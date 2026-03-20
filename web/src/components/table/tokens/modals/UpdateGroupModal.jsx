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

import React, { useState, useEffect, useContext } from 'react';
import { Modal, Form } from '@douyinfe/semi-ui';
import { API, showError, showSuccess } from '../../../../helpers';
import { StatusContext } from '../../../../context/Status';

const UpdateGroupModal = ({ visible, onCancel, selectedKeys, onSuccess, t }) => {
  const [statusState] = useContext(StatusContext);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [formApi, setFormApi] = useState(null);

  const loadGroups = async () => {
    let res = await API.get(`/api/user/self/groups`);
    const { success, message, data } = res.data;
    if (success) {
      let localGroupOptions = Object.entries(data).map(([group, info]) => ({
        label: (
          <div>
            <div>{group}</div>
            <div style={{ fontSize: '12px', color: 'var(--semi-color-text-2)' }}>
              {info.desc}
            </div>
          </div>
        ),
        value: group,
        name: group,
        ratio: info.ratio,
        order: info.order !== undefined ? info.order : 999,
        _display: group,
      }));
      localGroupOptions.sort((a, b) => {
        if (statusState?.status?.default_use_auto_group) {
          if (a.value === 'auto') return -1;
          if (b.value === 'auto') return 1;
        }
        return a.order - b.order;
      });
      setGroups(localGroupOptions);
    } else {
      showError(t(message));
    }
  };

  useEffect(() => {
    if (visible) {
      loadGroups();
    }
  }, [visible]);

  const handleSubmit = async (values) => {
    setLoading(true);
    const ids = selectedKeys.map((token) => token.id);
    const res = await API.put('/api/token/batch/group', {
      ids,
      group: values.group || '',
      cross_group_retry: values.cross_group_retry || false,
    });
    const { success, message } = res.data;
    setLoading(false);
    if (success) {
      showSuccess(t('批量修改分组成功'));
      onCancel();
      onSuccess();
    } else {
      showError(message);
    }
  };

  return (
    <Modal
      title={t('批量修改分组')}
      visible={visible}
      onCancel={onCancel}
      onOk={() => formApi?.submitForm()}
      confirmLoading={loading}
      okText={t('确定')}
      cancelText={t('取消')}
    >
      <p className='mb-4'>
        {t('已选择')} <strong>{selectedKeys.length}</strong> {t('个令牌')}
      </p>
      <Form
        getFormApi={(api) => setFormApi(api)}
        onSubmit={handleSubmit}
        initValues={{ group: '', cross_group_retry: false }}
      >
        <Form.Select
          field='group'
          label={t('分组')}
          placeholder={t('请选择分组')}
          optionList={groups}
          renderSelectedItem={(option) => option._display || option.value}
          style={{ width: '100%' }}
        />
        <Form.Checkbox field='cross_group_retry' noLabel>
          {t('跨分组重试（仅auto分组有效）')}
        </Form.Checkbox>
      </Form>
    </Modal>
  );
};

export default UpdateGroupModal;
