import React, { useEffect, useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Modal,
  Form,
  Select,
  Typography,
  Space,
  SideSheet,
  Input,
  TextArea,
} from '@douyinfe/semi-ui';
import { API, showError, showSuccess } from '../../helpers';
import { useTranslation } from 'react-i18next';
import { CHANNEL_OPTIONS } from '../../constants/channel.constants';

const { Text } = Typography;

const channelStatusMap = {
  0: { text: '未知', color: 'grey' },
  1: { text: '已启用', color: 'green' },
  2: { text: '已禁用', color: 'grey' },
  3: { text: '自动禁用', color: 'red' },
  4: { text: '待审核', color: 'orange' },
  5: { text: '已拒绝', color: 'red' },
};

const channelTypeMap = {};
CHANNEL_OPTIONS.forEach((opt) => {
  channelTypeMap[opt.value] = opt.label;
});

const VendorChannelPage = () => {
  const { t } = useTranslation();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [showSubmit, setShowSubmit] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const formApiRef = React.useRef();

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/vendor/channel/?p=${page}&page_size=${pageSize}`,
      );
      if (res.data.success) {
        setChannels(res.data.data.items || []);
        setTotal(res.data.data.total || 0);
      }
    } catch (e) {
      showError(t('获取数据失败'));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchChannels();
  }, [page]);

  const openSubmit = (channel = null) => {
    setEditingChannel(channel);
    setShowSubmit(true);
  };

  const handleSubmit = async (values) => {
    setSubmitting(true);
    try {
      let res;
      if (editingChannel) {
        res = await API.put(`/api/vendor/channel/${editingChannel.id}`, values);
      } else {
        res = await API.post('/api/vendor/channel/', values);
      }
      if (res.data.success) {
        showSuccess(editingChannel ? t('更新成功') : t('提交成功'));
        setShowSubmit(false);
        setEditingChannel(null);
        fetchChannels();
      } else {
        showError(res.data.message);
      }
    } catch (e) {
      showError(t('操作失败'));
    }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    Modal.confirm({
      title: t('确认删除'),
      content: t('确定要删除该渠道吗？'),
      onOk: async () => {
        try {
          const res = await API.delete(`/api/vendor/channel/${id}`);
          if (res.data.success) {
            showSuccess(t('删除成功'));
            fetchChannels();
          } else {
            showError(res.data.message);
          }
        } catch (e) {
          showError(t('删除失败'));
        }
      },
    });
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: t('名称'), dataIndex: 'name' },
    {
      title: t('类型'),
      dataIndex: 'type',
      render: (type) => channelTypeMap[type] || type,
    },
    { title: t('模型'), dataIndex: 'models', ellipsis: true },
    {
      title: t('状态'),
      dataIndex: 'status',
      render: (status) => {
        const s = channelStatusMap[status];
        return s ? (
          <Tag color={s.color}>{t(s.text)}</Tag>
        ) : (
          <Tag>{status}</Tag>
        );
      },
    },
    {
      title: t('操作'),
      render: (_, record) => (
        <Space>
          {(record.status === 4 || record.status === 5) && (
            <>
              <Button size='small' onClick={() => openSubmit(record)}>
                {t('编辑')}
              </Button>
              <Button
                size='small'
                type='danger'
                onClick={() => handleDelete(record.id)}
              >
                {t('删除')}
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className='p-4'>
      <div className='flex items-center justify-between mb-4'>
        <Text strong style={{ fontSize: 18 }}>
          {t('我的渠道')}
        </Text>
        <Button type='primary' theme='solid' onClick={() => openSubmit()}>
          {t('提交渠道')}
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={channels}
        loading={loading}
        rowKey='id'
        pagination={{
          currentPage: page,
          pageSize,
          total,
          onPageChange: setPage,
        }}
      />
      <SideSheet
        title={editingChannel ? t('编辑渠道') : t('提交渠道')}
        visible={showSubmit}
        onCancel={() => {
          setShowSubmit(false);
          setEditingChannel(null);
        }}
        width={500}
      >
        <Form
          getFormApi={(api) => (formApiRef.current = api)}
          onSubmit={handleSubmit}
          labelPosition='top'
          initValues={
            editingChannel
              ? {
                  name: editingChannel.name,
                  type: editingChannel.type,
                  key: '',
                  base_url: editingChannel.base_url,
                  models: editingChannel.models,
                  group: editingChannel.group,
                  test_model: editingChannel.test_model,
                }
              : { type: 1, group: 'default' }
          }
        >
          <Form.Input
            field='name'
            label={t('渠道名称')}
            rules={[{ required: true }]}
          />
          <Form.Select
            field='type'
            label={t('渠道类型')}
            rules={[{ required: true }]}
            optionList={CHANNEL_OPTIONS.map((opt) => ({
              value: opt.value,
              label: opt.label,
            }))}
            style={{ width: '100%' }}
          />
          <Form.TextArea
            field='key'
            label={t('密钥')}
            placeholder={editingChannel ? t('留空则不修改') : t('请输入密钥')}
            rules={editingChannel ? [] : [{ required: true }]}
            rows={3}
          />
          <Form.Input field='base_url' label={t('代理地址')} />
          <Form.TextArea
            field='models'
            label={t('模型')}
            placeholder={t('多个模型用逗号分隔')}
            rules={[{ required: true }]}
            rows={3}
          />
          <Form.Input field='group' label={t('分组')} />
          <Form.Input field='test_model' label={t('测试模型')} />
          <Button
            type='primary'
            theme='solid'
            htmlType='submit'
            loading={submitting}
            className='mt-4'
          >
            {editingChannel ? t('更新') : t('提交')}
          </Button>
        </Form>
      </SideSheet>
    </div>
  );
};

export default VendorChannelPage;
