package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// GetChannelAutoEnableStatus 获取渠道的自动启用状态
func GetChannelAutoEnableStatus(c *gin.Context) {
	channelId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	enabled := model.GetChannelAutoEnableStatus(channelId)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"channel_id": channelId,
			"enabled":    enabled,
		},
	})
}

// SetChannelAutoEnableStatus 设置渠道的自动启用状态
func SetChannelAutoEnableStatus(c *gin.Context) {
	channelId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	// 检查渠道是否存在
	_, err = model.GetChannelById(channelId, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "渠道不存在",
		})
		return
	}

	err = model.SetChannelAutoEnable(channelId, req.Enabled)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

// BatchGetChannelAutoEnableStatus 批量获取渠道的自动启用状态
func BatchGetChannelAutoEnableStatus(c *gin.Context) {
	var req struct {
		ChannelIds []int `json:"channel_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	statusMap, err := model.BatchGetChannelAutoEnableStatus(req.ChannelIds)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    statusMap,
	})
}

// BatchSetChannelAutoEnableStatus 批量设置渠道的自动启用状态
func BatchSetChannelAutoEnableStatus(c *gin.Context) {
	var req struct {
		ChannelIds []int `json:"channel_ids"`
		Enabled    bool  `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	if len(req.ChannelIds) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "渠道ID列表不能为空",
		})
		return
	}

	var successCount int
	for _, channelId := range req.ChannelIds {
		err := model.SetChannelAutoEnable(channelId, req.Enabled)
		if err == nil {
			successCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"total":   len(req.ChannelIds),
			"success": successCount,
		},
	})
}

// GetAllAutoEnableChannels 获取所有开启了自动启用的渠道ID列表
func GetAllAutoEnableChannels(c *gin.Context) {
	channelIds, err := model.GetAllEnabledAutoEnableChannelIds()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    channelIds,
	})
}
