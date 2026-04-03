package controller

import (
	"fmt"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

type VendorSubmitChannelRequest struct {
	Name      string  `json:"name" binding:"required"`
	Type      int     `json:"type" binding:"required"`
	Key       string  `json:"key" binding:"required"`
	BaseURL   *string `json:"base_url"`
	Models    string  `json:"models" binding:"required"`
	Group     string  `json:"group"`
	TestModel *string `json:"test_model"`
}

type VendorUpdateChannelRequest struct {
	Name      string  `json:"name" binding:"required"`
	Type      int     `json:"type" binding:"required"`
	Key       string  `json:"key"`
	BaseURL   *string `json:"base_url"`
	Models    string  `json:"models" binding:"required"`
	Group     string  `json:"group"`
	TestModel *string `json:"test_model"`
}

func VendorSubmitChannel(c *gin.Context) {
	userId := c.GetInt("id")
	var req VendorSubmitChannelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	channel := &model.Channel{
		Name:        req.Name,
		Type:        req.Type,
		Key:         req.Key,
		BaseURL:     req.BaseURL,
		Models:      req.Models,
		Group:       req.Group,
		TestModel:   req.TestModel,
		Status:      common.ChannelStatusPendingReview,
		Source:      "vendor",
		SubmittedBy: userId,
		CreatedTime: common.GetTimestamp(),
	}
	if channel.Group == "" {
		channel.Group = "default"
	}
	if err := validateChannel(channel, true); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := channel.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	// 异步测试渠道连通性
	channelId := channel.Id
	testModelStr := ""
	if channel.TestModel != nil {
		testModelStr = *channel.TestModel
	}
	gopool.Go(func() {
		ch, err := model.GetChannelById(channelId, true)
		if err != nil {
			return
		}
		result := testChannel(ch, testModelStr, "", false)
		info := ch.GetOtherInfo()
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
		ch.SetOtherInfo(info)
		model.DB.Model(ch).Update("other_info", ch.OtherInfo)
	})
	// 清除 key 再返回
	channel.Key = ""
	common.ApiSuccess(c, channel)
}

func VendorGetMyChannels(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	channels, total, err := model.GetChannelsBySubmitter(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(channels)
	common.ApiSuccess(c, pageInfo)
}

func VendorGetChannel(c *gin.Context) {
	userId := c.GetInt("id")
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	channel, err := model.GetChannelById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if channel.SubmittedBy != userId {
		common.ApiErrorMsg(c, "无权访问该渠道")
		return
	}
	channel.Key = ""
	common.ApiSuccess(c, channel)
}

func VendorUpdateChannel(c *gin.Context) {
	userId := c.GetInt("id")
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	channel, err := model.GetChannelById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if channel.SubmittedBy != userId {
		common.ApiErrorMsg(c, "无权修改该渠道")
		return
	}
	if channel.Status != common.ChannelStatusPendingReview && channel.Status != common.ChannelStatusRejected {
		common.ApiErrorMsg(c, "只能编辑待审核或已拒绝的渠道")
		return
	}
	var req VendorUpdateChannelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	channel.Name = req.Name
	channel.Type = req.Type
	if req.Key != "" {
		channel.Key = req.Key
	}
	channel.BaseURL = req.BaseURL
	channel.Models = req.Models
	channel.TestModel = req.TestModel
	if req.Group != "" {
		channel.Group = req.Group
	}
	channel.Status = common.ChannelStatusPendingReview
	if err := validateChannel(channel, false); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := channel.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	channel.Key = ""
	common.ApiSuccess(c, channel)
}

func VendorDeleteChannel(c *gin.Context) {
	userId := c.GetInt("id")
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	channel, err := model.GetChannelById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if channel.SubmittedBy != userId {
		common.ApiErrorMsg(c, "无权删除该渠道")
		return
	}
	if channel.Status != common.ChannelStatusPendingReview && channel.Status != common.ChannelStatusRejected {
		common.ApiErrorMsg(c, fmt.Sprintf("只能删除待审核或已拒绝的渠道"))
		return
	}
	if err := channel.Delete(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
