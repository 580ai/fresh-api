package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// GetAllOperationLogs 获取所有操作日志
func GetAllOperationLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	module := c.Query("module")
	action := c.Query("action")
	username := c.Query("username")
	targetId := c.Query("target_id")
	keyword := c.Query("keyword")

	queryParams := model.OperationLogQueryParams{
		Module:         module,
		Action:         action,
		Username:       username,
		TargetId:       targetId,
		Keyword:        keyword,
		StartTimestamp: startTimestamp,
		EndTimestamp:   endTimestamp,
	}

	logs, total, err := model.GetAllOperationLogs(pageInfo.GetStartIdx(), pageInfo.GetPageSize(), queryParams)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
}

// DeleteHistoryOperationLogs 删除历史操作日志
func DeleteHistoryOperationLogs(c *gin.Context) {
	targetTimestamp, _ := strconv.ParseInt(c.Query("target_timestamp"), 10, 64)
	if targetTimestamp == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "target timestamp is required",
		})
		return
	}
	count, err := model.DeleteOldOperationLog(c.Request.Context(), targetTimestamp, 100)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
}

// GetOperationLogOptions 获取操作日志筛选选项（模块和动作列表）
func GetOperationLogOptions(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"modules": model.GetOperationLogModules(),
			"actions": model.GetOperationLogActions(),
		},
	})
}
