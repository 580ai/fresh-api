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

import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Row,
  Spin,
  Typography,
  InputNumber,
  Input,
  Popconfirm,
  Empty,
  Divider,
  Tag,
} from '@douyinfe/semi-ui';
import { IconPlus, IconDelete, IconBolt } from '@douyinfe/semi-icons';
import { API, showError, showSuccess, showWarning } from '../../../helpers';
import { useTranslation } from 'react-i18next';

const { Text, Title } = Typography;

export default function TextModelPriceSettings(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [textModelPrice, setTextModelPrice] = useState({});
  const [originalData, setOriginalData] = useState({});
  const [newModelName, setNewModelName] = useState('');

  // 解析配置数据
  useEffect(() => {
    if (props.options?.TextModelPrice) {
      try {
        const parsed = JSON.parse(props.options.TextModelPrice);
        setTextModelPrice(parsed);
        setOriginalData(structuredClone(parsed));
      } catch (e) {
        setTextModelPrice({});
        setOriginalData({});
      }
    } else {
      setTextModelPrice({});
      setOriginalData({});
    }
  }, [props.options]);

  // 获取所有已配置的模型列表
  const getModelList = () => {
    return Object.keys(textModelPrice);
  };

  // 添加新模型
  const handleAddModel = () => {
    const trimmedName = newModelName.trim();
    if (!trimmedName) {
      showWarning(t('请输入模型名称'));
      return;
    }
    if (textModelPrice[trimmedName]) {
      showWarning(t('该模型已存在'));
      return;
    }
    setTextModelPrice((prev) => ({
      ...prev,
      [trimmedName]: {
        tiers: [{ max_tokens: 0, input: 0, output: 0 }],
        thinking_tiers: [],
      },
    }));
    setNewModelName('');
  };

  // 删除模型
  const handleDeleteModel = (modelName) => {
    setTextModelPrice((prev) => {
      const newData = { ...prev };
      delete newData[modelName];
      return newData;
    });
  };

  // 添加阶梯
  const handleAddTier = (modelName, isThinking) => {
    setTextModelPrice((prev) => {
      const newData = structuredClone(prev);
      const tierKey = isThinking ? 'thinking_tiers' : 'tiers';
      if (!newData[modelName][tierKey]) {
        newData[modelName][tierKey] = [];
      }
      newData[modelName][tierKey].push({ max_tokens: 0, input: 0, output: 0 });
      return newData;
    });
  };

  // 删除阶梯
  const handleDeleteTier = (modelName, isThinking, tierIndex) => {
    setTextModelPrice((prev) => {
      const newData = structuredClone(prev);
      const tierKey = isThinking ? 'thinking_tiers' : 'tiers';
      newData[modelName][tierKey].splice(tierIndex, 1);
      return newData;
    });
  };

  // 更新阶梯值
  const handleTierChange = (modelName, isThinking, tierIndex, field, value) => {
    setTextModelPrice((prev) => {
      const newData = structuredClone(prev);
      const tierKey = isThinking ? 'thinking_tiers' : 'tiers';
      if (!newData[modelName][tierKey]) {
        newData[modelName][tierKey] = [];
      }
      if (!newData[modelName][tierKey][tierIndex]) {
        newData[modelName][tierKey][tierIndex] = { max_tokens: 0, input: 0, output: 0 };
      }
      newData[modelName][tierKey][tierIndex][field] = value ?? 0;
      return newData;
    });
  };

  // 渲染阶梯配置
  const renderTiers = (modelName, tiers, isThinking) => {
    const tierKey = isThinking ? 'thinking_tiers' : 'tiers';
    const tierList = tiers || [];

    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <Tag color={isThinking ? 'purple' : 'blue'} style={{ marginRight: 8 }}>
            {isThinking ? t('思考模式') : t('非思考模式')}
          </Tag>
          <Button
            size='small'
            icon={<IconPlus />}
            onClick={() => handleAddTier(modelName, isThinking)}
          >
            {t('添加阶梯')}
          </Button>
        </div>

        {tierList.length === 0 ? (
          <Text type='tertiary'>{t('暂无阶梯配置，点击上方按钮添加')}</Text>
        ) : (
          tierList.map((tier, index) => (
            <Card
              key={index}
              style={{ marginBottom: 8, backgroundColor: 'var(--semi-color-fill-0)' }}
              bodyStyle={{ padding: 12 }}
            >
              <Row gutter={12} type='flex' align='middle'>
                <Col span={6}>
                  <div style={{ marginBottom: 4 }}>
                    <Text size='small'>{t('最大Token数')}</Text>
                  </div>
                  <InputNumber
                    placeholder='0'
                    min={0}
                    step={1000}
                    style={{ width: '100%' }}
                    value={tier.max_tokens}
                    onChange={(value) =>
                      handleTierChange(modelName, isThinking, index, 'max_tokens', value)
                    }
                  />
                </Col>
                <Col span={7}>
                  <div style={{ marginBottom: 4 }}>
                    <Text size='small'>{t('输入价格')}</Text>
                  </div>
                  <InputNumber
                    placeholder='0'
                    min={0}
                    step={0.01}
                    precision={4}
                    style={{ width: '100%' }}
                    suffix={t('$/1M tokens')}
                    value={tier.input}
                    onChange={(value) =>
                      handleTierChange(modelName, isThinking, index, 'input', value)
                    }
                  />
                </Col>
                <Col span={7}>
                  <div style={{ marginBottom: 4 }}>
                    <Text size='small'>{t('输出价格')}</Text>
                  </div>
                  <InputNumber
                    placeholder='0'
                    min={0}
                    step={0.01}
                    precision={4}
                    style={{ width: '100%' }}
                    suffix={t('$/1M tokens')}
                    value={tier.output}
                    onChange={(value) =>
                      handleTierChange(modelName, isThinking, index, 'output', value)
                    }
                  />
                </Col>
                <Col span={4} style={{ textAlign: 'right' }}>
                  <Popconfirm
                    title={t('确定删除该阶梯吗？')}
                    onConfirm={() => handleDeleteTier(modelName, isThinking, index)}
                  >
                    <Button
                      type='danger'
                      theme='borderless'
                      icon={<IconDelete />}
                      size='small'
                    />
                  </Popconfirm>
                </Col>
              </Row>
            </Card>
          ))
        )}
      </div>
    );
  };

  // 提交保存
  async function onSubmit() {
    // 检查是否有修改
    const currentJson = JSON.stringify(textModelPrice);
    const originalJson = JSON.stringify(originalData);
    if (currentJson === originalJson) {
      return showWarning(t('你似乎并没有修改什么'));
    }

    setLoading(true);
    try {
      const res = await API.put('/api/option/', {
        key: 'TextModelPrice',
        value: currentJson,
      });

      if (res.data.success) {
        showSuccess(t('保存成功'));
        props.refresh();
      } else {
        showError(res.data.message || t('保存失败'));
      }
    } catch (error) {
      console.error('Save error:', error);
      showError(t('保存失败，请重试'));
    } finally {
      setLoading(false);
    }
  }

  const modelList = getModelList();

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 15 }}>
        <Text type='secondary'>
          {t(
            '在此处配置文本模型的阶梯价格。根据输入Token数量和是否启用思考模式（enable_thinking参数）进行阶梯计费。阶梯按max_tokens升序匹配，输入Token数小于等于该阶梯max_tokens时使用该阶梯价格。价格单位为 $/1M tokens。',
          )}
        </Text>
      </div>

      {/* 添加新模型 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Input
            placeholder={t('输入模型名称，如 qwen-plus')}
            value={newModelName}
            onChange={setNewModelName}
            onEnterPress={handleAddModel}
            style={{ flex: 1 }}
          />
          <Button
            type='primary'
            icon={<IconPlus />}
            onClick={handleAddModel}
          >
            {t('添加模型')}
          </Button>
        </div>
      </Card>

      {/* 模型列表 */}
      {modelList.length === 0 ? (
        <Empty
          image={<IconBolt style={{ fontSize: 48, color: 'var(--semi-color-text-2)' }} />}
          title={t('暂无文本模型阶梯配置')}
          description={t('点击上方按钮添加需要阶梯定价的模型')}
        />
      ) : (
        modelList.map((modelName) => (
          <Card
            key={modelName}
            style={{ marginBottom: 16 }}
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconBolt style={{ color: 'var(--semi-color-primary)' }} />
                  <span>{modelName}</span>
                </div>
                <Popconfirm
                  title={t('确定删除该模型配置吗？')}
                  onConfirm={() => handleDeleteModel(modelName)}
                >
                  <Button
                    type='danger'
                    theme='borderless'
                    icon={<IconDelete />}
                    size='small'
                  />
                </Popconfirm>
              </div>
            }
          >
            {/* 非思考模式阶梯 */}
            {renderTiers(modelName, textModelPrice[modelName]?.tiers, false)}

            <Divider margin={16} />

            {/* 思考模式阶梯 */}
            {renderTiers(modelName, textModelPrice[modelName]?.thinking_tiers, true)}
          </Card>
        ))
      )}

      <Button type='primary' onClick={onSubmit} disabled={modelList.length === 0}>
        {t('保存文本模型阶梯价格设置')}
      </Button>
    </Spin>
  );
}
