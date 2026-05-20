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

import React, { useEffect, useRef, useState } from 'react';
import { Modal, Progress, Tag, Typography, Space } from '@douyinfe/semi-ui';
import { IconTick, IconClose, IconAlertTriangle } from '@douyinfe/semi-icons';
import { API } from '../../../../helpers';

const NO_CHANNEL_PATTERN = /No available channel for model/i;
const CONCURRENCY = 5;
const ENDPOINT_TYPE = 'anthropic';

const STATUS = {
  PENDING: 'pending',
  TESTING: 'testing',
  PASS: 'pass',
  FAIL_REMOVE: 'fail_remove',
  FAIL_KEEP: 'fail_keep',
};

const ClaudeModelPreTestModal = ({ visible, channels, onDone, t }) => {
  const [items, setItems] = useState([]);
  const [doneCount, setDoneCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      startedRef.current = false;
      setItems([]);
      setDoneCount(0);
      setFinished(false);
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    const flatItems = [];
    (channels || []).forEach((ch) => {
      (ch.models || []).forEach((model) => {
        flatItems.push({
          channelId: ch.id,
          channelName: ch.name,
          model,
          status: STATUS.PENDING,
          message: '',
        });
      });
    });
    setItems(flatItems);

    if (flatItems.length === 0) {
      setFinished(true);
      onDone?.({ totalModels: 0, totalRemoved: 0, removedByChannel: {} });
      return;
    }

    runTests(flatItems, channels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const runTests = async (flatItems, originalChannels) => {
    const removedByChannel = {};

    const updateItem = (idx, patch) => {
      setItems((prev) => {
        const next = prev.slice();
        next[idx] = { ...next[idx], ...patch };
        return next;
      });
    };

    const testOne = async (item, idx) => {
      updateItem(idx, { status: STATUS.TESTING });
      try {
        const url =
          `/api/channel/test/${item.channelId}` +
          `?model=${encodeURIComponent(item.model)}` +
          `&endpoint_type=${ENDPOINT_TYPE}`;
        const res = await API.get(url);
        const { success, message } = res.data || {};
        if (success) {
          updateItem(idx, { status: STATUS.PASS, message: '' });
        } else if (message && NO_CHANNEL_PATTERN.test(message)) {
          updateItem(idx, { status: STATUS.FAIL_REMOVE, message });
          if (!removedByChannel[item.channelId]) {
            removedByChannel[item.channelId] = [];
          }
          removedByChannel[item.channelId].push(item.model);
        } else {
          updateItem(idx, {
            status: STATUS.FAIL_KEEP,
            message: message || t('未知错误'),
          });
        }
      } catch (e) {
        updateItem(idx, {
          status: STATUS.FAIL_KEEP,
          message: e?.message || t('网络错误'),
        });
      } finally {
        setDoneCount((c) => c + 1);
      }
    };

    for (let i = 0; i < flatItems.length; i += CONCURRENCY) {
      const slice = flatItems.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        slice.map((item, j) => testOne(item, i + j)),
      );
    }

    // 对每个有需移除模型的渠道，用 PATCH 接口只更新 models 字段
    const channelMap = new Map(
      (originalChannels || []).map((ch) => [ch.id, ch]),
    );
    for (const channelIdStr of Object.keys(removedByChannel)) {
      const channelId = Number(channelIdStr);
      const toRemove = new Set(removedByChannel[channelId]);
      const original = channelMap.get(channelId);
      if (!original) continue;
      try {
        const newModels = (original.models || []).filter(
          (m) => !toRemove.has(m),
        );
        await API.patch(`/api/channel/${channelId}/models`, {
          models: newModels.join(','),
        });
      } catch (e) {
        // 忽略单渠道更新失败，继续处理其他渠道
      }
    }

    setFinished(true);
    const totalRemoved = Object.values(removedByChannel).reduce(
      (n, arr) => n + arr.length,
      0,
    );
    // 延迟关闭，让用户看到最终结果
    setTimeout(() => {
      onDone?.({
        totalModels: flatItems.length,
        totalRemoved,
        removedByChannel,
      });
    }, 1500);
  };

  const total = items.length;
  const progress = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  const renderStatusTag = (status) => {
    switch (status) {
      case STATUS.PENDING:
        return (
          <Tag color='grey' shape='circle' size='small'>
            {t('等待中')}
          </Tag>
        );
      case STATUS.TESTING:
        return (
          <Tag color='blue' shape='circle' size='small'>
            {t('测试中')}
          </Tag>
        );
      case STATUS.PASS:
        return (
          <Tag
            color='green'
            shape='circle'
            size='small'
            prefixIcon={<IconTick />}
          >
            {t('通过')}
          </Tag>
        );
      case STATUS.FAIL_REMOVE:
        return (
          <Tag
            color='red'
            shape='circle'
            size='small'
            prefixIcon={<IconClose />}
          >
            {t('模型上游无可用渠道')}
          </Tag>
        );
      case STATUS.FAIL_KEEP:
        return (
          <Tag
            color='orange'
            shape='circle'
            size='small'
            prefixIcon={<IconAlertTriangle />}
          >
            {t('测试失败 (保留)')}
          </Tag>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      title={finished ? t('测试完成') : t('正在测试模型')}
      visible={visible}
      closeOnEsc={false}
      maskClosable={false}
      footer={null}
      closable={false}
      width={640}
    >
      <div style={{ marginBottom: 12 }}>
        <Typography.Text type='secondary'>
          {t('已测试 {{done}} / {{total}}')
            .replace('{{done}}', doneCount)
            .replace('{{total}}', total)}
        </Typography.Text>
      </div>
      <Progress
        percent={progress}
        stroke={finished ? '#52c41a' : undefined}
        showInfo
      />
      <div
        style={{
          marginTop: 16,
          maxHeight: 320,
          overflowY: 'auto',
          border: '1px solid var(--semi-color-border)',
          borderRadius: 4,
          padding: 8,
        }}
      >
        {items.map((item, idx) => (
          <div
            key={`${item.channelId}-${item.model}-${idx}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '4px 0',
              gap: 8,
            }}
          >
            <Space spacing={6} style={{ minWidth: 0, flex: 1 }}>
              <Typography.Text
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.model}
              </Typography.Text>
              {(channels || []).length > 1 && (
                <Typography.Text type='tertiary' size='small'>
                  ({item.channelName})
                </Typography.Text>
              )}
            </Space>
            {renderStatusTag(item.status)}
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default ClaudeModelPreTestModal;
