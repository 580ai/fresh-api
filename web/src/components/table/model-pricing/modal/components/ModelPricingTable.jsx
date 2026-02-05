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
import { Card, Avatar, Typography, Table, Tag } from '@douyinfe/semi-ui';
import { IconCoinMoneyStroked } from '@douyinfe/semi-icons';
import { calculateModelPrice } from '../../../../../helpers';

const { Text } = Typography;

const ModelPricingTable = ({
  modelData,
  groupRatio,
  currency,
  tokenUnit,
  displayPrice,
  showRatio,
  usableGroup,
  autoGroups = [],
  t,
}) => {
  const modelEnableGroups = Array.isArray(modelData?.enable_groups)
    ? modelData.enable_groups
    : [];
  const autoChain = autoGroups.filter((g) => modelEnableGroups.includes(g));

  // 检查是否有特殊价格（分辨率价格）
  const hasSpecialPrices =
    modelData?.special_prices &&
    Object.keys(modelData.special_prices).length > 0;

  // 检查是否有文本模型阶梯价格
  const hasTextModelPrice =
    modelData?.text_model_price &&
    ((modelData.text_model_price.tiers && modelData.text_model_price.tiers.length > 0) ||
      (modelData.text_model_price.thinking_tiers && modelData.text_model_price.thinking_tiers.length > 0));

  // 分辨率顺序
  const sizeOrder = ['1k', '2k', '4k'];
  const availableSizes = hasSpecialPrices
    ? sizeOrder.filter((size) => modelData.special_prices[size] !== undefined)
    : [];

  // 格式化价格显示
  const formatPrice = (price) => {
    if (price === null || price === undefined) return '-';
    const symbol = currency === 'CNY' ? '¥' : '$';
    return `${symbol}${price.toFixed(4)}`;
  };

  // 格式化阶梯价格显示（$/1M tokens），应用分组倍率
  const formatTierPrice = (price, groupRatioValue = 1) => {
    if (price === null || price === undefined) return '-';
    const symbol = currency === 'CNY' ? '¥' : '$';
    // 应用分组倍率
    let displayValue = price * groupRatioValue;
    // 如果是 CNY，需要转换（假设汇率约 7）
    if (currency === 'CNY') {
      displayValue = displayValue * 7;
    }
    return `${symbol}${displayValue.toFixed(4)}`;
  };

  // 格式化 token 数量显示
  const formatTokenCount = (tokens) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(0)}K`;
    }
    return tokens.toString();
  };

  const renderGroupPriceTable = () => {
    // 仅展示模型可用的分组：模型 enable_groups 与用户可用分组的交集
    const availableGroups = Object.keys(usableGroup || {})
      .filter((g) => g !== '')
      .filter((g) => g !== 'auto')
      .filter((g) => modelEnableGroups.includes(g));

    // 如果有文本模型阶梯价格，使用阶梯价格表格
    if (hasTextModelPrice) {
      return renderTextModelTierTable(availableGroups);
    }

    // 准备表格数据
    const tableData = availableGroups.map((group) => {
      const priceData = modelData
        ? calculateModelPrice({
            record: modelData,
            selectedGroup: group,
            groupRatio,
            tokenUnit,
            displayPrice,
            currency,
          })
        : { inputPrice: '-', outputPrice: '-', price: '-' };

      // 获取分组倍率
      const groupRatioValue =
        groupRatio && groupRatio[group] ? groupRatio[group] : 1;

      const rowData = {
        key: group,
        group: group,
        ratio: groupRatioValue,
        billingType:
          modelData?.quota_type === 0
            ? t('按量计费')
            : modelData?.quota_type === 1
              ? t('按次计费')
              : '-',
        inputPrice: modelData?.quota_type === 0 ? priceData.inputPrice : '-',
        outputPrice:
          modelData?.quota_type === 0
            ? priceData.completionPrice || priceData.outputPrice
            : '-',
        fixedPrice: modelData?.quota_type === 1 ? priceData.price : '-',
      };

      // 如果有特殊价格，计算每个分辨率的价格（基础价格 × 分组倍率）
      if (hasSpecialPrices && modelData?.quota_type === 1) {
        rowData.specialPrices = {};
        availableSizes.forEach((size) => {
          const basePrice = modelData.special_prices[size];
          rowData.specialPrices[size] = basePrice * groupRatioValue;
        });
      }

      return rowData;
    });

    // 定义表格列
    const columns = [
      {
        title: t('分组'),
        dataIndex: 'group',
        render: (text) => (
          <Tag color='white' size='small' shape='circle'>
            {text}
            {t('分组')}
          </Tag>
        ),
      },
    ];

    // 如果显示倍率，添加倍率列
    if (showRatio) {
      columns.push({
        title: t('倍率'),
        dataIndex: 'ratio',
        render: (text) => (
          <Tag color='white' size='small' shape='circle'>
            {text}x
          </Tag>
        ),
      });
    }

    // 添加计费类型列
    columns.push({
      title: t('计费类型'),
      dataIndex: 'billingType',
      render: (text) => {
        let color = 'white';
        if (text === t('按量计费')) color = 'violet';
        else if (text === t('按次计费')) color = 'teal';
        return (
          <Tag color={color} size='small' shape='circle'>
            {text || '-'}
          </Tag>
        );
      },
    });

    // 根据计费类型添加价格列
    if (modelData?.quota_type === 0) {
      // 按量计费
      columns.push(
        {
          title: t('提示'),
          dataIndex: 'inputPrice',
          render: (text) => (
            <>
              <div className='font-semibold text-orange-600'>{text}</div>
              <div className='text-xs text-gray-500'>
                / {tokenUnit === 'K' ? '1K' : '1M'} tokens
              </div>
            </>
          ),
        },
        {
          title: t('补全'),
          dataIndex: 'outputPrice',
          render: (text) => (
            <>
              <div className='font-semibold text-orange-600'>{text}</div>
              <div className='text-xs text-gray-500'>
                / {tokenUnit === 'K' ? '1K' : '1M'} tokens
              </div>
            </>
          ),
        },
      );
    } else if (hasSpecialPrices && availableSizes.length > 0) {
      // 按次计费 + 有特殊价格（分辨率价格）- 嵌套两列：分辨率 + 价格
      columns.push({
        title: t('价格'),
        dataIndex: 'specialPrices',
        render: (specialPrices) => (
          <div className='flex flex-col gap-1'>
            {availableSizes.map((size) => (
              <div key={size} className='flex items-center justify-between gap-4'>
                <Tag color='white' size='small' shape='circle'>
                  {size.toUpperCase()}
                </Tag>
                <div className='text-right'>
                  <span className='font-semibold text-orange-600'>
                    {formatPrice(specialPrices[size])}
                  </span>
                  <span className='text-xs text-gray-500 ml-1'>/ {t('次')}</span>
                </div>
              </div>
            ))}
          </div>
        ),
      });
    } else {
      // 按次计费（无特殊价格）
      columns.push({
        title: t('价格'),
        dataIndex: 'fixedPrice',
        render: (text) => (
          <>
            <div className='font-semibold text-orange-600'>{text}</div>
            <div className='text-xs text-gray-500'>/ {t('次')}</div>
          </>
        ),
      });
    }

    return (
      <Table
        dataSource={tableData}
        columns={columns}
        pagination={false}
        size='small'
        bordered={false}
        className='!rounded-lg'
      />
    );
  };

  // 渲染文本模型阶梯价格表格（整合分组、阶梯、思考/非思考模式）
  const renderTextModelTierTable = (availableGroups) => {
    const textModelPrice = modelData.text_model_price;
    const tiers = textModelPrice.tiers || [];
    const thinkingTiers = textModelPrice.thinking_tiers || [];

    // 合并阶梯数据，按 max_tokens 对齐
    const allMaxTokens = new Set();
    tiers.forEach((tier) => allMaxTokens.add(tier.max_tokens));
    thinkingTiers.forEach((tier) => allMaxTokens.add(tier.max_tokens));
    const sortedMaxTokens = Array.from(allMaxTokens).sort((a, b) => a - b);

    // 为每个分组生成表格数据
    const tableData = [];
    availableGroups.forEach((group) => {
      const groupRatioValue =
        groupRatio && groupRatio[group] ? groupRatio[group] : 1;

      sortedMaxTokens.forEach((maxTokens, tierIndex) => {
        // 查找对应的阶梯
        const normalTier = tiers.find((t) => t.max_tokens === maxTokens);
        const thinkingTier = thinkingTiers.find((t) => t.max_tokens === maxTokens);

        // 计算区间：上一个阶梯的 max_tokens 到当前阶梯的 max_tokens
        const prevMaxTokens = tierIndex > 0 ? sortedMaxTokens[tierIndex - 1] : 0;

        tableData.push({
          key: `${group}-${maxTokens}`,
          group: group,
          groupRatioValue: groupRatioValue,
          maxTokens: maxTokens,
          prevMaxTokens: prevMaxTokens,
          // 非思考模式价格
          normalInput: normalTier ? normalTier.input : null,
          normalOutput: normalTier ? normalTier.output : null,
          // 思考模式价格
          thinkingInput: thinkingTier ? thinkingTier.input : null,
          thinkingOutput: thinkingTier ? thinkingTier.output : null,
          // 用于合并单元格
          isFirstTier: tierIndex === 0,
          tierCount: sortedMaxTokens.length,
        });
      });
    });

    // 格式化区间显示
    const formatTokenRange = (prevTokens, maxTokens) => {
      if (prevTokens === 0) {
        return `[0, ${formatTokenCount(maxTokens)}]`;
      }
      return `(${formatTokenCount(prevTokens)}, ${formatTokenCount(maxTokens)}]`;
    };

    // 定义表格列
    const columns = [
      {
        title: t('分组'),
        dataIndex: 'group',
        render: (text, record, index) => {
          // 合并同一分组的单元格
          if (record.isFirstTier) {
            return {
              children: (
                <Tag color='white' size='small' shape='circle'>
                  {text}
                  {t('分组')}
                </Tag>
              ),
              props: {
                rowSpan: record.tierCount,
              },
            };
          }
          return {
            props: {
              rowSpan: 0,
            },
          };
        },
      },
    ];

    // 如果显示倍率，添加倍率列
    if (showRatio) {
      columns.push({
        title: t('倍率'),
        dataIndex: 'groupRatioValue',
        render: (text, record) => {
          if (record.isFirstTier) {
            return {
              children: (
                <Tag color='white' size='small' shape='circle'>
                  {text}x
                </Tag>
              ),
              props: {
                rowSpan: record.tierCount,
              },
            };
          }
          return {
            props: {
              rowSpan: 0,
            },
          };
        },
      });
    }

    // 添加计费类型列
    columns.push({
      title: t('计费类型'),
      dataIndex: 'billingType',
      render: (_, record) => {
        if (record.isFirstTier) {
          return {
            children: (
              <Tag color='violet' size='small' shape='circle'>
                {t('阶梯计费')}
              </Tag>
            ),
            props: {
              rowSpan: record.tierCount,
            },
          };
        }
        return {
          props: {
            rowSpan: 0,
          },
        };
      },
    });

    // 添加输入Token区间列
    columns.push({
      title: t('输入区间'),
      dataIndex: 'maxTokens',
      render: (text, record) => (
        <Tag color='white' size='small' shape='circle'>
          {formatTokenRange(record.prevMaxTokens, text)}
        </Tag>
      ),
    });

    // 根据是否有思考模式阶梯来决定列结构
    const hasNormalTiers = tiers.length > 0;
    const hasThinkingTiers = thinkingTiers.length > 0;

    if (hasNormalTiers && hasThinkingTiers) {
      // 同时有思考和非思考模式，在同一行显示
      columns.push({
        title: (
          <div className='text-center'>
            <Tag color='blue' size='small'>{t('非思考')}</Tag>
            <div className='text-xs text-gray-500 mt-1'>{t('提示')} / {t('补全')}</div>
          </div>
        ),
        dataIndex: 'normalPrice',
        render: (_, record) => {
          if (record.normalInput === null) {
            return <span className='text-gray-400'>-</span>;
          }
          return (
            <div className='text-center'>
              <span className='font-semibold text-orange-600'>
                {formatTierPrice(record.normalInput, record.groupRatioValue)}
              </span>
              <span className='text-gray-400 mx-1'>/</span>
              <span className='font-semibold text-orange-600'>
                {formatTierPrice(record.normalOutput, record.groupRatioValue)}
              </span>
              <div className='text-xs text-gray-500'>/ 1M tokens</div>
            </div>
          );
        },
      });

      columns.push({
        title: (
          <div className='text-center'>
            <Tag color='purple' size='small'>{t('思考')}</Tag>
            <div className='text-xs text-gray-500 mt-1'>{t('提示')} / {t('补全')}</div>
          </div>
        ),
        dataIndex: 'thinkingPrice',
        render: (_, record) => {
          if (record.thinkingInput === null) {
            return <span className='text-gray-400'>-</span>;
          }
          return (
            <div className='text-center'>
              <span className='font-semibold text-purple-600'>
                {formatTierPrice(record.thinkingInput, record.groupRatioValue)}
              </span>
              <span className='text-gray-400 mx-1'>/</span>
              <span className='font-semibold text-purple-600'>
                {formatTierPrice(record.thinkingOutput, record.groupRatioValue)}
              </span>
              <div className='text-xs text-gray-500'>/ 1M tokens</div>
            </div>
          );
        },
      });
    } else if (hasNormalTiers) {
      // 只有非思考模式
      columns.push(
        {
          title: t('提示'),
          dataIndex: 'normalInput',
          render: (text, record) => (
            <>
              <div className='font-semibold text-orange-600'>
                {formatTierPrice(text, record.groupRatioValue)}
              </div>
              <div className='text-xs text-gray-500'>/ 1M tokens</div>
            </>
          ),
        },
        {
          title: t('补全'),
          dataIndex: 'normalOutput',
          render: (text, record) => (
            <>
              <div className='font-semibold text-orange-600'>
                {formatTierPrice(text, record.groupRatioValue)}
              </div>
              <div className='text-xs text-gray-500'>/ 1M tokens</div>
            </>
          ),
        },
      );
    } else if (hasThinkingTiers) {
      // 只有思考模式
      columns.push(
        {
          title: (
            <div>
              <Tag color='purple' size='small'>{t('思考')}</Tag> {t('提示')}
            </div>
          ),
          dataIndex: 'thinkingInput',
          render: (text, record) => (
            <>
              <div className='font-semibold text-purple-600'>
                {formatTierPrice(text, record.groupRatioValue)}
              </div>
              <div className='text-xs text-gray-500'>/ 1M tokens</div>
            </>
          ),
        },
        {
          title: (
            <div>
              <Tag color='purple' size='small'>{t('思考')}</Tag> {t('补全')}
            </div>
          ),
          dataIndex: 'thinkingOutput',
          render: (text, record) => (
            <>
              <div className='font-semibold text-purple-600'>
                {formatTierPrice(text, record.groupRatioValue)}
              </div>
              <div className='text-xs text-gray-500'>/ 1M tokens</div>
            </>
          ),
        },
      );
    }

    return (
      <Table
        dataSource={tableData}
        columns={columns}
        pagination={false}
        size='small'
        bordered={false}
        className='!rounded-lg'
      />
    );
  };

  return (
    <Card className='!rounded-2xl shadow-sm border-0'>
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='orange' className='mr-2 shadow-md'>
          <IconCoinMoneyStroked size={16} />
        </Avatar>
        <div>
          <Text className='text-lg font-medium'>
            {hasTextModelPrice ? t('分组阶梯价格') : t('分组价格')}
          </Text>
          <div className='text-xs text-gray-600'>
            {hasTextModelPrice
              ? t('根据分组和输入Token数量阶梯计费')
              : t('不同用户分组的价格信息')}
          </div>
        </div>
      </div>
      {autoChain.length > 0 && (
        <div className='flex flex-wrap items-center gap-1 mb-4'>
          <span className='text-sm text-gray-600'>{t('auto分组调用链路')}</span>
          <span className='text-sm'>→</span>
          {autoChain.map((g, idx) => (
            <React.Fragment key={g}>
              <Tag color='white' size='small' shape='circle'>
                {g}
                {t('分组')}
              </Tag>
              {idx < autoChain.length - 1 && <span className='text-sm'>→</span>}
            </React.Fragment>
          ))}
        </div>
      )}
      {renderGroupPriceTable()}
    </Card>
  );
};

export default ModelPricingTable;
