package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
)

var (
	channelStatsTaskOnce    sync.Once
	channelStatsTaskRunning atomic.Bool
)

// StartChannelStatsTask 启动渠道统计定时任务
func StartChannelStatsTask() {
	channelStatsTaskOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}

		gopool.Go(func() {
			logger.LogInfo(context.Background(), "channel stats task started")

			// 首次运行
			runChannelStatsOnce()

			// 定时运行
			for {
				interval := operation_setting.GetRefreshIntervalMinutes()
				if interval <= 0 {
					// 禁用状态，每分钟检查一次是否启用
					time.Sleep(time.Minute)
					continue
				}

				time.Sleep(time.Duration(interval) * time.Minute)
				runChannelStatsOnce()
			}
		})
	})
}

func runChannelStatsOnce() {
	if !operation_setting.IsChannelStatsEnabled() {
		return
	}

	if !channelStatsTaskRunning.CompareAndSwap(false, true) {
		return
	}
	defer channelStatsTaskRunning.Store(false)

	ctx := context.Background()

	// 查询最近24小时的统计数据
	results, err := model.GetChannelStatsFromLogs()
	if err != nil {
		logger.LogError(ctx, fmt.Sprintf("channel stats task: query failed: %v", err))
		return
	}

	// 转换为 ChannelStats 格式
	stats := make(map[int]*operation_setting.ChannelStats)
	for channelId, result := range results {
		successRate := float64(0)
		if result.TotalCount > 0 {
			successRate = float64(result.SuccessCount) / float64(result.TotalCount) * 100
		}
		stats[channelId] = &operation_setting.ChannelStats{
			ChannelID:    channelId,
			TotalCount:   result.TotalCount,
			SuccessCount: result.SuccessCount,
			FailCount:    result.FailCount,
			SuccessRate:  successRate,
		}
	}

	// 更新缓存
	operation_setting.UpdateChannelStatsCache(stats)

	if common.DebugEnabled {
		logger.LogDebug(ctx, "channel stats task: updated %d channels", len(stats))
	}
}
