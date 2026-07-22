package model

import (
	"github.com/QuantumNous/new-api/common"
)

// ChannelUpstreamUsage 渠道上游已用额度核对表（独立关联表，不改动 channel 原表）
// 用于把上游站点某个 token 的已用额度拉取回来，和本地渠道已用做核对。
type ChannelUpstreamUsage struct {
	Id                int   `json:"id" gorm:"primaryKey;autoIncrement"`
	ChannelId         int   `json:"channel_id" gorm:"uniqueIndex;not null"` // 渠道ID，唯一索引
	UpstreamUsedQuota int64 `json:"upstream_used_quota" gorm:"bigint;default:0"` // 上游返回的原始已用额度（未经倍率换算）
	CreatedTime       int64 `json:"created_time" gorm:"bigint"`
	UpdatedTime       int64 `json:"updated_time" gorm:"bigint"` // 最近一次拉取时间
}

func (ChannelUpstreamUsage) TableName() string {
	return "channel_upstream_usages"
}

// SetChannelUpstreamUsage 写入/更新某渠道的上游已用额度（存原始值，倍率换算交给前端展示）
func SetChannelUpstreamUsage(channelId int, upstreamUsedQuota int64) error {
	var record ChannelUpstreamUsage
	err := DB.Where("channel_id = ?", channelId).First(&record).Error
	if err != nil {
		// 不存在则创建
		record = ChannelUpstreamUsage{
			ChannelId:         channelId,
			UpstreamUsedQuota: upstreamUsedQuota,
			CreatedTime:       common.GetTimestamp(),
			UpdatedTime:       common.GetTimestamp(),
		}
		return DB.Create(&record).Error
	}
	// 存在则更新
	record.UpstreamUsedQuota = upstreamUsedQuota
	record.UpdatedTime = common.GetTimestamp()
	return DB.Save(&record).Error
}

// GetChannelUpstreamUsage 获取单个渠道的上游已用记录
func GetChannelUpstreamUsage(channelId int) (*ChannelUpstreamUsage, error) {
	var record ChannelUpstreamUsage
	err := DB.Where("channel_id = ?", channelId).First(&record).Error
	if err != nil {
		return nil, err
	}
	return &record, nil
}

// BatchGetChannelUpstreamUsage 批量获取多个渠道的上游已用额度，返回 channelId -> 原始已用额度
func BatchGetChannelUpstreamUsage(channelIds []int) (map[int]int64, error) {
	if len(channelIds) == 0 {
		return make(map[int]int64), nil
	}
	var records []ChannelUpstreamUsage
	err := DB.Where("channel_id IN ?", channelIds).Find(&records).Error
	if err != nil {
		return nil, err
	}
	result := make(map[int]int64, len(records))
	for _, r := range records {
		result[r.ChannelId] = r.UpstreamUsedQuota
	}
	return result, nil
}

// DeleteChannelUpstreamUsage 删除某渠道的上游已用记录
func DeleteChannelUpstreamUsage(channelId int) error {
	return DB.Where("channel_id = ?", channelId).Delete(&ChannelUpstreamUsage{}).Error
}
