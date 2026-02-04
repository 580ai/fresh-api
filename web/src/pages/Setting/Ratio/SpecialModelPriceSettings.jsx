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

import React, { useEffect, useState, useRef } from 'react';
import {
  Button,
  Card,
  Col,
  Form,
  Row,
  Spin,
  Typography,
  InputNumber,
} from '@douyinfe/semi-ui';
import { IconImage } from '@douyinfe/semi-icons';
import { API, showError, showSuccess, showWarning } from '../../../helpers';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

// 特殊模型配置列表
const SPECIAL_MODELS = [
  {
    name: 'gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image Preview',
    description: '图像生成模型，支持不同分辨率定价',
    priceKeys: [
      { key: '1k', label: '1K', description: '默认分辨率' },
      { key: '2k', label: '2K', description: '中等分辨率' },
      { key: '4k', label: '4K', description: '高分辨率' },
    ],
  },
];

export default function SpecialModelPriceSettings(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [specialModelPrice, setSpecialModelPrice] = useState({});
  const [originalData, setOriginalData] = useState({});
  const refForm = useRef();

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

  // 更新单个模型的价格
  const handlePriceChange = (modelName, priceKey, value) => {
    setSpecialModelPrice((prev) => {
      const newData = { ...prev };
      if (!newData[modelName]) {
        newData[modelName] = {};
      }
      if (value === null || value === undefined || value === '') {
        delete newData[modelName][priceKey];
        // 如果模型下没有任何价格了，删除整个模型
        if (Object.keys(newData[modelName]).length === 0) {
          delete newData[modelName];
        }
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

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 15 }}>
        <Text type='secondary'>
          {t(
            '在此处配置特殊模型的价格，如图像生成模型的不同分辨率价格。配置后将在价格页面的模型详情中展示。',
          )}
        </Text>
      </div>

      {SPECIAL_MODELS.map((model) => (
        <Card
          key={model.name}
          style={{ marginBottom: 16 }}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconImage style={{ color: 'var(--semi-color-primary)' }} />
              <span>{model.label}</span>
            </div>
          }
        >
          <Text type='secondary' style={{ display: 'block', marginBottom: 16 }}>
            {t(model.description)}
          </Text>
          <Text
            type='tertiary'
            size='small'
            style={{ display: 'block', marginBottom: 16 }}
          >
            {t('模型名称')}: <code>{model.name}</code>
          </Text>

          <Row gutter={16}>
            {model.priceKeys.map((priceConfig) => (
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
                    value={getPriceValue(model.name, priceConfig.key)}
                    onChange={(value) =>
                      handlePriceChange(model.name, priceConfig.key, value)
                    }
                  />
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      ))}

      <Button type='primary' onClick={onSubmit}>
        {t('保存特殊模型价格设置')}
      </Button>
    </Spin>
  );
}
