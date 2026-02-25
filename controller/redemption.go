package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// sanitizeRedemptionForLog 用于清理兑换码数据，移除敏感信息后用于操作日志记录
func sanitizeRedemptionForLog(r *model.Redemption) map[string]interface{} {
	return map[string]interface{}{
		"id":            r.Id,
		"name":          r.Name,
		"status":        r.Status,
		"quota":         r.Quota,
		"created_time":  r.CreatedTime,
		"expired_time":  r.ExpiredTime,
		"redeemed_time": r.RedeemedTime,
		"user_id":       r.UserId,
	}
}

func GetAllRedemptions(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	redemptions, total, err := model.GetAllRedemptions(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(redemptions)
	common.ApiSuccess(c, pageInfo)
	return
}

func SearchRedemptions(c *gin.Context) {
	keyword := c.Query("keyword")
	pageInfo := common.GetPageQuery(c)
	redemptions, total, err := model.SearchRedemptions(keyword, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(redemptions)
	common.ApiSuccess(c, pageInfo)
	return
}

func GetRedemption(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	redemption, err := model.GetRedemptionById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    redemption,
	})
	return
}

func AddRedemption(c *gin.Context) {
	redemption := model.Redemption{}
	err := c.ShouldBindJSON(&redemption)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if utf8.RuneCountInString(redemption.Name) == 0 || utf8.RuneCountInString(redemption.Name) > 20 {
		common.ApiErrorI18n(c, i18n.MsgRedemptionNameLength)
		return
	}
	if redemption.Count <= 0 {
		common.ApiErrorI18n(c, i18n.MsgRedemptionCountPositive)
		return
	}
	if redemption.Count > 100 {
		common.ApiErrorI18n(c, i18n.MsgRedemptionCountMax)
		return
	}
	if valid, msg := validateExpiredTime(c, redemption.ExpiredTime); !valid {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": msg})
		return
	}
	var keys []string
	for i := 0; i < redemption.Count; i++ {
		key := common.GetUUID()
		cleanRedemption := model.Redemption{
			UserId:      c.GetInt("id"),
			Name:        redemption.Name,
			Key:         key,
			CreatedTime: common.GetTimestamp(),
			Quota:       redemption.Quota,
			ExpiredTime: redemption.ExpiredTime,
		}
		err = cleanRedemption.Insert()
		if err != nil {
			common.SysError("failed to insert redemption: " + err.Error())
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": i18n.T(c, i18n.MsgRedemptionCreateFailed),
				"data":    keys,
			})
			return
		}
		keys = append(keys, key)
	}

	// 记录操作日志
	model.RecordOperationLog(c, c.GetInt("id"), model.ModuleRedemption, model.ActionCreate,
		redemption.Name, redemption.Name, nil, map[string]interface{}{
			"name":  redemption.Name,
			"count": redemption.Count,
			"quota": redemption.Quota,
			"keys":  keys,
		},
		fmt.Sprintf("创建兑换码: %s, 数量: %d", redemption.Name, redemption.Count))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    keys,
	})
	return
}

func DeleteRedemption(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	// 获取兑换码信息用于日志记录
	redemption, _ := model.GetRedemptionById(id)
	var redemptionInfo map[string]interface{}
	var redemptionName string
	if redemption != nil {
		redemptionInfo = sanitizeRedemptionForLog(redemption)
		redemptionName = redemption.Name
	}
	err := model.DeleteRedemptionById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	// 记录操作日志
	model.RecordOperationLog(c, c.GetInt("id"), model.ModuleRedemption, model.ActionDelete,
		strconv.Itoa(id), redemptionName, redemptionInfo, nil,
		fmt.Sprintf("删除兑换码: %s", redemptionName))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func UpdateRedemption(c *gin.Context) {
	statusOnly := c.Query("status_only")
	redemption := model.Redemption{}
	err := c.ShouldBindJSON(&redemption)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	cleanRedemption, err := model.GetRedemptionById(redemption.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	// 保存旧值用于日志记录
	oldRedemptionInfo := sanitizeRedemptionForLog(cleanRedemption)
	if statusOnly == "" {
		if valid, msg := validateExpiredTime(c, redemption.ExpiredTime); !valid {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": msg})
			return
		}
		// If you add more fields, please also update redemption.Update()
		cleanRedemption.Name = redemption.Name
		cleanRedemption.Quota = redemption.Quota
		cleanRedemption.ExpiredTime = redemption.ExpiredTime
	}
	if statusOnly != "" {
		cleanRedemption.Status = redemption.Status
	}
	err = cleanRedemption.Update()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	// 记录操作日志
	model.RecordOperationLog(c, c.GetInt("id"), model.ModuleRedemption, model.ActionUpdate,
		strconv.Itoa(cleanRedemption.Id), cleanRedemption.Name, oldRedemptionInfo, sanitizeRedemptionForLog(cleanRedemption),
		fmt.Sprintf("更新兑换码: %s", cleanRedemption.Name))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    cleanRedemption,
	})
	return
}

func DeleteInvalidRedemption(c *gin.Context) {
	rows, err := model.DeleteInvalidRedemptions()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	// 记录操作日志
	model.RecordOperationLog(c, c.GetInt("id"), model.ModuleRedemption, model.ActionDelete,
		"invalid", fmt.Sprintf("已使用/过期兑换码%d个", rows), nil, nil,
		fmt.Sprintf("删除已使用/过期兑换码: %d个", rows))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    rows,
	})
	return
}

func validateExpiredTime(c *gin.Context, expired int64) (bool, string) {
	if expired != 0 && expired < common.GetTimestamp() {
		return false, i18n.T(c, i18n.MsgRedemptionExpireTimeInvalid)
	}
	return true, ""
}
