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

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  API,
  getLogo,
  showError,
  showInfo,
  showSuccess,
  updateAPI,
  getSystemName,
  setUserData,
  onDiscordOAuthClicked,
} from '../../helpers';
import Turnstile from 'react-turnstile';
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Form,
  Icon,
  Modal,
} from '@douyinfe/semi-ui';
import Title from '@douyinfe/semi-ui/lib/es/typography/title';
import Text from '@douyinfe/semi-ui/lib/es/typography/text';
import {
  IconGithubLogo,
  IconMail,
  IconUser,
  IconLock,
  IconKey,
} from '@douyinfe/semi-icons';
import {
  onGitHubOAuthClicked,
  onLinuxDOOAuthClicked,
  onOIDCClicked,
} from '../../helpers';
import OIDCIcon from '../common/logo/OIDCIcon';
import LinuxDoIcon from '../common/logo/LinuxDoIcon';
import WeChatIcon from '../common/logo/WeChatIcon';
import TelegramLoginButton from 'react-telegram-login/src';
import { UserContext } from '../../context/User';
import { StatusContext } from '../../context/Status';
import { useTranslation } from 'react-i18next';
import { SiDiscord } from 'react-icons/si';
import { House } from 'lucide-react';
import loginImage from './login.png';
import NotificationButton from '../layout/headerbar/NotificationButton';
import ThemeToggle from '../layout/headerbar/ThemeToggle';
import LanguageSelector from '../layout/headerbar/LanguageSelector';
import NoticeModal from '../layout/NoticeModal';
import { useNotifications } from '../../hooks/common/useNotifications';
import { useTheme, useSetTheme } from '../../context/Theme';
import { useIsMobile } from '../../hooks/common/useIsMobile';

const RegisterForm = () => {
  let navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const theme = useTheme();
  const setTheme = useSetTheme();

  const githubButtonTextKeyByState = {
    idle: '使用 GitHub 继续',
    redirecting: '正在跳转 GitHub...',
    timeout: '请求超时，请刷新页面后重新发起 GitHub 登录',
  };
  const [inputs, setInputs] = useState({
    username: '',
    password: '',
    password2: '',
    email: '',
    verification_code: '',
    wechat_verification_code: '',
  });
  const { username, password, password2 } = inputs;
  const [userState, userDispatch] = useContext(UserContext);
  const [statusState] = useContext(StatusContext);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [showWeChatLoginModal, setShowWeChatLoginModal] = useState(false);
  const [showEmailRegister, setShowEmailRegister] = useState(false);
  const [wechatLoading, setWechatLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [oidcLoading, setOidcLoading] = useState(false);
  const [linuxdoLoading, setLinuxdoLoading] = useState(false);
  const [emailRegisterLoading, setEmailRegisterLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [verificationCodeLoading, setVerificationCodeLoading] = useState(false);
  const [otherRegisterOptionsLoading, setOtherRegisterOptionsLoading] =
    useState(false);
  const [wechatCodeSubmitLoading, setWechatCodeSubmitLoading] = useState(false);
  const [disableButton, setDisableButton] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [hasUserAgreement, setHasUserAgreement] = useState(false);
  const [hasPrivacyPolicy, setHasPrivacyPolicy] = useState(false);
  const [showUserAgreementModal, setShowUserAgreementModal] = useState(false);
  const [showPrivacyPolicyModal, setShowPrivacyPolicyModal] = useState(false);
  const [userAgreementContent, setUserAgreementContent] = useState('');
  const [privacyPolicyContent, setPrivacyPolicyContent] = useState('');
  const [githubButtonState, setGithubButtonState] = useState('idle');
  const [githubButtonDisabled, setGithubButtonDisabled] = useState(false);
  const githubTimeoutRef = useRef(null);
  const githubButtonText = t(githubButtonTextKeyByState[githubButtonState]);

  const logo = getLogo();
  const systemName = getSystemName();

  // 通知功能
  const {
    noticeVisible,
    unreadCount,
    handleNoticeOpen,
    handleNoticeClose,
    getUnreadKeys,
  } = useNotifications(statusState);

  let affCode = new URLSearchParams(window.location.search).get('aff');
  if (affCode) {
    localStorage.setItem('aff', affCode);
  }

  const status = useMemo(() => {
    if (statusState?.status) return statusState.status;
    const savedStatus = localStorage.getItem('status');
    if (!savedStatus) return {};
    try {
      return JSON.parse(savedStatus) || {};
    } catch (err) {
      return {};
    }
  }, [statusState?.status]);

  const [showEmailVerification, setShowEmailVerification] = useState(false);

  useEffect(() => {
    setShowEmailVerification(!!status?.email_verification);
    if (status?.turnstile_check) {
      setTurnstileEnabled(true);
      setTurnstileSiteKey(status.turnstile_site_key);
    }

    // 从 status 获取用户协议和隐私政策的启用状态
    setHasUserAgreement(status?.user_agreement_enabled || false);
    setHasPrivacyPolicy(status?.privacy_policy_enabled || false);
  }, [status]);

  useEffect(() => {
    let countdownInterval = null;
    if (disableButton && countdown > 0) {
      countdownInterval = setInterval(() => {
        setCountdown(countdown - 1);
      }, 1000);
    } else if (countdown === 0) {
      setDisableButton(false);
      setCountdown(30);
    }
    return () => clearInterval(countdownInterval); // Clean up on unmount
  }, [disableButton, countdown]);

  useEffect(() => {
    return () => {
      if (githubTimeoutRef.current) {
        clearTimeout(githubTimeoutRef.current);
      }
    };
  }, []);

  // 主题切换处理
  const handleThemeToggle = (newTheme) => {
    setTheme(newTheme);
  };

  // 语言切换处理
  const handleLanguageChange = (lang) => {
    i18n.changeLanguage(lang);
  };

  // 获取用户协议内容
  const fetchUserAgreement = async () => {
    try {
      const res = await API.get('/api/user-agreement');
      if (res.data.success) {
        setUserAgreementContent(res.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch user agreement:', error);
    }
  };

  // 获取隐私政策内容
  const fetchPrivacyPolicy = async () => {
    try {
      const res = await API.get('/api/privacy-policy');
      if (res.data.success) {
        setPrivacyPolicyContent(res.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch privacy policy:', error);
    }
  };

  // 显示用户协议模态框
  const handleShowUserAgreement = (e) => {
    e.preventDefault();
    e.stopPropagation();
    fetchUserAgreement();
    setShowUserAgreementModal(true);
  };

  // 显示隐私政策模态框
  const handleShowPrivacyPolicy = (e) => {
    e.preventDefault();
    e.stopPropagation();
    fetchPrivacyPolicy();
    setShowPrivacyPolicyModal(true);
  };

  // 同意用户协议并继续
  const handleAgreeUserAgreement = () => {
    setAgreedToTerms(true);
    setShowUserAgreementModal(false);
  };

  // 同意隐私政策并继续
  const handleAgreePrivacyPolicy = () => {
    setAgreedToTerms(true);
    setShowPrivacyPolicyModal(false);
  };

  const onWeChatLoginClicked = () => {
    setWechatLoading(true);
    setShowWeChatLoginModal(true);
    setWechatLoading(false);
  };

  const onSubmitWeChatVerificationCode = async () => {
    if (turnstileEnabled && turnstileToken === '') {
      showInfo('请稍后几秒重试，Turnstile 正在检查用户环境！');
      return;
    }
    setWechatCodeSubmitLoading(true);
    try {
      const res = await API.get(
        `/api/oauth/wechat?code=${inputs.wechat_verification_code}`,
      );
      const { success, message, data } = res.data;
      if (success) {
        userDispatch({ type: 'login', payload: data });
        localStorage.setItem('user', JSON.stringify(data));
        setUserData(data);
        updateAPI();
        navigate('/');
        showSuccess('登录成功！');
        setShowWeChatLoginModal(false);
      } else {
        showError(message);
      }
    } catch (error) {
      showError('登录失败，请重试');
    } finally {
      setWechatCodeSubmitLoading(false);
    }
  };

  function handleChange(name, value) {
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  }

  async function handleSubmit(e) {
    if (password.length < 8) {
      showInfo('密码长度不得小于 8 位！');
      return;
    }
    if (password !== password2) {
      showInfo('两次输入的密码不一致');
      return;
    }
    if (username && password) {
      if (turnstileEnabled && turnstileToken === '') {
        showInfo('请稍后几秒重试，Turnstile 正在检查用户环境！');
        return;
      }
      setRegisterLoading(true);
      try {
        if (!affCode) {
          affCode = localStorage.getItem('aff');
        }
        inputs.aff_code = affCode;
        const res = await API.post(
          `/api/user/register?turnstile=${turnstileToken}`,
          inputs,
        );
        const { success, message } = res.data;
        if (success) {
          navigate('/login');
          showSuccess('注册成功！');
        } else {
          showError(message);
        }
      } catch (error) {
        showError('注册失败，请重试');
      } finally {
        setRegisterLoading(false);
      }
    }
  }

  const sendVerificationCode = async () => {
    if (inputs.email === '') return;
    if (turnstileEnabled && turnstileToken === '') {
      showInfo('请稍后几秒重试，Turnstile 正在检查用户环境！');
      return;
    }
    setVerificationCodeLoading(true);
    try {
      const res = await API.get(
        `/api/verification?email=${encodeURIComponent(inputs.email)}&turnstile=${turnstileToken}`,
      );
      const { success, message } = res.data;
      if (success) {
        showSuccess('验证码发送成功，请检查你的邮箱！');
        setDisableButton(true); // 发送成功后禁用按钮，开始倒计时
      } else {
        showError(message);
      }
    } catch (error) {
      showError('发送验证码失败，请重试');
    } finally {
      setVerificationCodeLoading(false);
    }
  };

  const handleGitHubClick = () => {
    if (githubButtonDisabled) {
      return;
    }
    setGithubLoading(true);
    setGithubButtonDisabled(true);
    setGithubButtonState('redirecting');
    if (githubTimeoutRef.current) {
      clearTimeout(githubTimeoutRef.current);
    }
    githubTimeoutRef.current = setTimeout(() => {
      setGithubLoading(false);
      setGithubButtonState('timeout');
      setGithubButtonDisabled(true);
    }, 20000);
    try {
      onGitHubOAuthClicked(status.github_client_id, { shouldLogout: true });
    } finally {
      setTimeout(() => setGithubLoading(false), 3000);
    }
  };

  const handleDiscordClick = () => {
    setDiscordLoading(true);
    try {
      onDiscordOAuthClicked(status.discord_client_id, { shouldLogout: true });
    } finally {
      setTimeout(() => setDiscordLoading(false), 3000);
    }
  };

  const handleOIDCClick = () => {
    setOidcLoading(true);
    try {
      onOIDCClicked(
        status.oidc_authorization_endpoint,
        status.oidc_client_id,
        false,
        { shouldLogout: true },
      );
    } finally {
      setTimeout(() => setOidcLoading(false), 3000);
    }
  };

  const handleLinuxDOClick = () => {
    setLinuxdoLoading(true);
    try {
      onLinuxDOOAuthClicked(status.linuxdo_client_id, { shouldLogout: true });
    } finally {
      setTimeout(() => setLinuxdoLoading(false), 3000);
    }
  };

  const handleEmailRegisterClick = () => {
    setEmailRegisterLoading(true);
    setShowEmailRegister(true);
    setEmailRegisterLoading(false);
  };

  const handleOtherRegisterOptionsClick = () => {
    setOtherRegisterOptionsLoading(true);
    setShowEmailRegister(false);
    setOtherRegisterOptionsLoading(false);
  };

  const onTelegramLoginClicked = async (response) => {
    const fields = [
      'id',
      'first_name',
      'last_name',
      'username',
      'photo_url',
      'auth_date',
      'hash',
      'lang',
    ];
    const params = {};
    fields.forEach((field) => {
      if (response[field]) {
        params[field] = response[field];
      }
    });
    try {
      const res = await API.get(`/api/oauth/telegram/login`, { params });
      const { success, message, data } = res.data;
      if (success) {
        userDispatch({ type: 'login', payload: data });
        localStorage.setItem('user', JSON.stringify(data));
        showSuccess('登录成功！');
        setUserData(data);
        updateAPI();
        navigate('/');
      } else {
        showError(message);
      }
    } catch (error) {
      showError('登录失败，请重试');
    }
  };

  const renderOAuthOptions = () => {
    return (
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
                {t('注 册')}
              </Title>
            </div>
            <div className='px-2 py-8'>
              <div className='space-y-3'>
                {status.wechat_login && (
                  <Button
                    theme='outline'
                    className='w-full h-12 flex items-center justify-center !rounded-full border border-gray-200 hover:bg-gray-50 transition-colors'
                    type='tertiary'
                    icon={
                      <Icon svg={<WeChatIcon />} style={{ color: '#07C160' }} />
                    }
                    onClick={onWeChatLoginClicked}
                    loading={wechatLoading}
                  >
                    <span className='ml-3'>{t('使用 微信 继续')}</span>
                  </Button>
                )}

                {status.github_oauth && (
                  <Button
                    theme='outline'
                    className='w-full h-12 flex items-center justify-center !rounded-full border border-gray-200 hover:bg-gray-50 transition-colors'
                    type='tertiary'
                    icon={<IconGithubLogo size='large' />}
                    onClick={handleGitHubClick}
                    loading={githubLoading}
                    disabled={githubButtonDisabled}
                  >
                    <span className='ml-3'>{githubButtonText}</span>
                  </Button>
                )}

                {status.discord_oauth && (
                  <Button
                    theme='outline'
                    className='w-full h-12 flex items-center justify-center !rounded-full border border-gray-200 hover:bg-gray-50 transition-colors'
                    type='tertiary'
                    icon={
                      <SiDiscord
                        style={{
                          color: '#5865F2',
                          width: '20px',
                          height: '20px',
                        }}
                      />
                    }
                    onClick={handleDiscordClick}
                    loading={discordLoading}
                  >
                    <span className='ml-3'>{t('使用 Discord 继续')}</span>
                  </Button>
                )}

                {status.oidc_enabled && (
                  <Button
                    theme='outline'
                    className='w-full h-12 flex items-center justify-center !rounded-full border border-gray-200 hover:bg-gray-50 transition-colors'
                    type='tertiary'
                    icon={<OIDCIcon style={{ color: '#1877F2' }} />}
                    onClick={handleOIDCClick}
                    loading={oidcLoading}
                  >
                    <span className='ml-3'>{t('使用 OIDC 继续')}</span>
                  </Button>
                )}

                {status.linuxdo_oauth && (
                  <Button
                    theme='outline'
                    className='w-full h-12 flex items-center justify-center !rounded-full border border-gray-200 hover:bg-gray-50 transition-colors'
                    type='tertiary'
                    icon={
                      <LinuxDoIcon
                        style={{
                          color: '#E95420',
                          width: '20px',
                          height: '20px',
                        }}
                      />
                    }
                    onClick={handleLinuxDOClick}
                    loading={linuxdoLoading}
                  >
                    <span className='ml-3'>{t('使用 LinuxDO 继续')}</span>
                  </Button>
                )}

                {status.telegram_oauth && (
                  <div className='flex justify-center my-2'>
                    <TelegramLoginButton
                      dataOnauth={onTelegramLoginClicked}
                      botName={status.telegram_bot_name}
                    />
                  </div>
                )}

                <Divider margin='12px' align='center'>
                  {t('或')}
                </Divider>

                <Button
                  theme='solid'
                  type='primary'
                  className='w-full h-12 flex items-center justify-center bg-black text-white !rounded-full hover:bg-gray-800 transition-colors'
                  icon={<IconMail size='large' />}
                  onClick={handleEmailRegisterClick}
                  loading={emailRegisterLoading}
                >
                  <span className='ml-3'>{t('使用 用户名 注册')}</span>
                </Button>
              </div>

              <div className='mt-6 text-center text-sm'>
                <Text>
                  {t('已有账户？')}{' '}
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
        </div>
      </div>
    );
  };

  const renderEmailRegisterForm = () => {
    return (
      <div className='flex flex-col items-center'>
        <div className='w-full'>
          <div className='flex items-center justify-center mb-6 gap-3'>
            <img src={logo} alt='Logo' className='h-12 rounded-full' />
            <Title heading={1} className='!text-gray-800 dark:!text-gray-200 !text-3xl !font-bold'>
              Polo API
            </Title>
          </div>

          <div className='w-full max-w-md mx-auto'>
            <div className='flex justify-center mb-10'>
              <Title heading={2} className='text-gray-800 dark:text-gray-200 font-bold !text-2xl'>
                {t('用户注册')}
              </Title>
            </div>
            <div className='space-y-4'>
              <Form className='space-y-6'>
                <Form.Input
                  field='username'
                  label={t('用户名')}
                  placeholder={t('请输入用户名')}
                  name='username'
                  onChange={(value) => handleChange('username', value)}
                  prefix={<IconUser />}
                  className='!rounded-lg'
                  style={{ height: '56px' }}
                  inputStyle={{ fontSize: '16px', height: '56px', padding: '0 16px' }}
                  labelStyle={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}
                />

                <Form.Input
                  field='password'
                  label={t('密码')}
                  placeholder={t('输入密码，最短 8 位，最长 20 位')}
                  name='password'
                  mode='password'
                  onChange={(value) => handleChange('password', value)}
                  prefix={<IconLock />}
                  className='!rounded-lg'
                  style={{ height: '56px' }}
                  inputStyle={{ fontSize: '16px', height: '56px', padding: '0 16px' }}
                  labelStyle={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}
                />

                <Form.Input
                  field='password2'
                  label={t('确认密码')}
                  placeholder={t('确认密码')}
                  name='password2'
                  mode='password'
                  onChange={(value) => handleChange('password2', value)}
                  prefix={<IconLock />}
                  className='!rounded-lg'
                  style={{ height: '56px' }}
                  inputStyle={{ fontSize: '16px', height: '56px', padding: '0 16px' }}
                  labelStyle={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}
                />

                {showEmailVerification && (
                  <>
                    <Form.Input
                      field='email'
                      label={t('邮箱')}
                      placeholder={t('输入邮箱地址')}
                      name='email'
                      type='email'
                      onChange={(value) => handleChange('email', value)}
                      prefix={<IconMail />}
                      className='!rounded-lg'
                      style={{ height: '56px' }}
                      inputStyle={{ fontSize: '16px', height: '56px', padding: '0 16px' }}
                      labelStyle={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}
                      suffix={
                        <Button
                          onClick={sendVerificationCode}
                          loading={verificationCodeLoading}
                          disabled={disableButton || verificationCodeLoading}
                        >
                          {disableButton
                            ? `${t('重新发送')} (${countdown})`
                            : t('获取验证码')}
                        </Button>
                      }
                    />
                    <Form.Input
                      field='verification_code'
                      label={t('验证码')}
                      placeholder={t('输入验证码')}
                      name='verification_code'
                      onChange={(value) =>
                        handleChange('verification_code', value)
                      }
                      prefix={<IconKey />}
                      className='!rounded-lg'
                      style={{ height: '56px' }}
                      inputStyle={{ fontSize: '16px', height: '56px', padding: '0 16px' }}
                      labelStyle={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}
                    />
                  </>
                )}

                {(hasUserAgreement || hasPrivacyPolicy) && (
                  <div className='flex items-center pt-2'>
                    <Checkbox
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                    >
                      <Text size='big' className='text-gray-400'>
                        {t('我已阅读并同意')}
                        {hasUserAgreement && (
                          <>
                            <a
                              href='#'
                              onClick={handleShowUserAgreement}
                              className='text-blue-600 hover:text-blue-800 mx-1 cursor-pointer'
                            >
                              {t('《用户协议》')}
                            </a>
                          </>
                        )}
                        {hasUserAgreement && hasPrivacyPolicy && t('和')}
                        {hasPrivacyPolicy && (
                          <>
                            <a
                              href='#'
                              onClick={handleShowPrivacyPolicy}
                              className='text-blue-600 hover:text-blue-800 mx-1 cursor-pointer'
                            >
                              {t('《隐私政策》')}
                            </a>
                          </>
                        )}
                      </Text>
                    </Checkbox>
                  </div>
                )}

                <div className='space-y-3 pt-6'>
                  <Button
                    theme='solid'
                    className='w-full !rounded-full h-14 text-lg font-semibold shadow-lg hover:shadow-xl transition-all'
                    type='primary'
                    htmlType='submit'
                    size='large'
                    onClick={handleSubmit}
                    loading={registerLoading}
                    disabled={
                      (hasUserAgreement || hasPrivacyPolicy) && !agreedToTerms
                    }
                  >
                    {t('注册')}
                  </Button>
                </div>
              </Form>

              {(status.github_oauth ||
                status.discord_oauth ||
                status.oidc_enabled ||
                status.wechat_login ||
                status.linuxdo_oauth ||
                status.telegram_oauth) && (
                <>
                  <Divider margin='12px' align='center'>
                    {t('或')}
                  </Divider>

                  <div className='mt-4 text-center'>
                    <Button
                      theme='outline'
                      type='tertiary'
                      className='w-full !rounded-full'
                      onClick={handleOtherRegisterOptionsClick}
                      loading={otherRegisterOptionsLoading}
                    >
                      {t('其他注册选项')}
                    </Button>
                  </div>
                </>
              )}

              <div className='mt-6 text-center text-sm'>
                <Text>
                  {t('已有账户？')}{' '}
                  <Link
                    to='/login'
                    className='text-blue-600 hover:text-blue-800 font-medium'
                  >
                    {t('登录')}
                  </Link>
                </Text>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderWeChatLoginModal = () => {
    return (
      <Modal
        title={t('微信扫码登录')}
        visible={showWeChatLoginModal}
        maskClosable={true}
        onOk={onSubmitWeChatVerificationCode}
        onCancel={() => setShowWeChatLoginModal(false)}
        okText={t('登录')}
        centered={true}
        okButtonProps={{
          loading: wechatCodeSubmitLoading,
        }}
      >
        <div className='flex flex-col items-center'>
          <img src={status.wechat_qrcode} alt='微信二维码' className='mb-4' />
        </div>

        <div className='text-center mb-4'>
          <p>
            {t('微信扫码关注公众号，输入「验证码」获取验证码（三分钟内有效）')}
          </p>
        </div>

        <Form>
          <Form.Input
            field='wechat_verification_code'
            placeholder={t('验证码')}
            label={t('验证码')}
            value={inputs.wechat_verification_code}
            onChange={(value) =>
              handleChange('wechat_verification_code', value)
            }
          />
        </Form>
      </Modal>
    );
  };

  return (
    <>
      {/* 公告模态框 */}
      <NoticeModal
        visible={noticeVisible}
        onClose={handleNoticeClose}
        isMobile={isMobile}
        defaultTab={unreadCount > 0 ? 'system' : 'inApp'}
        unreadKeys={getUnreadKeys()}
      />

      <div className='min-h-screen flex'>
      {/* 左侧 - 品牌展示区 */}
      <div className='hidden lg:flex lg:w-1/2 relative overflow-hidden'>
        {/* 背景图片 */}
        <div
          className='absolute inset-0 bg-cover bg-center bg-no-repeat'
          style={{ backgroundImage: `url(${loginImage})` }}
        >
          {/* 渐变遮罩 */}
          <div className='absolute inset-0 bg-gradient-to-br from-blue-400/80 via-blue-500/70 to-blue-600/80'></div>
        </div>

        {/* 内容区 */}
        <div className='relative z-10 flex flex-col justify-start items-center px-24 pt-32 pb-24 text-white h-full group'>
          {/* Logo和标题 */}
          <div className='text-center transition-all duration-500 group-hover:transform group-hover:scale-105'>
            {/* Polo API 标题 - 渐变色 */}
            <h1 className='text-6xl font-bold mb-8 transition-all duration-300' style={{ textShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
              <span style={{
                background: 'linear-gradient(135deg, #60a5fa 0%, #93c5fd 50%, #60a5fa 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                Polo
              </span>
              <span className='ml-3' style={{
                background: 'linear-gradient(135deg, #c084fc 0%, #e9d5ff 50%, #c084fc 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                API
              </span>
            </h1>

            {/* 标语 - 白色文字带阴影 */}
            <h2 className='text-3xl font-bold mb-8 text-white transition-all duration-500 group-hover:tracking-wider' style={{ textShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              {t('更强模型')} {t('更低价格')} {t('更易落地')}
            </h2>

            {/* 描述文字 - 白色半透明 */}
            <p className='text-base text-white/95 leading-relaxed max-w-xl mx-auto transition-all duration-500 group-hover:text-white' style={{ textShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
              {t('致力于为开发者提供快速、便捷的 Web API 接口调用方案，打造稳定且易于使用的 API 接口平台，一站式集成几乎所有 AI 大模型。')}
            </p>
          </div>
        </div>
      </div>

      {/* 右侧 - 注册表单区 */}
      <div className='w-full lg:w-1/2 flex flex-col bg-white dark:bg-zinc-900 relative'>
        {/* 顶部导航图标 */}
        <div className='absolute top-6 right-6 flex items-center gap-2 md:gap-3 z-10'>
          {/* 首页按钮 */}
          <Link
            to='/'
            className='inline-flex items-center justify-center w-9 h-9 rounded-full bg-semi-color-fill-0 dark:bg-semi-color-fill-1 hover:bg-semi-color-fill-1 dark:hover:bg-semi-color-fill-2 transition-colors'
            title={t('返回首页')}
          >
            <House size={18} className='text-current' />
          </Link>

          {/* 公告按钮 */}
          <NotificationButton
            unreadCount={unreadCount}
            onNoticeOpen={handleNoticeOpen}
            t={t}
          />

          {/* 主题切换 */}
          <ThemeToggle theme={theme} onThemeToggle={handleThemeToggle} t={t} />

          {/* 语言选择 */}
          <LanguageSelector
            currentLang={i18n.language}
            onLanguageChange={handleLanguageChange}
            t={t}
          />
        </div>

        {/* 表单内容区 */}
        <div className='flex-1 flex items-center justify-center p-8 overflow-y-auto'>
          <div className='w-full max-w-md'>
        {showEmailRegister ||
        !(
          status.github_oauth ||
          status.discord_oauth ||
          status.oidc_enabled ||
          status.wechat_login ||
          status.linuxdo_oauth ||
          status.telegram_oauth
        )
          ? renderEmailRegisterForm()
          : renderOAuthOptions()}
        {renderWeChatLoginModal()}

        {/* 用户协议模态框 */}
        <Modal
          title={t('用户协议')}
          visible={showUserAgreementModal}
          onCancel={() => setShowUserAgreementModal(false)}
          width={700}
          centered
          footer={
            <div className='flex justify-end'>
              <Button type='primary' onClick={handleAgreeUserAgreement}>
                {t('同意并继续')}
              </Button>
            </div>
          }
        >
          <div
            className='overflow-y-auto p-4 text-base leading-loose whitespace-pre-wrap'
            style={{ maxHeight: 'calc(66.67vh - 120px)' }}
            dangerouslySetInnerHTML={{ __html: userAgreementContent }}
          />
        </Modal>

        {/* 隐私政策模态框 */}
        <Modal
          title={t('隐私政策')}
          visible={showPrivacyPolicyModal}
          onCancel={() => setShowPrivacyPolicyModal(false)}
          width={700}
          centered
          footer={
            <div className='flex justify-end'>
              <Button type='primary' onClick={handleAgreePrivacyPolicy}>
                {t('同意并继续')}
              </Button>
            </div>
          }
        >
          <div
            className='overflow-y-auto p-4 text-base leading-loose whitespace-pre-wrap'
            style={{ maxHeight: 'calc(66.67vh - 120px)' }}
            dangerouslySetInnerHTML={{ __html: privacyPolicyContent }}
          />
        </Modal>

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
    </>
  );
};

export default RegisterForm;
