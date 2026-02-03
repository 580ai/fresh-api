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

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Tag, Checkbox, Popover, Typography, Input } from '@douyinfe/semi-ui';
import { IconClose, IconHandle, IconChevronDown, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

/**
 * 可拖拽排序的多选分组组件
 * @param {Object} props
 * @param {Array} props.value - 已选择的分组值数组，按优先级排序
 * @param {Function} props.onChange - 值变化回调
 * @param {Array} props.options - 可选分组列表 [{label, value, ratio}]
 * @param {string} props.placeholder - 占位文本
 * @param {boolean} props.disabled - 是否禁用
 */
const DraggableGroupSelect = ({
  value,
  onChange,
  options = [],
  placeholder,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const dragNodeRef = useRef(null);

  // 确保 value 是数组
  const safeValue = Array.isArray(value) ? value : [];

  // 获取分组信息
  const getGroupInfo = useCallback(
    (groupValue) => {
      return options.find((opt) => opt.value === groupValue) || { label: groupValue, value: groupValue };
    },
    [options]
  );

  // 过滤后的选项（根据搜索值）
  const filteredOptions = useMemo(() => {
    if (!searchValue.trim()) {
      return options;
    }
    const lowerSearch = searchValue.toLowerCase().trim();
    return options.filter((opt) => {
      const label = (opt.label || '').toLowerCase();
      const value = (opt.value || '').toLowerCase();
      return label.includes(lowerSearch) || value.includes(lowerSearch);
    });
  }, [options, searchValue]);

  // 处理选择变化
  const handleCheckboxChange = (optValue, checked) => {
    if (disabled) return;
    if (checked) {
      // 添加到末尾
      onChange([...safeValue, optValue]);
    } else {
      // 移除
      onChange(safeValue.filter((v) => v !== optValue));
    }
  };

  // 移除分组
  const handleRemove = (groupValue, e) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(safeValue.filter((v) => v !== groupValue));
  };

  // 拖拽开始
  const handleDragStart = (e, index) => {
    if (disabled) return;
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
    if (disabled || draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  // 拖拽离开
  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  // 放置
  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (disabled || draggedIndex === null || draggedIndex === dropIndex) return;

    const newValue = [...safeValue];
    const [draggedItem] = newValue.splice(draggedIndex, 1);
    newValue.splice(dropIndex, 0, draggedItem);
    onChange(newValue);

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // 渲染分组标签
  const renderGroupTag = (groupValue, index) => {
    const groupInfo = getGroupInfo(groupValue);
    const isDragging = draggedIndex === index;
    const isDragOver = dragOverIndex === index;

    return (
      <div
        key={groupValue}
        draggable={!disabled}
        onDragStart={(e) => handleDragStart(e, index)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, index)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, index)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '6px',
          marginRight: '8px',
          marginBottom: '8px',
          transition: 'all 0.2s',
          userSelect: 'none',
          opacity: isDragging ? 0.5 : 1,
          boxShadow: isDragOver ? '0 0 0 2px #1890ff' : 'none',
          cursor: disabled ? 'not-allowed' : 'grab',
          backgroundColor: 'var(--semi-color-primary-light-default)',
          border: '1px solid var(--semi-color-primary)',
          touchAction: 'none',
        }}
      >
        {!disabled && (
          <IconHandle
            size="small"
            style={{ color: 'var(--semi-color-text-2)' }}
          />
        )}
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--semi-color-primary)' }}>
          {groupInfo.label || groupValue}
        </span>
        {groupInfo.ratio !== undefined && (
          <span style={{ fontSize: '12px', color: 'var(--semi-color-primary)', marginLeft: '4px' }}>
            ({groupInfo.ratio}x)
          </span>
        )}
        {!disabled && (
          <IconClose
            size="small"
            style={{ color: 'var(--semi-color-text-2)', cursor: 'pointer', marginLeft: '4px' }}
            onClick={(e) => handleRemove(groupValue, e)}
          />
        )}
      </div>
    );
  };

  // 渲染下拉选项内容
  const renderPopoverContent = () => {
    return (
      <div style={{ minWidth: '250px' }}>
        {/* 搜索框 */}
        <div style={{ padding: '8px', borderBottom: '1px solid var(--semi-color-border)' }}>
          <Input
            prefix={<IconSearch />}
            placeholder={t('搜索分组')}
            value={searchValue}
            onChange={setSearchValue}
            showClear
            autofocus
          />
        </div>
        {/* 选项列表 */}
        <div style={{ padding: '8px', maxHeight: '250px', overflowY: 'auto' }}>
          {filteredOptions.map((opt) => {
            const isSelected = safeValue.includes(opt.value);
            return (
              <div
                key={opt.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  backgroundColor: isSelected ? 'var(--semi-color-primary-light-default)' : 'transparent',
                }}
                onClick={() => handleCheckboxChange(opt.value, !isSelected)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Checkbox checked={isSelected} />
                  <span style={{ fontWeight: 500 }}>{opt.label}</span>
                  {opt.ratio !== undefined && (
                    <Tag size="small" color="blue">
                      {opt.ratio}x
                    </Tag>
                  )}
                </div>
              </div>
            );
          })}
          {filteredOptions.length === 0 && options.length > 0 && (
            <div style={{ padding: '8px', color: 'var(--semi-color-text-2)', textAlign: 'center' }}>
              {t('未找到匹配的分组')}
            </div>
          )}
          {options.length === 0 && (
            <div style={{ padding: '8px', color: 'var(--semi-color-text-2)', textAlign: 'center' }}>
              {t('暂无可选分组')}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: '100%' }}>
      {/* 已选择的分组标签（可拖拽排序） */}
      {safeValue.length > 0 && (
        <div style={{
          marginBottom: '8px',
          padding: '8px',
          backgroundColor: 'var(--semi-color-fill-0)',
          borderRadius: '8px',
          minHeight: '44px',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {safeValue.map((groupValue, index) => renderGroupTag(groupValue, index))}
          </div>
          <Text type="tertiary" size="small" style={{ marginTop: '4px', display: 'block' }}>
            {t('拖拽标签可调整优先级顺序，排在前面的优先级更高')}
          </Text>
        </div>
      )}

      {/* 分组选择下拉框 */}
      <Popover
        visible={popoverVisible}
        onVisibleChange={(visible) => {
          setPopoverVisible(visible);
          // 关闭时清空搜索值
          if (!visible) {
            setSearchValue('');
          }
        }}
        content={renderPopoverContent()}
        trigger="click"
        position="bottomLeft"
        showArrow={false}
        stopPropagation={true}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            border: '1px solid var(--semi-color-border)',
            borderRadius: '6px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            backgroundColor: disabled ? 'var(--semi-color-disabled-fill)' : 'var(--semi-color-bg-2)',
          }}
          onClick={() => !disabled && setPopoverVisible(!popoverVisible)}
        >
          <span style={{ color: safeValue.length > 0 ? 'var(--semi-color-text-0)' : 'var(--semi-color-text-2)' }}>
            {safeValue.length > 0 ? t('已选择 {{count}} 个分组', { count: safeValue.length }) : (placeholder || t('请选择分组'))}
          </span>
          <IconChevronDown style={{ color: 'var(--semi-color-text-2)' }} />
        </div>
      </Popover>

      {/* 优先级说明 */}
      <div style={{
        marginTop: '12px',
        padding: '12px',
        backgroundColor: 'var(--semi-color-fill-0)',
        borderRadius: '8px',
        border: '1px solid var(--semi-color-border)',
      }}>
        <Text strong style={{ display: 'block', marginBottom: '8px' }}>
          {t('优先级说明')}
        </Text>
        <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--semi-color-text-2)', fontSize: '13px', lineHeight: '1.8' }}>
          <li>{t('选择顺序决定分组优先级（第一个为主分组）')}</li>
          <li>{t('系统会按优先级顺序尝试各分组渠道')}</li>
          <li>{t('建议选择2-3个分组以确保服务稳定性')}</li>
        </ul>
      </div>
    </div>
  );
};

export default DraggableGroupSelect;
