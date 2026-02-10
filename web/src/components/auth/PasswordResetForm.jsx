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

import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  API,
  getLogo,
  showError,
  showInfo,
  showSuccess,
  getSystemName,
} from '../../helpers';
import Turnstile from 'react-turnstile';
import { Button, Card, Form, Typography } from '@douyinfe/semi-ui';
import { IconMail, IconUser, IconKey, IconLock } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';

const { Text, Title } = Typography;

const isPhoneMode = import.meta.env.VITE_PHONE_REGISTER === 'true';

const PasswordResetForm = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [inputs, setInputs] = useState(
    isPhoneMode
      ? { username: '', code: '', password: '', password2: '' }
      : { email: '' }
  );

  const [loading, setLoading] = useState(false);
  const [sendCodeLoading, setSendCodeLoading] = useState(false);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [disableButton, setDisableButton] = useState(false);
  const [countdown, setCountdown] = useState(isPhoneMode ? 60 : 30);
  const [codeSent, setCodeSent] = useState(false);

  const logo = getLogo();
  const systemName = getSystemName();

  useEffect(() => {
    let status = localStorage.getItem('status');
    if (status) {
      status = JSON.parse(status);
      if (status.turnstile_check) {
        setTurnstileEnabled(true);
        setTurnstileSiteKey(status.turnstile_site_key);
      }
    }
  }, []);

  useEffect(() => {
    let countdownInterval = null;
    if (disableButton && countdown > 0) {
      countdownInterval = setInterval(() => {
        setCountdown(countdown - 1);
      }, 1000);
    } else if (countdown === 0) {
      setDisableButton(false);
      setCountdown(isPhoneMode ? 60 : 30);
    }
    return () => clearInterval(countdownInterval);
  }, [disableButton, countdown]);

  const validatePhone = (phone) => {
    const pattern = /^1[3-9]\d{9}$/;
    return pattern.test(phone);
  };

  function handleChange(name, value) {
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  }

  const sendVerificationCode = async () => {
    if (!inputs.username) {
      showError(t('请输入手机号'));
      return;
    }
    if (!validatePhone(inputs.username)) {
      showError(t('请输入正确的手机号格式'));
      return;
    }
    if (turnstileEnabled && turnstileToken === '') {
      showInfo(t('请稍后几秒重试，Turnstile 正在检查用户环境！'));
      return;
    }

    setSendCodeLoading(true);
    setDisableButton(true);

    try {
      const res = await API.post('/code/reset-password', {
        username: inputs.username,
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('验证码已发送，请查看短信！'));
        setCodeSent(true);
      } else {
        showError(message || t('发送验证码失败'));
        setDisableButton(false);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || t('发送验证码失败，请重试');
      showError(errorMsg);
      setDisableButton(false);
    } finally {
      setSendCodeLoading(false);
    }
  };

  async function handleSubmit(e) {
    if (isPhoneMode) {
      if (!inputs.username) {
        showError(t('请输入手机号'));
        return;
      }
      if (!validatePhone(inputs.username)) {
        showError(t('请输入正确的手机号格式'));
        return;
      }
      if (!inputs.code) {
        showError(t('请输入验证码'));
        return;
      }
      if (!inputs.password) {
        showError(t('请输入新密码'));
        return;
      }
      if (inputs.password.length < 8) {
        showInfo(t('密码长度不得小于 8 位！'));
        return;
      }
      if (inputs.password !== inputs.password2) {
        showInfo(t('两次输入的密码不一致'));
        return;
      }
      if (turnstileEnabled && turnstileToken === '') {
        showInfo(t('请稍后几秒重试，Turnstile 正在检查用户环境！'));
        return;
      }

      setLoading(true);
      try {
        const res = await API.post('/code/reset-password/verify', {
          username: inputs.username,
          code: inputs.code,
          password: inputs.password,
        });
        const { success, message } = res.data;
        if (success) {
          showSuccess(t('密码重置成功！'));
          setInputs({ username: '', code: '', password: '', password2: '' });
          setTimeout(() => {
            navigate('/login');
          }, 1500);
        } else {
          showError(message || t('密码重置失败'));
        }
      } catch (error) {
        const errorMsg = error.response?.data?.message || t('密码重置失败，请重试');
        showError(errorMsg);
      } finally {
        setLoading(false);
      }
    } else {
      if (!inputs.email) {
        showError(t('请输入邮箱地址'));
        return;
      }
      if (turnstileEnabled && turnstileToken === '') {
        showInfo(t('请稍后几秒重试，Turnstile 正在检查用户环境！'));
        return;
      }
      setDisableButton(true);
      setLoading(true);
      const res = await API.get(
        `/api/reset_password?email=${inputs.email}&turnstile=${turnstileToken}`,
      );
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('重置邮件发送成功，请检查邮箱！'));
        setInputs({ email: '' });
      } else {
        showError(message);
      }
      setLoading(false);
    }
  }

  const renderPhoneResetForm = () => (
    <Form className='space-y-3'>
      <Form.Input
        field='username'
        label={t('手机号')}
        placeholder={t('请输入您的手机号')}
        name='username'
        value={inputs.username}
        onChange={(value) => handleChange('username', value)}
        prefix={<IconUser />}
        suffix={
          <Button
            size='small'
            onClick={sendVerificationCode}
            loading={sendCodeLoading}
            disabled={disableButton || sendCodeLoading}
          >
            {disableButton ? `${countdown}s` : t('获取验证码')}
          </Button>
        }
      />

      {codeSent && (
        <>
          <Form.Input
            field='code'
            label={t('验证码')}
            placeholder={t('请输入验证码')}
            name='code'
            value={inputs.code}
            onChange={(value) => handleChange('code', value)}
            prefix={<IconKey />}
          />

          <Form.Input
            field='password'
            label={t('新密码')}
            placeholder={t('输入新密码，最短 8 位')}
            name='password'
            mode='password'
            value={inputs.password}
            onChange={(value) => handleChange('password', value)}
            prefix={<IconLock />}
          />

          <Form.Input
            field='password2'
            label={t('确认密码')}
            placeholder={t('请再次输入新密码')}
            name='password2'
            mode='password'
            value={inputs.password2}
            onChange={(value) => handleChange('password2', value)}
            prefix={<IconLock />}
          />

          <div className='space-y-2 pt-2'>
            <Button
              theme='solid'
              className='w-full !rounded-full'
              type='primary'
              htmlType='submit'
              onClick={handleSubmit}
              loading={loading}
            >
              {t('重置密码')}
            </Button>
          </div>
        </>
      )}
    </Form>
  );

  const renderEmailResetForm = () => (
    <Form className='space-y-3'>
      <Form.Input
        field='email'
        label={t('邮箱')}
        placeholder={t('请输入您的邮箱地址')}
        name='email'
        value={inputs.email}
        onChange={(value) => handleChange('email', value)}
        prefix={<IconMail />}
      />

      <div className='space-y-2 pt-2'>
        <Button
          theme='solid'
          className='w-full !rounded-full'
          type='primary'
          htmlType='submit'
          onClick={handleSubmit}
          loading={loading}
          disabled={disableButton}
        >
          {disableButton
            ? `${t('重试')} (${countdown})`
            : t('提交')}
        </Button>
      </div>
    </Form>
  );

  return (
    <div className='relative overflow-hidden bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8'>
      {/* 背景模糊晕染球 */}
      <div
        className='blur-ball blur-ball-indigo'
        style={{ top: '-80px', right: '-80px', transform: 'none' }}
      />
      <div
        className='blur-ball blur-ball-teal'
        style={{ top: '50%', left: '-120px' }}
      />
      <div className='w-full max-w-sm mt-[60px]'>
        <div className='flex flex-col items-center'>
          <div className='w-full max-w-md'>
            <div className='flex items-center justify-center mb-6 gap-2'>
              <img src={logo} alt='Logo' className='h-10 rounded-full' />
              <Title heading={3} className='!text-gray-800'>
                {systemName}
              </Title>
            </div>

            <Card className='border-0 !rounded-2xl overflow-hidden'>
              <div className='flex justify-center pt-6 pb-2'>
                <Title heading={3} className='text-gray-800 dark:text-gray-200'>
                  {isPhoneMode ? t('重置密码') : t('密码重置')}
                </Title>
              </div>
              <div className='px-2 py-8'>
                {isPhoneMode ? renderPhoneResetForm() : renderEmailResetForm()}

                <div className='mt-6 text-center text-sm'>
                  <Text>
                    {t('想起来了？')}{' '}
                    <Link
                      to='/login'
                      className='text-blue-600 hover:text-blue-800 font-medium'
                    >
                      {t('登录')}
                    </Link>
                  </Text>
                </div>
              </div>
            </Card>

            {turnstileEnabled && (
              <div className='flex justify-center mt-6'>
                <Turnstile
                  sitekey={turnstileSiteKey}
                  onVerify={(token) => {
                    setTurnstileToken(token);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PasswordResetForm;
