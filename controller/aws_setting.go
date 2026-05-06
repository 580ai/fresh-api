package controller

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

func GetAwsSetting(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	settings := map[string]string{
		"aws_setting.enabled":      common.OptionMap["aws_setting.enabled"],
		"aws_setting.groups":       common.OptionMap["aws_setting.groups"],
		"aws_setting.keywords":     common.OptionMap["aws_setting.keywords"],
		"aws_setting.ban_duration": common.OptionMap["aws_setting.ban_duration"],
	}
	common.OptionMapRWMutex.RUnlock()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    settings,
	})
}

type AwsSettingUpdateRequest struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

func UpdateAwsSetting(c *gin.Context) {
	var req AwsSettingUpdateRequest
	err := json.NewDecoder(c.Request.Body).Decode(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的参数",
		})
		return
	}

	// Validate key
	validKeys := map[string]bool{
		"aws_setting.enabled":      true,
		"aws_setting.groups":       true,
		"aws_setting.keywords":     true,
		"aws_setting.ban_duration": true,
	}
	if !validKeys[req.Key] {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的设置项",
		})
		return
	}

	err = model.UpdateOption(req.Key, req.Value)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func GetAwsModelBans(c *gin.Context) {
	p, _ := strconv.Atoi(c.Query("p"))
	if p < 0 {
		p = 0
	}
	pageSize, _ := strconv.Atoi(c.Query("page_size"))
	if pageSize <= 0 {
		pageSize = 10
	}
	status, _ := strconv.Atoi(c.Query("status"))

	bans, total, err := model.GetAwsModelBans(p*pageSize, pageSize, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    bans,
		"total":   total,
	})
}

func RestoreAwsModelBan(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的ID",
		})
		return
	}

	// Get ban record first
	bans, _, err := model.GetAwsModelBans(0, 1000, 1)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	var targetBan *model.AwsModelBan
	for _, ban := range bans {
		if ban.Id == id {
			targetBan = ban
			break
		}
	}

	if targetBan == nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "记录不存在或已恢复",
		})
		return
	}

	// Re-enable the ability
	err = model.EnableModelAbility(targetBan.Group, targetBan.ModelName, targetBan.ChannelId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "恢复模型能力失败: " + err.Error(),
		})
		return
	}

	// Delete the ban record
	err = model.RestoreAwsModelBan(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "删除记录失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}
