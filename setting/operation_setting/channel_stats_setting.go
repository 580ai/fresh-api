package operation_setting

import (
	"sync"
	"time"

	"github.com/QuantumNous/new-api/setting/config"
)

// ChannelStatsSetting 渠道统计设置
type ChannelStatsSetting struct {
	// 统计刷新间隔（分钟），0 表示禁用
	RefreshIntervalMinutes int `json:"refresh_interval_minutes"`
}

// ChannelStats 单个渠道的统计数据
type ChannelStats struct {
	ChannelID    int     `json:"channel_id"`
	TotalCount   int     `json:"total_count"`   // 总请求数
	SuccessCount int     `json:"success_count"` // 成功数
	FailCount    int     `json:"fail_count"`    // 失败数
	SuccessRate  float64 `json:"success_rate"`  // 成功率 (0-100)
}

// 默认配置
var channelStatsSetting = ChannelStatsSetting{
	RefreshIntervalMinutes: 5, // 默认5分钟刷新一次
}

// 渠道统计缓存
var (
	channelStatsCache     = make(map[int]*ChannelStats)
	channelStatsCacheLock sync.RWMutex
	channelStatsUpdatedAt int64
)

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("channel_stats_setting", &channelStatsSetting)
}

// GetChannelStatsSetting 获取渠道统计设置
func GetChannelStatsSetting() *ChannelStatsSetting {
	return &channelStatsSetting
}

// GetRefreshIntervalMinutes 获取刷新间隔（分钟）
func GetRefreshIntervalMinutes() int {
	if channelStatsSetting.RefreshIntervalMinutes < 0 {
		return 0
	}
	return channelStatsSetting.RefreshIntervalMinutes
}

// IsChannelStatsEnabled 是否启用渠道统计
func IsChannelStatsEnabled() bool {
	return channelStatsSetting.RefreshIntervalMinutes > 0
}

// GetChannelStats 获取单个渠道的统计数据
func GetChannelStats(channelID int) *ChannelStats {
	channelStatsCacheLock.RLock()
	defer channelStatsCacheLock.RUnlock()
	if stats, ok := channelStatsCache[channelID]; ok {
		return stats
	}
	return nil
}

// GetAllChannelStats 获取所有渠道的统计数据
func GetAllChannelStats() map[int]*ChannelStats {
	channelStatsCacheLock.RLock()
	defer channelStatsCacheLock.RUnlock()
	// 返回副本
	result := make(map[int]*ChannelStats, len(channelStatsCache))
	for k, v := range channelStatsCache {
		statsCopy := *v
		result[k] = &statsCopy
	}
	return result
}

// GetChannelStatsUpdatedAt 获取统计数据更新时间
func GetChannelStatsUpdatedAt() int64 {
	channelStatsCacheLock.RLock()
	defer channelStatsCacheLock.RUnlock()
	return channelStatsUpdatedAt
}

// UpdateChannelStatsCache 更新渠道统计缓存
func UpdateChannelStatsCache(stats map[int]*ChannelStats) {
	channelStatsCacheLock.Lock()
	defer channelStatsCacheLock.Unlock()
	channelStatsCache = stats
	channelStatsUpdatedAt = time.Now().Unix()
}

// ClearChannelStatsCache 清空渠道统计缓存
func ClearChannelStatsCache() {
	channelStatsCacheLock.Lock()
	defer channelStatsCacheLock.Unlock()
	channelStatsCache = make(map[int]*ChannelStats)
	channelStatsUpdatedAt = 0
}
