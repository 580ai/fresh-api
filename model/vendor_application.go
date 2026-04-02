package model

import (
	"github.com/QuantumNous/new-api/common"
)

const (
	VendorAppStatusPending  = 1
	VendorAppStatusApproved = 2
	VendorAppStatusRejected = 3
)

type VendorApplication struct {
	Id          int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId      int    `json:"user_id" gorm:"index;not null"`
	CompanyName string `json:"company_name" gorm:"type:varchar(128);not null"`
	ContactInfo string `json:"contact_info" gorm:"type:varchar(255)"`
	Description string `json:"description" gorm:"type:text"`
	Status      int    `json:"status" gorm:"default:1"`
	AdminRemark string `json:"admin_remark" gorm:"type:text"`
	ReviewedBy  int    `json:"reviewed_by" gorm:"default:0"`
	CreatedTime int64  `json:"created_time" gorm:"bigint"`
	UpdatedTime int64  `json:"updated_time" gorm:"bigint"`
}

func (v *VendorApplication) Insert() error {
	now := common.GetTimestamp()
	v.CreatedTime = now
	v.UpdatedTime = now
	v.Status = VendorAppStatusPending
	return DB.Create(v).Error
}

func GetVendorApplicationByUserId(userId int) (*VendorApplication, error) {
	var app VendorApplication
	err := DB.Where("user_id = ?", userId).Order("id desc").First(&app).Error
	if err != nil {
		return nil, err
	}
	return &app, nil
}

func GetVendorApplicationById(id int) (*VendorApplication, error) {
	var app VendorApplication
	err := DB.First(&app, id).Error
	if err != nil {
		return nil, err
	}
	return &app, nil
}

func HasPendingVendorApplication(userId int) (bool, error) {
	var count int64
	err := DB.Model(&VendorApplication{}).Where("user_id = ? AND status = ?", userId, VendorAppStatusPending).Count(&count).Error
	return count > 0, err
}

func GetAllVendorApplications(status int, offset int, limit int) ([]*VendorApplication, int64, error) {
	var apps []*VendorApplication
	var total int64
	query := DB.Model(&VendorApplication{})
	if status > 0 {
		query = query.Where("status = ?", status)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("id desc").Offset(offset).Limit(limit).Find(&apps).Error
	return apps, total, err
}
