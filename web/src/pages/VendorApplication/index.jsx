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
} from '@douyinfe/semi-ui';
import { API, showError, showSuccess } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

const statusMap = {
  1: { text: '待审核', color: 'orange' },
  2: { text: '已通过', color: 'green' },
  3: { text: '已拒绝', color: 'red' },
};

const VendorApplicationPage = () => {
  const { t } = useTranslation();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState(0);
  const [reviewModal, setReviewModal] = useState(false);
  const [currentApp, setCurrentApp] = useState(null);
  const [reviewAction, setReviewAction] = useState('');
  const [adminRemark, setAdminRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      let url = `/api/vendor_application/?p=${page}&page_size=${pageSize}`;
      if (statusFilter > 0) {
        url += `&status=${statusFilter}`;
      }
      const res = await API.get(url);
      if (res.data.success) {
        setApplications(res.data.data.items || []);
        setTotal(res.data.data.total || 0);
      }
    } catch (e) {
      showError(t('获取数据失败'));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchApplications();
  }, [page, statusFilter]);

  const handleReview = (app, action) => {
    setCurrentApp(app);
    setReviewAction(action);
    setAdminRemark('');
    setReviewModal(true);
  };

  const submitReview = async () => {
    setSubmitting(true);
    try {
      const res = await API.post('/api/vendor_application/review', {
        id: currentApp.id,
        status: reviewAction === 'approve' ? 2 : 3,
        admin_remark: adminRemark,
      });
      if (res.data.success) {
        showSuccess(t('审核完成'));
        setReviewModal(false);
        fetchApplications();
      } else {
        showError(res.data.message);
      }
    } catch (e) {
      showError(t('操作失败'));
    }
    setSubmitting(false);
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: t('用户ID'), dataIndex: 'user_id', width: 80 },
    { title: t('公司名称'), dataIndex: 'company_name' },
    { title: t('联系方式'), dataIndex: 'contact_info' },
    { title: t('申请描述'), dataIndex: 'description', ellipsis: true },
    {
      title: t('状态'),
      dataIndex: 'status',
      render: (status) => {
        const s = statusMap[status];
        return s ? <Tag color={s.color}>{t(s.text)}</Tag> : <Tag>{status}</Tag>;
      },
    },
    { title: t('审核备注'), dataIndex: 'admin_remark', ellipsis: true },
    {
      title: t('操作'),
      render: (_, record) => {
        if (record.status !== 1) return null;
        return (
          <Space>
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
          </Space>
        );
      },
    },
  ];

  return (
    <div className='p-4'>
      <div className='flex items-center gap-4 mb-4'>
        <Text strong style={{ fontSize: 18 }}>{t('供应商入驻审核')}</Text>
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 140 }}
        >
          <Select.Option value={0}>{t('全部')}</Select.Option>
          <Select.Option value={1}>{t('待审核')}</Select.Option>
          <Select.Option value={2}>{t('已通过')}</Select.Option>
          <Select.Option value={3}>{t('已拒绝')}</Select.Option>
        </Select>
      </div>
      <Table
        columns={columns}
        dataSource={applications}
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
        title={reviewAction === 'approve' ? t('审核通过') : t('审核拒绝')}
        visible={reviewModal}
        onOk={submitReview}
        onCancel={() => setReviewModal(false)}
        confirmLoading={submitting}
      >
        {currentApp && (
          <div className='space-y-2 mb-4'>
            <Text>{t('公司名称')}: {currentApp.company_name}</Text>
            <br />
            <Text>{t('申请描述')}: {currentApp.description}</Text>
          </div>
        )}
        <Form.TextArea
          value={adminRemark}
          onChange={setAdminRemark}
          placeholder={t('审核备注')}
          rows={3}
        />
      </Modal>
    </div>
  );
};

export default VendorApplicationPage;
