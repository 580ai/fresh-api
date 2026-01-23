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
  Col,
  Form,
  Row,
  Spin,
  Typography,
  Space,
  Tag,
  Popconfirm,
  InputNumber,
} from '@douyinfe/semi-ui';
import { IconPlus, IconDelete } from '@douyinfe/semi-icons';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
  parseHttpStatusCodeRules,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';
import HttpStatusCodeRulesInput from '../../../components/settings/HttpStatusCodeRulesInput';

const { Text } = Typography;

export default function SettingsMonitoring(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    ChannelDisableThreshold: '',
    QuotaRemindThreshold: '',
    AutomaticDisableChannelEnabled: false,
    AutomaticEnableChannelEnabled: false,
    AutomaticDisableKeywords: '',
    AutomaticDisableStatusCodes: '401',
    AutomaticRetryStatusCodes: '100-199,300-399,401-407,409-499,500-503,505-523,525-599',
    'monitor_setting.auto_test_channel_enabled': false,
    'monitor_setting.auto_test_channel_minutes': 10,
    // 渠道优先级监控设置
    'channel_priority_monitor.enabled': false,
    'channel_priority_monitor.interval_minutes': 30,
    'channel_priority_monitor.timeout_seconds': 30,
    'channel_priority_monitor.model_priorities': '',
    'channel_priority_monitor.response_time_tiers': '[{"min":0,"max":3},{"min":3,"max":10},{"min":10,"max":30},{"min":30,"max":9999}]',
  });
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);

  // 响应时间分层配置
  const [responseTimeTiers, setResponseTimeTiers] = useState([
    { min: 0, max: 3 },
    { min: 3, max: 10 },
    { min: 10, max: 30 },
    { min: 30, max: 9999 },
  ]);

  const parsedAutoDisableStatusCodes = parseHttpStatusCodeRules(
    inputs.AutomaticDisableStatusCodes || '',
  );
  const parsedAutoRetryStatusCodes = parseHttpStatusCodeRules(
    inputs.AutomaticRetryStatusCodes || '',
  );

  // 更新分层配置
  const updateTier = (index, field, value) => {
    const newTiers = [...responseTimeTiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    setResponseTimeTiers(newTiers);
    // 同步到 inputs
    setInputs({
      ...inputs,
      'channel_priority_monitor.response_time_tiers': JSON.stringify(newTiers),
    });
  };

  // 添加新分层
  const addTier = () => {
    const lastTier = responseTimeTiers[responseTimeTiers.length - 1];
    const newTier = {
      min: lastTier ? lastTier.max : 0,
      max: lastTier ? lastTier.max + 10 : 10,
    };
    const newTiers = [...responseTimeTiers, newTier];
    setResponseTimeTiers(newTiers);
    setInputs({
      ...inputs,
      'channel_priority_monitor.response_time_tiers': JSON.stringify(newTiers),
    });
  };

  // 删除分层
  const removeTier = (index) => {
    if (responseTimeTiers.length <= 1) {
      showWarning(t('至少保留一个分层配置'));
      return;
    }
    const newTiers = responseTimeTiers.filter((_, i) => i !== index);
    setResponseTimeTiers(newTiers);
    setInputs({
      ...inputs,
      'channel_priority_monitor.response_time_tiers': JSON.stringify(newTiers),
    });
  };

  function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) return showWarning(t('你似乎并没有修改什么'));
    if (!parsedAutoDisableStatusCodes.ok) {
      const details =
        parsedAutoDisableStatusCodes.invalidTokens &&
        parsedAutoDisableStatusCodes.invalidTokens.length > 0
          ? `: ${parsedAutoDisableStatusCodes.invalidTokens.join(', ')}`
          : '';
      return showError(`${t('自动禁用状态码格式不正确')}${details}`);
    }
    if (!parsedAutoRetryStatusCodes.ok) {
      const details =
        parsedAutoRetryStatusCodes.invalidTokens &&
        parsedAutoRetryStatusCodes.invalidTokens.length > 0
          ? `: ${parsedAutoRetryStatusCodes.invalidTokens.join(', ')}`
          : '';
      return showError(`${t('自动重试状态码格式不正确')}${details}`);
    }
    const requestQueue = updateArray.map((item) => {
      let value = '';
      if (typeof inputs[item.key] === 'boolean') {
        value = String(inputs[item.key]);
      } else {
        const normalizedMap = {
          AutomaticDisableStatusCodes: parsedAutoDisableStatusCodes.normalized,
          AutomaticRetryStatusCodes: parsedAutoRetryStatusCodes.normalized,
        };
        value = normalizedMap[item.key] ?? inputs[item.key];
      }
      return API.put('/api/option/', {
        key: item.key,
        value,
      });
    });
    setLoading(true);
    Promise.all(requestQueue)
      .then((res) => {
        if (requestQueue.length === 1) {
          if (res.includes(undefined)) return;
        } else if (requestQueue.length > 1) {
          if (res.includes(undefined))
            return showError(t('部分保存失败，请重试'));
        }
        showSuccess(t('保存成功'));
        props.refresh();
      })
      .catch(() => {
        showError(t('保存失败，请重试'));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    const currentInputs = {};
    for (let key in props.options) {
      if (Object.keys(inputs).includes(key)) {
        currentInputs[key] = props.options[key];
      }
    }
    setInputs(currentInputs);
    setInputsRow(structuredClone(currentInputs));
    refForm.current.setValues(currentInputs);

    // 解析响应时间分层配置
    if (currentInputs['channel_priority_monitor.response_time_tiers']) {
      try {
        const tiers = JSON.parse(currentInputs['channel_priority_monitor.response_time_tiers']);
        if (Array.isArray(tiers) && tiers.length > 0) {
          setResponseTimeTiers(tiers);
        }
      } catch (e) {
        console.error('解析响应时间分层配置失败:', e);
      }
    }
  }, [props.options]);

  return (
    <>
      <Spin spinning={loading}>
        <Form
          values={inputs}
          getFormApi={(formAPI) => (refForm.current = formAPI)}
          style={{ marginBottom: 15 }}
        >
          <Form.Section text={t('监控设置')}>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'monitor_setting.auto_test_channel_enabled'}
                  label={t('定时测试所有通道')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'monitor_setting.auto_test_channel_enabled': value,
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('自动测试所有通道间隔时间')}
                  step={1}
                  min={1}
                  suffix={t('分钟')}
                  extraText={t('每隔多少分钟测试一次所有通道')}
                  placeholder={''}
                  field={'monitor_setting.auto_test_channel_minutes'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'monitor_setting.auto_test_channel_minutes':
                        parseInt(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('测试所有渠道的最长响应时间')}
                  step={1}
                  min={0}
                  suffix={t('秒')}
                  extraText={t(
                    '当运行通道全部测试时，超过此时间将自动禁用通道',
                  )}
                  placeholder={''}
                  field={'ChannelDisableThreshold'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      ChannelDisableThreshold: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('额度提醒阈值')}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={t('低于此额度时将发送邮件提醒用户')}
                  placeholder={''}
                  field={'QuotaRemindThreshold'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaRemindThreshold: String(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'AutomaticDisableChannelEnabled'}
                  label={t('失败时自动禁用通道')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) => {
                    setInputs({
                      ...inputs,
                      AutomaticDisableChannelEnabled: value,
                    });
                  }}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'AutomaticEnableChannelEnabled'}
                  label={t('成功时自动启用通道')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      AutomaticEnableChannelEnabled: value,
                    })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={16}>
                <HttpStatusCodeRulesInput
                  label={t('自动禁用状态码')}
                  placeholder={t('例如：401, 403, 429, 500-599')}
                  extraText={t(
                    '支持填写单个状态码或范围（含首尾），使用逗号分隔',
                  )}
                  field={'AutomaticDisableStatusCodes'}
                  onChange={(value) =>
                    setInputs({ ...inputs, AutomaticDisableStatusCodes: value })
                  }
                  parsed={parsedAutoDisableStatusCodes}
                  invalidText={t('自动禁用状态码格式不正确')}
                />
                <HttpStatusCodeRulesInput
                  label={t('自动重试状态码')}
                  placeholder={t('例如：401, 403, 429, 500-599')}
                  extraText={t(
                    '支持填写单个状态码或范围（含首尾），使用逗号分隔',
                  )}
                  field={'AutomaticRetryStatusCodes'}
                  onChange={(value) =>
                    setInputs({ ...inputs, AutomaticRetryStatusCodes: value })
                  }
                  parsed={parsedAutoRetryStatusCodes}
                  invalidText={t('自动重试状态码格式不正确')}
                />
                <Form.TextArea
                  label={t('自动禁用关键词')}
                  placeholder={t('一行一个，不区分大小写')}
                  extraText={t(
                    '当上游通道返回错误中包含这些关键词时（不区分大小写），自动禁用通道',
                  )}
                  field={'AutomaticDisableKeywords'}
                  autosize={{ minRows: 6, maxRows: 12 }}
                  onChange={(value) =>
                    setInputs({ ...inputs, AutomaticDisableKeywords: value })
                  }
                />
              </Col>
            </Row>
            <Row>
              <Button size='default' onClick={onSubmit}>
                {t('保存监控设置')}
              </Button>
            </Row>
          </Form.Section>

          {/* 渠道优先级监控设置 */}
          <Form.Section text={t('渠道优先级监控设置')}>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Switch
                  field={'channel_priority_monitor.enabled'}
                  label={t('启用定时测试渠道')}
                  size='default'
                  checkedText='｜'
                  uncheckedText='〇'
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'channel_priority_monitor.enabled': value,
                    })
                  }
                  extraText={t('定时测试渠道并根据响应时间自动调整优先级和权重')}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('自动测试间隔时间')}
                  step={1}
                  min={1}
                  suffix={t('分钟')}
                  extraText={t('每隔多少分钟测试一次配置的模型')}
                  placeholder={'30'}
                  field={'channel_priority_monitor.interval_minutes'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'channel_priority_monitor.interval_minutes': parseInt(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('最长响应时间')}
                  step={1}
                  min={1}
                  suffix={t('秒')}
                  extraText={t('超过此时间的渠道将被标记为超时')}
                  placeholder={'30'}
                  field={'channel_priority_monitor.timeout_seconds'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'channel_priority_monitor.timeout_seconds': parseInt(value),
                    })
                  }
                />
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={16}>
                <Form.TextArea
                  label={t('模型优先级配置')}
                  placeholder={t('一行一个，格式：模型名称:起始优先级\n例如：\ngemini-2.5-pro:100\ngpt-4o:200\nclaude-3-5-sonnet:300')}
                  extraText={t('配置需要监控的模型及其起始优先级，测试后会根据响应时间在此基础上调整')}
                  field={'channel_priority_monitor.model_priorities'}
                  autosize={{ minRows: 4, maxRows: 10 }}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'channel_priority_monitor.model_priorities': value,
                    })
                  }
                />
              </Col>
            </Row>

            {/* 响应时间分层配置 */}
            <Row gutter={16}>
              <Col xs={24}>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>{t('响应时间分层配置')}</Text>
                  <Text type='tertiary' style={{ marginLeft: 8 }}>
                    {t('根据响应时间划分层级，同层级内按响应时间排序分配优先级和权重')}
                  </Text>
                </div>
                <div
                  style={{
                    border: '1px solid var(--semi-color-border)',
                    borderRadius: 8,
                    padding: 16,
                    backgroundColor: 'var(--semi-color-bg-1)',
                  }}
                >
                  {/* 表头 */}
                  <Row gutter={8} style={{ marginBottom: 8 }}>
                    <Col span={3}>
                      <Text type='secondary' size='small'>{t('层级')}</Text>
                    </Col>
                    <Col span={8}>
                      <Text type='secondary' size='small'>{t('最小时间(秒)')}</Text>
                    </Col>
                    <Col span={8}>
                      <Text type='secondary' size='small'>{t('最大时间(秒)')}</Text>
                    </Col>
                    <Col span={5}>
                      <Text type='secondary' size='small'>{t('操作')}</Text>
                    </Col>
                  </Row>

                  {/* 分层列表 */}
                  {responseTimeTiers.map((tier, index) => (
                    <Row gutter={8} key={index} style={{ marginBottom: 8 }} align='middle'>
                      <Col span={3}>
                        <Tag color='blue' size='small'>
                          {t('第{{n}}层', { n: index + 1 })}
                        </Tag>
                      </Col>
                      <Col span={8}>
                        <InputNumber
                          min={0}
                          value={tier.min}
                          onChange={(value) => updateTier(index, 'min', value)}
                          style={{ width: '100%' }}
                        />
                      </Col>
                      <Col span={8}>
                        <InputNumber
                          min={0}
                          value={tier.max}
                          onChange={(value) => updateTier(index, 'max', value)}
                          style={{ width: '100%' }}
                        />
                      </Col>
                      <Col span={5}>
                        <Popconfirm
                          title={t('确定删除此分层？')}
                          onConfirm={() => removeTier(index)}
                        >
                          <Button
                            icon={<IconDelete />}
                            type='danger'
                            theme='borderless'
                            size='small'
                            disabled={responseTimeTiers.length <= 1}
                          />
                        </Popconfirm>
                      </Col>
                    </Row>
                  ))}

                  {/* 添加按钮 */}
                  <Button
                    icon={<IconPlus />}
                    theme='light'
                    type='tertiary'
                    size='small'
                    onClick={addTier}
                    style={{ marginTop: 8 }}
                  >
                    {t('添加分层')}
                  </Button>

                  {/* 说明 */}
                  <div style={{ marginTop: 12, padding: 12, backgroundColor: 'var(--semi-color-bg-2)', borderRadius: 6 }}>
                    <Text type='tertiary' size='small'>
                      <div style={{ marginBottom: 4 }}><Text strong>{t('优先级分配规则（数值越大越优先）：')}</Text></div>
                      {t('1. 响应时间越短，优先级数值越大，越优先被选择')}
                      <br />
                      {t('2. 第1层渠道优先级最大，依次递减；同层内按响应时间从短到长排序，优先级递减1')}
                      <br />
                      {t('3. 如果配置了模型起始优先级（如 gemini-2.5-pro:100），则从该值开始向下分配；否则使用渠道原有优先级')}
                      <br /><br />
                      <div style={{ marginBottom: 4 }}><Text strong>{t('权重分配规则（数值越大越优先）：')}</Text></div>
                      {t('同一层级内，响应时间越短权重越大，被选中的概率越高')}
                    </Text>
                  </div>
                </div>
              </Col>
            </Row>

            <Row style={{ marginTop: 16 }}>
              <Space>
                <Button size='default' onClick={onSubmit}>
                  {t('保存渠道优先级监控设置')}
                </Button>
                <Tag color='blue'>
                  {t('响应时间短的渠道优先级数值更小，会被优先选择')}
                </Tag>
              </Space>
            </Row>
          </Form.Section>
        </Form>
      </Spin>
    </>
  );
}
