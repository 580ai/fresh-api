package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// ChannelAutoEnableSetting 渠道自动启用设置
type ChannelAutoEnableSetting struct {
	Enabled              bool `json:"enabled"`                // 是否启用自动启用功能
	IntervalMinutes      int  `json:"interval_minutes"`       // 测试间隔时间（分钟）
	TimeoutSeconds       int  `json:"timeout_seconds"`        // 测试最长响应时间（秒），超过视为失败
	SuccessRateThreshold int  `json:"success_rate_threshold"` // 成功率阈值（百分比），达到此阈值才启用渠道
	TestCount            int  `json:"test_count"`             // 每次测试的请求次数
}

// 默认配置
var channelAutoEnableSetting = ChannelAutoEnableSetting{
	Enabled:              false, // 默认关闭
	IntervalMinutes:      30,    // 默认30分钟
	TimeoutSeconds:       30,    // 默认30秒超时
	SuccessRateThreshold: 50,    // 默认50%成功率
	TestCount:            2,     // 默认测试2次
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("channel_auto_enable_setting", &channelAutoEnableSetting)
}

func GetChannelAutoEnableSetting() *ChannelAutoEnableSetting {
	return &channelAutoEnableSetting
}

// IsChannelAutoEnableEnabled 是否启用渠道自动启用功能
func IsChannelAutoEnableEnabled() bool {
	return channelAutoEnableSetting.Enabled
}

// GetChannelAutoEnableInterval 获取测试间隔时间（分钟）
func GetChannelAutoEnableInterval() int {
	if channelAutoEnableSetting.IntervalMinutes <= 0 {
		return 30
	}
	return channelAutoEnableSetting.IntervalMinutes
}

// GetChannelAutoEnableTimeout 获取测试超时时间（秒）
func GetChannelAutoEnableTimeout() int {
	if channelAutoEnableSetting.TimeoutSeconds <= 0 {
		return 30
	}
	return channelAutoEnableSetting.TimeoutSeconds
}

// GetChannelAutoEnableSuccessRateThreshold 获取成功率阈值
func GetChannelAutoEnableSuccessRateThreshold() int {
	if channelAutoEnableSetting.SuccessRateThreshold <= 0 {
		return 50
	}
	if channelAutoEnableSetting.SuccessRateThreshold > 100 {
		return 100
	}
	return channelAutoEnableSetting.SuccessRateThreshold
}

// GetChannelAutoEnableTestCount 获取测试次数
func GetChannelAutoEnableTestCount() int {
	if channelAutoEnableSetting.TestCount <= 0 {
		return 2
	}
	return channelAutoEnableSetting.TestCount
}
