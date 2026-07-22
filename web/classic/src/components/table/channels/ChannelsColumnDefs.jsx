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

import React from 'react';
import {
  Button,
  Dropdown,
  InputNumber,
  Modal,
  Space,
  SplitButtonGroup,
  Tag,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import {
  timestamp2string,
  renderGroup,
  renderQuota,
  getChannelIcon,
  renderQuotaWithAmount,
  showSuccess,
  showError,
  showInfo,
  toBoolean,
} from '../../../helpers';
import {
  CHANNEL_OPTIONS,
  MODEL_FETCHABLE_CHANNEL_TYPES,
} from '../../../constants';
import { parseUpstreamUpdateMeta } from '../../../hooks/channels/upstreamUpdateUtils';
import {
  IconTreeTriangleDown,
  IconMore,
  IconAlertTriangle,
} from '@douyinfe/semi-icons';
import { FaRandom } from 'react-icons/fa';

// ============================================================================
// 上游已用对账辅助
// 命名规范：类型-上游名称-倍率[-S/G]（末尾解析，上游名称本身可含 '-'）
//   末段∈{S,G} → 结算标志；倍率=倒数第2段。否则倍率=末段、无结算标志。
// ============================================================================
const parseChannelReconMeta = (name) => {
  const result = { ratio: null, settlement: null };
  if (!name) return result;
  const parts = String(name).split('-');
  let ratioIdx = parts.length - 1;
  const last = (parts[parts.length - 1] || '').trim().toUpperCase();
  if (last === 'S' || last === 'G') {
    result.settlement = last;
    ratioIdx = parts.length - 2;
  }
  if (ratioIdx >= 0) {
    const r = Number((parts[ratioIdx] || '').trim());
    if (Number.isFinite(r) && r > 0) result.ratio = r;
  }
  return result;
};

// 计算对账各项（单位均为额度 quota）：误差=U/r−L，利润=L−U/r，金额=L×r
const computeRecon = (record) => {
  const local = record.used_quota || 0;
  const upstreamRaw = record.upstream_used_quota || 0;
  const { ratio, settlement } = parseChannelReconMeta(record.name);
  const r = ratio || 1;
  const upstreamAdjusted = upstreamRaw / r;
  const error = upstreamAdjusted - local;
  const profit = local - upstreamAdjusted;
  const amount = local * r;
  return {
    local,
    upstreamRaw,
    ratio,
    upstreamAdjusted,
    error,
    profit,
    profitRate: local > 0 ? profit / local : null,
    amount,
    settlement,
    hasUpstream: upstreamRaw > 0,
  };
};

const reconSignPrefix = (v) => {
  if (v > 0) return '+';
  if (v < 0) return '-';
  return '';
};

// Render functions
const renderType = (type, channelInfo = undefined, t) => {
  let type2label = new Map();
  for (let i = 0; i < CHANNEL_OPTIONS.length; i++) {
    type2label[CHANNEL_OPTIONS[i].value] = CHANNEL_OPTIONS[i];
  }
  type2label[0] = { value: 0, label: t('未知类型'), color: 'grey' };

  let icon = getChannelIcon(type);

  if (channelInfo?.is_multi_key) {
    icon =
      channelInfo?.multi_key_mode === 'random' ? (
        <div className='flex items-center gap-1'>
          <FaRandom className='text-blue-500' />
          {icon}
        </div>
      ) : (
        <div className='flex items-center gap-1'>
          <IconTreeTriangleDown className='text-blue-500' />
          {icon}
        </div>
      );
  }

  return (
    <Tag color={type2label[type]?.color} shape='circle' prefixIcon={icon}>
      {type2label[type]?.label}
    </Tag>
  );
};

const renderTagType = (t) => {
  return (
    <Tag color='light-blue' shape='circle' type='light'>
      {t('标签聚合')}
    </Tag>
  );
};

const renderStatus = (status, channelInfo = undefined, t) => {
  if (channelInfo) {
    if (channelInfo.is_multi_key) {
      let keySize = channelInfo.multi_key_size;
      let enabledKeySize = keySize;
      if (channelInfo.multi_key_status_list) {
        enabledKeySize =
          keySize - Object.keys(channelInfo.multi_key_status_list).length;
      }
      return renderMultiKeyStatus(status, keySize, enabledKeySize, t);
    }
  }
  switch (status) {
    case 1:
      return (
        <Tag color='green' shape='circle'>
          {t('已启用')}
        </Tag>
      );
    case 2:
      return (
        <Tag color='red' shape='circle'>
          {t('已禁用')}
        </Tag>
      );
    case 3:
      return (
        <Tag color='yellow' shape='circle'>
          {t('自动禁用')}
        </Tag>
      );
    default:
      return (
        <Tag color='grey' shape='circle'>
          {t('未知状态')}
        </Tag>
      );
  }
};

const renderMultiKeyStatus = (status, keySize, enabledKeySize, t) => {
  switch (status) {
    case 1:
      return (
        <Tag color='green' shape='circle'>
          {t('已启用')} {enabledKeySize}/{keySize}
        </Tag>
      );
    case 2:
      return (
        <Tag color='red' shape='circle'>
          {t('已禁用')} {enabledKeySize}/{keySize}
        </Tag>
      );
    case 3:
      return (
        <Tag color='yellow' shape='circle'>
          {t('自动禁用')} {enabledKeySize}/{keySize}
        </Tag>
      );
    default:
      return (
        <Tag color='grey' shape='circle'>
          {t('未知状态')} {enabledKeySize}/{keySize}
        </Tag>
      );
  }
};

const renderResponseTime = (responseTime, t) => {
  let time = responseTime / 1000;
  time = time.toFixed(2) + t(' 秒');
  if (responseTime === 0) {
    return (
      <Tag color='grey' shape='circle'>
        {t('未测试')}
      </Tag>
    );
  } else if (responseTime <= 1000) {
    return (
      <Tag color='green' shape='circle'>
        {time}
      </Tag>
    );
  } else if (responseTime <= 3000) {
    return (
      <Tag color='lime' shape='circle'>
        {time}
      </Tag>
    );
  } else if (responseTime <= 5000) {
    return (
      <Tag color='yellow' shape='circle'>
        {time}
      </Tag>
    );
  } else {
    return (
      <Tag color='red' shape='circle'>
        {time}
      </Tag>
    );
  }
};

// 渲染渠道失败率和实时 RPM
const renderFailureRateAndRpm = (stats, t) => {
  if (!stats) {
    return (
      <Tag color='grey' shape='circle'>
        {t('暂无数据')}
      </Tag>
    );
  }

  const { total_count, fail_count, timeout_count, rpm } = stats;
  const failRate =
    total_count > 0
      ? (((fail_count || 0) + (timeout_count || 0)) / total_count) * 100
      : 0;
  const failRateStr = failRate.toFixed(1);
  const rpmValue = rpm ?? 0;

  let failColor = 'green';
  if (failRate >= 95) {
    failColor = 'red';
  } else if (failRate >= 50) {
    failColor = 'orange';
  } else if (failRate >= 20) {
    failColor = 'yellow';
  } else if (failRate > 0) {
    failColor = 'lime';
  }

  let rpmColor = 'grey';
  if (rpmValue >= 200) {
    rpmColor = 'green';
  } else if (rpmValue >= 50) {
    rpmColor = 'teal';
  } else if (rpmValue >= 10) {
    rpmColor = 'cyan';
  } else if (rpmValue > 0) {
    rpmColor = 'blue';
  }

  return (
    <Tooltip
      content={
        <div>
          <div>
            {t('总请求')}: {total_count || 0}
          </div>
          <div>
            {t('失败')}: {(fail_count || 0) + (timeout_count || 0)}
          </div>
          <div>
            {t('最近1分钟请求数')}: {rpmValue}
          </div>
          <div className='text-xs text-gray-400 mt-1'>{t('最近24小时')}</div>
        </div>
      }
    >
      <Space spacing={6} className='whitespace-nowrap'>
        {/* 成功率、超时率暂时隐藏，仅保留失败率和 RPM 展示。 */}
        <Tag color={failColor} shape='circle'>
          {t('失败')} {failRateStr}%
        </Tag>
        <Tag color={rpmColor} shape='circle'>{`RPM ${rpmValue}`}</Tag>
      </Space>
    </Tooltip>
  );
};

const getUpstreamUpdateMeta = (record) => {
  const supported =
    !!record &&
    record.children === undefined &&
    MODEL_FETCHABLE_CHANNEL_TYPES.has(record.type);
  if (!record || record.children !== undefined) {
    return {
      supported: false,
      enabled: false,
      pendingAddModels: [],
      pendingRemoveModels: [],
    };
  }
  const parsed =
    record?.upstreamUpdateMeta && typeof record.upstreamUpdateMeta === 'object'
      ? record.upstreamUpdateMeta
      : parseUpstreamUpdateMeta(record?.settings);
  return {
    supported,
    enabled: parsed?.enabled === true,
    pendingAddModels: Array.isArray(parsed?.pendingAddModels)
      ? parsed.pendingAddModels
      : [],
    pendingRemoveModels: Array.isArray(parsed?.pendingRemoveModels)
      ? parsed.pendingRemoveModels
      : [],
  };
};

const isRequestPassThroughEnabled = (record) => {
  if (!record || record.children !== undefined) {
    return false;
  }
  const settingValue = record.setting;
  if (!settingValue) {
    return false;
  }
  if (typeof settingValue === 'object') {
    return settingValue.pass_through_body_enabled === true;
  }
  if (typeof settingValue !== 'string') {
    return false;
  }
  try {
    const parsed = JSON.parse(settingValue);
    return parsed?.pass_through_body_enabled === true;
  } catch (error) {
    return false;
  }
};

export const getChannelsColumns = ({
  t,
  COLUMN_KEYS,
  updateChannelBalance,
  manageChannel,
  manageTag,
  submitTagEdit,
  testChannel,
  setCurrentTestChannel,
  setShowModelTestModal,
  setEditingChannel,
  setShowEdit,
  setShowEditTag,
  setEditingTag,
  copySelectedChannel,
  refresh,
  activePage,
  channels,
  setShowMultiKeyManageModal,
  setCurrentMultiKeyChannel,
  openUpstreamUpdateModal,
  detectChannelUpstreamUpdates,
}) => {
  return [
    {
      key: COLUMN_KEYS.ID,
      title: t('ID'),
      dataIndex: 'id',
    },
    {
      key: COLUMN_KEYS.SUCCESS_RATE,
      title: t('失败率/RPM'),
      dataIndex: 'stats',
      width: 160,
      render: (text, record, index) => (
        <div>{renderFailureRateAndRpm(record.stats, t)}</div>
      ),
    },
    {
      key: COLUMN_KEYS.CREATED_TIME,
      title: t('上架时间'),
      dataIndex: 'created_time',
      render: (text) => <div>{timestamp2string(text)}</div>,
    },
    {
      key: COLUMN_KEYS.NAME,
      title: t('名称'),
      dataIndex: 'name',
      render: (text, record, index) => {
        const passThroughEnabled = isRequestPassThroughEnabled(record);
        const upstreamUpdateMeta = getUpstreamUpdateMeta(record);
        const pendingAddCount = upstreamUpdateMeta.pendingAddModels.length;
        const pendingRemoveCount =
          upstreamUpdateMeta.pendingRemoveModels.length;
        const showUpstreamUpdateTag =
          upstreamUpdateMeta.supported &&
          upstreamUpdateMeta.enabled &&
          (pendingAddCount > 0 || pendingRemoveCount > 0);
        const nameNode =
          record.remark && record.remark.trim() !== '' ? (
            <Tooltip
              content={
                <div className='flex flex-col gap-2 max-w-xs'>
                  <div className='text-sm'>{record.remark}</div>
                  <Button
                    size='small'
                    type='primary'
                    theme='outline'
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard
                        .writeText(record.remark)
                        .then(() => {
                          showSuccess(t('复制成功'));
                        })
                        .catch(() => {
                          showError(t('复制失败'));
                        });
                    }}
                  >
                    {t('复制')}
                  </Button>
                </div>
              }
              trigger='hover'
              position='topLeft'
            >
              <span>{text}</span>
            </Tooltip>
          ) : (
            <span>{text}</span>
          );

        if (!passThroughEnabled && !showUpstreamUpdateTag) {
          return nameNode;
        }

        return (
          <Space spacing={6} align='center'>
            {nameNode}
            {passThroughEnabled && (
              <Tooltip
                content={t(
                  '该渠道已开启请求透传：参数覆写、模型重定向、渠道适配等 NewAPI 内置功能将失效，非最佳实践；如因此产生问题，请勿提交 issue 反馈。',
                )}
                trigger='hover'
                position='topLeft'
              >
                <span className='inline-flex items-center'>
                  <IconAlertTriangle
                    style={{ color: 'var(--semi-color-warning)' }}
                  />
                </span>
              </Tooltip>
            )}
            {showUpstreamUpdateTag && (
              <Space spacing={4} align='center'>
                {pendingAddCount > 0 ? (
                  <Tooltip content={t('点击处理新增模型')} position='top'>
                    <Tag
                      color='green'
                      type='light'
                      size='small'
                      shape='circle'
                      className='cursor-pointer transition-all duration-150 hover:opacity-85 hover:-translate-y-px active:scale-95'
                      onClick={(e) => {
                        e.stopPropagation();
                        openUpstreamUpdateModal(
                          record,
                          upstreamUpdateMeta.pendingAddModels,
                          upstreamUpdateMeta.pendingRemoveModels,
                          'add',
                        );
                      }}
                    >
                      +{pendingAddCount}
                    </Tag>
                  </Tooltip>
                ) : null}
                {pendingRemoveCount > 0 ? (
                  <Tooltip content={t('点击处理删除模型')} position='top'>
                    <Tag
                      color='red'
                      type='light'
                      size='small'
                      shape='circle'
                      className='cursor-pointer transition-all duration-150 hover:opacity-85 hover:-translate-y-px active:scale-95'
                      onClick={(e) => {
                        e.stopPropagation();
                        openUpstreamUpdateModal(
                          record,
                          upstreamUpdateMeta.pendingAddModels,
                          upstreamUpdateMeta.pendingRemoveModels,
                          'remove',
                        );
                      }}
                    >
                      -{pendingRemoveCount}
                    </Tag>
                  </Tooltip>
                ) : null}
              </Space>
            )}
          </Space>
        );
      },
    },
    {
      key: COLUMN_KEYS.GROUP,
      title: t('分组'),
      dataIndex: 'group',
      render: (text, record, index) => (
        <div>
          <Space spacing={2}>
            {text
              ?.split(',')
              .sort((a, b) => {
                if (a === 'default') return -1;
                if (b === 'default') return 1;
                return a.localeCompare(b);
              })
              .map((item, index) => renderGroup(item))}
          </Space>
        </div>
      ),
    },
    {
      key: COLUMN_KEYS.TYPE,
      title: t('类型'),
      dataIndex: 'type',
      render: (text, record, index) => {
        if (record.children === undefined) {
          if (record.channel_info) {
            if (record.channel_info.is_multi_key) {
              return <>{renderType(text, record.channel_info, t)}</>;
            }
          }
          return <>{renderType(text, undefined, t)}</>;
        } else {
          return <>{renderTagType(t)}</>;
        }
      },
    },
    {
      key: COLUMN_KEYS.STATUS,
      title: t('状态'),
      dataIndex: 'status',
      render: (text, record, index) => {
        if (text === 3) {
          if (record.other_info === '') {
            record.other_info = '{}';
          }
          let otherInfo = JSON.parse(record.other_info);
          let reason = otherInfo['status_reason'];
          let time = otherInfo['status_time'];
          return (
            <div>
              <Tooltip
                content={
                  t('原因：') + reason + t('，时间：') + timestamp2string(time)
                }
              >
                {renderStatus(text, record.channel_info, t)}
              </Tooltip>
            </div>
          );
        } else {
          return renderStatus(text, record.channel_info, t);
        }
      },
    },
    {
      key: COLUMN_KEYS.RESPONSE_TIME,
      title: t('响应时间'),
      dataIndex: 'response_time',
      render: (text, record, index) => <div>{renderResponseTime(text, t)}</div>,
    },
    {
      key: COLUMN_KEYS.BALANCE,
      title: (
        <Tooltip
          content={
            <div
              style={{
                maxWidth: 280,
                fontSize: 12,
                lineHeight: 1.7,
                whiteSpace: 'pre-line',
              }}
            >
              {t(
                '已用：本站消耗（1倍率）。\n误差：上游已用÷倍率 − 本站已用。>0 亏钱→红，≤0 赚钱→黑。\n金额：本站已用×倍率（折成上游结算额）。对私→红，对公/未标注→黑。\n命名规范：类型-上游名称-倍率-S/G（S对私 G对公，可省略）。\n悬停单元格可见上游原始已用、利润与利润率。数据来自定时/批量核对。',
              )}
            </div>
          }
        >
          <span style={{ cursor: 'help', borderBottom: '1px dashed #bbb' }}>
            {t('已用/误差/金额')}
          </span>
        </Tooltip>
      ),
      dataIndex: 'expired_time',
      render: (text, record, index) => {
        // 标签聚合行：只显示已用
        if (record.children !== undefined) {
          return (
            <Tooltip content={t('已用额度')}>
              <Tag color='white' type='ghost' shape='circle'>
                {renderQuota(record.used_quota)}
              </Tag>
            </Tooltip>
          );
        }
        // 类型 57(Codex)：保留「帐号信息」入口
        if (record.type === 57) {
          return (
            <div>
              <Space spacing={1}>
                <Tooltip content={t('已用额度')}>
                  <Tag color='white' type='ghost' shape='circle'>
                    {renderQuota(record.used_quota)}
                  </Tag>
                </Tooltip>
                <Tooltip content={t('查看 Codex 帐号信息与用量')}>
                  <Tag
                    color='light-blue'
                    type='light'
                    shape='circle'
                    className='cursor-pointer'
                    onClick={() => updateChannelBalance(record)}
                  >
                    {t('帐号信息')}
                  </Tag>
                </Tooltip>
              </Space>
            </div>
          );
        }
        // 普通渠道：已用 / 误差 / 金额
        const recon = computeRecon(record);
        const errText = recon.hasUpstream
          ? `${reconSignPrefix(recon.error)}${renderQuota(Math.abs(recon.error))}`
          : '-';
        const errIsLoss = recon.hasUpstream && recon.error > 0;
        const errColor = errIsLoss ? 'red' : 'white';
        const amtIsPrivate = recon.settlement === 'S';
        const amtColor = amtIsPrivate ? 'red' : 'white';
        let errTone = t('持平');
        if (recon.error > 0) {
          errTone = t('亏');
        } else if (recon.error < 0) {
          errTone = t('赚');
        }
        let settleLabel = t('未标注');
        if (recon.settlement === 'S') {
          settleLabel = t('对私');
        } else if (recon.settlement === 'G') {
          settleLabel = t('对公');
        }
        const ratioText =
          recon.ratio === null ? t('未识别(按1)') : `÷${recon.ratio}`;
        const rateText =
          recon.profitRate === null
            ? ''
            : ` (${(recon.profitRate * 100).toFixed(1)}%)`;
        const reconDetail = (
          <div style={{ fontSize: 12, lineHeight: 1.8, minWidth: 190 }}>
            <div>
              {t('本站已用')}：{renderQuota(recon.local)}
            </div>
            {recon.hasUpstream ? (
              <>
                <div>
                  {t('上游已用(原始)')}：{renderQuota(recon.upstreamRaw)}
                </div>
                <div>
                  {t('上游折算')}({ratioText})：
                  {renderQuota(recon.upstreamAdjusted)}
                </div>
                <div
                  style={{
                    borderTop: '1px solid rgba(0,0,0,.12)',
                    marginTop: 4,
                    paddingTop: 4,
                  }}
                >
                  {t('误差')}：{renderQuota(recon.upstreamAdjusted)} −{' '}
                  {renderQuota(recon.local)} = <b>{errText}</b> {errTone}
                </div>
                <div>
                  {t('利润')}：{reconSignPrefix(recon.profit)}
                  {renderQuota(Math.abs(recon.profit))}
                  {rateText}
                </div>
              </>
            ) : (
              <div>{t('暂无上游数据')}</div>
            )}
            <div>
              {t('结算金额')}({settleLabel})：{renderQuota(recon.local)} ×{' '}
              {recon.ratio || 1} = {renderQuota(recon.amount)}
            </div>
          </div>
        );
        return (
          <Tooltip content={reconDetail} position='top'>
            <span
              style={{
                display: 'inline-flex',
                gap: 4,
                alignItems: 'center',
                cursor: 'help',
              }}
            >
              <Tag color='white' type='ghost' shape='circle'>
                {renderQuota(recon.local)}
              </Tag>
              <Tag
                color={errColor}
                type={errIsLoss ? 'light' : 'ghost'}
                shape='circle'
              >
                {errText}
              </Tag>
              <Tag
                color={amtColor}
                type={amtIsPrivate ? 'light' : 'ghost'}
                shape='circle'
              >
                {renderQuota(recon.amount)}
              </Tag>
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: COLUMN_KEYS.PRIORITY,
      title: t('优先级'),
      dataIndex: 'priority',
      render: (text, record, index) => {
        if (record.children === undefined) {
          return (
            <div>
              <InputNumber
                style={{ width: 70 }}
                name='priority'
                onBlur={(e) => {
                  manageChannel(record.id, 'priority', record, e.target.value);
                }}
                keepFocus={true}
                innerButtons
                defaultValue={record.priority}
                min={-999}
                size='small'
              />
            </div>
          );
        } else {
          return (
            <InputNumber
              style={{ width: 70 }}
              name='priority'
              keepFocus={true}
              onBlur={(e) => {
                Modal.warning({
                  title: t('修改子渠道优先级'),
                  content:
                    t('确定要修改所有子渠道优先级为 ') +
                    e.target.value +
                    t(' 吗？'),
                  onOk: () => {
                    if (e.target.value === '') {
                      return;
                    }
                    submitTagEdit('priority', {
                      tag: record.key,
                      priority: e.target.value,
                    });
                  },
                });
              }}
              innerButtons
              defaultValue={record.priority}
              min={-999}
              size='small'
            />
          );
        }
      },
    },
    {
      key: COLUMN_KEYS.WEIGHT,
      title: t('权重'),
      dataIndex: 'weight',
      render: (text, record, index) => {
        if (record.children === undefined) {
          return (
            <div>
              <InputNumber
                style={{ width: 70 }}
                name='weight'
                onBlur={(e) => {
                  manageChannel(record.id, 'weight', record, e.target.value);
                }}
                keepFocus={true}
                innerButtons
                defaultValue={record.weight}
                min={0}
                size='small'
              />
            </div>
          );
        } else {
          return (
            <InputNumber
              style={{ width: 70 }}
              name='weight'
              keepFocus={true}
              onBlur={(e) => {
                Modal.warning({
                  title: t('修改子渠道权重'),
                  content:
                    t('确定要修改所有子渠道权重为 ') +
                    e.target.value +
                    t(' 吗？'),
                  onOk: () => {
                    if (e.target.value === '') {
                      return;
                    }
                    submitTagEdit('weight', {
                      tag: record.key,
                      weight: e.target.value,
                    });
                  },
                });
              }}
              innerButtons
              defaultValue={record.weight}
              min={-999}
              size='small'
            />
          );
        }
      },
    },
    {
      key: COLUMN_KEYS.OPERATE,
      title: '',
      dataIndex: 'operate',
      fixed: 'right',
      render: (text, record, index) => {
        if (record.children === undefined) {
          const upstreamUpdateMeta = getUpstreamUpdateMeta(record);
          const moreMenuItems = [
            {
              node: 'item',
              name: t('删除'),
              type: 'danger',
              onClick: () => {
                Modal.confirm({
                  title: t('确定是否要删除此渠道？'),
                  content: t('此修改将不可逆'),
                  onOk: () => {
                    (async () => {
                      await manageChannel(record.id, 'delete', record);
                      await refresh();
                      setTimeout(() => {
                        if (channels.length === 0 && activePage > 1) {
                          refresh(activePage - 1);
                        }
                      }, 100);
                    })();
                  },
                });
              },
            },
            {
              node: 'item',
              name: t('复制'),
              type: 'tertiary',
              onClick: () => {
                Modal.confirm({
                  title: t('确定是否要复制此渠道？'),
                  content: t('复制渠道的所有信息'),
                  onOk: () => copySelectedChannel(record),
                });
              },
            },
          ];

          if (upstreamUpdateMeta.supported) {
            moreMenuItems.push({
              node: 'item',
              name: t('仅检测上游模型更新'),
              type: 'tertiary',
              onClick: () => {
                detectChannelUpstreamUpdates(record);
              },
            });
            moreMenuItems.push({
              node: 'item',
              name: t('处理上游模型更新'),
              type: 'tertiary',
              onClick: () => {
                if (!upstreamUpdateMeta.enabled) {
                  showInfo(t('该渠道未开启上游模型更新检测'));
                  return;
                }
                if (
                  upstreamUpdateMeta.pendingAddModels.length === 0 &&
                  upstreamUpdateMeta.pendingRemoveModels.length === 0
                ) {
                  showInfo(t('该渠道暂无可处理的上游模型更新'));
                  return;
                }
                openUpstreamUpdateModal(
                  record,
                  upstreamUpdateMeta.pendingAddModels,
                  upstreamUpdateMeta.pendingRemoveModels,
                  upstreamUpdateMeta.pendingAddModels.length > 0
                    ? 'add'
                    : 'remove',
                );
              },
            });
          }

          if (record.type === 4) {
            moreMenuItems.unshift({
              node: 'item',
              name: t('测活'),
              type: 'tertiary',
              onClick: () => checkOllamaVersion(record),
            });
          }

          return (
            <Space wrap>
              <SplitButtonGroup
                className='overflow-hidden'
                aria-label={t('测试单个渠道操作项目组')}
              >
                <Button
                  size='small'
                  type='tertiary'
                  onClick={() => testChannel(record, '')}
                >
                  {t('测试')}
                </Button>
                <Button
                  size='small'
                  type='tertiary'
                  icon={<IconTreeTriangleDown />}
                  onClick={() => {
                    setCurrentTestChannel(record);
                    setShowModelTestModal(true);
                  }}
                />
              </SplitButtonGroup>

              {record.status === 1 ? (
                <Button
                  type='danger'
                  size='small'
                  onClick={() => manageChannel(record.id, 'disable', record)}
                >
                  {t('禁用')}
                </Button>
              ) : (
                <Button
                  size='small'
                  onClick={() => manageChannel(record.id, 'enable', record)}
                >
                  {t('启用')}
                </Button>
              )}

              {record.channel_info?.is_multi_key ? (
                <SplitButtonGroup aria-label={t('多密钥渠道操作项目组')}>
                  <Button
                    type='tertiary'
                    size='small'
                    onClick={() => {
                      setEditingChannel(record);
                      setShowEdit(true);
                    }}
                  >
                    {t('编辑')}
                  </Button>
                  <Dropdown
                    trigger='click'
                    position='bottomRight'
                    menu={[
                      {
                        node: 'item',
                        name: t('多密钥管理'),
                        onClick: () => {
                          setCurrentMultiKeyChannel(record);
                          setShowMultiKeyManageModal(true);
                        },
                      },
                    ]}
                  >
                    <Button
                      type='tertiary'
                      size='small'
                      icon={<IconTreeTriangleDown />}
                    />
                  </Dropdown>
                </SplitButtonGroup>
              ) : (
                <Button
                  type='tertiary'
                  size='small'
                  onClick={() => {
                    setEditingChannel(record);
                    setShowEdit(true);
                  }}
                >
                  {t('编辑')}
                </Button>
              )}

              <Dropdown
                trigger='click'
                position='bottomRight'
                menu={moreMenuItems}
              >
                <Button icon={<IconMore />} type='tertiary' size='small' />
              </Dropdown>
            </Space>
          );
        } else {
          // 标签操作按钮
          return (
            <Space wrap>
              <Button
                type='tertiary'
                size='small'
                onClick={() => manageTag(record.key, 'enable')}
              >
                {t('启用全部')}
              </Button>
              <Button
                type='tertiary'
                size='small'
                onClick={() => manageTag(record.key, 'disable')}
              >
                {t('禁用全部')}
              </Button>
              <Button
                type='tertiary'
                size='small'
                onClick={() => {
                  setShowEditTag(true);
                  setEditingTag(record.key);
                }}
              >
                {t('编辑')}
              </Button>
            </Space>
          );
        }
      },
    },
  ];
};
