package operation_setting

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// LogContentSetting 日志内容记录设置（系统设置-运营设置-日志设置）
type LogContentSetting struct {
	// 启用记录请求内容 - 开启后将请求和响应内容存储到日志表中
	Enabled bool `json:"enabled"`
	// 过滤用户ID - 逗号分隔的用户ID列表，只有匹配的用户才记录，为空则不记录
	FilterUserIds string `json:"filter_user_ids"`
}

// 默认配置
var logContentSetting = LogContentSetting{
	Enabled:       false,
	FilterUserIds: "",
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

// IsLogContentEnabledForUser 判断指定用户是否需要记录日志内容
func IsLogContentEnabledForUser(userId int) bool {
	if !logContentSetting.Enabled {
		return false
	}
	if logContentSetting.FilterUserIds == "" {
		return false
	}
	for _, idStr := range strings.Split(logContentSetting.FilterUserIds, ",") {
		idStr = strings.TrimSpace(idStr)
		if idStr == "" {
			continue
		}
		if id, err := strconv.Atoi(idStr); err == nil && id == userId {
			return true
		}
	}
	return false
}
