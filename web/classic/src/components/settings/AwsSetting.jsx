import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Table,
  Form,
  Select,
  Spin,
  Popconfirm,
  Tag,
  Typography,
  Banner,
  Switch,
  InputNumber,
} from '@douyinfe/semi-ui';
import { API, showError, showSuccess } from '../../helpers';

const { Text } = Typography;
const { TextArea } = Form;

const AwsSetting = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState([]);
  const [bans, setBans] = useState([]);
  const [bansTotal, setBansTotal] = useState(0);
  const [bansPage, setBansPage] = useState(1);
  const [bansPageSize] = useState(10);

  const [enabled, setEnabled] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [keywords, setKeywords] = useState('');
  const [banDuration, setBanDuration] = useState(60);

  const loadGroups = async () => {
    try {
      const res = await API.get('/api/group/');
      if (res.data.success) {
        setGroups(res.data.data || []);
      }
    } catch (e) {
      showError('获取分组列表失败');
    }
  };

  const loadSettings = async () => {
    try {
      const res = await API.get('/api/aws_setting/');
      if (res.data.success) {
        const data = res.data.data;
        setEnabled(data['aws_setting.enabled'] === 'true');
        try {
          const g = JSON.parse(data['aws_setting.groups'] || '[]');
          setSelectedGroups(Array.isArray(g) ? g : []);
        } catch {
          setSelectedGroups([]);
        }
        setKeywords(data['aws_setting.keywords'] || '');
        const dur = parseInt(data['aws_setting.ban_duration'] || '60', 10);
        setBanDuration(isNaN(dur) ? 60 : dur);
      }
    } catch (e) {
      showError('获取AWS设置失败');
    }
  };

  const loadBans = async (page) => {
    try {
      const p = (page || 1) - 1;
      const res = await API.get(
        `/api/aws_setting/bans?p=${p}&page_size=${bansPageSize}&status=1`,
      );
      if (res.data.success) {
        setBans(res.data.data || []);
        setBansTotal(res.data.total || 0);
      }
    } catch (e) {
      showError('获取下架记录失败');
    }
  };

  const saveSetting = async (key, value) => {
    try {
      const res = await API.put('/api/aws_setting/', {
        key,
        value: String(value),
      });
      if (res.data.success) {
        return true;
      } else {
        showError(res.data.message || '保存失败');
        return false;
      }
    } catch (e) {
      showError('保存失败');
      return false;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting('aws_setting.enabled', enabled ? 'true' : 'false');
      await saveSetting('aws_setting.groups', JSON.stringify(selectedGroups));
      await saveSetting('aws_setting.keywords', keywords);
      await saveSetting('aws_setting.ban_duration', String(banDuration));
      showSuccess('保存成功');
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (id) => {
    try {
      const res = await API.delete(`/api/aws_setting/bans/${id}`);
      if (res.data.success) {
        showSuccess('恢复成功');
        loadBans(bansPage);
      } else {
        showError(res.data.message || '恢复失败');
      }
    } catch (e) {
      showError('恢复失败');
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadGroups(), loadSettings(), loadBans(1)]).finally(() =>
      setLoading(false),
    );
  }, []);

  const formatTime = (timestamp) => {
    if (!timestamp) return '-';
    return new Date(timestamp * 1000).toLocaleString();
  };

  const columns = [
    {
      title: '分组',
      dataIndex: 'group',
      width: 100,
    },
    {
      title: '渠道',
      dataIndex: 'channel_name',
      width: 150,
      render: (text, record) => text || `ID: ${record.channel_id}`,
    },
    {
      title: '模型',
      dataIndex: 'model_name',
      width: 200,
    },
    {
      title: '错误内容',
      dataIndex: 'error_content',
      width: 300,
      render: (text) => (
        <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 280 }}>
          {text}
        </Text>
      ),
    },
    {
      title: '下架时间',
      dataIndex: 'ban_time',
      width: 180,
      render: (val) => formatTime(val),
    },
    {
      title: '预计恢复时间',
      dataIndex: 'unban_time',
      width: 180,
      render: (val) => formatTime(val),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (val) => (
        <Tag color={val === 1 ? 'red' : 'green'}>
          {val === 1 ? '下架中' : '已恢复'}
        </Tag>
      ),
    },
    {
      title: '操作',
      width: 120,
      render: (text, record) =>
        record.status === 1 ? (
          <Popconfirm
            title='确认恢复'
            content='确定要提前恢复该模型吗？'
            onConfirm={() => handleRestore(record.id)}
          >
            <Button theme='light' type='primary' size='small'>
              手动恢复
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <Spin spinning={loading} size='large'>
      <Card style={{ marginTop: '10px' }}>
        <Typography.Title heading={5}>
          AWS 错误日志自动下架设置
        </Typography.Title>
        <Banner
          type='info'
          description='开启后，系统将每分钟扫描错误日志，当日志内容匹配到指定关键词时，自动下架该渠道中报错的模型。超过下架时长后自动恢复。'
          style={{ marginBottom: 16 }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            maxWidth: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>功能开关：</span>
            <Switch checked={enabled} onChange={(val) => setEnabled(val)} />
          </div>
          <div>
            <span>监控分组：</span>
            <Select
              multiple
              style={{ width: '100%', marginTop: 4 }}
              placeholder='选择需要监控的渠道分组'
              value={selectedGroups}
              onChange={(val) => setSelectedGroups(val)}
            >
              {groups.map((g) => (
                <Select.Option key={g} value={g}>
                  {g}
                </Select.Option>
              ))}
            </Select>
          </div>
          <div>
            <span>匹配关键词（每行一个，不区分大小写）：</span>
            <textarea
              style={{
                marginTop: 4,
                width: '100%',
                minHeight: 120,
                padding: 8,
                border: '1px solid var(--semi-color-border)',
                borderRadius: 4,
                fontFamily: 'inherit',
                fontSize: 14,
                resize: 'vertical',
              }}
              placeholder={'例如：\nThrottlingException\nRate exceeded\nResourceNotFoundException'}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>下架时长（分钟）：</span>
            <InputNumber
              min={1}
              max={1440}
              value={banDuration}
              onChange={(val) => setBanDuration(val)}
              style={{ width: 150 }}
            />
          </div>
          <div>
            <Button type='primary' loading={saving} onClick={handleSave}>
              保存设置
            </Button>
          </div>
        </div>
      </Card>

      <Card style={{ marginTop: '10px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Typography.Title heading={5}>当前下架记录</Typography.Title>
          <Button onClick={() => loadBans(bansPage)}>刷新</Button>
        </div>
        <Table
          columns={columns}
          dataSource={bans}
          rowKey='id'
          pagination={{
            currentPage: bansPage,
            total: bansTotal,
            pageSize: bansPageSize,
            onPageChange: (page) => {
              setBansPage(page);
              loadBans(page);
            },
          }}
          empty='暂无下架记录'
        />
      </Card>
    </Spin>
  );
};

export default AwsSetting;
