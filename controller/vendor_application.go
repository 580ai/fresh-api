package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

type SubmitVendorApplicationRequest struct {
	CompanyName string `json:"company_name" binding:"required"`
	ContactInfo string `json:"contact_info"`
	Description string `json:"description"`
}

type ReviewVendorApplicationRequest struct {
	Id          int    `json:"id" binding:"required"`
	Status      int    `json:"status" binding:"required"`
	AdminRemark string `json:"admin_remark"`
}

func SubmitVendorApplication(c *gin.Context) {
	userId := c.GetInt("id")
	role := c.GetInt("role")
	if role >= common.RoleVendor {
		common.ApiErrorMsg(c, "您已经是供应商或更高权限用户")
		return
	}
	hasPending, err := model.HasPendingVendorApplication(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if hasPending {
		common.ApiErrorMsg(c, "您已有待审核的申请")
		return
	}
	var req SubmitVendorApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	app := &model.VendorApplication{
		UserId:      userId,
		CompanyName: req.CompanyName,
		ContactInfo: req.ContactInfo,
		Description: req.Description,
	}
	if err := app.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, app)
}

func GetMyVendorApplication(c *gin.Context) {
	userId := c.GetInt("id")
	app, err := model.GetVendorApplicationByUserId(userId)
	if err != nil {
		common.ApiSuccess(c, nil)
		return
	}
	common.ApiSuccess(c, app)
}

func GetAllVendorApplicationsAdmin(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	status, _ := strconv.Atoi(c.Query("status"))
	apps, total, err := model.GetAllVendorApplications(status, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(apps)
	common.ApiSuccess(c, pageInfo)
}

func ReviewVendorApplication(c *gin.Context) {
	var req ReviewVendorApplicationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.Status != model.VendorAppStatusApproved && req.Status != model.VendorAppStatusRejected {
		common.ApiErrorMsg(c, "无效的审核状态")
		return
	}
	app, err := model.GetVendorApplicationById(req.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if app.Status != model.VendorAppStatusPending {
		common.ApiErrorMsg(c, "该申请已被审核")
		return
	}
	adminId := c.GetInt("id")
	app.Status = req.Status
	app.AdminRemark = req.AdminRemark
	app.ReviewedBy = adminId
	app.UpdatedTime = common.GetTimestamp()
	if err := model.DB.Save(app).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	if req.Status == model.VendorAppStatusApproved {
		if err := model.DB.Model(&model.User{}).Where("id = ?", app.UserId).Update("role", common.RoleVendor).Error; err != nil {
			common.ApiError(c, err)
			return
		}
	}
	common.ApiSuccess(c, app)
}
