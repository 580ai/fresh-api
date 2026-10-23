package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// ChannelPriorityBalanceSetting 「Anthropic Claude 批量」(type=9001) 渠道优先级自动平衡设置
type ChannelPriorityBalanceSetting struct {
	Enabled bool `json:"enabled"` // 是否启用自动平衡定时任务
}

// 默认配置：随后端启动自动开启
var channelPriorityBalanceSetting = ChannelPriorityBalanceSetting{
	Enabled: true,
}

func init() {
	config.GlobalConfig.Register("channel_priority_balance_setting", &channelPriorityBalanceSetting)
}

func GetChannelPriorityBalanceSetting() *ChannelPriorityBalanceSetting {
	return &channelPriorityBalanceSetting
}

// IsChannelPriorityBalanceEnabled 是否启用渠道优先级自动平衡
func IsChannelPriorityBalanceEnabled() bool {
	return channelPriorityBalanceSetting.Enabled
}
