package operation_setting

import (
	"github.com/QuantumNous/new-api/setting/config"
)

// ResponseTimeTier 响应时间分层配置
type ResponseTimeTier struct {
	Min int `json:"min"` // 最小响应时间（秒）
	Max int `json:"max"` // 最大响应时间（秒）
}

// ChannelPriorityMonitorSetting 渠道优先级监控设置
type ChannelPriorityMonitorSetting struct {
	Enabled           bool               `json:"enabled"`             // 是否启用
	IntervalMinutes   int                `json:"interval_minutes"`    // 测试间隔（分钟）
	TimeoutSeconds    int                `json:"timeout_seconds"`     // 最长响应时间（秒）
	ModelPriorities   string             `json:"model_priorities"`    // 模型优先级配置，格式：model:priority，一行一个
	ResponseTimeTiers []ResponseTimeTier `json:"response_time_tiers"` // 响应时间分层配置
}

// 默认配置
var channelPriorityMonitorSetting = ChannelPriorityMonitorSetting{
	Enabled:         false,
	IntervalMinutes: 30,
	TimeoutSeconds:  30,
	ModelPriorities: "",
	ResponseTimeTiers: []ResponseTimeTier{
		{Min: 0, Max: 3},
		{Min: 3, Max: 10},
		{Min: 10, Max: 30},
		{Min: 30, Max: 9999},
	},
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("channel_priority_monitor", &channelPriorityMonitorSetting)
}

// GetChannelPriorityMonitorSetting 获取渠道优先级监控设置
func GetChannelPriorityMonitorSetting() *ChannelPriorityMonitorSetting {
	return &channelPriorityMonitorSetting
}
