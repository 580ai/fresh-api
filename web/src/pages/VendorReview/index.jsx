import React, { useEffect, useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Modal,
  Typography,
  Space,
  Select,
  TextArea,
} from '@douyinfe/semi-ui';
import { API, showError, showSuccess } from '../../helpers';
import { useTranslation } from 'react-i18next';
import { CHANNEL_OPTIONS } from '../../constants/channel.constants';

const { Text } = Typography;

const channelTypeMap = {};
CHANNEL_OPTIONS.forEach((opt) => {
  channelTypeMap[opt.value] = opt.label;
});

const VendorReviewPage = () => {
  const { t } = useTranslation();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState(4);
  const [reviewModal, setReviewModal] = useState(false);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [reviewAction, setReviewAction] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const res = await API.get(
        `/api/vendor/review/channels?p=${page}&page_size=${pageSize}&status=${statusFilter}`,
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
  }, [page, statusFilter]);

  const getTestResult = (channel) => {
    if (!channel.other_info) return null;
    try {
      const info = JSON.parse(channel.other_info);
      return info;
    } catch {
      return null;
    }
  };

  const handleReview = (channel, action) => {
    setCurrentChannel(channel);
    setReviewAction(action);
    setRemark('');
    setReviewModal(true);
  };

  const submitReview = async () => {
    setSubmitting(true);
    try {
      const res = await API.post('/api/vendor/review/channel', {
        channel_id: currentChannel.id,
        action: reviewAction,
        remark,
      });
      if (res.data.success) {
        showSuccess(t('审核完成'));
        setReviewModal(false);
        fetchChannels();
      } else {
        showError(res.data.message);
      }
    } catch (e) {
      showError(t('操作失败'));
    }
    setSubmitting(false);
  };

  const handleRetest = async (id) => {
    try {
      const res = await API.post(`/api/vendor/review/channel/test/${id}`);
      if (res.data.success) {
        showSuccess(t('测试已触发'));
        setTimeout(fetchChannels, 3000);
      } else {
        showError(res.data.message);
      }
    } catch (e) {
      showError(t('操作失败'));
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: t('名称'), dataIndex: 'name' },
    {
      title: t('类型'),
      dataIndex: 'type',
      render: (type) => channelTypeMap[type] || type,
    },
    { title: t('模型'), dataIndex: 'models', ellipsis: true, width: 200 },
    {
      title: t('提交者ID'),
      dataIndex: 'submitted_by',
      width: 90,
    },
    {
      title: t('测试结果'),
      render: (_, record) => {
        const info = getTestResult(record);
        if (!info || !info.test_result) return <Tag color='grey'>{t('未测试')}</Tag>;
        return info.test_result === 'passed' ? (
          <Tag color='green'>{t('测试通过')}</Tag>
        ) : (
          <Tag color='red'>{t('测试失败')}</Tag>
        );
      },
    },
    {
      title: t('操作'),
      render: (_, record) => (
        <Space>
          <Button size='small' onClick={() => handleRetest(record.id)}>
            {t('重新测试')}
          </Button>
          {record.status === 4 && (
            <>
              <Button
                size='small'
                type='primary'
                theme='solid'
                onClick={() => handleReview(record, 'approve')}
              >
                {t('通过')}
              </Button>
              <Button
                size='small'
                type='danger'
                theme='solid'
                onClick={() => handleReview(record, 'reject')}
              >
                {t('拒绝')}
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className='p-4'>
      <div className='flex items-center gap-4 mb-4'>
        <Text strong style={{ fontSize: 18 }}>
          {t('渠道审核')}
        </Text>
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 140 }}
        >
          <Select.Option value={4}>{t('待审核')}</Select.Option>
          <Select.Option value={5}>{t('已拒绝')}</Select.Option>
          <Select.Option value={1}>{t('已通过')}</Select.Option>
        </Select>
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
      <Modal
        title={
          reviewAction === 'approve' ? t('审核通过') : t('审核拒绝')
        }
        visible={reviewModal}
        onOk={submitReview}
        onCancel={() => setReviewModal(false)}
        confirmLoading={submitting}
      >
        {currentChannel && (
          <div className='space-y-2 mb-4'>
            <Text>
              {t('渠道名称')}: {currentChannel.name}
            </Text>
            <br />
            <Text>
              {t('类型')}: {channelTypeMap[currentChannel.type] || currentChannel.type}
            </Text>
            <br />
            <Text>
              {t('模型')}: {currentChannel.models}
            </Text>
          </div>
        )}
        <TextArea
          value={remark}
          onChange={setRemark}
          placeholder={t('审核备注')}
          rows={3}
        />
      </Modal>
    </div>
  );
};

export default VendorReviewPage;
