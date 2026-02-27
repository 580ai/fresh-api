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
import { Button, Col, Form, Row, Spin } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
} from '../../../helpers';

export default function SettingsCreditLimit(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    QuotaForNewUser: '',
    PreConsumedQuota: '',
    QuotaForInviter: '',
    QuotaForInvitee: '',
    'quota_setting.enable_free_model_pre_consume': true,
    'channel_auto_enable_setting.enabled': false,
    'channel_auto_enable_setting.interval_minutes': 30,
    'channel_auto_enable_setting.timeout_seconds': 30,
    'channel_auto_enable_setting.success_rate_threshold': 50,
    'channel_auto_enable_setting.test_count': 2,
  });
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);

  function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) return showWarning(t('你似乎并没有修改什么'));
    const requestQueue = updateArray.map((item) => {
      let value = '';
      if (typeof inputs[item.key] === 'boolean') {
        value = String(inputs[item.key]);
      } else if (typeof inputs[item.key] === 'number') {
        value = String(inputs[item.key]);
      } else {
        value = inputs[item.key];
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
  }, [props.options]);
  return (
    <>
      <Spin spinning={loading}>
        <Form
          values={inputs}
          getFormApi={(formAPI) => (refForm.current = formAPI)}
          style={{ marginBottom: 15 }}
        >
          <Form.Section text={t('额度设置')}>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('新用户初始额度')}
                  field={'QuotaForNewUser'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  placeholder={''}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaForNewUser: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('请求预扣费额度')}
                  field={'PreConsumedQuota'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={t('请求结束后多退少补')}
                  placeholder={''}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      PreConsumedQuota: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('邀请新用户奖励额度')}
                  field={'QuotaForInviter'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={''}
                  placeholder={t('例如：2000')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaForInviter: String(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.InputNumber
                  label={t('新用户使用邀请码奖励额度')}
                  field={'QuotaForInvitee'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={''}
                  placeholder={t('例如：1000')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaForInvitee: String(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row>
              <Col>
                <Form.Switch
                  label={t('对免费模型启用预消耗')}
                  field={'quota_setting.enable_free_model_pre_consume'}
                  extraText={t(
                    '开启后，对免费模型（倍率为0，或者价格为0）的模型也会预消耗额度',
                  )}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'quota_setting.enable_free_model_pre_consume': value,
                    })
                  }
                />
              </Col>
            </Row>

            <Row>
              <Button size='default' onClick={onSubmit}>
                {t('保存额度设置')}
              </Button>
            </Row>
          </Form.Section>

          <Form.Section text={t('渠道自动启用设置')}>
            <Row>
              <Col>
                <Form.Switch
                  label={t('启用渠道自动启用功能')}
                  field={'channel_auto_enable_setting.enabled'}
                  extraText={t(
                    '开启后，系统会定期扫描开启了自动启用的渠道，测试成功率达标后自动启用',
                  )}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'channel_auto_enable_setting.enabled': value,
                    })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={6} xl={6}>
                <Form.InputNumber
                  label={t('测试间隔时长')}
                  field={'channel_auto_enable_setting.interval_minutes'}
                  step={1}
                  min={1}
                  max={1440}
                  suffix={t('分钟')}
                  extraText={t('每隔多少分钟扫描一次')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'channel_auto_enable_setting.interval_minutes': value,
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={6} xl={6}>
                <Form.InputNumber
                  label={t('测试超时时长')}
                  field={'channel_auto_enable_setting.timeout_seconds'}
                  step={1}
                  min={5}
                  max={300}
                  suffix={t('秒')}
                  extraText={t('超过此时长视为测试失败')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'channel_auto_enable_setting.timeout_seconds': value,
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={6} xl={6}>
                <Form.InputNumber
                  label={t('成功率阈值')}
                  field={'channel_auto_enable_setting.success_rate_threshold'}
                  step={1}
                  min={1}
                  max={100}
                  suffix={'%'}
                  extraText={t('成功率达到此阈值才启用渠道')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'channel_auto_enable_setting.success_rate_threshold': value,
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={6} xl={6}>
                <Form.InputNumber
                  label={t('测试次数')}
                  field={'channel_auto_enable_setting.test_count'}
                  step={1}
                  min={1}
                  max={10}
                  suffix={t('次')}
                  extraText={t('每次扫描时对每个渠道测试的次数')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'channel_auto_enable_setting.test_count': value,
                    })
                  }
                />
              </Col>
            </Row>
            <Row>
              <Button size='default' onClick={onSubmit}>
                {t('保存渠道自动启用设置')}
              </Button>
            </Row>
          </Form.Section>
        </Form>
      </Spin>
    </>
  );
}
