import React, { useEffect, useState, useRef } from 'react';
import {
  Table,
  Tag,
  Button,
  Modal,
  Typography,
  Space,
  Select,
  TextArea,
  SplitButtonGroup,
} from '@douyinfe/semi-ui';
import { IconTreeTriangleDown } from '@douyinfe/semi-icons';
import { API, showError, showSuccess, showInfo } from '../../helpers';
import { useTranslation } from 'react-i18next';
import { CHANNEL_OPTIONS } from '../../constants/channel.constants';
import ModelTestModal from '../../components/table/channels/modals/ModelTestModal';
import { useIsMobile } from '../../hooks/common/useIsMobile';

const { Text } = Typography;

const channelTypeMap = {};
CHANNEL_OPTIONS.forEach((opt) => {
  channelTypeMap[opt.value] = opt.label;
});

const VendorReviewPage = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
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

  // Model test states
  const [showModelTestModal, setShowModelTestModal] = useState(false);
  const [currentTestChannel, setCurrentTestChannel] = useState(null);
  const [modelSearchKeyword, setModelSearchKeyword] = useState('');
  const [modelTestResults, setModelTestResults] = useState({});
  const [testingModels, setTestingModels] = useState(new Set());
  const [selectedModelKeys, setSelectedModelKeys] = useState([]);
  const [isBatchTesting, setIsBatchTesting] = useState(false);
  const [modelTablePage, setModelTablePage] = useState(1);
  const [selectedEndpointType, setSelectedEndpointType] = useState('');
  const [isStreamTest, setIsStreamTest] = useState(false);
  const shouldStopBatchTestingRef = useRef(false);
  const allSelectingRef = useRef(false);

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

  // 单个模型测试（复用管理员测试接口）
  const testChannelModel = async (record, model, endpointType = '', stream = false) => {
    const testKey = `${record.id}-${model}`;
    if (shouldStopBatchTestingRef.current && isBatchTesting) return;

    setTestingModels((prev) => new Set([...prev, model]));
    try {
      let url = `/api/channel/test/${record.id}?model=${model}`;
      if (endpointType) url += `&endpoint_type=${endpointType}`;
      if (stream) url += `&stream=true`;
      const res = await API.get(url);

      if (shouldStopBatchTestingRef.current && isBatchTesting) return;

      const { success, message, time, response } = res.data;
      setModelTestResults((prev) => ({
        ...prev,
        [testKey]: { success, message, time: time || 0, response: response || '', timestamp: Date.now() },
      }));

      if (success) {
        showInfo(
          t('通道 ${name} 测试成功，模型 ${model} 耗时 ${time.toFixed(2)} 秒。')
            .replace('${name}', record.name)
            .replace('${model}', model)
            .replace('${time.toFixed(2)}', time.toFixed(2)),
        );
      } else {
        showError(`${t('模型')} ${model}: ${message}`);
      }
    } catch (error) {
      setModelTestResults((prev) => ({
        ...prev,
        [testKey]: { success: false, message: error.message || t('网络错误'), time: 0, response: '', timestamp: Date.now() },
      }));
      showError(`${t('模型')} ${model}: ${error.message || t('测试失败')}`);
    } finally {
      setTestingModels((prev) => {
        const newSet = new Set(prev);
        newSet.delete(model);
        return newSet;
      });
    }
  };

  // 批量测试
  const batchTestModels = async () => {
    if (!currentTestChannel || !currentTestChannel.models) {
      showError(t('渠道模型信息不完整'));
      return;
    }
    const models = currentTestChannel.models
      .split(',')
      .filter((m) => m.toLowerCase().includes(modelSearchKeyword.toLowerCase()));
    if (models.length === 0) {
      showError(t('没有找到匹配的模型'));
      return;
    }

    setIsBatchTesting(true);
    shouldStopBatchTestingRef.current = false;
    setModelTestResults((prev) => {
      const newResults = { ...prev };
      models.forEach((m) => delete newResults[`${currentTestChannel.id}-${m}`]);
      return newResults;
    });

    try {
      showInfo(t('开始批量测试 ${count} 个模型，已清空上次结果...').replace('${count}', models.length));
      const concurrencyLimit = 5;
      for (let i = 0; i < models.length; i += concurrencyLimit) {
        if (shouldStopBatchTestingRef.current) { showInfo(t('批量测试已停止')); break; }
        const batch = models.slice(i, i + concurrencyLimit);
        await Promise.allSettled(
          batch.map((m) => testChannelModel(currentTestChannel, m, selectedEndpointType, isStreamTest)),
        );
        if (shouldStopBatchTestingRef.current) { showInfo(t('批量测试已停止')); break; }
        if (i + concurrencyLimit < models.length) await new Promise((r) => setTimeout(r, 100));
      }
      if (!shouldStopBatchTestingRef.current) {
        showSuccess(t('批量测试完成！成功: ${success}, 失败: ${fail}, 总计: ${total}')
          .replace('${success}', models.filter((m) => modelTestResults[`${currentTestChannel.id}-${m}`]?.success).length)
          .replace('${fail}', models.filter((m) => !modelTestResults[`${currentTestChannel.id}-${m}`]?.success).length)
          .replace('${total}', models.length));
      }
    } catch (error) {
      showError(t('批量测试过程中发生错误: ') + error.message);
    } finally {
      setIsBatchTesting(false);
    }
  };

  const handleCloseTestModal = () => {
    if (isBatchTesting) {
      shouldStopBatchTestingRef.current = true;
      showInfo(t('关闭弹窗，已停止批量测试'));
    }
    setShowModelTestModal(false);
    setModelSearchKeyword('');
    setIsBatchTesting(false);
    setTestingModels(new Set());
    setSelectedModelKeys([]);
    setModelTablePage(1);
    setSelectedEndpointType('');
    setIsStreamTest(false);
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
          <SplitButtonGroup className='overflow-hidden'>
            <Button size='small' onClick={() => handleRetest(record.id)}>
              {t('测试')}
            </Button>
            <Button
              size='small'
              icon={<IconTreeTriangleDown />}
              onClick={() => {
                setCurrentTestChannel(record);
                setShowModelTestModal(true);
              }}
            />
          </SplitButtonGroup>
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
      <ModelTestModal
        showModelTestModal={showModelTestModal}
        currentTestChannel={currentTestChannel}
        handleCloseModal={handleCloseTestModal}
        isBatchTesting={isBatchTesting}
        batchTestModels={batchTestModels}
        modelSearchKeyword={modelSearchKeyword}
        setModelSearchKeyword={setModelSearchKeyword}
        selectedModelKeys={selectedModelKeys}
        setSelectedModelKeys={setSelectedModelKeys}
        modelTestResults={modelTestResults}
        testingModels={testingModels}
        testChannel={testChannelModel}
        modelTablePage={modelTablePage}
        setModelTablePage={setModelTablePage}
        selectedEndpointType={selectedEndpointType}
        setSelectedEndpointType={setSelectedEndpointType}
        isStreamTest={isStreamTest}
        setIsStreamTest={setIsStreamTest}
        allSelectingRef={allSelectingRef}
        isMobile={isMobile}
        t={t}
      />
    </div>
  );
};

export default VendorReviewPage;
