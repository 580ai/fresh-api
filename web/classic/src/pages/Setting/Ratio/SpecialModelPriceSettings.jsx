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
} from '@douyinfe/semi-ui';
import { IconImage, IconPlus, IconDelete } from '@douyinfe/semi-icons';
import { API, showError, showSuccess, showWarning } from '../../../helpers';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

// 默认的价格键配置
const DEFAULT_PRICE_KEYS = [
  { key: '1k', label: '1K', description: '默认分辨率' },
  { key: '2k', label: '2K', description: '中等分辨率' },
  { key: '4k', label: '4K', description: '高分辨率' },
];

export default function SpecialModelPriceSettings(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [specialModelPrice, setSpecialModelPrice] = useState({});
  const [originalData, setOriginalData] = useState({});
  const [newModelName, setNewModelName] = useState('');

  // 解析配置数据
  useEffect(() => {
    if (props.options?.SpecialModelPrice) {
      try {
        const parsed = JSON.parse(props.options.SpecialModelPrice);
        setSpecialModelPrice(parsed);
        setOriginalData(structuredClone(parsed));
      } catch (e) {
        setSpecialModelPrice({});
        setOriginalData({});
      }
    } else {
      setSpecialModelPrice({});
      setOriginalData({});
    }
  }, [props.options]);

  // 获取所有已配置的模型列表
  const getModelList = () => {
    return Object.keys(specialModelPrice);
  };

  // 添加新模型
  const handleAddModel = () => {
    const trimmedName = newModelName.trim();
    if (!trimmedName) {
      showWarning(t('请输入模型名称'));
      return;
    }
    if (specialModelPrice[trimmedName]) {
      showWarning(t('该模型已存在'));
      return;
    }
    setSpecialModelPrice((prev) => ({
      ...prev,
      [trimmedName]: {},
    }));
    setNewModelName('');
  };

  // 删除模型
  const handleDeleteModel = (modelName) => {
    setSpecialModelPrice((prev) => {
      const newData = { ...prev };
      delete newData[modelName];
      return newData;
    });
  };

  // 更新单个模型的价格
  const handlePriceChange = (modelName, priceKey, value) => {
    setSpecialModelPrice((prev) => {
      const newData = { ...prev };
      if (!newData[modelName]) {
        newData[modelName] = {};
      }
      if (value === null || value === undefined || value === '') {
        delete newData[modelName][priceKey];
      } else {
        newData[modelName][priceKey] = value;
      }
      return newData;
    });
  };

  // 获取价格值
  const getPriceValue = (modelName, priceKey) => {
    return specialModelPrice[modelName]?.[priceKey] ?? null;
  };

  // 提交保存
  async function onSubmit() {
    // 检查是否有修改
    const currentJson = JSON.stringify(specialModelPrice);
    const originalJson = JSON.stringify(originalData);
    if (currentJson === originalJson) {
      return showWarning(t('你似乎并没有修改什么'));
    }

    setLoading(true);
    try {
      const res = await API.put('/api/option/', {
        key: 'SpecialModelPrice',
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
            '在此处配置特殊模型的价格，如图像生成模型的不同分辨率价格。配置后将在价格页面的模型详情中展示，并在调用时按配置价格计费。',
          )}
        </Text>
      </div>

      {/* 添加新模型 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Input
            placeholder={t('输入模型名称，如 gemini-3-pro-image-preview')}
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
          image={<IconImage style={{ fontSize: 48, color: 'var(--semi-color-text-2)' }} />}
          title={t('暂无特殊模型配置')}
          description={t('点击上方按钮添加需要特殊定价的模型')}
        />
      ) : (
        modelList.map((modelName) => (
          <Card
            key={modelName}
            style={{ marginBottom: 16 }}
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconImage style={{ color: 'var(--semi-color-primary)' }} />
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
            <Row gutter={16}>
              {DEFAULT_PRICE_KEYS.map((priceConfig) => (
                <Col xs={24} sm={8} key={priceConfig.key}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ marginBottom: 4 }}>
                      <Text strong>{priceConfig.label}</Text>
                      <Text type='tertiary' size='small' style={{ marginLeft: 8 }}>
                        {t(priceConfig.description)}
                      </Text>
                    </div>
                    <InputNumber
                      placeholder={t('输入价格')}
                      prefix='$'
                      suffix={t('/次')}
                      min={0}
                      step={0.001}
                      style={{ width: '100%' }}
                      value={getPriceValue(modelName, priceConfig.key)}
                      onChange={(value) =>
                        handlePriceChange(modelName, priceConfig.key, value)
                      }
                    />
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        ))
      )}

      <Button type='primary' onClick={onSubmit} disabled={modelList.length === 0}>
        {t('保存特殊模型价格设置')}
      </Button>
    </Spin>
  );
}
