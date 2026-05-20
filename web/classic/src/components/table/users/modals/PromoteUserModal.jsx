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

import React, { useState, useEffect } from 'react';
import { Modal, RadioGroup, Radio, Typography } from '@douyinfe/semi-ui';

const { Text } = Typography;

const PromoteUserModal = ({ visible, onCancel, onConfirm, user, currentUserRole, t }) => {
  const [targetRole, setTargetRole] = useState('promote');

  // 当弹窗打开时，根据用户当前角色设置默认选项
  useEffect(() => {
    if (visible && user) {
      // 如果用户已经是管理员，默认选择提升到超级管理员
      if (user.role === 10) {
        setTargetRole('promote_root');
      } else {
        setTargetRole('promote');
      }
    }
  }, [visible, user]);

  const handleConfirm = () => {
    onConfirm(targetRole);
  };

  // 当前登录用户是否为超级管理员
  const isSuperAdmin = currentUserRole === 100;
  // 目标用户当前角色
  const userRole = user?.role || 1;

  return (
    <Modal
      title={t('提升用户权限')}
      visible={visible}
      onCancel={onCancel}
      onOk={handleConfirm}
      type='warning'
    >
      <div style={{ marginBottom: 16 }}>
        <Text>{t('选择要提升到的权限级别')}:</Text>
      </div>
      <RadioGroup
        value={targetRole}
        onChange={(e) => setTargetRole(e.target.value)}
        direction='vertical'
      >
        {/* 只有普通用户可以提升到管理员 */}
        {userRole === 1 && (
          <Radio value='promote'>
            <div>
              <Text strong>{t('管理员')}</Text>
              <Text type='tertiary' size='small' style={{ marginLeft: 8 }}>
                {t('可管理渠道、用户、兑换码等')}
              </Text>
            </div>
          </Radio>
        )}
        {/* 只有超级管理员才能提升用户到超级管理员 */}
        {isSuperAdmin && (
          <Radio value='promote_root'>
            <div>
              <Text strong>{t('超级管理员')}</Text>
              <Text type='tertiary' size='small' style={{ marginLeft: 8 }}>
                {t('拥有所有权限，包括系统设置')}
              </Text>
            </div>
          </Radio>
        )}
      </RadioGroup>
      {!isSuperAdmin && userRole === 10 && (
        <Text type='warning' style={{ marginTop: 16, display: 'block' }}>
          {t('只有超级管理员才能提升用户到超级管理员')}
        </Text>
      )}
    </Modal>
  );
};

export default PromoteUserModal;
