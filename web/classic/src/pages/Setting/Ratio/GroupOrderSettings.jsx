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
import { Button, Card, Spin, Typography, Empty } from '@douyinfe/semi-ui';
import { IconHandle } from '@douyinfe/semi-icons';
import { API, showError, showSuccess, showWarning } from '../../../helpers';
import { useTranslation } from 'react-i18next';

const { Text, Title } = Typography;

export default function GroupOrderSettings(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState([]);
  const [originalOrder, setOriginalOrder] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragNodeRef = useRef(null);

  // 从 UserUsableGroups 和 GroupRatio 解析分组列表
  const parseGroups = () => {
    try {
      const groupRatio = props.options?.GroupRatio;
      const groupOrder = props.options?.GroupOrder;
      const userUsableGroups = props.options?.UserUsableGroups;

      if (!userUsableGroups) {
        setGroups([]);
        return;
      }

      // 解析用户可选分组
      let usableGroupsObj = {};
      try {
        usableGroupsObj = JSON.parse(userUsableGroups);
      } catch (e) {
        setGroups([]);
        return;
      }

      const usableGroupNames = Object.keys(usableGroupsObj);
      if (usableGroupNames.length === 0) {
        setGroups([]);
        return;
      }

      // 解析分组倍率
      let ratioObj = {};
      if (groupRatio) {
        try {
          ratioObj = JSON.parse(groupRatio);
        } catch (e) {
          // ignore
        }
      }

      // 如果有排序配置，按排序配置排列
      let sortedGroups = [];
      if (groupOrder) {
        try {
          const orderArr = JSON.parse(groupOrder);
          if (Array.isArray(orderArr) && orderArr.length > 0) {
            // 先添加排序列表中的用户可选分组
            for (const name of orderArr) {
              if (usableGroupNames.includes(name)) {
                sortedGroups.push({
                  name,
                  desc: usableGroupsObj[name] || name,
                  ratio: ratioObj[name],
                });
              }
            }
            // 再添加不在排序列表中的用户可选分组
            for (const name of usableGroupNames) {
              if (!orderArr.includes(name)) {
                sortedGroups.push({
                  name,
                  desc: usableGroupsObj[name] || name,
                  ratio: ratioObj[name],
                });
              }
            }
          } else {
            // 没有排序配置，按字母顺序
            sortedGroups = usableGroupNames.sort().map(name => ({
              name,
              desc: usableGroupsObj[name] || name,
              ratio: ratioObj[name],
            }));
          }
        } catch (e) {
          // 解析失败，按字母顺序
          sortedGroups = usableGroupNames.sort().map(name => ({
            name,
            desc: usableGroupsObj[name] || name,
            ratio: ratioObj[name],
          }));
        }
      } else {
        // 没有排序配置，按字母顺序
        sortedGroups = usableGroupNames.sort().map(name => ({
          name,
          desc: usableGroupsObj[name] || name,
          ratio: ratioObj[name],
        }));
      }

      setGroups(sortedGroups);
      setOriginalOrder(sortedGroups.map(g => g.name));
    } catch (e) {
      console.error('Failed to parse groups:', e);
      setGroups([]);
    }
  };

  useEffect(() => {
    parseGroups();
  }, [props.options]);

  // 拖拽开始
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    dragNodeRef.current = e.target;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.style.opacity = '0.5';
      }
    }, 0);
  };

  // 拖拽结束
  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1';
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragNodeRef.current = null;
  };

  // 拖拽经过
  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  // 拖拽离开
  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  // 放置
  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newGroups = [...groups];
    const [draggedItem] = newGroups.splice(draggedIndex, 1);
    newGroups.splice(dropIndex, 0, draggedItem);
    setGroups(newGroups);

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // 保存排序
  const handleSave = async () => {
    const currentOrder = groups.map(g => g.name);

    // 检查是否有变化
    if (JSON.stringify(currentOrder) === JSON.stringify(originalOrder)) {
      showWarning(t('排序没有变化'));
      return;
    }

    setSaving(true);
    try {
      const res = await API.put('/api/option/', {
        key: 'GroupOrder',
        value: JSON.stringify(currentOrder),
      });

      if (res.data.success) {
        showSuccess(t('分组排序保存成功'));
        setOriginalOrder(currentOrder);
        props.refresh();
      } else {
        showError(res.data.message || t('保存失败'));
      }
    } catch (error) {
      console.error('Failed to save group order:', error);
      showError(t('保存失败'));
    } finally {
      setSaving(false);
    }
  };

  // 重置排序
  const handleReset = () => {
    parseGroups();
  };

  return (
    <Spin spinning={loading || saving}>
      <div style={{ marginBottom: 16 }}>
        <Title heading={6}>{t('分组排序')}</Title>
        <Text type="tertiary">
          {t('拖拽分组卡片调整显示顺序，排序将应用于所有分组选择列表（仅对用户可选分组进行排序）')}
        </Text>
      </div>

      {groups.length === 0 ? (
        <Empty
          title={t('暂无分组')}
          description={t('请先在分组倍率设置中配置用户可选分组')}
        />
      ) : (
        <>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginBottom: '16px',
          }}>
            {groups.map((group, index) => {
              const isDragging = draggedIndex === index;
              const isDragOver = dragOverIndex === index;

              return (
                <div
                  key={group.name}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 16px',
                    backgroundColor: isDragOver
                      ? 'var(--semi-color-primary-light-default)'
                      : 'var(--semi-color-bg-2)',
                    border: isDragOver
                      ? '2px solid var(--semi-color-primary)'
                      : '1px solid var(--semi-color-border)',
                    borderRadius: '8px',
                    cursor: 'grab',
                    opacity: isDragging ? 0.5 : 1,
                    transition: 'all 0.2s',
                    userSelect: 'none',
                  }}
                >
                  <IconHandle
                    style={{
                      marginRight: '12px',
                      color: 'var(--semi-color-text-2)',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flex: 1,
                  }}>
                    <div>
                      <Text strong style={{ fontSize: '14px' }}>
                        {index + 1}. {group.name}
                      </Text>
                      {group.desc && group.desc !== group.name && (
                        <div style={{ marginTop: '4px' }}>
                          <Text type="tertiary" style={{ fontSize: '12px' }}>
                            {group.desc}
                          </Text>
                        </div>
                      )}
                    </div>
                    {group.ratio !== undefined && (
                      <Text type="tertiary" style={{ fontSize: '13px' }}>
                        {t('倍率')}: {group.ratio}x
                      </Text>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Button
              type="primary"
              onClick={handleSave}
              loading={saving}
            >
              {t('保存排序')}
            </Button>
            <Button onClick={handleReset}>
              {t('重置')}
            </Button>
          </div>
        </>
      )}
    </Spin>
  );
}
