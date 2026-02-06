package model

import (
	"context"
	"encoding/json"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// OperationLog 操作日志模型
type OperationLog struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	UserId      int    `json:"user_id" gorm:"index"`                          // 操作人ID
	Username    string `json:"username" gorm:"index;type:varchar(100)"`       // 操作人用户名
	Module      string `json:"module" gorm:"index;type:varchar(50)"`          // 模块: channel, option, user, token, model, redemption
	Action      string `json:"action" gorm:"index;type:varchar(50)"`          // 动作: create, update, delete, enable, disable
	TargetId    string `json:"target_id" gorm:"type:varchar(100)"`            // 目标ID（渠道ID、参数名等）
	TargetName  string `json:"target_name" gorm:"type:varchar(200)"`          // 目标名称
	OldValue    string `json:"old_value" gorm:"type:text"`                    // 修改前的值(JSON)
	NewValue    string `json:"new_value" gorm:"type:text"`                    // 修改后的值(JSON)
	Description string `json:"description" gorm:"type:varchar(500)"`          // 操作描述
	Ip          string `json:"ip" gorm:"type:varchar(50)"`                    // 操作IP
	CreatedAt   int64  `json:"created_at" gorm:"index;index:idx_module_time"` // 操作时间
}

// 操作日志模块常量
const (
	OperationModuleChannel    = "channel"    // 渠道
	OperationModuleOption     = "option"     // 系统参数
	OperationModuleUser       = "user"       // 用户
	OperationModuleToken      = "token"      // 令牌
	OperationModuleModel      = "model"      // 模型
	OperationModuleRedemption = "redemption" // 兑换码
)

// 操作日志动作常量
const (
	OperationActionCreate  = "create"  // 创建
	OperationActionUpdate  = "update"  // 更新
	OperationActionDelete  = "delete"  // 删除
	OperationActionEnable  = "enable"  // 启用
	OperationActionDisable = "disable" // 禁用
)

// 简短别名
const (
	ModuleChannel    = OperationModuleChannel
	ModuleOption     = OperationModuleOption
	ModuleUser       = OperationModuleUser
	ModuleToken      = OperationModuleToken
	ModuleModel      = OperationModuleModel
	ModuleRedemption = OperationModuleRedemption

	ActionCreate  = OperationActionCreate
	ActionUpdate  = OperationActionUpdate
	ActionDelete  = OperationActionDelete
	ActionEnable  = OperationActionEnable
	ActionDisable = OperationActionDisable
)

// OperationLogQueryParams 查询参数
type OperationLogQueryParams struct {
	Module         string
	Action         string
	Username       string
	TargetId       string
	Keyword        string
	StartTimestamp int64
	EndTimestamp   int64
}

// RecordOperationLog 记录操作日志
func RecordOperationLog(c *gin.Context, userId int, module string, action string, targetId string, targetName string, oldValue any, newValue any, description string) {
	username, _ := GetUsernameById(userId, false)

	var oldValueStr, newValueStr string
	if oldValue != nil {
		if bytes, err := json.Marshal(oldValue); err == nil {
			oldValueStr = string(bytes)
		}
	}
	if newValue != nil {
		if bytes, err := json.Marshal(newValue); err == nil {
			newValueStr = string(bytes)
		}
	}

	var ip string
	if c != nil {
		ip = c.ClientIP()
	}

	log := &OperationLog{
		UserId:      userId,
		Username:    username,
		Module:      module,
		Action:      action,
		TargetId:    targetId,
		TargetName:  targetName,
		OldValue:    oldValueStr,
		NewValue:    newValueStr,
		Description: description,
		Ip:          ip,
		CreatedAt:   common.GetTimestamp(),
	}

	err := DB.Create(log).Error
	if err != nil {
		common.SysLog("failed to record operation log: " + err.Error())
	}
}

// GetAllOperationLogs 获取所有操作日志
func GetAllOperationLogs(startIdx int, num int, queryParams OperationLogQueryParams) (logs []*OperationLog, total int64, err error) {
	tx := DB.Model(&OperationLog{})

	// 按模块筛选
	if queryParams.Module != "" {
		tx = tx.Where("module = ?", queryParams.Module)
	}

	// 按动作筛选
	if queryParams.Action != "" {
		tx = tx.Where("action = ?", queryParams.Action)
	}

	// 按操作人筛选
	if queryParams.Username != "" {
		tx = tx.Where("username = ?", queryParams.Username)
	}

	// 按目标ID筛选
	if queryParams.TargetId != "" {
		tx = tx.Where("target_id = ?", queryParams.TargetId)
	}

	// 关键词模糊搜索（搜索目标名称、描述、新旧值）
	if queryParams.Keyword != "" {
		keyword := "%" + queryParams.Keyword + "%"
		tx = tx.Where("target_name LIKE ? OR description LIKE ? OR old_value LIKE ? OR new_value LIKE ?",
			keyword, keyword, keyword, keyword)
	}

	// 按时间范围筛选
	if queryParams.StartTimestamp != 0 {
		tx = tx.Where("created_at >= ?", queryParams.StartTimestamp)
	}
	if queryParams.EndTimestamp != 0 {
		tx = tx.Where("created_at <= ?", queryParams.EndTimestamp)
	}

	// 获取总数
	err = tx.Count(&total).Error
	if err != nil {
		return nil, 0, err
	}

	// 获取数据
	err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		return nil, 0, err
	}

	return logs, total, nil
}

// DeleteOldOperationLog 删除历史操作日志
func DeleteOldOperationLog(ctx context.Context, targetTimestamp int64, limit int) (int64, error) {
	var total int64
	for {
		if ctx != nil && ctx.Err() != nil {
			return total, ctx.Err()
		}

		result := DB.Where("created_at < ?", targetTimestamp).Limit(limit).Delete(&OperationLog{})
		if result.Error != nil {
			return total, result.Error
		}

		total += result.RowsAffected
		if result.RowsAffected < int64(limit) {
			break
		}
	}
	return total, nil
}

// GetOperationLogModules 获取所有模块列表
func GetOperationLogModules() []string {
	return []string{
		OperationModuleChannel,
		OperationModuleOption,
		OperationModuleUser,
		OperationModuleToken,
		OperationModuleModel,
		OperationModuleRedemption,
	}
}

// GetOperationLogActions 获取所有动作列表
func GetOperationLogActions() []string {
	return []string{
		OperationActionCreate,
		OperationActionUpdate,
		OperationActionDelete,
		OperationActionEnable,
		OperationActionDisable,
	}
}
