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

# 数据库配置
DB_CONFIG = {
    "host": "91.216.169.138",
    "user": "cc-club",
    "password": "xMGXnXEBBnrNGPK8",
    "database": "cc-club",
    "port": 3306,
    "charset": "utf8mb4",
}

# 共享密钥（需要与前端一致）
SHARED_SECRET = os.getenv(
    "API_SHARED_SECRET",
    "dd7ea0087bb492abaf990d6e2795b2f0a3fafd0c40a9a8b7a9ccf7112cf3ba75",
)

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
        # 生产环境建议改为你的实际域名，例如：
        # self.send_header("Access-Control-Allow-Origin", "https://yourdomain.com")
        self.send_header("Access-Control-Allow-Origin", "*")  # 允许跨域
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
            if path == "/api/user/aff":
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

            else:
                self._send_error(404, "API endpoint not found")

        except Exception as e:
            self._send_error(500, str(e))

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
    run_server(host="0.0.0.0", port=8001)
