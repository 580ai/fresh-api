import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../../context/User';
import {
  API,
  getLogo,
  showError,
  showSuccess,
  updateAPI,
  getSystemName,
  setUserData,
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
import TwoFAVerification from './TwoFAVerification';
import DocumentRenderer from '../../components/common/DocumentRenderer';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

const LoginForm = () => {
  let navigate = useNavigate();
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({ username: '', password: '', wechat_verification_code: '' });
  const { username, password } = inputs;
  const [, userDispatch] = useContext(UserContext);
  
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [showWeChatLoginModal, setShowWeChatLoginModal] = useState(false);
  const [showTwoFA, setShowTwoFA] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  
  const [loginLoading, setLoginLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const logo = getLogo();
  const systemName = getSystemName();

  const [status] = useState(() => {
    const savedStatus = localStorage.getItem('status');
    return savedStatus ? JSON.parse(savedStatus) : {};
  });

  useEffect(() => {
    if (status.turnstile_check) {
      setTurnstileEnabled(true);
      setTurnstileSiteKey(status.turnstile_site_key);
    }
  }, [status]);

  const handleChange = (name, value) => {
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  };

  // 核心提交逻辑
  const handleSubmit = async (ignoreCheck = false) => {
    // 修改点：如果未勾选且不忽略检查，直接打开协议弹窗，不再 showInfo 提示
    if (!ignoreCheck && !agreedToTerms) {
      setShowAgreementModal(true);
      return;
    }

    if (turnstileEnabled && turnstileToken === '') {
      showError('请稍后，验证系统加载中...');
      return;
    }

    setLoginLoading(true);
    try {
      const res = await API.post(`/api/user/login?turnstile=${turnstileToken}`, { username, password });
      const { success, message, data } = res.data;
      
      if (success && data) {
        if (data.require_2fa) {
          setShowTwoFA(true);
          setLoginLoading(false);
          return;
        }
        
        userDispatch({ type: 'login', payload: data });
        setUserData(data);
        updateAPI();
        showSuccess('登录成功！');
        navigate('/console');
      } else {
        showError(message || '登录失败');
      }
    } catch (error) {
      showError('登录异常，请重试');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAgreeAndLogin = () => {
    setAgreedToTerms(true); 
    setShowAgreementModal(false);
    handleSubmit(true); // 强制执行登录，跳过勾选检查
  };

  const renderEmailForm = () => (
    <div className="w-full">
      <Form className="space-y-4">
        <div className="space-y-1">
          <Text strong type="secondary" size="small">用户名或邮箱</Text>
          <Form.Input
            noLabel
            field="username"
            placeholder="请输入用户名/邮箱"
            onChange={(v) => handleChange('username', v)}
            style={{ backgroundColor: '#F0F4FF', border: 'none', height: '48px', borderRadius: '12px' }}
          />
        </div>
        <div className="space-y-1">
          <Text strong type="secondary" size="small">密码</Text>
          <Form.Input
            noLabel
            field="password"
            mode="password"
            placeholder="请输入密码"
            onChange={(v) => handleChange('password', v)}
            style={{ backgroundColor: '#F0F4FF', border: 'none', height: '48px', borderRadius: '12px' }}
          />
        </div>

        <div className="flex items-center justify-between">
          <Checkbox checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)}>
            <span className="text-xs text-gray-400">
              我已阅读并同意 
              <span 
                className="font-bold cursor-pointer mx-1 hover:underline"
                style={{ color: '#2F65FF' }} 
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowAgreementModal(true);
                }}
              >
                《用户协议》
              </span>
            </span>
          </Checkbox>
          <Text size="small" link onClick={() => navigate('/reset')} style={{ cursor: 'pointer' }}>忘记密码?</Text>
        </div>

        <Button
          theme="solid"
          type="primary"
          block
          size="large"
          loading={loginLoading}
          onClick={() => handleSubmit(false)}
          style={{ borderRadius: '12px', height: '48px', backgroundColor: '#2F65FF', marginTop: '10px' }}
        >
          登录
        </Button>
      </Form>

      <div className="mt-6 text-center">
        <Text size="small" type="secondary">没有账户？ </Text>
        <Text size="small" link onClick={() => navigate('/register')} style={{ cursor: 'pointer', fontWeight: 'bold' }}>立即注册</Text>
      </div>

      <div className="flex items-center justify-center mt-8 gap-6">
        {status.github_oauth && <IconGithubLogo size="extra-large" className="cursor-pointer text-gray-400 hover:text-black transition-colors" onClick={() => onGitHubOAuthClicked(status.github_client_id)} />}
        {status.linuxdo_oauth && <LinuxDoIcon className="cursor-pointer w-6 h-6 grayscale hover:grayscale-0 transition-all" onClick={() => onLinuxDOOAuthClicked(status.linuxdo_client_id)} />}
        {status.wechat_login && <Icon svg={<WeChatIcon />} className="cursor-pointer text-gray-400 hover:text-green-500 transition-colors" onClick={() => setShowWeChatLoginModal(true)} />}
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full flex bg-white overflow-hidden font-sans">
      
      {/* --- 左侧背景 --- */}
      <div 
        className="hidden lg:block lg:w-7/12 h-full"
        style={{
            backgroundImage: 'url("/login.png")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
        }}
      />

      {/* --- 右侧内容 --- */}
      <div className="w-full lg:w-5/12 flex flex-col items-center justify-center px-8 sm:px-20 bg-white relative">
        <div className="absolute top-8 right-8 cursor-pointer text-gray-300 hover:text-blue-600 transition-colors">
           <IconLanguage size="large" />
        </div>

        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-10 text-center">
            <div className="p-4 bg-white shadow-xl rounded-2xl mb-4 border border-gray-50">
              <img src={logo} alt="Logo" className="h-10 w-10 object-contain" />
            </div>
            <Title heading={3} className="!m-0 text-gray-800">{systemName}</Title>
            <Text type="secondary" className="mt-1">用户登录</Text>
          </div>

          {renderEmailForm()}

          {turnstileEnabled && (
            <div className="flex justify-center mt-8 scale-90">
              <Turnstile sitekey={turnstileSiteKey} onVerify={(token) => setTurnstileToken(token)} />
            </div>
          )}
        </div>
      </div>

      {/* 协议弹窗 */}
      <Modal
        title={t('用户协议')}
        visible={showAgreementModal}
        onCancel={() => setShowAgreementModal(false)}
        width={800}
        centered
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowAgreementModal(false)}>取消</Button>
            <Button theme="solid" type="primary" onClick={handleAgreeAndLogin}>同意并继续登录</Button>
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

      {/* 其他业务弹窗 */}
      <Modal title="微信扫码登录" visible={showWeChatLoginModal} onCancel={() => setShowWeChatLoginModal(false)} footer={null} centered>
        <div className="flex flex-col items-center p-6 text-center">
          <img src={status.wechat_qrcode} alt="WeChat" className="w-48 h-48 mb-6 shadow-xl rounded-xl border border-gray-100" />
          <Text strong>扫码关注公众号并发送“验证码”</Text>
          <div className="mt-6 w-full max-w-xs text-left">
            <Form.Input placeholder="请输入 6 位验证码" size="large" onChange={v => handleChange('wechat_verification_code', v)} />
          </div>
        </div>
      </Modal>

      <Modal title="安全验证" visible={showTwoFA} onCancel={() => setShowTwoFA(false)} footer={null} centered>
        <TwoFAVerification onSuccess={(d) => { setUserData(d); navigate('/console'); }} onBack={() => setShowTwoFA(false)} isModal={true} />
      </Modal>
    </div>
  );
};

export default LoginForm;