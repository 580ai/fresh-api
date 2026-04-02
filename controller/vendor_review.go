package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

func GetPendingVendorChannels(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	status, _ := strconv.Atoi(c.Query("status"))
	if status == 0 {
		status = common.ChannelStatusPendingReview
	}
	var channels []*model.Channel
	var total int64
	query := model.DB.Model(&model.Channel{}).Where("source = ? AND status = ?", "vendor", status)
	if err := query.Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	err := query.Order("id desc").
		Offset(pageInfo.GetStartIdx()).
		Limit(pageInfo.GetPageSize()).
		Omit("key").
		Find(&channels).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(channels)
	common.ApiSuccess(c, pageInfo)
}

type ReviewVendorChannelRequest struct {
	ChannelId int    `json:"channel_id" binding:"required"`
	Action    string `json:"action" binding:"required"`
	Remark    string `json:"remark"`
}

func ReviewVendorChannel(c *gin.Context) {
	var req ReviewVendorChannelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.Action != "approve" && req.Action != "reject" {
		common.ApiErrorMsg(c, "无效的审核操作，仅支持 approve/reject")
		return
	}
	channel, err := model.GetChannelById(req.ChannelId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if channel.Source != "vendor" {
		common.ApiErrorMsg(c, "该渠道非供应商提交")
		return
	}
	if channel.Status != common.ChannelStatusPendingReview {
		common.ApiErrorMsg(c, "该渠道不在待审核状态")
		return
	}
	info := channel.GetOtherInfo()
	info["review_remark"] = req.Remark
	info["reviewed_by"] = c.GetInt("id")
	info["review_time"] = common.GetTimestamp()
	if req.Action == "approve" {
		channel.Status = common.ChannelStatusEnabled
		info["review_action"] = "approved"
	} else {
		channel.Status = common.ChannelStatusRejected
		info["review_action"] = "rejected"
	}
	channel.SetOtherInfo(info)
	if err := model.DB.Model(channel).Updates(map[string]interface{}{
		"status":     channel.Status,
		"other_info": channel.OtherInfo,
	}).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if req.Action == "approve" {
		_ = channel.UpdateAbilities(nil)
		model.InitChannelCache()
	}
	common.ApiSuccess(c, channel)
}

func RetestVendorChannel(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	channel, err := model.GetChannelById(id, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if channel.Source != "vendor" {
		common.ApiErrorMsg(c, "该渠道非供应商提交")
		return
	}
	testModelStr := ""
	if channel.TestModel != nil {
		testModelStr = *channel.TestModel
	}
	gopool.Go(func() {
		result := testChannel(channel, testModelStr, "", false)
		info := channel.GetOtherInfo()
		if result.localErr != nil {
			info["test_result"] = "failed"
			info["test_error"] = result.localErr.Error()
		} else if result.newAPIError != nil {
			info["test_result"] = "failed"
			info["test_error"] = result.newAPIError.Error()
		} else {
			info["test_result"] = "passed"
			info["test_error"] = ""
		}
		info["test_time"] = common.GetTimestamp()
		channel.SetOtherInfo(info)
		model.DB.Model(channel).Update("other_info", channel.OtherInfo)
	})
	common.ApiSuccess(c, "测试已触发")
}

func GetPendingVendorChannelCount(c *gin.Context) {
	var count int64
	model.DB.Model(&model.Channel{}).Where("source = ? AND status = ?", "vendor", common.ChannelStatusPendingReview).Count(&count)
	common.ApiSuccess(c, gin.H{"count": count})
}
