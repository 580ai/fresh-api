#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import mysql.connector
from mysql.connector import pooling
from urllib.parse import urlparse, parse_qs
import hmac
import hashlib
import time
import os

def _required_env(name):
    """读取必需的配置项；缺失时直接退出，避免以不安全默认值启动。"""
    value = os.getenv(name)
    if not value:
        raise SystemExit(
            f"missing required environment variable: {name} "
            "(see .env.example; never hardcode credentials in source)"
        )
    return value


# 数据库配置：全部来自环境变量，禁止在源码中出现凭据。
DB_CONFIG = {
    "host": _required_env("API_DB_HOST"),
    "user": _required_env("API_DB_USER"),
    "password": _required_env("API_DB_PASSWORD"),
    "database": os.getenv("API_DB_NAME", "cc-club"),
    "port": int(os.getenv("API_DB_PORT", "3306")),
    "charset": "utf8mb4",
}

# 共享密钥（需要与前端一致）
SHARED_SECRET = _required_env("API_SHARED_SECRET")

# 创建数据库连接池
connection_pool = pooling.MySQLConnectionPool(
    pool_name="aff_count_pool",
    pool_size=5,  # 连接池大小
    pool_reset_session=True,
    **DB_CONFIG,
)


def verify_auth_token(user_id, auth_token, timestamp):
    """验证HMAC token"""
    try:
        timestamp_int = int(timestamp)
        # 检查时间戳是否在5分钟内
        if time.time() - timestamp_int > 300:
            return False

        # 计算期望的token
        expected_token = hmac.new(
            SHARED_SECRET.encode(), f"{user_id}:{timestamp}".encode(), hashlib.sha256
        ).hexdigest()

        return hmac.compare_digest(auth_token, expected_token)
    except (ValueError, TypeError):
        return False


class APIHandler(BaseHTTPRequestHandler):
    """处理HTTP请求的类"""

    def _set_headers(self, status_code=200):
        """设置响应头"""
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        # 允许的跨域来源由环境变量控制；未配置时不下发该头（同源请求不受影响）。
        allowed_origin = os.getenv("API_ALLOWED_ORIGIN", "")
        if allowed_origin:
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers", "Content-Type, Authorization"
        )  # 添加 Authorization
        self.end_headers()

    def log_message(self, format, *args):
        """禁用默认的HTTP请求日志输出"""
        # 不输出日志，保持控制台整洁
        return

    def do_OPTIONS(self):
        """处理预检请求"""
        self._set_headers(200)

    def do_GET(self):
        """处理GET请求"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        try:
            # 路由处理
            if path == "/api/user/aff" or path == "/pyapi/user/aff":
                # 从查询参数获取认证信息
                query_params = parse_qs(parsed_path.query)
                user_id = query_params.get("user_id", [None])[0]
                auth_token = query_params.get("auth_token", [None])[0]
                timestamp = query_params.get("timestamp", [None])[0]

                if not all([user_id, auth_token, timestamp]):
                    self._send_error(401, "缺少认证参数")
                    return

                # 验证token
                if not verify_auth_token(user_id, auth_token, timestamp):
                    self._send_error(401, "认证失败或token已过期")
                    return

                # 获取邀请人数
                invite_count = self.get_invite_count_by_user_id(int(user_id))
                if invite_count is not None:
                    response = {
                        "success": True,
                        "data": {"user_id": int(user_id), "invite_count": invite_count},
                    }
                    self._set_headers(200)
                else:
                    response = {"success": False, "message": "用户不存在"}
                    self._set_headers(404)

                self.wfile.write(
                    json.dumps(response, ensure_ascii=False).encode("utf-8")
                )

            elif path == "/api/user/aff/income" or path == "/pyapi/user/aff/income":
                # 获取邀请用户充值总金额
                query_params = parse_qs(parsed_path.query)
                user_id = query_params.get("user_id", [None])[0]
                auth_token = query_params.get("auth_token", [None])[0]
                timestamp = query_params.get("timestamp", [None])[0]

                if not all([user_id, auth_token, timestamp]):
                    self._send_error(401, "缺少认证参数")
                    return

                # 验证token
                if not verify_auth_token(user_id, auth_token, timestamp):
                    self._send_error(401, "认证失败或token已过期")
                    return

                # 获取邀请用户充值总金额
                income_data = self.get_invite_income_by_user_id(int(user_id))
                if income_data is not None:
                    response = {
                        "success": True,
                        "data": {
                            "user_id": int(user_id),
                            "total_income": income_data["total_income"],  # 总收益（充值总金额）
                            "pending_income": income_data["pending_income"],  # 待使用收益
                        },
                    }
                    self._set_headers(200)
                else:
                    response = {"success": False, "message": "获取数据失败"}
                    self._set_headers(500)

                self.wfile.write(
                    json.dumps(response, ensure_ascii=False).encode("utf-8")
                )

            else:
                self._send_error(404, "API endpoint not found")

        except Exception as e:
            # 详细异常只写服务端日志，不回传调用方（避免泄露 SQL/连接串等内部信息）。
            print(f"[error] unhandled exception: {e!r}")
            self._send_error(500, "Internal server error")

    def get_invite_count_by_user_id(self, user_id):
        """根据user_id获取邀请人数"""
        conn = None
        try:
            # 从连接池获取连接
            conn = connection_pool.get_connection()
            cursor = conn.cursor(dictionary=True)

            # 统计有多少用户的inviter_id是当前用户的id
            count_query = """
                SELECT COUNT(*) as invite_count
                FROM users
                WHERE inviter_id = %s AND deleted_at IS NULL
            """
            cursor.execute(count_query, (user_id,))
            result = cursor.fetchone()
            cursor.close()

            return result["invite_count"] if result else 0

        except mysql.connector.Error as e:
            print(f"Database error: {e}")
            return None
        finally:
            if conn and conn.is_connected():
                conn.close()  # 归还连接到连接池

    def get_invite_income_by_user_id(self, user_id):
        """根据user_id获取邀请用户的充值总金额"""
        conn = None
        try:
            # 从连接池获取连接
            conn = connection_pool.get_connection()
            cursor = conn.cursor(dictionary=True)

            # 先查询被邀请的用户数量（调试用）
            debug_query = """
                SELECT COUNT(*) as invited_count
                FROM users
                WHERE inviter_id = %s AND deleted_at IS NULL
            """
            cursor.execute(debug_query, (user_id,))
            debug_result = cursor.fetchone()
            print(f"[DEBUG] 用户 {user_id} 邀请的人数: {debug_result['invited_count']}")

            # 查询被当前用户邀请的用户的充值总金额
            # 1. 先找出所有被当前用户邀请的用户ID
            # 2. 统计这些用户的成功充值记录的money字段总和
            income_query = """
                SELECT COALESCE(SUM(t.money), 0) as total_income
                FROM top_ups t
                INNER JOIN users u ON t.user_id = u.id
                WHERE u.inviter_id = %s
                  AND u.deleted_at IS NULL
                  AND t.status = 'success'
            """
            cursor.execute(income_query, (user_id,))
            result = cursor.fetchone()

            total_income = float(result["total_income"]) if result else 0.0
            print(f"[DEBUG] 用户 {user_id} 邀请用户的充值总金额: {total_income}")

            # 获取用户当前的aff_quota（待使用收益）和aff_history_quota（总收益）
            # 用于计算待使用收益
            user_query = """
                SELECT aff_quota, aff_history
                FROM users
                WHERE id = %s AND deleted_at IS NULL
            """
            cursor.execute(user_query, (user_id,))
            user_result = cursor.fetchone()
            cursor.close()

            # 待使用收益 = 用户表中的 aff_quota（系统计算的待划转额度）
            # 这里我们返回总充值金额作为总收益，待使用保留原来的逻辑
            pending_income = float(user_result["aff_quota"]) / 500000.0 if user_result else 0.0  # 转换为美元
            print(f"[DEBUG] 用户 {user_id} 的 aff_quota: {user_result['aff_quota'] if user_result else 0}, 转换后: {pending_income}")

            return {
                "total_income": total_income,  # 邀请用户的充值总金额（美元）
                "pending_income": pending_income,  # 待使用收益（美元）
            }

        except mysql.connector.Error as e:
            print(f"Database error: {e}")
            return None
        finally:
            if conn and conn.is_connected():
                conn.close()  # 归还连接到连接池

    def _send_error(self, status_code, message):
        """发送错误响应"""
        self._set_headers(status_code)
        response = {"success": False, "message": message}
        self.wfile.write(json.dumps(response, ensure_ascii=False).encode("utf-8"))


def run_server(host="127.0.0.1", port=8001):
    """启动服务器

    Args:
        host: 监听地址
              - "0.0.0.0": 监听所有网络接口（公网可访问）
              - "127.0.0.1": 只监听本地（通过反向代理访问）
        port: 监听端口
    """
    server_address = (host, port)
    httpd = HTTPServer(server_address, APIHandler)
    print(f"服务器启动在 http://{host}:{port}")
    print(
        f"数据库连接池: {connection_pool.pool_name} (大小: {connection_pool.pool_size})"
    )
    print(f"API端点:")
    print(f"  - GET /api/user/aff")
    print(f"    参数: user_id, auth_token, timestamp")
    print(f"    功能: 获取用户的真实邀请人数（通过inviter_id统计）")
    print(f"  - GET /api/user/aff/income")
    print(f"    参数: user_id, auth_token, timestamp")
    print(f"    功能: 获取邀请用户的充值总金额")
    print(
        f"\n共享密钥已设置: {'是' if SHARED_SECRET != 'your-secret-key-here' else '否（请设置环境变量 API_SHARED_SECRET）'}"
    )
    print("按 Ctrl+C 停止服务器")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
        httpd.server_close()


if __name__ == "__main__":
    # 默认只监听回环地址；需要对外提供服务时显式设置 API_BIND_HOST，
    # 并由前置反向代理负责 TLS 与访问控制。
    run_server(
        host=os.getenv("API_BIND_HOST", "127.0.0.1"),
        port=int(os.getenv("API_BIND_PORT", "8001")),
    )
