import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Form,
  Tag,
  Typography,
  Descriptions,
} from '@douyinfe/semi-ui';
import { API, showError, showSuccess } from '../../../../helpers';

const { Text } = Typography;

const statusMap = {
  1: { text: '待审核', color: 'orange' },
  2: { text: '已通过', color: 'green' },
  3: { text: '已拒绝', color: 'red' },
};

const VendorApplicationCard = ({ t, userRole }) => {
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchApplication = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/vendor_application/my');
      if (res.data.success && res.data.data) {
        setApplication(res.data.data);
      }
    } catch (e) {
      // no application yet
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchApplication();
  }, []);

  const handleSubmit = async (values) => {
    setSubmitting(true);
    try {
      const res = await API.post('/api/vendor_application/submit', values);
      if (res.data.success) {
        showSuccess(t('申请已提交'));
        setApplication(res.data.data);
      } else {
        showError(res.data.message);
      }
    } catch (e) {
      showError(t('提交失败'));
    }
    setSubmitting(false);
  };

  if (userRole >= 5) {
    return null;
  }

  return (
    <Card title={t('申请成为供应商')} className='w-full'>
      {loading ? null : application ? (
        <div className='space-y-3'>
          <Descriptions
            data={[
              {
                key: t('公司名称'),
                value: application.company_name,
              },
              {
                key: t('状态'),
                value: (
                  <Tag color={statusMap[application.status]?.color || 'grey'}>
                    {t(statusMap[application.status]?.text || '未知')}
                  </Tag>
                ),
              },
            ]}
          />
          {application.status === 3 && application.admin_remark && (
            <div>
              <Text type='tertiary'>{t('拒绝原因')}: </Text>
              <Text>{application.admin_remark}</Text>
            </div>
          )}
          {application.status === 3 && (
            <Button
              theme='solid'
              onClick={() => setApplication(null)}
            >
              {t('重新申请')}
            </Button>
          )}
        </div>
      ) : (
        <Form onSubmit={handleSubmit} labelPosition='top'>
          <Form.Input
            field='company_name'
            label={t('公司名称')}
            placeholder={t('请输入公司或团队名称')}
            rules={[{ required: true, message: t('请输入公司名称') }]}
          />
          <Form.Input
            field='contact_info'
            label={t('联系方式')}
            placeholder={t('邮箱或手机号')}
          />
          <Form.TextArea
            field='description'
            label={t('申请描述')}
            placeholder={t('请简要描述您的业务和提供的API服务')}
            rows={3}
          />
          <Button
            type='primary'
            theme='solid'
            htmlType='submit'
            loading={submitting}
            className='mt-2'
          >
            {t('提交申请')}
          </Button>
        </Form>
      )}
    </Card>
  );
};

export default VendorApplicationCard;
