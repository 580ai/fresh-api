/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import CryptoJS from 'crypto-js';

// Python API 服务地址
const PYTHON_API_URL =
  import.meta.env.VITE_PYTHON_API_URL || '';

// HMAC 共享密钥（需要与Python脚本中的密钥一致）
const SHARED_SECRET = 'dd7ea0087bb492abaf990d6e2795b2f0a3fafd0c40a9a8b7a9ccf7112cf3ba75';

/**
 * 生成HMAC认证token
 * @param {number} userId - 用户ID
 * @param {number} timestamp - 时间戳（秒）
 * @returns {string} HMAC-SHA256签名的token
 */
function generateAuthToken(userId, timestamp) {
  const message = `${userId}:${timestamp}`;
  return CryptoJS.HmacSHA256(message, SHARED_SECRET).toString();
}

/**
 * 获取用户的真实邀请人数（通过inviter_id统计）
 * @param {number} userId - 用户ID
 * @returns {Promise<number>} 邀请人数
 * @throws {Error} 如果请求失败或认证失败
 */
export async function getRealInviteCount(userId) {
  try {
    // 生成当前时间戳（秒）
    const timestamp = Math.floor(Date.now() / 1000);

    // 生成HMAC认证token
    const auth_token = generateAuthToken(userId, timestamp);

    // 构建请求URL
    const url = `${PYTHON_API_URL}/pyapi/user/aff?user_id=${userId}&auth_token=${auth_token}&timestamp=${timestamp}`;

    // 发送请求
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 解析响应
    const data = await response.json();

    if (data.success) {
      return data.data.invite_count;
    } else {
      throw new Error(data.message || '获取邀请人数失败');
    }
  } catch (error) {
    console.error('获取真实邀请人数失败:', error);
    throw error;
  }
}

/**
 * 获取邀请用户的充值总金额（收益统计）
 * @param {number} userId - 用户ID
 * @returns {Promise<{total_income: number, pending_income: number}>} 收益数据
 *   - total_income: 总收益（邀请用户充值总金额，美元）
 *   - pending_income: 待使用收益（美元）
 * @throws {Error} 如果请求失败或认证失败
 */
export async function getInviteIncome(userId) {
  try {
    // 生成当前时间戳（秒）
    const timestamp = Math.floor(Date.now() / 1000);

    // 生成HMAC认证token
    const auth_token = generateAuthToken(userId, timestamp);

    // 构建请求URL
    const url = `${PYTHON_API_URL}/pyapi/user/aff/income?user_id=${userId}&auth_token=${auth_token}&timestamp=${timestamp}`;

    // 发送请求
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 解析响应
    const data = await response.json();

    if (data.success) {
      return {
        total_income: data.data.total_income,
        pending_income: data.data.pending_income,
      };
    } else {
      throw new Error(data.message || '获取收益数据失败');
    }
  } catch (error) {
    console.error('获取邀请收益失败:', error);
    throw error;
  }
}
