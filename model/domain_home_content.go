package model

type DomainHomeContent struct {
	ID      int    `json:"id" gorm:"primaryKey"`
	Domain  string `json:"domain" gorm:"uniqueIndex;type:varchar(255);not null"`
	Content string `json:"content" gorm:"type:text"`
}

func GetDomainHomeContent(domain string) (*DomainHomeContent, error) {
	var content DomainHomeContent
	err := DB.Where("domain = ?", domain).First(&content).Error
	if err != nil {
		return nil, err
	}
	return &content, nil
}

func GetAllDomainHomeContents() ([]*DomainHomeContent, error) {
	var contents []*DomainHomeContent
	err := DB.Order("id ASC").Find(&contents).Error
	return contents, err
}

func CreateDomainHomeContent(content *DomainHomeContent) error {
	return DB.Create(content).Error
}

func UpdateDomainHomeContent(content *DomainHomeContent) error {
	return DB.Save(content).Error
}

func DeleteDomainHomeContent(id int) error {
	return DB.Delete(&DomainHomeContent{}, id).Error
}
