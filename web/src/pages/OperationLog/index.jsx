import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Select,
  DatePicker,
  Input,
  Modal,
  Tag,
  Card,
  Space,
  Typography,
  Descriptions,
} from '@douyinfe/semi-ui';
import { IconSearch, IconRefresh, IconArrowRight } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError, timestamp2string } from '../../helpers';

const { Text } = Typography;

// 模块名称映射
const moduleLabels = {
  channel: '渠道',
  option: '系统参数',
  user: '用户',
  token: '令牌',
  model: '模型',
  redemption: '兑换码',
};

// 动作名称映射
const actionLabels = {
  create: '创建',
  update: '更新',
  delete: '删除',
  enable: '启用',
  disable: '禁用',
};

// 动作标签颜色
const actionColors = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  enable: 'cyan',
  disable: 'orange',
};

// 各模块字段中文映射
const fieldLabels = {
  // 渠道字段
  channel: {
    id: 'ID',
    name: '名称',
    type: '类型',
    base_url: '代理地址',
    other: '其他参数',
    models: '模型',
    model_mapping: '模型映射',
    status: '状态',
    group: '分组',
    groups: '分组',
    weight: '权重',
    priority: '优先级',
    tag: '标签',
    setting: '设置',
    test_model: '测速模型',
    tested_time: '测速时间',
    response_time: '响应时间',
    used_quota: '已用额度',
    balance: '余额',
    balance_updated_time: '余额更新时间',
    auto_ban: '自动禁用',
    is_tools: '函数调用',
    claude_original_request: 'Claude原始请求',
    status_code_mapping: '状态码映射',
    headers: '请求头',
    fix_content: '固定内容',
    used_count: '使用次数',
  },
  // 系统参数名称映射
  option: {
    // 通用设置
    RetryTimes: '重试次数',
    RetryInterval: '重试间隔',
    GlobalApiRateLimitNum: '全局API速率限制',
    DefaultCollapseSidebar: '默认折叠侧边栏',
    ChannelDisableThreshold: '渠道禁用阈值',
    QuotaPerUnit: '单位额度',
    DisplayInCurrencyEnabled: '显示货币',
    DisplayTokenStatEnabled: '显示Token统计',
    AutomaticDisableChannelEnabled: '自动禁用渠道',
    AutomaticEnableChannelEnabled: '自动启用渠道',
    LogConsumeEnabled: '记录消费日志',
    QuotaRemindThreshold: '额度提醒阈值',
    PreConsumedQuota: '预消费额度',
    GroupRatio: '分组倍率',
    CompletionRatio: '补全倍率',
    ModelRatio: '模型倍率',
    ModelPrice: '模型价格',
    CacheRatio: '缓存倍率',
    ImageRatio: '图片倍率',
    AudioRatio: '音频倍率',
    AudioCompletionRatio: '音频补全倍率',
    GroupGroupRatio: '分组分组倍率',
    GroupOrder: '分组顺序',
    TopUpLink: '充值链接',
    ChatLink: '聊天链接',
    SystemName: '系统名称',
    Logo: 'Logo',
    Footer: '页脚',
    About: '关于',
    HomePageContent: '首页内容',
    Theme: '主题',
    ServerAddress: '服务器地址',
    // 注册登录
    PasswordLoginEnabled: '密码登录',
    PasswordRegisterEnabled: '密码注册',
    EmailVerificationEnabled: '邮箱验证',
    GitHubOAuthEnabled: 'GitHub登录',
    DiscordOAuthEnabled: 'Discord登录',
    LinuxDOOAuthEnabled: 'LinuxDO登录',
    WeChatAuthEnabled: '微信登录',
    TelegramOAuthEnabled: 'Telegram登录',
    TurnstileCheckEnabled: 'Turnstile验证',
    RegisterEnabled: '允许注册',
    EmailDomainRestrictionEnabled: '邮箱域名限制',
    EmailAliasRestrictionEnabled: '邮箱别名限制',
    EmailDomainWhitelist: '邮箱域名白名单',
    // 邮件设置
    SMTPServer: 'SMTP服务器',
    SMTPPort: 'SMTP端口',
    SMTPAccount: 'SMTP账号',
    SMTPToken: 'SMTP密码',
    SMTPFrom: '发件人地址',
    SMTPSSLEnabled: 'SMTP SSL',
    // 额度设置
    QuotaForNewUser: '新用户额度',
    QuotaForInviter: '邀请人额度',
    QuotaForInvitee: '被邀请人额度',
    TopupGroupRatio: '充值分组倍率',
    // 支付设置
    PayAddress: '支付地址',
    EpayId: '易支付ID',
    EpayKey: '易支付密钥',
    Price: '价格',
    USDExchangeRate: '美元汇率',
    MinTopUp: '最低充值',
    StripeApiSecret: 'Stripe密钥',
    StripeWebhookSecret: 'Stripe Webhook密钥',
    StripePriceId: 'Stripe价格ID',
    StripeUnitPrice: 'Stripe单价',
    StripeMinTopUp: 'Stripe最低充值',
    StripePromotionCodesEnabled: 'Stripe促销码',
    CreemApiKey: 'Creem API密钥',
    CreemProducts: 'Creem产品',
    CreemTestMode: 'Creem测试模式',
    CreemWebhookSecret: 'Creem Webhook密钥',
    PayMethods: '支付方式',
    CustomCallbackAddress: '自定义回调地址',
    // OAuth设置
    GitHubClientId: 'GitHub客户端ID',
    GitHubClientSecret: 'GitHub客户端密钥',
    LinuxDOClientId: 'LinuxDO客户端ID',
    LinuxDOClientSecret: 'LinuxDO客户端密钥',
    LinuxDOMinimumTrustLevel: 'LinuxDO最低信任等级',
    TelegramBotToken: 'Telegram机器人Token',
    TelegramBotName: 'Telegram机器人名称',
    WeChatServerAddress: '微信服务器地址',
    WeChatServerToken: '微信服务器Token',
    WeChatAccountQRCodeImageURL: '微信二维码图片',
    TurnstileSiteKey: 'Turnstile站点密钥',
    TurnstileSecretKey: 'Turnstile密钥',
    // 功能开关
    DrawingEnabled: '绘图功能',
    TaskEnabled: '任务功能',
    DataExportEnabled: '数据导出',
    DataExportInterval: '数据导出间隔',
    DataExportDefaultTime: '数据导出默认时间',
    // MJ设置
    MjNotifyEnabled: 'MJ通知',
    MjAccountFilterEnabled: 'MJ账号过滤',
    MjModeClearEnabled: 'MJ模式清除',
    MjForwardUrlEnabled: 'MJ转发URL',
    MjActionCheckSuccessEnabled: 'MJ动作检查',
    // 敏感词设置
    CheckSensitiveEnabled: '敏感词检测',
    CheckSensitiveOnPromptEnabled: '提示词敏感检测',
    StopOnSensitiveEnabled: '敏感词停止',
    SensitiveWords: '敏感词列表',
    // 速率限制
    ModelRequestRateLimitEnabled: '模型请求限制',
    ModelRequestRateLimitCount: '模型请求限制次数',
    ModelRequestRateLimitDurationMinutes: '模型请求限制时长',
    ModelRequestRateLimitSuccessCount: '模型请求成功限制',
    ModelRequestRateLimitGroup: '模型请求限制分组',
    // Worker设置
    WorkerUrl: 'Worker地址',
    WorkerValidKey: 'Worker验证密钥',
    WorkerAllowHttpImageRequestEnabled: 'Worker允许HTTP图片',
    // 其他
    Notice: '公告',
    SystemText: '系统提示',
    ModelMapping: '模型映射',
    ChannelTestModel: '测试模型',
    PaymentEnabled: '支付功能',
    RechargeDiscount: '充值折扣',
    PaymentMinAmount: '最低充值',
    PaymentUSDRate: '美元汇率',
    SidebarModulesAdmin: '管理员侧边栏',
    HeaderNavModules: '顶栏导航',
    Chats: '聊天配置',
    AutoGroups: '自动分组',
    DefaultUseAutoGroup: '默认自动分组',
    UserUsableGroups: '用户可用分组',
    DemoSiteEnabled: '演示站点',
    SelfUseModeEnabled: '自用模式',
    StreamCacheQueueLength: '流缓存队列长度',
    AutomaticDisableKeywords: '自动禁用关键词',
    AutomaticDisableStatusCodes: '自动禁用状态码',
    AutomaticRetryStatusCodes: '自动重试状态码',
    ExposeRatioEnabled: '公开倍率',
    SpecialModelPrice: '特殊模型价格',
    TextModelPrice: '文本模型价格',
  },
  // 用户字段
  user: {
    id: 'ID',
    username: '用户名',
    display_name: '显示名称',
    role: '角色',
    status: '状态',
    email: '邮箱',
    group: '分组',
    quota: '额度',
    used_quota: '已用额度',
    request_count: '请求次数',
    remark: '备注',
    inviter_id: '邀请人ID',
  },
  // 令牌字段
  token: {
    id: 'ID',
    name: '名称',
    user_id: '用户ID',
    status: '状态',
    expired_time: '过期时间',
    remain_quota: '剩余额度',
    unlimited_quota: '无限额度',
    model_limits_enabled: '模型限制',
    group: '分组',
    models: '可用模型',
  },
  // 兑换码字段
  redemption: {
    id: 'ID',
    name: '名称',
    status: '状态',
    quota: '额度',
    count: '数量',
    created_time: '创建时间',
    expired_time: '过期时间',
    redeemed_time: '兑换时间',
    user_id: '创建者ID',
    keys: '兑换码',
  },
  // 模型字段
  model: {
    id: 'ID',
    name: '名称',
    owned_by: '提供商',
  },
};

// 状态值映射
const statusLabels = {
  1: '启用',
  2: '禁用',
  3: '已过期',
  4: '已耗尽',
};

// 角色值映射
const roleLabels = {
  1: '普通用户',
  10: '管理员',
  100: '超级管理员',
};

// 格式化字段值为可读形式
const formatFieldValue = (key, value, module) => {
  if (value === null || value === undefined) return '-';
  if (value === '') return '(空)';
  if (value === true) return '是';
  if (value === false) return '否';

  // 状态字段
  if (key === 'status' && typeof value === 'number') {
    return statusLabels[value] || value;
  }

  // 角色字段
  if (key === 'role' && typeof value === 'number') {
    return roleLabels[value] || value;
  }

  // 时间戳字段
  if ((key.includes('time') || key.includes('Time')) && typeof value === 'number' && value > 1000000000) {
    if (value === -1) return '永不过期';
    return timestamp2string(value);
  }

  // 额度字段 - 转换为美元显示
  if ((key === 'quota' || key === 'remain_quota' || key === 'used_quota') && typeof value === 'number') {
    return `$${(value / 500000).toFixed(2)}`;
  }

  // 数组字段
  if (Array.isArray(value)) {
    if (value.length === 0) return '(空)';
    return value.join('、');
  }

  // 对象字段
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

// 获取字段的中文标签
const getFieldLabel = (module, field) => {
  return fieldLabels[module]?.[field] || fieldLabels.channel?.[field] || field;
};

// 比较两个值并生成差异
const compareValues = (oldVal, newVal, key, module) => {
  const oldFormatted = formatFieldValue(key, oldVal, module);
  const newFormatted = formatFieldValue(key, newVal, module);

  if (oldFormatted === newFormatted) return null;

  return {
    field: key,
    label: getFieldLabel(module, key),
    oldValue: oldFormatted,
    newValue: newFormatted,
  };
};

// 生成变更列表
const generateChanges = (oldValue, newValue, module) => {
  const changes = [];

  let oldObj = {};
  let newObj = {};

  try {
    oldObj = typeof oldValue === 'string' ? JSON.parse(oldValue || '{}') : (oldValue || {});
  } catch {
    oldObj = {};
  }

  try {
    newObj = typeof newValue === 'string' ? JSON.parse(newValue || '{}') : (newValue || {});
  } catch {
    newObj = {};
  }

  // 收集所有字段
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  // 定义字段显示顺序优先级
  const priorityFields = ['name', 'username', 'display_name', 'status', 'group', 'groups', 'quota', 'role'];
  const sortedKeys = [...allKeys].sort((a, b) => {
    const aIdx = priorityFields.indexOf(a);
    const bIdx = priorityFields.indexOf(b);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    // 跳过一些不需要显示的字段
    if (['key', 'keys', 'id'].includes(key) && module !== 'redemption') continue;

    const change = compareValues(oldObj[key], newObj[key], key, module);
    if (change) {
      changes.push(change);
    }
  }

  return changes;
};

const OperationLog = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选条件
  const [filters, setFilters] = useState({
    module: '',
    action: '',
    username: '',
    keyword: '',
    start_timestamp: '',
    end_timestamp: '',
  });

  // 详情弹窗
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailData, setDetailData] = useState(null);

  // 获取日志数据
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      });

      if (filters.module) params.append('module', filters.module);
      if (filters.action) params.append('action', filters.action);
      if (filters.username) params.append('username', filters.username);
      if (filters.keyword) params.append('keyword', filters.keyword);
      if (filters.start_timestamp) params.append('start_timestamp', filters.start_timestamp);
      if (filters.end_timestamp) params.append('end_timestamp', filters.end_timestamp);

      const res = await API.get(`/api/operation_log/?${params.toString()}`);
      if (res.data.success) {
        setLogs(res.data.data.items || []);
        setTotal(res.data.data.total || 0);
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // 处理筛选变化
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  // 处理时间范围变化
  const handleDateChange = (dates) => {
    if (dates && dates.length === 2) {
      setFilters(prev => ({
        ...prev,
        start_timestamp: Math.floor(dates[0].getTime() / 1000).toString(),
        end_timestamp: Math.floor(dates[1].getTime() / 1000).toString(),
      }));
    } else {
      setFilters(prev => ({
        ...prev,
        start_timestamp: '',
        end_timestamp: '',
      }));
    }
    setPage(1);
  };

  // 重置筛选
  const handleReset = () => {
    setFilters({
      module: '',
      action: '',
      username: '',
      keyword: '',
      start_timestamp: '',
      end_timestamp: '',
    });
    setPage(1);
  };

  // 显示详情
  const showDetail = (record) => {
    setDetailData(record);
    setDetailVisible(true);
  };

  // 解析可能被双重编码的 JSON
const parseJsonValue = (val) => {
  if (!val) return null;
  try {
    let parsed = JSON.parse(val);
    // 如果解析结果还是字符串，再解析一次
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    return parsed;
  } catch {
    return null;
  }
};

// 格式化值为可读字符串
const formatValue = (val) => {
  if (val === undefined) return '(无)';
  if (val === null) return '(空)';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

// 生成简要变更摘要（用于表格描述列）
  const getChangeSummary = (record) => {
    if (record.action === 'create') {
      return record.description || `创建${moduleLabels[record.module] || record.module}: ${record.target_name}`;
    }
    if (record.action === 'delete') {
      return record.description || `删除${moduleLabels[record.module] || record.module}: ${record.target_name}`;
    }

    // 系统参数特殊处理
    if (record.module === 'option') {
      const paramName = record.target_id || record.target_name;
      const label = fieldLabels.option?.[paramName] || paramName;
      const oldVal = record.old_value || '';
      const newVal = record.new_value || '';

      // 尝试解析为 JSON，比较差异
      const oldObj = parseJsonValue(oldVal);
      const newObj = parseJsonValue(newVal);

      // 如果都是对象，找出变更的字段
      if (oldObj && newObj && typeof oldObj === 'object' && typeof newObj === 'object' && !Array.isArray(oldObj) && !Array.isArray(newObj)) {
        const changedFields = [];
        const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
        for (const key of allKeys) {
          const oldValue = oldObj[key];
          const newValue = newObj[key];
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changedFields.push({ key, oldValue, newValue });
          }
        }
        if (changedFields.length === 0) {
          return record.description || '-';
        }
        const summary = changedFields.slice(0, 2).map(c => {
          const o = formatValue(c.oldValue);
          const n = formatValue(c.newValue);
          return `${c.key}: ${o} → ${n}`;
        }).join('; ');
        if (changedFields.length > 2) {
          return `${label}: ${summary} 等${changedFields.length}项`;
        }
        return `${label}: ${summary}`;
      }

      // 普通字符串值
      return `${label}: ${oldVal || '(空)'} → ${newVal || '(空)'}`;
    }

    const changes = generateChanges(record.old_value, record.new_value, record.module);
    if (changes.length === 0) {
      return record.description || '-';
    }

    // 取前2个变更作为摘要
    const summary = changes.slice(0, 2).map(c => `${c.label}: ${c.oldValue} → ${c.newValue}`).join('; ');
    if (changes.length > 2) {
      return `${summary} 等${changes.length}项变更`;
    }
    return summary;
  };

  // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 70,
    },
    {
      title: t('操作时间'),
      dataIndex: 'created_at',
      width: 170,
      render: (value) => timestamp2string(value),
    },
    {
      title: t('操作人'),
      dataIndex: 'username',
      width: 100,
    },
    {
      title: t('模块'),
      dataIndex: 'module',
      width: 90,
      render: (value) => moduleLabels[value] || value,
    },
    {
      title: t('动作'),
      dataIndex: 'action',
      width: 70,
      render: (value) => (
        <Tag color={actionColors[value] || 'default'} size="small">
          {actionLabels[value] || value}
        </Tag>
      ),
    },
    {
      title: t('目标'),
      dataIndex: 'target_name',
      width: 120,
      ellipsis: true,
    },
    {
      title: t('变更摘要'),
      dataIndex: 'description',
      ellipsis: true,
      render: (_, record) => (
        <Text ellipsis={{ showTooltip: true }} style={{ width: '100%' }}>
          {getChangeSummary(record)}
        </Text>
      ),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 120,
    },
    {
      title: t('操作'),
      width: 70,
      render: (_, record) => (
        <Button size="small" theme="borderless" onClick={() => showDetail(record)}>
          {t('详情')}
        </Button>
      ),
    },
  ];

  // 渲染变更详情
  const renderChanges = () => {
    if (!detailData) return null;

    const { action, module, old_value, new_value, target_name } = detailData;

    // 创建操作：显示新值
    if (action === 'create') {
      let newObj = {};
      try {
        newObj = typeof new_value === 'string' ? JSON.parse(new_value || '{}') : (new_value || {});
      } catch {
        newObj = {};
      }

      return (
        <div>
          <Text strong style={{ color: 'var(--semi-color-success)' }}>
            新建内容
          </Text>
          <div style={{
            marginTop: 12,
            padding: 16,
            background: 'var(--semi-color-fill-0)',
            borderRadius: 8,
            border: '1px solid var(--semi-color-border)',
          }}>
            {Object.entries(newObj).map(([key, value]) => {
              if (key === 'key' || key === 'keys') return null;
              return (
                <div key={key} style={{
                  display: 'flex',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--semi-color-border)',
                }}>
                  <Text type="tertiary" style={{ width: 120, flexShrink: 0 }}>
                    {getFieldLabel(module, key)}
                  </Text>
                  <Text style={{ color: 'var(--semi-color-success)' }}>
                    {formatFieldValue(key, value, module)}
                  </Text>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // 删除操作：显示旧值
    if (action === 'delete') {
      let oldObj = {};
      try {
        oldObj = typeof old_value === 'string' ? JSON.parse(old_value || '{}') : (old_value || {});
      } catch {
        oldObj = {};
      }

      return (
        <div>
          <Text strong style={{ color: 'var(--semi-color-danger)' }}>
            删除内容
          </Text>
          <div style={{
            marginTop: 12,
            padding: 16,
            background: 'var(--semi-color-fill-0)',
            borderRadius: 8,
            border: '1px solid var(--semi-color-border)',
          }}>
            {Object.entries(oldObj).map(([key, value]) => {
              if (key === 'key' || key === 'keys') return null;
              return (
                <div key={key} style={{
                  display: 'flex',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--semi-color-border)',
                }}>
                  <Text type="tertiary" style={{ width: 120, flexShrink: 0 }}>
                    {getFieldLabel(module, key)}
                  </Text>
                  <Text delete style={{ color: 'var(--semi-color-danger)' }}>
                    {formatFieldValue(key, value, module)}
                  </Text>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // 系统参数特殊处理
    if (module === 'option') {
      const paramName = detailData.target_id || target_name;
      const label = fieldLabels.option?.[paramName] || paramName;

      // 尝试解析为 JSON，比较差异
      const oldObj = parseJsonValue(old_value);
      const newObj = parseJsonValue(new_value);

      // 如果都是对象，找出变更的字段
      if (oldObj && newObj && typeof oldObj === 'object' && typeof newObj === 'object' && !Array.isArray(oldObj) && !Array.isArray(newObj)) {
        const changedFields = [];
        const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
        for (const key of allKeys) {
          const oldValue = oldObj[key];
          const newValue = newObj[key];
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changedFields.push({ key, oldValue, newValue });
          }
        }

        if (changedFields.length > 0) {
          return (
            <div>
              <Text strong>变更内容 - {label} ({changedFields.length}项)</Text>
              <div style={{
                marginTop: 12,
                background: 'var(--semi-color-fill-0)',
                borderRadius: 8,
                border: '1px solid var(--semi-color-border)',
                overflow: 'hidden',
              }}>
                {changedFields.map((change, index) => (
                  <div
                    key={change.key}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      padding: '12px 16px',
                      borderBottom: index < changedFields.length - 1 ? '1px solid var(--semi-color-border)' : 'none',
                    }}
                  >
                    <Text strong style={{
                      width: 150,
                      flexShrink: 0,
                      color: 'var(--semi-color-text-0)',
                    }}>
                      {change.key}
                    </Text>
                    <div style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      minWidth: 0,
                    }}>
                      <Text style={{
                        background: 'var(--semi-color-danger-light-default)',
                        color: 'var(--semi-color-danger)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        wordBreak: 'break-word',
                        flex: '1 1 0',
                        minWidth: 0,
                      }}>
                        {formatValue(change.oldValue)}
                      </Text>
                      <IconArrowRight size="small" style={{ color: 'var(--semi-color-text-2)', flexShrink: 0, marginTop: 4 }} />
                      <Text style={{
                        background: 'var(--semi-color-success-light-default)',
                        color: 'var(--semi-color-success)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        wordBreak: 'break-word',
                        flex: '1 1 0',
                        minWidth: 0,
                      }}>
                        {formatValue(change.newValue)}
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }
      }

      // 普通字符串值
      return (
        <div>
          <Text strong>变更内容 (1项)</Text>
          <div style={{
            marginTop: 12,
            background: 'var(--semi-color-fill-0)',
            borderRadius: 8,
            border: '1px solid var(--semi-color-border)',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: '12px 16px',
            }}>
              <Text strong style={{
                width: 150,
                flexShrink: 0,
                color: 'var(--semi-color-text-0)',
              }}>
                {label}
              </Text>
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                minWidth: 0,
              }}>
                <Text style={{
                  background: 'var(--semi-color-danger-light-default)',
                  color: 'var(--semi-color-danger)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  wordBreak: 'break-word',
                  flex: '1 1 0',
                  minWidth: 0,
                }}>
                  {old_value || '(空)'}
                </Text>
                <IconArrowRight size="small" style={{ color: 'var(--semi-color-text-2)', flexShrink: 0, marginTop: 4 }} />
                <Text style={{
                  background: 'var(--semi-color-success-light-default)',
                  color: 'var(--semi-color-success)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  wordBreak: 'break-word',
                  flex: '1 1 0',
                  minWidth: 0,
                }}>
                  {new_value || '(空)'}
                </Text>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 更新操作：显示变更对比
    const changes = generateChanges(old_value, new_value, module);

    if (changes.length === 0) {
      return (
        <div style={{
          padding: 24,
          textAlign: 'center',
          color: 'var(--semi-color-text-2)',
        }}>
          无变更内容
        </div>
      );
    }

    return (
      <div>
        <Text strong>变更内容 ({changes.length}项)</Text>
        <div style={{
          marginTop: 12,
          background: 'var(--semi-color-fill-0)',
          borderRadius: 8,
          border: '1px solid var(--semi-color-border)',
          overflow: 'hidden',
        }}>
          {changes.map((change, index) => (
            <div
              key={change.field}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                padding: '12px 16px',
                borderBottom: index < changes.length - 1 ? '1px solid var(--semi-color-border)' : 'none',
              }}
            >
              <Text strong style={{
                width: 120,
                flexShrink: 0,
                color: 'var(--semi-color-text-0)',
              }}>
                {change.label}
              </Text>
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                minWidth: 0,
              }}>
                <Text style={{
                  background: 'var(--semi-color-danger-light-default)',
                  color: 'var(--semi-color-danger)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  wordBreak: 'break-word',
                  flex: '1 1 0',
                  minWidth: 0,
                }}>
                  {change.oldValue}
                </Text>
                <IconArrowRight size="small" style={{ color: 'var(--semi-color-text-2)', flexShrink: 0, marginTop: 4 }} />
                <Text style={{
                  background: 'var(--semi-color-success-light-default)',
                  color: 'var(--semi-color-success)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  wordBreak: 'break-word',
                  flex: '1 1 0',
                  minWidth: 0,
                }}>
                  {change.newValue}
                </Text>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-[60px] px-2">
      <Card>
        {/* 筛选区域 */}
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            placeholder={t('模块')}
            value={filters.module}
            onChange={(value) => handleFilterChange('module', value)}
            style={{ width: 120 }}
            showClear
          >
            <Select.Option value="channel">{t('渠道')}</Select.Option>
            <Select.Option value="option">{t('系统参数')}</Select.Option>
            <Select.Option value="user">{t('用户')}</Select.Option>
            <Select.Option value="token">{t('令牌')}</Select.Option>
            <Select.Option value="model">{t('模型')}</Select.Option>
            <Select.Option value="redemption">{t('兑换码')}</Select.Option>
          </Select>

          <Select
            placeholder={t('动作')}
            value={filters.action}
            onChange={(value) => handleFilterChange('action', value)}
            style={{ width: 100 }}
            showClear
          >
            <Select.Option value="create">{t('创建')}</Select.Option>
            <Select.Option value="update">{t('更新')}</Select.Option>
            <Select.Option value="delete">{t('删除')}</Select.Option>
            <Select.Option value="enable">{t('启用')}</Select.Option>
            <Select.Option value="disable">{t('禁用')}</Select.Option>
          </Select>

          <Input
            placeholder={t('操作人')}
            value={filters.username}
            onChange={(value) => handleFilterChange('username', value)}
            style={{ width: 120 }}
            prefix={<IconSearch />}
          />

          <Input
            placeholder={t('搜索内容')}
            value={filters.keyword}
            onChange={(value) => handleFilterChange('keyword', value)}
            style={{ width: 180 }}
            prefix={<IconSearch />}
          />

          <DatePicker
            type="dateTimeRange"
            onChange={handleDateChange}
            style={{ width: 380 }}
          />

          <Button icon={<IconRefresh />} onClick={handleReset}>
            {t('重置')}
          </Button>
        </Space>

        {/* 数据表格 */}
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{
            currentPage: page,
            pageSize: pageSize,
            total: total,
            onPageChange: setPage,
            onPageSizeChange: setPageSize,
            pageSizeOpts: [10, 20, 50, 100],
            showSizeChanger: true,
            showTotal: true,
          }}
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{t('操作日志详情')}</span>
            {detailData && (
              <Tag color={actionColors[detailData.action]} size="small">
                {actionLabels[detailData.action] || detailData.action}
              </Tag>
            )}
          </div>
        }
        visible={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={900}
        style={{ maxWidth: '90vw' }}
        bodyStyle={{ maxHeight: '70vh', overflow: 'auto' }}
      >
        {detailData && (
          <div>
            {/* 基本信息 */}
            <div style={{
              marginBottom: 20,
              padding: 16,
              background: 'var(--semi-color-fill-0)',
              borderRadius: 8,
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px 24px',
              }}>
                <div>
                  <Text type="tertiary" size="small">{t('操作时间')}</Text>
                  <div>{timestamp2string(detailData.created_at)}</div>
                </div>
                <div>
                  <Text type="tertiary" size="small">{t('操作人')}</Text>
                  <div>{detailData.username}</div>
                </div>
                <div>
                  <Text type="tertiary" size="small">{t('模块')}</Text>
                  <div>{moduleLabels[detailData.module] || detailData.module}</div>
                </div>
                <div>
                  <Text type="tertiary" size="small">{t('目标')}</Text>
                  <div>{detailData.target_name}</div>
                </div>
                <div>
                  <Text type="tertiary" size="small">IP</Text>
                  <div>{detailData.ip}</div>
                </div>
                <div>
                  <Text type="tertiary" size="small">{t('描述')}</Text>
                  <div>{detailData.description}</div>
                </div>
              </div>
            </div>

            {/* 变更内容 */}
            {renderChanges()}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OperationLog;
