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
import {
  API,
  showError,
  showSuccess,
  updateAPI,
  setUserData,
} from '../../helpers';
import {
  Button,
  Card,
  Divider,
  Form,
  Input,
  Typography,
} from '@douyinfe/semi-ui';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const { Title, Text, Paragraph } = Typography;

const TwoFAVerification = ({
  onSuccess,
  onBack,
  isModal = false,
  challenge = null,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const verificationRequest = useRef(null);

  useEffect(() => () => verificationRequest.current?.abort(), []);

  const handleSubmit = async () => {
    if (verificationRequest.current) return;
    const code = verificationCode.trim();
    if (!code) {
      showError(t('请输入验证码'));
      return;
    }
    // Validate code format
    if (useBackupCode && code.length !== 8) {
      showError(t('备用码必须是8位'));
      return;
    } else if (!useBackupCode && !/^\d{6}$/.test(code)) {
      showError(t('验证码必须是6位数字'));
      return;
    }

    const isModernChallenge = challenge?.require_verification === true;
    if (isModernChallenge) {
      if (
        !challenge.flow_token ||
        !Number.isFinite(challenge.expires_at) ||
        !challenge.methods?.some(
          (option) => option.method === '2fa' && option.available,
        )
      ) {
        showError(t('验证失败，请重试'));
        return;
      }
      if (challenge.expires_at <= Date.now() / 1000) {
        showError(t('未登录或登录已过期，请重新登录'));
        onBack?.();
        return;
      }
    }

    const controller = new AbortController();
    verificationRequest.current = controller;
    setLoading(true);
    try {
      const res = await API.post(
        isModernChallenge ? '/api/user/login/verify' : '/api/user/login/2fa',
        isModernChallenge
          ? { flow_token: challenge.flow_token, method: '2fa', code }
          : { code },
        {
          signal: controller.signal,
          skipAuthRefresh: true,
          skipErrorHandler: true,
          skipAuthRotation: true,
        },
      );
      if (controller.signal.aborted) return;

      if (res.data.success) {
        // 保存用户信息到本地存储
        const user = setUserData(res.data.data);
        showSuccess(t('登录成功'));
        // 重建 axios 实例，让后续请求带上正确的 New-Api-User
        updateAPI();
        if (onSuccess) {
          onSuccess(user);
        }
      } else {
        showError(res.data.message || t('验证失败，请重试'));
        if (res.data.code === 'AUTH_FLOW_INVALID') onBack?.();
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      showError(error.response?.data?.message || t('验证失败，请重试'));
      if (error.response?.data?.code === 'AUTH_FLOW_INVALID') onBack?.();
    } finally {
      verificationRequest.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  if (isModal) {
    return (
      <div className='space-y-4'>
        <Paragraph className='text-gray-600 dark:text-gray-300'>
          请输入认证器应用显示的验证码完成登录
        </Paragraph>

        <Form onSubmit={handleSubmit}>
          <Form.Input
            field='code'
            label={useBackupCode ? '备用码' : '验证码'}
            placeholder={useBackupCode ? '请输入8位备用码' : '请输入6位验证码'}
            value={verificationCode}
            onChange={setVerificationCode}
            size='large'
            style={{ marginBottom: 16 }}
            autoFocus
          />

          <Button
            htmlType='submit'
            type='primary'
            loading={loading}
            block
            size='large'
            style={{ marginBottom: 16 }}
          >
            验证并登录
          </Button>
        </Form>

        <Divider />

        <div style={{ textAlign: 'center' }}>
          <Button
            theme='borderless'
            type='tertiary'
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setVerificationCode('');
            }}
            style={{ marginRight: 16, color: '#1890ff', padding: 0 }}
          >
            {useBackupCode ? '使用认证器验证码' : '使用备用码'}
          </Button>

          {onBack && (
            <Button
              theme='borderless'
              type='tertiary'
              onClick={onBack}
              style={{ color: '#1890ff', padding: 0 }}
            >
              返回登录
            </Button>
          )}
        </div>

        <div className='bg-gray-50 dark:bg-gray-800 rounded-lg p-3'>
          <Text size='small' type='secondary'>
            <strong>提示：</strong>
            <br />
            • 验证码每30秒更新一次
            <br />
            • 如果无法获取验证码，请使用备用码
            <br />• 每个备用码只能使用一次
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
      }}
    >
      <Card style={{ width: 400, padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title heading={3}>两步验证</Title>
          <Paragraph type='secondary'>
            请输入认证器应用显示的验证码完成登录
          </Paragraph>
        </div>

        <Form onSubmit={handleSubmit}>
          <Form.Input
            field='code'
            label={useBackupCode ? '备用码' : '验证码'}
            placeholder={useBackupCode ? '请输入8位备用码' : '请输入6位验证码'}
            value={verificationCode}
            onChange={setVerificationCode}
            size='large'
            style={{ marginBottom: 16 }}
            autoFocus
          />

          <Button
            htmlType='submit'
            type='primary'
            loading={loading}
            block
            size='large'
            style={{ marginBottom: 16 }}
          >
            验证并登录
          </Button>
        </Form>

        <Divider />

        <div style={{ textAlign: 'center' }}>
          <Button
            theme='borderless'
            type='tertiary'
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setVerificationCode('');
            }}
            style={{ marginRight: 16, color: '#1890ff', padding: 0 }}
          >
            {useBackupCode ? '使用认证器验证码' : '使用备用码'}
          </Button>

          {onBack && (
            <Button
              theme='borderless'
              type='tertiary'
              onClick={onBack}
              style={{ color: '#1890ff', padding: 0 }}
            >
              返回登录
            </Button>
          )}
        </div>

        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: '#f6f8fa',
            borderRadius: 6,
          }}
        >
          <Text size='small' type='secondary'>
            <strong>提示：</strong>
            <br />
            • 验证码每30秒更新一次
            <br />
            • 如果无法获取验证码，请使用备用码
            <br />• 每个备用码只能使用一次
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default TwoFAVerification;
