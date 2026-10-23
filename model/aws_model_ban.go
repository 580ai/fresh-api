package model

import (
	"strings"
	"time"
)

type AwsModelBan struct {
	Id           int    `json:"id" gorm:"primaryKey;autoIncrement"`
	Group        string `json:"group" gorm:"type:varchar(64);index"`
	ChannelId    int    `json:"channel_id" gorm:"index"`
	ChannelName  string `json:"channel_name" gorm:"type:varchar(255)"`
	ModelName    string `json:"model_name" gorm:"type:varchar(255);index"`
	ErrorContent string `json:"error_content" gorm:"type:text"`
	BanTime      int64  `json:"ban_time" gorm:"bigint;index"`
	UnbanTime    int64  `json:"unban_time" gorm:"bigint"`
	Status       int    `json:"status" gorm:"default:1;index"` // 1=banned, 2=restored
	RestoredAt   int64  `json:"restored_at" gorm:"bigint"`
}

func (AwsModelBan) TableName() string {
	return "aws_model_bans"
}

// GetAwsModelBans returns paginated ban records
func GetAwsModelBans(startIdx int, num int, status int) (bans []*AwsModelBan, total int64, err error) {
	tx := DB.Model(&AwsModelBan{})
	if status > 0 {
		tx = tx.Where("status = ?", status)
	}
	err = tx.Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	err = tx.Order("id desc").Offset(startIdx).Limit(num).Find(&bans).Error
	return bans, total, err
}

// GetActiveAwsModelBan checks if a specific model is already banned in a group+channel
func GetActiveAwsModelBan(group string, channelId int, modelName string) (*AwsModelBan, error) {
	var ban AwsModelBan
	err := DB.Where(commonGroupCol+" = ? AND channel_id = ? AND model_name = ? AND status = 1", group, channelId, modelName).First(&ban).Error
	if err != nil {
		return nil, err
	}
	return &ban, nil
}

// CreateAwsModelBan creates a new ban record
func CreateAwsModelBan(ban *AwsModelBan) error {
	return DB.Create(ban).Error
}

// GetExpiredAwsModelBans returns bans that should be restored
func GetExpiredAwsModelBans() ([]*AwsModelBan, error) {
	var bans []*AwsModelBan
	now := time.Now().Unix()
	err := DB.Where("status = 1 AND unban_time <= ?", now).Find(&bans).Error
	return bans, err
}

// RestoreAwsModelBan marks a ban as restored and deletes it
func RestoreAwsModelBan(id int) error {
	return DB.Delete(&AwsModelBan{}, "id = ?", id).Error
}

// DisableModelAbility disables a specific model ability for a group+channel
func DisableModelAbility(group string, modelName string, channelId int) error {
	return DB.Model(&Ability{}).Where(commonGroupCol+" = ? AND model = ? AND channel_id = ?", group, modelName, channelId).Update("enabled", false).Error
}

// EnableModelAbility enables a specific model ability for a group+channel
func EnableModelAbility(group string, modelName string, channelId int) error {
	return DB.Model(&Ability{}).Where(commonGroupCol+" = ? AND model = ? AND channel_id = ?", group, modelName, channelId).Update("enabled", true).Error
}

// GetRecentErrorLogs returns error logs from the last given minutes for specified groups
func GetRecentErrorLogs(sinceTimestamp int64, groups []string) ([]*Log, error) {
	var logs []*Log
	if len(groups) == 0 {
		return logs, nil
	}
	placeholders := make([]string, len(groups))
	for i := range groups {
		placeholders[i] = "?"
	}
	groupCondition := logGroupCol + " IN (" + strings.Join(placeholders, ",") + ")"
	args := make([]interface{}, 0, len(groups)+2)
	args = append(args, LogTypeError)
	args = append(args, sinceTimestamp)
	for _, g := range groups {
		args = append(args, g)
	}
	err := LOG_DB.Where("type = ? AND created_at >= ? AND "+groupCondition, args...).Find(&logs).Error
	return logs, err
}

// GetChannelNameById returns channel name by id
func GetChannelNameById(channelId int) string {
	var channel Channel
	err := DB.Select("name").First(&channel, "id = ?", channelId).Error
	if err != nil {
		return ""
	}
	return channel.Name
}
