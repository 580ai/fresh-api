import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Table, Button, Spin, Typography, Input, SideSheet, Tag, RadioGroup, Radio } from '@douyinfe/semi-ui';
import { IconChevronLeft, IconChevronRight, IconDownload, IconSearch, IconTreeTriangleRight, IconTreeTriangleDown } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError } from '../../../helpers';
import { renderQuota } from '../../../helpers/render';

const RANK_LABELS = ['1', '2', '3'];
const RANK_COLORS = ['amber', 'light-blue', 'grey'];

function getHeatmapColor(value, maxValue) {
  if (value === 0 || maxValue === 0) return 'transparent';
  const ratio = value / maxValue;
  if (ratio <= 0.1) return 'rgba(34,197,94,0.15)';
  if (ratio <= 0.25) return 'rgba(34,197,94,0.3)';
  if (ratio <= 0.5) return 'rgba(34,197,94,0.5)';
  if (ratio <= 0.75) return 'rgba(34,197,94,0.7)';
  return 'rgba(34,197,94,0.9)';
}

function getMonthRange(year, month) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
  return {
    startTimestamp: Math.floor(start.getTime() / 1000),
    endTimestamp: Math.floor(end.getTime() / 1000),
    daysInMonth: end.getUTCDate(),
  };
}

export function useTokenConsumption() {
  const { t } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState([]);
  const [tokenIds, setTokenIds] = useState([]);
  const [tokenNames, setTokenNames] = useState({});
  const [keyword, setKeyword] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortOrder, setSortOrder] = useState('');

  const { startTimestamp, endTimestamp, daysInMonth } = useMemo(
    () => getMonthRange(year, month),
    [year, month],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        start_timestamp: startTimestamp,
        end_timestamp: endTimestamp,
        p: page,
        page_size: pageSize,
      };
      if (keyword) params.keyword = keyword;
      if (sortField) params.sort_field = sortField;
      if (sortOrder) params.sort_order = sortOrder;
      const res = await API.get('/api/log/self/token_daily', { params });
      const { success, message, data } = res.data || {};
      if (success) {
        setItems(data.items || []);
        setTotal(data.total || 0);
        setSummary(data.summary || []);
        setTokenIds(data.token_ids || []);
        setTokenNames(data.token_names || {});
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [startTimestamp, endTimestamp, page, pageSize, keyword, sortField, sortOrder]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePrevMonth = () => {
    setPage(1);
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else { setMonth(month - 1); }
  };

  const handleNextMonth = () => {
    setPage(1);
    const n = new Date();
    if (year === n.getFullYear() && month >= n.getMonth()) return;
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else { setMonth(month + 1); }
  };

  const handleSearch = () => {
    setPage(1);
    setKeyword(searchValue);
  };

  const handleClearSearch = () => {
    setSearchValue('');
    setPage(1);
    setKeyword('');
  };

  const handleSort = (field) => {
    setPage(1);
    if (sortField === field) {
      if (sortOrder === 'desc') {
        setSortOrder('asc');
      } else {
        setSortField('');
        setSortOrder('');
      }
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleExport = async () => {
    try {
      const res = await API.get('/api/log/self/token_daily/export', {
        params: { start_timestamp: startTimestamp, end_timestamp: endTimestamp },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `token_consumption_${monthLabel}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      showError(e.message || t('导出失败'));
    }
  };

  const monthLabel = `${year}-${String(month + 1).padStart(2, '0')}`;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  return {
    t, items, total, summary, loading, daysInMonth, tokenIds, tokenNames,
    page, setPage, pageSize, setPageSize,
    monthLabel, isCurrentMonth, startTimestamp, endTimestamp,
    handlePrevMonth, handleNextMonth, handleExport,
    searchValue, setSearchValue, handleSearch, handleClearSearch,
    sortField, sortOrder, handleSort,
  };
}

export function TokenConsumptionToolbar({
  monthLabel, isCurrentMonth, handlePrevMonth, handleNextMonth, handleExport,
  searchValue, setSearchValue, handleSearch, handleClearSearch, t,
}) {
  return (
    <div className='flex items-center gap-3 w-full justify-center flex-wrap'>
      <Input
        prefix={<IconSearch />}
        placeholder={t('搜索令牌名称')}
        value={searchValue}
        onChange={setSearchValue}
        onEnterPress={handleSearch}
        showClear
        onClear={handleClearSearch}
        style={{ width: 200 }}
        size='small'
      />
      <Button icon={<IconSearch />} size='small' onClick={handleSearch}>
        {t('搜索')}
      </Button>
      <Button icon={<IconChevronLeft />} size='small' onClick={handlePrevMonth} />
      <Typography.Text strong>{monthLabel}</Typography.Text>
      <Button icon={<IconChevronRight />} size='small' onClick={handleNextMonth} disabled={isCurrentMonth} />
      <Button icon={<IconDownload />} size='small' onClick={handleExport}>
        {t('导出报表')}
      </Button>
    </div>
  );
}

function ModelDetailSideSheet({ visible, onClose, tokenName, tokenId, startTimestamp, endTimestamp, t }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('total_cost');
  const [sortOrder, setSortOrder] = useState('desc');

  const fetchFullData = useCallback(async () => {
    if (!tokenId || !visible) return;
    setLoading(true);
    try {
      const res = await API.get('/api/log/self/token_model_full', {
        params: { token_id: tokenId, start_timestamp: startTimestamp, end_timestamp: endTimestamp, sort_by: sortBy, sort_order: sortOrder },
      });
      const { success, message, data: respData } = res.data || {};
      if (success) {
        setData(respData || []);
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tokenId, visible, startTimestamp, endTimestamp, sortBy, sortOrder]);

  useEffect(() => { fetchFullData(); }, [fetchFullData]);

  const drawerColumns = useMemo(() => [
    {
      title: '#',
      dataIndex: 'index',
      width: 50,
      render: (_, __, index) => index + 1,
    },
    {
      title: t('模型名称'),
      dataIndex: 'model_name',
      render: (text) => (
        <Typography.Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 200 }}>
          {text}
        </Typography.Text>
      ),
    },
    {
      title: t('消耗金额'),
      dataIndex: 'total_cost',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.total_cost - b.total_cost,
      defaultSortOrder: sortBy === 'total_cost' ? 'descend' : false,
      render: (val) => (val === 0 ? '-' : renderQuota(val, 2)),
    },
    {
      title: t('调用次数'),
      dataIndex: 'total_count',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.total_count - b.total_count,
      defaultSortOrder: sortBy === 'total_count' ? 'descend' : false,
      render: (val) => val.toLocaleString(),
    },
  ], [t, sortBy]);

  const handleDrawerSort = ({ sorter }) => {
    if (!sorter || !sorter.dataIndex) return;
    const field = sorter.dataIndex;
    if (field === 'total_cost' || field === 'total_count') {
      setSortBy(field);
      setSortOrder(sorter.sortOrder === 'ascend' ? 'asc' : 'desc');
    }
  };

  return (
    <SideSheet
      title={`${tokenName} - ${t('模型消耗明细')}`}
      visible={visible}
      onCancel={onClose}
      placement='right'
      width={560}
      destroyOnClose
      footer={null}
    >
      <div style={{ marginBottom: 12 }}>
        <RadioGroup
          type='button'
          size='small'
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value); setSortOrder('desc'); }}
        >
          <Radio value='total_cost'>{t('按消耗金额')}</Radio>
          <Radio value='total_count'>{t('按调用次数')}</Radio>
        </RadioGroup>
      </div>
      <Spin spinning={loading}>
        <Table
          columns={drawerColumns}
          dataSource={data}
          rowKey='model_name'
          pagination={false}
          size='small'
          empty={t('暂无数据')}
          onChange={handleDrawerSort}
        />
      </Spin>
    </SideSheet>
  );
}

export default function TokenConsumptionTable({ consumptionData }) {
  const {
    t, items, total, summary, loading, daysInMonth, tokenIds, tokenNames,
    sortField, sortOrder, handleSort, startTimestamp, endTimestamp,
  } = consumptionData;

  const [expandedTokens, setExpandedTokens] = useState({});
  const [drawerState, setDrawerState] = useState({ visible: false, tokenId: null, tokenName: '' });

  useEffect(() => { setExpandedTokens({}); }, [startTimestamp]);

  const dayTimestamps = useMemo(() => {
    const map = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const ts = new Date(Date.UTC(
        new Date(startTimestamp * 1000).getUTCFullYear(),
        new Date(startTimestamp * 1000).getUTCMonth(),
        d,
      ));
      map[d] = Math.floor(ts.getTime() / 1000);
    }
    return map;
  }, [daysInMonth, startTimestamp]);

  const { rows, summaryRow, maxVal } = useMemo(() => {
    const tokenMap = {};
    for (const item of items) {
      if (!tokenMap[item.token_id]) {
        tokenMap[item.token_id] = { token_name: item.token_name, days: {}, total: 0 };
      }
      const d = new Date(item.day_timestamp * 1000);
      const day = d.getUTCDate();
      tokenMap[item.token_id].days[day] = (tokenMap[item.token_id].days[day] || 0) + item.quota;
      tokenMap[item.token_id].total += item.quota;
    }

    const order = tokenIds.length > 0 ? tokenIds : Object.keys(tokenMap).map(Number);
    const dataRows = order.map((tid) => ({
      key: tid,
      token_name: tokenMap[tid]?.token_name || tokenNames[tid] || `Token #${tid}`,
      days: tokenMap[tid]?.days || {},
      total: tokenMap[tid]?.total || 0,
    }));

    const sumDays = {};
    let sumTotal = 0;
    for (const s of summary) {
      const d = new Date(s.day_timestamp * 1000);
      const day = d.getUTCDate();
      sumDays[day] = (sumDays[day] || 0) + s.quota;
      sumTotal += s.quota;
    }
    const sRow = { key: '__summary__', token_name: t('合计'), days: sumDays, total: sumTotal, isSummary: true };

    let mv = 0;
    for (const r of dataRows) {
      for (const v of Object.values(r.days)) {
        if (v > mv) mv = v;
      }
    }

    return { rows: dataRows, summaryRow: sRow, maxVal: mv };
  }, [items, summary, t, tokenIds, tokenNames]);

  const handleExpandToggle = async (tokenId) => {
    if (expandedTokens[tokenId] && !expandedTokens[tokenId].loading) {
      setExpandedTokens((prev) => { const n = { ...prev }; delete n[tokenId]; return n; });
      return;
    }
    if (expandedTokens[tokenId]?.loading) return;

    setExpandedTokens((prev) => ({ ...prev, [tokenId]: { loading: true, data: null } }));
    try {
      const res = await API.get('/api/log/self/token_model_daily', {
        params: { token_id: tokenId, start_timestamp: startTimestamp, end_timestamp: endTimestamp },
      });
      const { success, message, data } = res.data || {};
      if (success) {
        setExpandedTokens((prev) => {
          if (!prev[tokenId]) return prev;
          return { ...prev, [tokenId]: { loading: false, data } };
        });
      } else {
        showError(message);
        setExpandedTokens((prev) => { const n = { ...prev }; delete n[tokenId]; return n; });
      }
    } catch (e) {
      showError(e.message);
      setExpandedTokens((prev) => { const n = { ...prev }; delete n[tokenId]; return n; });
    }
  };

  const allRows = useMemo(() => {
    const result = [];
    for (const row of rows) {
      result.push(row);
      const expanded = expandedTokens[row.key];
      if (!expanded) continue;

      if (expanded.loading) {
        result.push({ key: `${row.key}_loading`, _type: 'loading', days: {}, total: 0 });
        continue;
      }
      if (!expanded.data) continue;

      const { top_models, other_models_summary, has_more } = expanded.data;
      if (!top_models || top_models.length === 0) {
        result.push({ key: `${row.key}_empty`, _type: 'empty', days: {}, total: 0 });
        continue;
      }

      for (let idx = 0; idx < top_models.length; idx++) {
        const m = top_models[idx];
        const days = {};
        if (m.daily_data) {
          for (const [tsStr, quota] of Object.entries(m.daily_data)) {
            const day = new Date(parseInt(tsStr, 10) * 1000).getUTCDate();
            days[day] = (days[day] || 0) + quota;
          }
        }
        result.push({
          key: `${row.key}_m${idx}`,
          _type: 'model',
          rank: idx,
          token_name: m.model_name,
          days,
          total: m.total_cost,
        });
      }

      if (has_more) {
        result.push({
          key: `${row.key}_more`,
          _type: 'more',
          _parentTokenId: row.key,
          _parentTokenName: row.token_name,
          _moreCount: other_models_summary.count,
          _moreTotalCost: other_models_summary.total_cost,
          days: {},
          total: 0,
        });
      }
    }
    result.push(summaryRow);
    return result;
  }, [rows, summaryRow, expandedTokens]);

  const getSortOrder = (field) => {
    if (sortField === field) return sortOrder === 'desc' ? 'descend' : 'ascend';
    return false;
  };

  const columns = useMemo(() => {
    const cols = [
      {
        title: t('令牌名称'),
        dataIndex: 'token_name',
        fixed: 'left',
        width: 160,
        render: (text, record) => {
          if (record.isSummary) {
            return <Typography.Text strong>{text}</Typography.Text>;
          }
          if (record._type === 'loading') {
            return (
              <div style={{ paddingLeft: 24, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Spin size='small' />
                <Typography.Text type='tertiary' size='small'>{t('加载模型数据...')}</Typography.Text>
              </div>
            );
          }
          if (record._type === 'empty') {
            return (
              <Typography.Text type='tertiary' style={{ paddingLeft: 24, fontSize: 12 }}>
                {t('该令牌暂无模型消耗数据')}
              </Typography.Text>
            );
          }
          if (record._type === 'model') {
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 24 }}>
                <Tag size='small' color={RANK_COLORS[record.rank] || 'grey'} style={{ minWidth: 20, textAlign: 'center', flexShrink: 0 }}>
                  {RANK_LABELS[record.rank] || record.rank + 1}
                </Tag>
                <Typography.Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 96, fontSize: 12 }}>
                  {text}
                </Typography.Text>
              </div>
            );
          }
          if (record._type === 'more') {
            return (
              <Typography.Text type='tertiary' style={{ paddingLeft: 24, fontSize: 12 }}>
                {t('还有 {{count}} 个模型，总消耗', { count: record._moreCount })}{' '}
                {renderQuota(record._moreTotalCost, 2)}
              </Typography.Text>
            );
          }
          const isExpanded = !!expandedTokens[record.key];
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Button
                theme='borderless'
                size='small'
                icon={isExpanded ? <IconTreeTriangleDown size='small' /> : <IconTreeTriangleRight size='small' />}
                onClick={(e) => { e.stopPropagation(); handleExpandToggle(record.key); }}
                style={{ padding: 0, minWidth: 20, height: 20, flexShrink: 0 }}
              />
              <Typography.Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 116 }}>
                {text}
              </Typography.Text>
            </div>
          );
        },
      },
    ];

    for (let d = 1; d <= daysInMonth; d++) {
      const day = d;
      const dayTs = String(dayTimestamps[d]);
      cols.push({
        title: String(d),
        dataIndex: `day_${d}`,
        width: 90,
        align: 'center',
        sorter: (a, b) => 0,
        sortOrder: getSortOrder(dayTs),
        render: (_, record) => {
          if (record._type === 'loading' || record._type === 'more' || record._type === 'empty') return null;
          const val = record.days[day] || 0;
          const isModel = record._type === 'model';
          const bg = record.isSummary ? 'transparent' : getHeatmapColor(val, maxVal);
          return (
            <div
              style={{
                backgroundColor: bg,
                padding: '2px 4px',
                borderRadius: 4,
                fontWeight: record.isSummary ? 600 : 400,
                whiteSpace: 'nowrap',
                fontSize: isModel ? 11 : 12,
                color: isModel ? '#666' : undefined,
              }}
            >
              {val === 0 ? '-' : renderQuota(val, 2)}
            </div>
          );
        },
      });
    }

    cols.push({
      title: t('合计'),
      dataIndex: 'total',
      fixed: 'right',
      width: 100,
      align: 'center',
      sorter: (a, b) => 0,
      sortOrder: getSortOrder('total'),
      render: (val, record) => {
        if (record._type === 'loading' || record._type === 'empty') return null;
        if (record._type === 'more') {
          return (
            <Button
              theme='borderless'
              type='primary'
              size='small'
              style={{ fontSize: 12, padding: '0 4px' }}
              onClick={() => setDrawerState({ visible: true, tokenId: record._parentTokenId, tokenName: record._parentTokenName })}
            >
              {t('查看完整明细')}
            </Button>
          );
        }
        const isModel = record._type === 'model';
        return (
          <Typography.Text strong={record.isSummary} style={{ whiteSpace: 'nowrap', fontSize: isModel ? 12 : undefined }}>
            {(!val || val === 0) ? '-' : renderQuota(val, 2)}
          </Typography.Text>
        );
      },
    });

    return cols;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysInMonth, maxVal, t, sortField, sortOrder, dayTimestamps, expandedTokens]);

  const handleTableChange = ({ sorter }) => {
    if (!sorter || !sorter.dataIndex) {
      handleSort('');
      return;
    }
    const { dataIndex } = sorter;
    if (dataIndex === 'total') {
      handleSort('total');
    } else if (dataIndex.startsWith('day_')) {
      const day = parseInt(dataIndex.replace('day_', ''), 10);
      const ts = dayTimestamps[day];
      if (ts) handleSort(String(ts));
    }
  };

  return (
    <Spin spinning={loading}>
      <style>{`
        .consumption-summary-row td {
          position: sticky !important;
          bottom: 0;
          z-index: 10;
          background-color: var(--semi-color-bg-2) !important;
          font-weight: 600;
          box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.1);
        }
        .consumption-table .semi-table-header .semi-table-row-head .semi-table-scrollbar {
          display: none;
        }
        .consumption-model-row td,
        .consumption-more-row td,
        .consumption-loading-row td,
        .consumption-empty-row td {
          background-color: #f9f9f9 !important;
        }
        .consumption-more-row td {
          border-bottom: 2px solid #e0e0e0 !important;
        }
      `}</style>
      <Table
        className='consumption-table'
        columns={columns}
        dataSource={allRows}
        rowKey='key'
        scroll={{ x: 160 + daysInMonth * 90 + 100, y: 'calc(100vh - 370px)' }}
        pagination={false}
        size='small'
        empty={t('暂无数据')}
        onChange={handleTableChange}
        onRow={(record) => {
          if (record.isSummary) return { className: 'consumption-summary-row' };
          if (record._type === 'model') return { className: 'consumption-model-row' };
          if (record._type === 'more') return { className: 'consumption-more-row' };
          if (record._type === 'loading') return { className: 'consumption-loading-row' };
          if (record._type === 'empty') return { className: 'consumption-empty-row' };
          return {};
        }}
      />
      <ModelDetailSideSheet
        visible={drawerState.visible}
        onClose={() => setDrawerState({ visible: false, tokenId: null, tokenName: '' })}
        tokenName={drawerState.tokenName}
        tokenId={drawerState.tokenId}
        startTimestamp={startTimestamp}
        endTimestamp={endTimestamp}
        t={t}
      />
    </Spin>
  );
}
