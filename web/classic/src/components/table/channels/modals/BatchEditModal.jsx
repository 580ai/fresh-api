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

import React, { useState } from 'react';
import { Modal, Input, Typography, Checkbox, InputNumber } from '@douyinfe/semi-ui';

const BatchEditModal = ({
  showBatchEdit,
  setShowBatchEdit,
  batchEditChannels,
  selectedChannels,
  t,
}) => {
  const [enableRPM, setEnableRPM] = useState(false);
  const [enableProxy, setEnableProxy] = useState(false);
  const [maxRPM, setMaxRPM] = useState(0);
  const [proxy, setProxy] = useState('');

  const handleOk = () => {
    const editData = {};
    if (enableRPM) {
      editData.max_rpm = maxRPM;
    }
    if (enableProxy) {
      editData.proxy = proxy;
    }
    if (!enableRPM && !enableProxy) {
      return;
    }
    batchEditChannels(editData);
  };

  const handleClose = () => {
    setShowBatchEdit(false);
    setEnableRPM(false);
    setEnableProxy(false);
    setMaxRPM(0);
    setProxy('');
  };

  return (
    <Modal
      title={t('批量编辑')}
      visible={showBatchEdit}
      onOk={handleOk}
      onCancel={handleClose}
      maskClosable={false}
      centered={true}
      size='small'
      className='!rounded-lg'
    >
      <div className='flex flex-col gap-4'>
        <div>
          <Checkbox
            checked={enableRPM}
            onChange={(e) => setEnableRPM(e.target.checked)}
          >
            {t('设置 RPM 限制')}
          </Checkbox>
          {enableRPM && (
            <div className='mt-2 ml-6'>
              <InputNumber
                min={0}
                value={maxRPM}
                onChange={(v) => setMaxRPM(v)}
                placeholder={t('0 表示不限制')}
                style={{ width: '100%' }}
              />
              <Typography.Text type='tertiary' size='small'>
                {t('0 表示不限制')}
              </Typography.Text>
            </div>
          )}
        </div>

        <div>
          <Checkbox
            checked={enableProxy}
            onChange={(e) => setEnableProxy(e.target.checked)}
          >
            {t('设置代理')}
          </Checkbox>
          {enableProxy && (
            <div className='mt-2 ml-6'>
              <Input
                value={proxy}
                onChange={(v) => setProxy(v)}
                placeholder='socks5://127.0.0.1:1080'
              />
              <Typography.Text type='tertiary' size='small'>
                {t('留空表示清除代理')}
              </Typography.Text>
            </div>
          )}
        </div>

        <div>
          <Typography.Text type='secondary'>
            {t('已选择 ${count} 个渠道').replace(
              '${count}',
              selectedChannels.length,
            )}
          </Typography.Text>
        </div>
      </div>
    </Modal>
  );
};

export default BatchEditModal;
