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
import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import TokensTable from '../../components/table/tokens';
// 消耗统计子面板功能暂时取消，保留引用代码便于后续恢复。
// import TokenConsumptionTable, { useTokenConsumption, TokenConsumptionToolbar } from '../../components/table/tokens/TokenConsumptionTable';

const Token = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('list');
  // 消耗统计子面板功能暂时取消，避免继续请求消耗统计接口。
  // const consumptionData = useTokenConsumption();

  return (
    <div className='mt-[60px] px-2'>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab={t('令牌列表')} itemKey='list'>
          <TokensTable />
        </TabPane>
        {/* 消耗统计子面板功能暂时取消，保留原始面板代码便于后续恢复。 */}
        {/* <TabPane tab={t('消耗统计')} itemKey='consumption'>
          <div className='flex flex-col gap-4'>
            <TokenConsumptionToolbar
              monthLabel={consumptionData.monthLabel}
              isCurrentMonth={consumptionData.isCurrentMonth}
              handlePrevMonth={consumptionData.handlePrevMonth}
              handleNextMonth={consumptionData.handleNextMonth}
              handleExport={consumptionData.handleExport}
              searchValue={consumptionData.searchValue}
              setSearchValue={consumptionData.setSearchValue}
              handleSearch={consumptionData.handleSearch}
              handleClearSearch={consumptionData.handleClearSearch}
              t={consumptionData.t}
            />
            <TokenConsumptionTable consumptionData={consumptionData} />
            {consumptionData.total > 0 && (
              <div className='flex justify-center mt-2'>
                <Pagination
                  total={consumptionData.total}
                  currentPage={consumptionData.page}
                  pageSize={consumptionData.pageSize}
                  onPageChange={consumptionData.setPage}
                  onPageSizeChange={consumptionData.setPageSize}
                  showSizeChanger
                  pageSizeOpts={[10, 20, 50, 100]}
                />
              </div>
            )}
          </div>
        </TabPane> */}
      </Tabs>
    </div>
  );
};

export default Token;
