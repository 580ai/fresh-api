import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  API,
  getLogo,
  showError,
  showInfo,
  showSuccess,
  getSystemName,
  onGitHubOAuthClicked,
  onLinuxDOOAuthClicked,
} from '../../helpers';
import Turnstile from 'react-turnstile';
import { Button, Checkbox, Form, Icon, Modal, Typography } from '@douyinfe/semi-ui';
import {
  IconGithubLogo,
  IconLanguage
} from '@douyinfe/semi-icons';
import WeChatIcon from '../common/logo/WeChatIcon';
import LinuxDoIcon from '../common/logo/LinuxDoIcon';
import DocumentRenderer from '../../components/common/DocumentRenderer';
import { UserContext } from '../../context/User';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const RegisterForm = () => {
  let navigate = useNavigate();
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({
    username: '',
    password: '',
    password2: '',
    email: '',
    verification_code: '',
  });
  const { username, password, password2 } = inputs;
  const [, userDispatch] = useContext(UserContext);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [verificationCodeLoading, setVerificationCodeLoading] = useState(false);
  const [disableButton, setDisableButton] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const logo = getLogo();
  const systemName = getSystemName();

  const [status] = useState(() => {
    const savedStatus = localStorage.getItem('status');
    return savedStatus ? JSON.parse(savedStatus) : {};
  });

  const showEmailVerification = status.email_verification ?? false;

  useEffect(() => {
    if (status.turnstile_check) {
      setTurnstileEnabled(true);
      setTurnstileSiteKey(status.turnstile_site_key);
    }
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
    return () => clearInterval(countdownInterval);
  }, [disableButton, countdown]);

  function handleChange(name, value) {
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  }

  const handleSubmit = async (ignoreCheck = false) => {
    if (!ignoreCheck && !agreedToTerms) {
      setShowAgreementModal(true);
      return;
    }
    if (password.length < 8) {
      showInfo('密码长度不得小于 8 位！');
      return;
    }
    if (password !== password2) {
      showInfo('两次输入的密码不一致');
      return;
    }
    if (turnstileEnabled && turnstileToken === '') {
      showInfo('验证中，请稍后...');
      return;
    }

    setRegisterLoading(true);
    try {
      const affCode = localStorage.getItem('aff');
      const registerData = { ...inputs, aff_code: affCode };
      const res = await API.post(`/api/user/register?turnstile=${turnstileToken}`, registerData);
      const { success, message } = res.data;
      if (success) {
        showSuccess('注册成功！');
        navigate('/login');
      } else {
        showError(message);
      }
    } catch (error) {
      showError('注册失败，请重试');
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleAgreeAndRegister = () => {
    setAgreedToTerms(true);
    setShowAgreementModal(false);
    setTimeout(() => {
      handleSubmit(true);
    }, 150);
  };

  const sendVerificationCode = async () => {
    if (!inputs.email) {
      showInfo('请输入邮箱地址');
      return;
    };
    setVerificationCodeLoading(true);
    try {
      const res = await API.get(`/api/verification?email=${inputs.email}&turnstile=${turnstileToken}`);
      const { success, message } = res.data;
      if (success) {
        showSuccess('验证码发送成功！');
        setDisableButton(true);
      } else {
        showError(message);
      }
    } catch (error) {
      showError('发送验证码失败');
    } finally {
      setVerificationCodeLoading(false);
    }
  };

  const renderRegisterForm = () => (
    <div className="w-full">
      <Form className="space-y-3">
        <div className="space-y-1">
          <Text strong type="secondary" size="small">{t('用户名')}</Text>
          <Form.Input
            noLabel
            field="username"
            placeholder={t('请输入用户名')}
            onChange={(v) => handleChange('username', v)}
            style={{ backgroundColor: '#F0F4FF', border: 'none', height: '45px', borderRadius: '12px' }}
          />
        </div>
        <div className="space-y-1">
          <Text strong type="secondary" size="small">{t('密码')}</Text>
          <Form.Input
            noLabel
            field="password"
            mode="password"
            placeholder={t('最短 8 位')}
            onChange={(v) => handleChange('password', v)}
            style={{ backgroundColor: '#F0F4FF', border: 'none', height: '45px', borderRadius: '12px' }}
          />
        </div>
        <div className="space-y-1">
          <Text strong type="secondary" size="small">{t('确认密码')}</Text>
          <Form.Input
            noLabel
            field="password2"
            mode="password"
            placeholder={t('请再次输入密码')}
            onChange={(v) => handleChange('password2', v)}
            style={{ backgroundColor: '#F0F4FF', border: 'none', height: '45px', borderRadius: '12px' }}
          />
        </div>

        {showEmailVerification && (
          <>
            <div className="space-y-1">
              <Text strong type="secondary" size="small">{t('邮箱')}</Text>
              <Form.Input
                noLabel
                field="email"
                placeholder={t('输入邮箱地址')}
                onChange={(v) => handleChange('email', v)}
                style={{ backgroundColor: '#F0F4FF', border: 'none', height: '45px', borderRadius: '12px' }}
                suffix={
                  <Button
                    onClick={sendVerificationCode}
                    loading={verificationCodeLoading}
                    disabled={disableButton || verificationCodeLoading}
                    size="small"
                    theme="borderless"
                  >
                    {disableButton ? `${countdown}s` : t('获取验证码')}
                  </Button>
                }
              />
            </div>
            <div className="space-y-1">
              <Text strong type="secondary" size="small">{t('验证码')}</Text>
              <Form.Input
                noLabel
                field="verification_code"
                placeholder={t('邮箱验证码')}
                onChange={(v) => handleChange('verification_code', v)}
                style={{ backgroundColor: '#F0F4FF', border: 'none', height: '45px', borderRadius: '12px' }}
              />
            </div>
          </>
        )}

        <div className="pt-2">
          <Checkbox checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)}>
            <span className="text-xs text-gray-400">
              {t('我已阅读并同意')}
              <span
                className="font-bold cursor-pointer mx-1 hover:underline"
                style={{ color: '#2F65FF' }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowAgreementModal(true);
                }}
              >
                《{t('用户协议')}》
              </span>
            </span>
          </Checkbox>
        </div>

        <Button
          theme="solid"
          type="primary"
          block
          size="large"
          loading={registerLoading}
          onClick={() => handleSubmit(false)}
          style={{ borderRadius: '12px', height: '48px', backgroundColor: '#2F65FF', marginTop: '10px' }}
        >
          {t('立即注册')}
        </Button>
      </Form>

      <div className="mt-6 text-center">
        <Text size="small" type="secondary">{t('已有账户？')} </Text>
        <Text size="small" link onClick={() => navigate('/login')} style={{ cursor: 'pointer', fontWeight: 'bold' }}>{t('登录')}</Text>
      </div>

      <div className="flex items-center justify-center mt-8 gap-6">
        {status.github_oauth && <IconGithubLogo size="extra-large" className="cursor-pointer text-gray-400 hover:text-black transition-colors" onClick={() => onGitHubOAuthClicked(status.github_client_id)} />}
        {status.linuxdo_oauth && <LinuxDoIcon className="cursor-pointer w-6 h-6 grayscale hover:grayscale-0 transition-all" onClick={() => onLinuxDOOAuthClicked(status.linuxdo_client_id)} />}
        {status.wechat_login && <Icon svg={<WeChatIcon />} className="cursor-pointer text-gray-400 hover:text-green-500 transition-colors" onClick={() => navigate('/login')} />}
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full flex bg-white overflow-hidden font-sans">
      {/* --- 左侧背景区域 (48% 宽度) --- */}
      <div 
        className="hidden lg:block lg:w-[48%] h-full relative"
        style={{
            backgroundImage: 'url("/login.png")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
        }}
      >
        <div className="absolute inset-0 bg-black/5 flex flex-col justify-start p-16 pt-24">
            <h1 className="text-4xl font-extrabold text-[#2F65FF] mb-2 drop-shadow-sm">PoloAPI</h1>
            <h2 className="text-2xl font-bold text-gray-800 mb-1 drop-shadow-sm">全球领先的AI大模型API供应商</h2>
            <div className="text-xl font-bold text-gray-700 mb-6 drop-shadow-sm flex items-center">
                专业稳定高并发 <span className="mx-2 text-gray-300">|</span> 直连官转中转API
            </div>
        </div>
      </div>

      {/* --- 右侧注册区 (52% 宽度) --- */}
      <div className="w-full lg:w-[52%] flex flex-col items-center justify-center px-8 sm:px-20 bg-white relative">
        <div className="absolute top-8 right-8 cursor-pointer text-gray-300 hover:text-blue-600 transition-colors">
          <IconLanguage size="large" />
        </div>

        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8 text-center">
            {/* <div className="p-4 bg-white shadow-xl rounded-2xl mb-4 border border-gray-50">
              <img src={logo} alt="Logo" className="h-10 w-10 object-contain" />
            </div> */}
            <Title heading={1} className="!m-0 text-gray-800">{systemName}</Title>
            <Text type="secondary" className="mt-1">{t('注 册')}</Text>
          </div>

          {renderRegisterForm()}

          {turnstileEnabled && (
            <div className="flex justify-center mt-6 scale-90">
              <Turnstile sitekey={turnstileSiteKey} onVerify={(token) => setTurnstileToken(token)} />
            </div>
          )}
        </div>
      </div>

      {/* 用户协议弹窗 */}
      <Modal
        title={t('用户协议')}
        visible={showAgreementModal}
        onCancel={() => setShowAgreementModal(false)}
        width={800}
        centered
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowAgreementModal(false)}>{t('取消')}</Button>
            <Button theme="solid" type="primary" onClick={handleAgreeAndRegister}>{t('同意并继续注册')}</Button>
          </div>
        }
      >
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          <DocumentRenderer
            apiEndpoint="/api/user-agreement"
            cacheKey="user_agreement"
            emptyMessage={t('加载用户协议内容失败...')}
          />
        </div>
      </Modal>
    </div>
  );
};

export default RegisterForm;