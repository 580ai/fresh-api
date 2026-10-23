package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
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

// GetChannelSettings 获取渠道的完整设置（自动启用、RPM限制等）
func GetChannelSettings(c *gin.Context) {
	channelId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	settings, err := model.GetChannelSettings(channelId)
	if err != nil {
		// 不存在时返回默认值
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"channel_id":  channelId,
				"auto_enable": false,
				"max_rpm":     0,
				"current_rpm": 0,
			},
		})
		return
	}

	// 获取当前RPM
	currentRPM := service.GetChannelCurrentRPM(channelId)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"channel_id":  channelId,
			"auto_enable": settings.Enabled,
			"max_rpm":     settings.MaxRPM,
			"current_rpm": currentRPM,
		},
	})
}

// SetChannelSettings 设置渠道的完整设置
func SetChannelSettings(c *gin.Context) {
	channelId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	var req struct {
		AutoEnable bool `json:"auto_enable"`
		MaxRPM     int  `json:"max_rpm"`
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

	// RPM限制不能为负数
	if req.MaxRPM < 0 {
		req.MaxRPM = 0
	}

	err = model.SetChannelSettings(channelId, req.AutoEnable, req.MaxRPM)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

// GetChannelMaxRPM 获取渠道的RPM限制
func GetChannelMaxRPM(c *gin.Context) {
	channelId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	maxRPM := model.GetChannelMaxRPM(channelId)
	currentRPM := service.GetChannelCurrentRPM(channelId)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"channel_id":  channelId,
			"max_rpm":     maxRPM,
			"current_rpm": currentRPM,
		},
	})
}

// SetChannelMaxRPM 设置渠道的RPM限制
func SetChannelMaxRPM(c *gin.Context) {
	channelId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	var req struct {
		MaxRPM int `json:"max_rpm"`
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

	// RPM限制不能为负数
	if req.MaxRPM < 0 {
		req.MaxRPM = 0
	}

	err = model.SetChannelMaxRPM(channelId, req.MaxRPM)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

// BatchGetChannelSettings 批量获取渠道设置
func BatchGetChannelSettings(c *gin.Context) {
	var req struct {
		ChannelIds []int `json:"channel_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	// 批量获取自动启用状态
	autoEnableMap, err := model.BatchGetChannelAutoEnableStatus(req.ChannelIds)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	// 批量获取RPM限制
	rpmMap, err := model.BatchGetChannelMaxRPM(req.ChannelIds)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	// 合并结果
	result := make(map[int]gin.H)
	for _, channelId := range req.ChannelIds {
		result[channelId] = gin.H{
			"auto_enable": autoEnableMap[channelId],
			"max_rpm":     rpmMap[channelId],
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}
