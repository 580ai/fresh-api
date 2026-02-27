package model

import (
	"github.com/QuantumNous/new-api/common"
)

// ChannelAutoEnable 渠道扩展配置表（自动启用、限流等）
type ChannelAutoEnable struct {
	Id          int   `json:"id" gorm:"primaryKey;autoIncrement"`
	ChannelId   int   `json:"channel_id" gorm:"uniqueIndex;not null"` // 渠道ID，唯一索引
	Enabled     bool  `json:"enabled" gorm:"default:true"`            // 是否启用自动启用功能
	MaxRPM      int   `json:"max_rpm" gorm:"default:0"`               // 每分钟最大请求数，0表示不限制
	CreatedTime int64 `json:"created_time" gorm:"bigint"`
	UpdatedTime int64 `json:"updated_time" gorm:"bigint"`
}

func (ChannelAutoEnable) TableName() string {
	return "channel_auto_enables"
}

// GetChannelAutoEnable 获取渠道的自动启用配置
func GetChannelAutoEnable(channelId int) (*ChannelAutoEnable, error) {
	var config ChannelAutoEnable
	err := DB.Where("channel_id = ?", channelId).First(&config).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

// GetChannelAutoEnableStatus 获取渠道是否开启了自动启用
func GetChannelAutoEnableStatus(channelId int) bool {
	config, err := GetChannelAutoEnable(channelId)
	if err != nil {
		return false
	}
	return config.Enabled
}

// SetChannelAutoEnable 设置渠道的自动启用配置
func SetChannelAutoEnable(channelId int, enabled bool) error {
	var config ChannelAutoEnable
	err := DB.Where("channel_id = ?", channelId).First(&config).Error
	if err != nil {
		// 不存在则创建
		config = ChannelAutoEnable{
			ChannelId:   channelId,
			Enabled:     enabled,
			CreatedTime: common.GetTimestamp(),
			UpdatedTime: common.GetTimestamp(),
		}
		return DB.Create(&config).Error
	}
	// 存在则更新
	config.Enabled = enabled
	config.UpdatedTime = common.GetTimestamp()
	return DB.Save(&config).Error
}

// DeleteChannelAutoEnable 删除渠道的自动启用配置
func DeleteChannelAutoEnable(channelId int) error {
	return DB.Where("channel_id = ?", channelId).Delete(&ChannelAutoEnable{}).Error
}

// GetAllEnabledAutoEnableChannelIds 获取所有开启了自动启用的渠道ID列表
func GetAllEnabledAutoEnableChannelIds() ([]int, error) {
	var configs []ChannelAutoEnable
	err := DB.Where("enabled = ?", true).Find(&configs).Error
	if err != nil {
		return nil, err
	}
	ids := make([]int, len(configs))
	for i, config := range configs {
		ids[i] = config.ChannelId
	}
	return ids, nil
}

// GetAutoEnableChannelsToTest 获取需要测试的渠道（开启了自动启用且当前未启用的渠道）
func GetAutoEnableChannelsToTest() ([]*Channel, error) {
	// 先获取所有开启了自动启用的渠道ID
	channelIds, err := GetAllEnabledAutoEnableChannelIds()
	if err != nil {
		return nil, err
	}
	if len(channelIds) == 0 {
		return []*Channel{}, nil
	}

	// 查询这些渠道中状态不是启用的渠道
	var channels []*Channel
	err = DB.Where("id IN ? AND status != ?", channelIds, common.ChannelStatusEnabled).Find(&channels).Error
	if err != nil {
		return nil, err
	}
	return channels, nil
}

// BatchGetChannelAutoEnableStatus 批量获取渠道的自动启用状态
func BatchGetChannelAutoEnableStatus(channelIds []int) (map[int]bool, error) {
	if len(channelIds) == 0 {
		return make(map[int]bool), nil
	}
	var configs []ChannelAutoEnable
	err := DB.Where("channel_id IN ?", channelIds).Find(&configs).Error
	if err != nil {
		return nil, err
	}
	result := make(map[int]bool)
	for _, config := range configs {
		result[config.ChannelId] = config.Enabled
	}
	return result, nil
}

// GetChannelMaxRPM 获取渠道的最大RPM限制，返回0表示不限制
func GetChannelMaxRPM(channelId int) int {
	config, err := GetChannelAutoEnable(channelId)
	if err != nil {
		return 0
	}
	return config.MaxRPM
}

// SetChannelMaxRPM 设置渠道的最大RPM限制
func SetChannelMaxRPM(channelId int, maxRPM int) error {
	var config ChannelAutoEnable
	err := DB.Where("channel_id = ?", channelId).First(&config).Error
	if err != nil {
		// 不存在则创建
		config = ChannelAutoEnable{
			ChannelId:   channelId,
			Enabled:     false, // 默认不启用自动启用
			MaxRPM:      maxRPM,
			CreatedTime: common.GetTimestamp(),
			UpdatedTime: common.GetTimestamp(),
		}
		return DB.Create(&config).Error
	}
	// 存在则更新
	config.MaxRPM = maxRPM
	config.UpdatedTime = common.GetTimestamp()
	return DB.Save(&config).Error
}

// BatchGetChannelMaxRPM 批量获取渠道的RPM限制
func BatchGetChannelMaxRPM(channelIds []int) (map[int]int, error) {
	if len(channelIds) == 0 {
		return make(map[int]int), nil
	}
	var configs []ChannelAutoEnable
	err := DB.Where("channel_id IN ?", channelIds).Find(&configs).Error
	if err != nil {
		return nil, err
	}
	result := make(map[int]int)
	for _, config := range configs {
		result[config.ChannelId] = config.MaxRPM
	}
	return result, nil
}

// GetChannelSettings 获取渠道的完整设置
func GetChannelSettings(channelId int) (*ChannelAutoEnable, error) {
	return GetChannelAutoEnable(channelId)
}

// SetChannelSettings 设置渠道的完整设置
func SetChannelSettings(channelId int, autoEnable bool, maxRPM int) error {
	var config ChannelAutoEnable
	err := DB.Where("channel_id = ?", channelId).First(&config).Error
	if err != nil {
		// 不存在则创建
		config = ChannelAutoEnable{
			ChannelId:   channelId,
			Enabled:     autoEnable,
			MaxRPM:      maxRPM,
			CreatedTime: common.GetTimestamp(),
			UpdatedTime: common.GetTimestamp(),
		}
		return DB.Create(&config).Error
	}
	// 存在则更新
	config.Enabled = autoEnable
	config.MaxRPM = maxRPM
	config.UpdatedTime = common.GetTimestamp()
	return DB.Save(&config).Error
}
