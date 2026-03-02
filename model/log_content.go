package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/bytedance/gopkg/util/gopool"
)

// LogContent 日志内容表，用于存储请求和响应的完整内容
type LogContent struct {
	Id           int    `json:"id" gorm:"primaryKey"`
	LogId        int    `json:"log_id" gorm:"index"`                      // 关联 Log 表的 ID
	RequestId    string `json:"request_id" gorm:"type:varchar(64);index"` // 请求唯一标识
	RequestBody  string `json:"request_body" gorm:"type:text"`            // 请求内容
	ResponseBody string `json:"response_body" gorm:"type:text"`           // 响应内容
	CreatedAt    int64  `json:"created_at" gorm:"index"`                  // 创建时间
}

// RecordLogContent 异步记录日志内容
func RecordLogContent(logId int, requestId string, requestBody string, responseBody string) {
	// 检查是否启用日志内容记录
	if !operation_setting.IsLogContentEnabled() {
		common.SysLog("log content recording is disabled, skipping...")
		return
	}

	// 如果请求和响应都为空，则不记录
	if requestBody == "" && responseBody == "" {
		common.SysLog("log content: both request and response body are empty, skipping...")
		return
	}

	//common.SysLog(fmt.Sprintf("recording log content: logId=%d, requestId=%s, reqLen=%d, respLen=%d",
	//	logId, requestId, len(requestBody), len(responseBody)))

	gopool.Go(func() {
		logContent := &LogContent{
			LogId:        logId,
			RequestId:    requestId,
			RequestBody:  requestBody,
			ResponseBody: responseBody,
			CreatedAt:    common.GetTimestamp(),
		}
		err := LOG_DB.Create(logContent).Error
		if err != nil {
			common.SysLog("failed to record log content: " + err.Error())
		} else {
			common.SysLog(fmt.Sprintf("log content recorded successfully: id=%d", logContent.Id))
		}
	})
}

// GetLogContentByLogId 根据日志 ID 获取日志内容
func GetLogContentByLogId(logId int) (*LogContent, error) {
	var logContent LogContent
	err := LOG_DB.Where("log_id = ?", logId).First(&logContent).Error
	if err != nil {
		return nil, err
	}
	return &logContent, nil
}

// GetLogContentByRequestId 根据请求 ID 获取日志内容
func GetLogContentByRequestId(requestId string) (*LogContent, error) {
	var logContent LogContent
	err := LOG_DB.Where("request_id = ?", requestId).First(&logContent).Error
	if err != nil {
		return nil, err
	}
	return &logContent, nil
}

// DeleteOldLogContent 删除旧的日志内容
func DeleteOldLogContent(targetTimestamp int64, limit int) (int64, error) {
	result := LOG_DB.Where("created_at < ?", targetTimestamp).Limit(limit).Delete(&LogContent{})
	return result.RowsAffected, result.Error
}
