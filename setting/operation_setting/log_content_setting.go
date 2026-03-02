package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// LogContentSetting 日志内容记录设置（系统设置-运营设置-日志设置）
type LogContentSetting struct {
	// 启用记录请求内容 - 开启后将请求和响应内容存储到日志表中
	Enabled bool `json:"enabled"`
}

// 默认配置
var logContentSetting = LogContentSetting{
	Enabled: false,
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("log_content_setting", &logContentSetting)
}

// GetLogContentSetting 获取日志内容记录设置
func GetLogContentSetting() *LogContentSetting {
	return &logContentSetting
}

// IsLogContentEnabled 是否启用日志内容记录
func IsLogContentEnabled() bool {
	return logContentSetting.Enabled
}
