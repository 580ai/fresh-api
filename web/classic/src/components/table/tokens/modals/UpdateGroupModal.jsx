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
import { Modal } from '@douyinfe/semi-ui';
import { API, showError, showSuccess } from '../../../../helpers';
import { StatusContext } from '../../../../context/Status';
import DraggableGroupSelect from '../../../common/ui/DraggableGroupSelect';

const UpdateGroupModal = ({
  visible,
  onCancel,
  selectedKeys,
  onSuccess,
  t,
}) => {
  const [statusState] = useContext(StatusContext);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  // 与单个令牌编辑保持一致：勾选多个分组时下发有序分组链
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [maxAutoGroups, setMaxAutoGroups] = useState(5);

  const loadGroups = async () => {
    let res = await API.get(`/api/user/self/groups`);
    const { success, message, data } = res.data;
    if (success) {
      let localGroupOptions = Object.entries(data).map(([group, info]) => ({
        label: (
          <div>
            <div>{group}</div>
            <div
              style={{ fontSize: '12px', color: 'var(--semi-color-text-2)' }}
            >
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

  const loadAutoGroupsMeta = async () => {
    try {
      const res = await API.get('/api/token/auto-groups');
      const { success, data } = res.data;
      if (success && data?.max_count > 0) {
        setMaxAutoGroups(data.max_count);
      }
    } catch (e) {
      // 拿不到上限时保留默认值，服务端仍会做最终校验
    }
  };

  useEffect(() => {
    if (visible) {
      loadGroups();
      loadAutoGroupsMeta();
    }
  }, [visible]);

  const handleSubmit = async () => {
    const wantsAuto = selectedGroups.includes('auto');
    const ordered = selectedGroups.filter((g) => g !== 'auto');
    if (ordered.length > maxAutoGroups) {
      showError(t('最多只能选择 {{max}} 个分组', { max: maxAutoGroups }));
      return;
    }

    const payload = { ids: selectedKeys.map((token) => token.id) };
    if (wantsAuto && ordered.length === 0) {
      payload.group = 'auto';
      payload.auto_groups = [];
      payload.cross_group_retry = true;
    } else if (ordered.length > 1) {
      payload.group = 'auto';
      payload.auto_groups = ordered;
      payload.cross_group_retry = true;
    } else {
      payload.group = ordered[0] || '';
      payload.auto_groups = [];
      payload.cross_group_retry = false;
    }

    setLoading(true);
    const res = await API.put('/api/token/batch/group', payload);
    const { success, message } = res.data;
    setLoading(false);
    if (success) {
      showSuccess(t('批量修改分组成功'));
      setSelectedGroups([]);
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
      onOk={() => handleSubmit()}
      confirmLoading={loading}
      okText={t('确定')}
      cancelText={t('取消')}
    >
      <p className='mb-4'>
        {t('已选择')} <strong>{selectedKeys.length}</strong> {t('个令牌')}
      </p>
      {groups.length > 0 ? (
        <>
          <div className='mb-2'>{t('分组')}</div>
          <DraggableGroupSelect
            value={selectedGroups}
            onChange={setSelectedGroups}
            options={groups}
            placeholder={t('请选择分组，可多选并拖拽排序设置优先级')}
          />
          {(selectedGroups.includes('auto') || selectedGroups.length > 1) && (
            <p className='mt-2 text-xs text-gray-500'>
              {t('跨分组重试已自动开启，按顺序尝试所选分组')}
            </p>
          )}
        </>
      ) : (
        <p className='text-xs text-gray-500'>{t('管理员未设置用户可选分组')}</p>
      )}
    </Modal>
  );
};

export default UpdateGroupModal;
