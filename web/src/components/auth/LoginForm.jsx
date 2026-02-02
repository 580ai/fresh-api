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
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { UserContext } from '../../context/User';
import { StatusContext } from '../../context/Status';
import {
  API,
  getLogo,
  showError,
  showInfo,
  showSuccess,
  updateAPI,
  getSystemName,
  setUserData,
  onGitHubOAuthClicked,
  onDiscordOAuthClicked,
  onOIDCClicked,
  onLinuxDOOAuthClicked,
  prepareCredentialRequestOptions,
  buildAssertionResult,
  isPasskeySupported,
} from '../../helpers';
import Turnstile from 'react-turnstile';
import { Button, Card, Checkbox, Divider, Form, Icon, Modal } from '@douyinfe/semi-ui';
import Title from '@douyinfe/semi-ui/lib/es/typography/title';
import Text from '@douyinfe/semi-ui/lib/es/typography/text';
import TelegramLoginButton from 'react-telegram-login';

import {
  IconGithubLogo,
  IconMail,
  IconLock,
  IconKey,
} from '@douyinfe/semi-icons';
import OIDCIcon from '../common/logo/OIDCIcon';
import WeChatIcon from '../common/logo/WeChatIcon';
import LinuxDoIcon from '../common/logo/LinuxDoIcon';
import TwoFAVerification from './TwoFAVerification';
import { useTranslation } from 'react-i18next';
import { SiDiscord }from 'react-icons/si';
import { House } from 'lucide-react';
import loginImage from './login.png';
import NotificationButton from '../layout/headerbar/NotificationButton';
import ThemeToggle from '../layout/headerbar/ThemeToggle';
import LanguageSelector from '../layout/headerbar/LanguageSelector';
import NoticeModal from '../layout/NoticeModal';
import { useNotifications } from '../../hooks/common/useNotifications';
import { useTheme, useSetTheme } from '../../context/Theme';
import { useIsMobile } from '../../hooks/common/useIsMobile';

const LoginForm = () => {
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
    wechat_verification_code: '',
  });
  const { username, password } = inputs;
  const [searchParams, setSearchParams] = useSearchParams();
  const [submitted, setSubmitted] = useState(false);
  const [userState, userDispatch] = useContext(UserContext);
  const [statusState] = useContext(StatusContext);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [showWeChatLoginModal, setShowWeChatLoginModal] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [wechatLoading, setWechatLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [oidcLoading, setOidcLoading] = useState(false);
  const [linuxdoLoading, setLinuxdoLoading] = useState(false);
  const [emailLoginLoading, setEmailLoginLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [otherLoginOptionsLoading, setOtherLoginOptionsLoading] =
    useState(false);
  const [wechatCodeSubmitLoading, setWechatCodeSubmitLoading] = useState(false);
  const [showTwoFA, setShowTwoFA] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
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

  useEffect(() => {
    if (status?.turnstile_check) {
      setTurnstileEnabled(true);
      setTurnstileSiteKey(status.turnstile_site_key);
    }
    
    // 从 status 获取用户协议和隐私政策的启用状态
    setHasUserAgreement(status?.user_agreement_enabled || false);
    setHasPrivacyPolicy(status?.privacy_policy_enabled || false);
  }, [status]);

  useEffect(() => {
    isPasskeySupported()
      .then(setPasskeySupported)
      .catch(() => setPasskeySupported(false));

    return () => {
      if (githubTimeoutRef.current) {
        clearTimeout(githubTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (searchParams.get('expired')) {
      showError(t('未登录或登录已过期，请重新登录'));
    }
  }, []);

  // 主题切换处理（与顶部导航栏一致）
  const handleThemeToggle = (newTheme) => {
    setTheme(newTheme);
  };

  // 语言切换处理（与顶部导航栏一致）
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
    e.stopPropagation(); // 阻止事件冒泡到 Checkbox
    fetchUserAgreement();
    setShowUserAgreementModal(true);
  };

  // 显示隐私政策模态框
  const handleShowPrivacyPolicy = (e) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止事件冒泡到 Checkbox
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
    if ((hasUserAgreement || hasPrivacyPolicy) && !agreedToTerms) {
      showInfo(t('请先阅读并同意用户协议和隐私政策'));
      return;
    }
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
    if ((hasUserAgreement || hasPrivacyPolicy) && !agreedToTerms) {
      showInfo(t('请先阅读并同意用户协议和隐私政策'));
      return;
    }
    if (turnstileEnabled && turnstileToken === '') {
      showInfo('请稍后几秒重试，Turnstile 正在检查用户环境！');
      return;
    }
    setSubmitted(true);
    setLoginLoading(true);
    try {
      if (username && password) {
        const res = await API.post(
          `/api/user/login?turnstile=${turnstileToken}`,
          {
            username,
            password,
          },
        );
        const { success, message, data } = res.data;
        if (success) {
          // 检查是否需要2FA验证
          if (data && data.require_2fa) {
            setShowTwoFA(true);
            setLoginLoading(false);
            return;
          }

          userDispatch({ type: 'login', payload: data });
          setUserData(data);
          updateAPI();
          showSuccess('登录成功！');
          if (username === 'root' && password === '123456') {
            Modal.error({
              title: '您正在使用默认密码！',
              content: '请立刻修改默认密码！',
              centered: true,
            });
          }
          navigate('/console');
        } else {
          showError(message);
        }
      } else {
        showError('请输入用户名和密码！');
      }
    } catch (error) {
      showError('登录失败，请重试');
    } finally {
      setLoginLoading(false);
    }
  }

  // 添加Telegram登录处理函数
  const onTelegramLoginClicked = async (response) => {
    if ((hasUserAgreement || hasPrivacyPolicy) && !agreedToTerms) {
      showInfo(t('请先阅读并同意用户协议和隐私政策'));
      return;
    }
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

  // 包装的GitHub登录点击处理
  const handleGitHubClick = () => {
    if ((hasUserAgreement || hasPrivacyPolicy) && !agreedToTerms) {
      showInfo(t('请先阅读并同意用户协议和隐私政策'));
      return;
    }
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
      // 由于重定向，这里不会执行到，但为了完整性添加
      setTimeout(() => setGithubLoading(false), 3000);
    }
  };

  // 包装的Discord登录点击处理
  const handleDiscordClick = () => {
    if ((hasUserAgreement || hasPrivacyPolicy) && !agreedToTerms) {
      showInfo(t('请先阅读并同意用户协议和隐私政策'));
      return;
    }
    setDiscordLoading(true);
    try {
      onDiscordOAuthClicked(status.discord_client_id, { shouldLogout: true });
    } finally {
      // 由于重定向，这里不会执行到，但为了完整性添加
      setTimeout(() => setDiscordLoading(false), 3000);
    }
  };

  // 包装的OIDC登录点击处理
  const handleOIDCClick = () => {
    if ((hasUserAgreement || hasPrivacyPolicy) && !agreedToTerms) {
      showInfo(t('请先阅读并同意用户协议和隐私政策'));
      return;
    }
    setOidcLoading(true);
    try {
      onOIDCClicked(
        status.oidc_authorization_endpoint,
        status.oidc_client_id,
        false,
        { shouldLogout: true },
      );
    } finally {
      // 由于重定向，这里不会执行到，但为了完整性添加
      setTimeout(() => setOidcLoading(false), 3000);
    }
  };

  // 包装的LinuxDO登录点击处理
  const handleLinuxDOClick = () => {
    if ((hasUserAgreement || hasPrivacyPolicy) && !agreedToTerms) {
      showInfo(t('请先阅读并同意用户协议和隐私政策'));
      return;
    }
    setLinuxdoLoading(true);
    try {
      onLinuxDOOAuthClicked(status.linuxdo_client_id, { shouldLogout: true });
    } finally {
      // 由于重定向，这里不会执行到，但为了完整性添加
      setTimeout(() => setLinuxdoLoading(false), 3000);
    }
  };

  // 包装的邮箱登录选项点击处理
  const handleEmailLoginClick = () => {
    setEmailLoginLoading(true);
    setShowEmailLogin(true);
    setEmailLoginLoading(false);
  };

  const handlePasskeyLogin = async () => {
    if ((hasUserAgreement || hasPrivacyPolicy) && !agreedToTerms) {
      showInfo(t('请先阅读并同意用户协议和隐私政策'));
      return;
    }
    if (!passkeySupported) {
      showInfo('当前环境无法使用 Passkey 登录');
      return;
    }
    if (!window.PublicKeyCredential) {
      showInfo('当前浏览器不支持 Passkey');
      return;
    }

    setPasskeyLoading(true);
    try {
      const beginRes = await API.post('/api/user/passkey/login/begin');
      const { success, message, data } = beginRes.data;
      if (!success) {
        showError(message || '无法发起 Passkey 登录');
        return;
      }

      const publicKeyOptions = prepareCredentialRequestOptions(
        data?.options || data?.publicKey || data,
      );
      const assertion = await navigator.credentials.get({
        publicKey: publicKeyOptions,
      });
      const payload = buildAssertionResult(assertion);
      if (!payload) {
        showError('Passkey 验证失败，请重试');
        return;
      }

      const finishRes = await API.post(
        '/api/user/passkey/login/finish',
        payload,
      );
      const finish = finishRes.data;
      if (finish.success) {
        userDispatch({ type: 'login', payload: finish.data });
        setUserData(finish.data);
        updateAPI();
        showSuccess('登录成功！');
        navigate('/console');
      } else {
        showError(finish.message || 'Passkey 登录失败，请重试');
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        showInfo('已取消 Passkey 登录');
      } else {
        showError('Passkey 登录失败，请重试');
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  // 包装的重置密码点击处理
  const handleResetPasswordClick = () => {
    setResetPasswordLoading(true);
    navigate('/reset');
    setResetPasswordLoading(false);
  };

  // 包装的其他登录选项点击处理
  const handleOtherLoginOptionsClick = () => {
    setOtherLoginOptionsLoading(true);
    setShowEmailLogin(false);
    setOtherLoginOptionsLoading(false);
  };

  // 2FA验证成功处理
  const handle2FASuccess = (data) => {
    userDispatch({ type: 'login', payload: data });
    setUserData(data);
    updateAPI();
    showSuccess('登录成功！');
    navigate('/console');
  };

  // 返回登录页面
  const handleBackToLogin = () => {
    setShowTwoFA(false);
    setInputs({ username: '', password: '', wechat_verification_code: '' });
  };

  const renderOAuthOptions = () => {
    return (
      <div className='flex flex-col items-center'>
        <div className='w-full'>
          <div className='flex items-center justify-center mb-8 gap-2'>
            <img src={logo} alt='Logo' className='h-10 rounded-full' />
            <Title heading={2} className='!text-gray-800 dark:!text-gray-200'>
              Polo API
            </Title>
          </div>

          <div className='w-full max-w-md mx-auto'>
            <div className='flex justify-center mb-8'>
              <Title heading={3} className='text-gray-800 dark:text-gray-200 font-semibold'>
                {t('用户登录')}
              </Title>
            </div>
            <div className='space-y-4'>
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
                    icon={<SiDiscord style={{ color: '#5865F2', width: '20px', height: '20px' }} />}
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

                {status.passkey_login && passkeySupported && (
                  <Button
                    theme='outline'
                    className='w-full h-12 flex items-center justify-center !rounded-full border border-gray-200 hover:bg-gray-50 transition-colors'
                    type='tertiary'
                    icon={<IconKey size='large' />}
                    onClick={handlePasskeyLogin}
                    loading={passkeyLoading}
                  >
                    <span className='ml-3'>{t('使用 Passkey 登录')}</span>
                  </Button>
                )}

                <Divider margin='12px' align='center'>
                  {t('或')}
                </Divider>

                <Button
                  theme='solid'
                  type='primary'
                  className='w-full h-12 flex items-center justify-center bg-black text-white !rounded-full hover:bg-gray-800 transition-colors'
                  icon={<IconMail size='large' />}
                  onClick={handleEmailLoginClick}
                  loading={emailLoginLoading}
                >
                  <span className='ml-3'>{t('使用 邮箱或用户名 登录')}</span>
                </Button>
              </div>

              {(hasUserAgreement || hasPrivacyPolicy) && (
                <div className='mt-6'>
                  <Checkbox
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                  >
                    <Text size='small' className='text-gray-600'>
                      {t('我已阅读并同意')}
                      {hasUserAgreement && (
                        <>
                          <a
                            href='#'
                            onClick={handleShowUserAgreement}
                            className='text-blue-600 hover:text-blue-800 mx-1 cursor-pointer'
                          >
                            {t('用户协议')}
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
                            {t('隐私政策')}
                          </a>
                        </>
                      )}
                    </Text>
                    </Checkbox>
                  </div>
                )}

              {!status.self_use_mode_enabled && (
                <div className='mt-6 text-center text-sm'>
                  <Text>
                    {t('没有账户？')}{' '}
                    <Link
                      to='/register'
                      className='text-blue-600 hover:text-blue-800 font-medium'
                    >
                      {t('注册')}
                    </Link>
                  </Text>
                </div>
              )}
            </div>
          </div>
        </div>
    );
  };

  const renderEmailLoginForm = () => {
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
                {t('用户登录')}
              </Title>
            </div>
            <div className='space-y-4'>
              {status.passkey_login && passkeySupported && (
                <Button
                  theme='outline'
                  type='tertiary'
                  className='w-full h-12 flex items-center justify-center !rounded-full border border-gray-200 hover:bg-gray-50 transition-colors mb-4'
                  icon={<IconKey size='large' />}
                  onClick={handlePasskeyLogin}
                  loading={passkeyLoading}
                >
                  <span className='ml-3'>{t('使用 Passkey 登录')}</span>
                </Button>
              )}
              <Form className='space-y-6'>
                <Form.Input
                  field='username'
                  label={t('用户名或邮箱')}
                  name='username'
                  onChange={(value) => handleChange('username', value)}
                  prefix={<IconMail />}
                  className='!rounded-lg'
                  placeholder={t('请输入您的用户名或邮箱地址')}
                  style={{ height: '56px' }}
                  inputStyle={{ fontSize: '16px', height: '56px', padding: '0 16px' }}
                  labelStyle={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}
                />

                <Form.Input
                  field='password'
                  label={t('密码')}
                  name='password'
                  mode='password'
                  onChange={(value) => handleChange('password', value)}
                  prefix={<IconLock />}
                  className='!rounded-lg'
                  placeholder={t('请输入您的密码')}
                  style={{ height: '56px' }}
                  inputStyle={{ fontSize: '16px', height: '56px', padding: '0 16px' }}
                  labelStyle={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}
                />

                <div className='flex items-center justify-between pt-2'>
                  {(hasUserAgreement || hasPrivacyPolicy) && (
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
                  )}
                  <Button
                    theme='borderless'
                    type='tertiary'
                    size='big'
                    onClick={handleResetPasswordClick}
                    loading={resetPasswordLoading}
                    className='text-blue-600 hover:text-blue-800 mx-1'
                  >
                    {t('忘记密码？')}
                  </Button>
                </div>

                <div className='space-y-2 pt-6'>
                  <Button
                    theme='solid'
                    className='w-full !rounded-full h-14 text-lg font-semibold shadow-lg hover:shadow-xl transition-all'
                    type='primary'
                    size='large'
                    htmlType='submit'
                    onClick={handleSubmit}
                    loading={loginLoading}
                    disabled={(hasUserAgreement || hasPrivacyPolicy) && !agreedToTerms}
                  >
                    {t('登录')}
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
                      onClick={handleOtherLoginOptionsClick}
                      loading={otherLoginOptionsLoading}
                    >
                      {t('其他登录选项')}
                    </Button>
                  </div>
                </>
              )}

              {!status.self_use_mode_enabled && (
                <div className='mt-6 text-center text-sm'>
                  <Text>
                    {t('没有账户？')}{' '}
                    <Link
                      to='/register'
                      className='text-blue-600 hover:text-blue-800 font-medium'
                    >
                      {t('注册')}
                    </Link>
                  </Text>
                </div>
              )}

              {/* 社交登录图标 */}
              {(status.github_oauth || status.wechat_login) && (
                <div className='mt-6 flex justify-center gap-4'>
                  {status.github_oauth && (
                    <button
                      onClick={handleGitHubClick}
                      disabled={githubButtonDisabled}
                      className='w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                    >
                      <IconGithubLogo size='large' />
                    </button>
                  )}
                  {status.wechat_login && (
                    <button
                      onClick={onWeChatLoginClicked}
                      className='w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors'
                    >
                      <Icon svg={<WeChatIcon />} style={{ color: '#07C160' }} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 微信登录模态框
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

  // 2FA验证弹窗
  const render2FAModal = () => {
    return (
      <Modal
        title={
          <div className='flex items-center'>
            <div className='w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mr-3'>
              <svg
                className='w-4 h-4 text-green-600 dark:text-green-400'
                fill='currentColor'
                viewBox='0 0 20 20'
              >
                <path
                  fillRule='evenodd'
                  d='M6 8a2 2 0 11-4 0 2 2 0 014 0zM8 7a1 1 0 100 2h8a1 1 0 100-2H8zM6 14a2 2 0 11-4 0 2 2 0 014 0zM8 13a1 1 0 100 2h8a1 1 0 100-2H8z'
                  clipRule='evenodd'
                />
              </svg>
            </div>
            两步验证
          </div>
        }
        visible={showTwoFA}
        onCancel={handleBackToLogin}
        footer={null}
        width={450}
        centered
      >
        <TwoFAVerification
          onSuccess={handle2FASuccess}
          onBack={handleBackToLogin}
          isModal={true}
        />
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
            <p className='text-base text-white/90 leading-relaxed max-w-xl mx-auto transition-all duration-500 group-hover:text-white' style={{ textShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
              {t('致力于为开发者提供快速、便捷的 Web API 接口调用方案，打造稳定且易于使用的 API 接口平台，一站式集成几乎所有 AI 大模型。')}
            </p>
          </div>
        </div>
      </div>

      {/* 右侧 - 登录表单区 */}
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

          {/* 主题切换按钮 */}
          <ThemeToggle
            theme={theme}
            onThemeToggle={handleThemeToggle}
            t={t}
          />

          {/* 语言选择器 */}
          <LanguageSelector
            currentLang={i18n.language}
            onLanguageChange={handleLanguageChange}
            t={t}
          />
        </div>

        {/* 登录表单容器 */}
        <div className='flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12'>
          <div className='w-full max-w-md'>

          {showEmailLogin ||
          !(
            status.github_oauth ||
            status.discord_oauth ||
            status.oidc_enabled ||
            status.wechat_login ||
            status.linuxdo_oauth ||
            status.telegram_oauth
          )
            ? renderEmailLoginForm()
            : renderOAuthOptions()}
          {renderWeChatLoginModal()}
          {render2FAModal()}

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

export default LoginForm;
