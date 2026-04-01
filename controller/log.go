package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
)

func GetAllLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	username := c.Query("username")
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	requestId := c.Query("request_id")
	logs, total, err := model.GetAllLogs(logType, startTimestamp, endTimestamp, modelName, username, tokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), channel, group, requestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

func GetUserLogs(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	userId := c.GetInt("id")
	userRole := c.GetInt("role")
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	group := c.Query("group")
	requestId := c.Query("request_id")
	logs, total, err := model.GetUserLogs(userId, logType, startTimestamp, endTimestamp, modelName, tokenName, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), group, requestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	// 普通用户脱敏 Other 字段中的渠道信息
	if userRole < common.RoleAdminUser {
		for i := range logs {
			if logs[i].Other != "" {
				otherMap, _ := common.StrToMap(logs[i].Other)
				if otherMap != nil {
					delete(otherMap, "channel_id")
					delete(otherMap, "channel_name")
					logs[i].Other = common.MapToJsonStr(otherMap)
				}
			}
		}
	}

	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(logs)
	common.ApiSuccess(c, pageInfo)
	return
}

// Deprecated: SearchAllLogs 已废弃，前端未使用该接口。
func SearchAllLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": "该接口已废弃",
	})
}

// Deprecated: SearchUserLogs 已废弃，前端未使用该接口。
func SearchUserLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": "该接口已废弃",
	})
}

func GetLogByKey(c *gin.Context) {
	tokenId := c.GetInt("token_id")
	if tokenId == 0 {
		c.JSON(200, gin.H{
			"success": false,
			"message": "无效的令牌",
		})
		return
	}
	logs, err := model.GetLogByTokenId(tokenId)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data":    logs,
	})
}

func GetLogsStat(c *gin.Context) {
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	username := c.Query("username")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	stat, err := model.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, "")
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": stat.Quota,
			"rpm":   stat.Rpm,
			"tpm":   stat.Tpm,
		},
	})
	return
}

func GetLogsSelfStat(c *gin.Context) {
	username := c.GetString("username")
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	quotaNum, err := model.SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	//tokenNum := model.SumUsedToken(logType, startTimestamp, endTimestamp, modelName, username, tokenName)
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota": quotaNum.Quota,
			"rpm":   quotaNum.Rpm,
			"tpm":   quotaNum.Tpm,
			//"token": tokenNum,
		},
	})
	return
}

func DeleteHistoryLogs(c *gin.Context) {
	targetTimestamp, _ := strconv.ParseInt(c.Query("target_timestamp"), 10, 64)
	if targetTimestamp == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "target timestamp is required",
		})
		return
	}
	count, err := model.DeleteOldLog(c.Request.Context(), targetTimestamp, 100)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
	return
}

func GetTokenDailyConsumption(c *gin.Context) {
	userId := c.GetInt("id")
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if startTimestamp == 0 || endTimestamp == 0 {
		c.JSON(200, gin.H{"success": false, "message": "start_timestamp and end_timestamp are required"})
		return
	}
	keyword := c.Query("keyword")
	sortField := c.Query("sort_field")
	sortOrder := c.Query("sort_order")
	if sortOrder != "" && sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "desc"
	}
	if sortField != "" && sortField != "total" {
		if _, err := strconv.ParseInt(sortField, 10, 64); err != nil {
			sortField = ""
		}
	}
	pageInfo := common.GetPageQuery(c)
	items, total, tokenIds, err := model.GetTokenDailyQuotaPaged(userId, startTimestamp, endTimestamp, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), keyword, sortField, sortOrder)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	tokenNameMap := make(map[int]string)
	if len(tokenIds) > 0 {
		type tokenNameRow struct {
			Id   int    `gorm:"column:id"`
			Name string `gorm:"column:name"`
		}
		var nameRows []tokenNameRow
		model.DB.Table("tokens").Select("id, name").Where("id IN ?", tokenIds).Find(&nameRows)
		for _, r := range nameRows {
			tokenNameMap[r.Id] = r.Name
		}
	}
	summary, _ := model.GetTokenDailyQuotaSummary(userId, startTimestamp, endTimestamp, keyword)
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"items":       items,
			"total":       total,
			"summary":     summary,
			"token_ids":   tokenIds,
			"token_names": tokenNameMap,
		},
	})
}

func ExportTokenDailyConsumption(c *gin.Context) {
	userId := c.GetInt("id")
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if startTimestamp == 0 || endTimestamp == 0 {
		c.JSON(200, gin.H{"success": false, "message": "start_timestamp and end_timestamp are required"})
		return
	}

	rows, err := model.GetTokenModelDailyQuotaAll(userId, startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	type tokenRow struct {
		Id   int    `gorm:"column:id"`
		Name string `gorm:"column:name"`
	}
	var allTokens []tokenRow
	model.DB.Table("tokens").Select("id, name").Where("user_id = ? AND deleted_at IS NULL", userId).Order("id ASC").Find(&allTokens)
	tokenNameMap := make(map[int]string, len(allTokens))
	for _, tk := range allTokens {
		tokenNameMap[tk.Id] = tk.Name
	}

	startTime := time.Unix(startTimestamp, 0).UTC()
	year, month := startTime.Year(), startTime.Month()
	daysInMonth := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()

	type modelDays struct {
		days  map[int]int
		total int
	}
	tokenModels := make(map[int]map[string]*modelDays)
	tokenModelOrder := make(map[int][]string)
	tokenModelSet := make(map[int]map[string]bool)

	for _, r := range rows {
		if tokenModels[r.TokenId] == nil {
			tokenModels[r.TokenId] = make(map[string]*modelDays)
			tokenModelSet[r.TokenId] = make(map[string]bool)
		}
		if tokenModels[r.TokenId][r.ModelName] == nil {
			tokenModels[r.TokenId][r.ModelName] = &modelDays{days: make(map[int]int)}
			if !tokenModelSet[r.TokenId][r.ModelName] {
				tokenModelOrder[r.TokenId] = append(tokenModelOrder[r.TokenId], r.ModelName)
				tokenModelSet[r.TokenId][r.ModelName] = true
			}
		}
		d := time.Unix(r.DayTimestamp, 0).UTC().Day()
		tokenModels[r.TokenId][r.ModelName].days[d] += r.Quota
		tokenModels[r.TokenId][r.ModelName].total += r.Quota
	}

	for tid := range tokenModelOrder {
		models := tokenModelOrder[tid]
		data := tokenModels[tid]
		for i := 0; i < len(models); i++ {
			for j := i + 1; j < len(models); j++ {
				if data[models[i]].total < data[models[j]].total {
					models[i], models[j] = models[j], models[i]
				}
			}
		}
	}

	f := excelize.NewFile()
	sheet := "Sheet1"

	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 10},
		Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"#E0E0E0"}},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
		Border: []excelize.Border{
			{Type: "bottom", Style: 1, Color: "#BDBDBD"},
		},
	})
	tokenSummaryStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 10},
		Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"#EEEEEE"}},
		Alignment: &excelize.Alignment{Horizontal: "right", Vertical: "center"},
	})
	tokenSummaryNameStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 10},
		Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"#EEEEEE"}},
		Alignment: &excelize.Alignment{Vertical: "center"},
	})
	grandSummaryStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 10},
		Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"#D6D6D6"}},
		Alignment: &excelize.Alignment{Horizontal: "right", Vertical: "center"},
	})
	grandSummaryNameStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 10},
		Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"#D6D6D6"}},
		Alignment: &excelize.Alignment{Vertical: "center"},
	})
	dimTokenNameStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Color: "#BDBDBD", Size: 10},
		Alignment: &excelize.Alignment{Vertical: "center"},
	})
	normalTokenNameStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Size: 10},
		Alignment: &excelize.Alignment{Vertical: "center"},
	})
	dataCellStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Size: 10},
		Alignment: &excelize.Alignment{Horizontal: "right", Vertical: "center"},
	})

	f.SetCellValue(sheet, "A1", "令牌名称")
	f.SetCellValue(sheet, "B1", "模型名称")
	for d := 1; d <= daysInMonth; d++ {
		col, _ := excelize.ColumnNumberToName(d + 2)
		f.SetCellValue(sheet, col+"1", d)
	}
	totalCol, _ := excelize.ColumnNumberToName(daysInMonth + 3)
	f.SetCellValue(sheet, totalCol+"1", "合计")

	lastCol, _ := excelize.ColumnNumberToName(daysInMonth + 3)
	f.SetCellStyle(sheet, "A1", lastCol+"1", headerStyle)

	f.SetColWidth(sheet, "A", "A", 20)
	f.SetColWidth(sheet, "B", "B", 22)

	row := 2
	grandDailyTotals := make(map[int]int)
	grandTotal := 0

	for _, tk := range allTokens {
		tokenName := tk.Name
		models := tokenModelOrder[tk.Id]
		data := tokenModels[tk.Id]

		if len(models) == 0 {
			f.SetCellValue(sheet, fmt.Sprintf("A%d", row), tokenName)
			f.SetCellStyle(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("A%d", row), normalTokenNameStyle)
			f.SetCellValue(sheet, fmt.Sprintf("B%d", row), "-")
			for d := 1; d <= daysInMonth; d++ {
				col, _ := excelize.ColumnNumberToName(d + 2)
				f.SetCellValue(sheet, fmt.Sprintf("%s%d", col, row), 0)
				f.SetCellStyle(sheet, fmt.Sprintf("%s%d", col, row), fmt.Sprintf("%s%d", col, row), dataCellStyle)
			}
			f.SetCellValue(sheet, fmt.Sprintf("%s%d", totalCol, row), 0)
			f.SetCellStyle(sheet, fmt.Sprintf("%s%d", totalCol, row), fmt.Sprintf("%s%d", totalCol, row), dataCellStyle)
			row++
			continue
		}

		tokenDailyTotals := make(map[int]int)
		tokenTotal := 0
		for _, modelName := range models {
			md := data[modelName]
			for d := 1; d <= daysInMonth; d++ {
				tokenDailyTotals[d] += md.days[d]
			}
			tokenTotal += md.total
		}

		f.SetCellValue(sheet, fmt.Sprintf("A%d", row), tokenName)
		f.SetCellStyle(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("A%d", row), tokenSummaryNameStyle)
		f.SetCellValue(sheet, fmt.Sprintf("B%d", row), "Total")
		f.SetCellStyle(sheet, fmt.Sprintf("B%d", row), fmt.Sprintf("B%d", row), tokenSummaryNameStyle)
		for d := 1; d <= daysInMonth; d++ {
			col, _ := excelize.ColumnNumberToName(d + 2)
			f.SetCellValue(sheet, fmt.Sprintf("%s%d", col, row), float64(tokenDailyTotals[d])/common.QuotaPerUnit)
			f.SetCellStyle(sheet, fmt.Sprintf("%s%d", col, row), fmt.Sprintf("%s%d", col, row), tokenSummaryStyle)
		}
		f.SetCellValue(sheet, fmt.Sprintf("%s%d", totalCol, row), float64(tokenTotal)/common.QuotaPerUnit)
		f.SetCellStyle(sheet, fmt.Sprintf("%s%d", totalCol, row), fmt.Sprintf("%s%d", totalCol, row), tokenSummaryStyle)
		row++

		isFirstModelRow := false
		for _, modelName := range models {
			md := data[modelName]
			f.SetCellValue(sheet, fmt.Sprintf("A%d", row), tokenName)
			if isFirstModelRow {
				f.SetCellStyle(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("A%d", row), normalTokenNameStyle)
				isFirstModelRow = false
			} else {
				f.SetCellStyle(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("A%d", row), dimTokenNameStyle)
			}
			f.SetCellValue(sheet, fmt.Sprintf("B%d", row), modelName)

			for d := 1; d <= daysInMonth; d++ {
				val := md.days[d]
				col, _ := excelize.ColumnNumberToName(d + 2)
				f.SetCellValue(sheet, fmt.Sprintf("%s%d", col, row), float64(val)/common.QuotaPerUnit)
				f.SetCellStyle(sheet, fmt.Sprintf("%s%d", col, row), fmt.Sprintf("%s%d", col, row), dataCellStyle)
			}
			f.SetCellValue(sheet, fmt.Sprintf("%s%d", totalCol, row), float64(md.total)/common.QuotaPerUnit)
			f.SetCellStyle(sheet, fmt.Sprintf("%s%d", totalCol, row), fmt.Sprintf("%s%d", totalCol, row), dataCellStyle)
			row++
		}

		for d, v := range tokenDailyTotals {
			grandDailyTotals[d] += v
		}
		grandTotal += tokenTotal
	}

	f.SetCellValue(sheet, fmt.Sprintf("A%d", row), "合计")
	f.SetCellStyle(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("A%d", row), grandSummaryNameStyle)
	f.SetCellValue(sheet, fmt.Sprintf("B%d", row), "Total")
	f.SetCellStyle(sheet, fmt.Sprintf("B%d", row), fmt.Sprintf("B%d", row), grandSummaryNameStyle)
	for d := 1; d <= daysInMonth; d++ {
		col, _ := excelize.ColumnNumberToName(d + 2)
		f.SetCellValue(sheet, fmt.Sprintf("%s%d", col, row), float64(grandDailyTotals[d])/common.QuotaPerUnit)
		f.SetCellStyle(sheet, fmt.Sprintf("%s%d", col, row), fmt.Sprintf("%s%d", col, row), grandSummaryStyle)
	}
	f.SetCellValue(sheet, fmt.Sprintf("%s%d", totalCol, row), float64(grandTotal)/common.QuotaPerUnit)
	f.SetCellStyle(sheet, fmt.Sprintf("%s%d", totalCol, row), fmt.Sprintf("%s%d", totalCol, row), grandSummaryStyle)

	filename := fmt.Sprintf("token_consumption_%d-%02d.xlsx", year, month)
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	f.Write(c.Writer)
}

// GetTokenModelDailyConsumption 获取某 Token 的模型维度消耗预览（Top 3 + 其余汇总）
func GetTokenModelDailyConsumption(c *gin.Context) {
	userId := c.GetInt("id")
	tokenId, err := strconv.Atoi(c.Query("token_id"))
	if err != nil || tokenId == 0 {
		c.JSON(200, gin.H{"success": false, "message": "token_id is required"})
		return
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if startTimestamp == 0 || endTimestamp == 0 {
		c.JSON(200, gin.H{"success": false, "message": "start_timestamp and end_timestamp are required"})
		return
	}

	result, err := model.GetTokenModelDailyQuota(userId, tokenId, startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data":    result,
	})
}

// GetTokenModelFullConsumption 获取某 Token 的全量模型消耗列表（抽屉用）
func GetTokenModelFullConsumption(c *gin.Context) {
	userId := c.GetInt("id")
	tokenId, err := strconv.Atoi(c.Query("token_id"))
	if err != nil || tokenId == 0 {
		c.JSON(200, gin.H{"success": false, "message": "token_id is required"})
		return
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if startTimestamp == 0 || endTimestamp == 0 {
		c.JSON(200, gin.H{"success": false, "message": "start_timestamp and end_timestamp are required"})
		return
	}
	sortBy := c.Query("sort_by")
	sortOrder := c.Query("sort_order")

	results, err := model.GetTokenModelFullList(userId, tokenId, startTimestamp, endTimestamp, sortBy, sortOrder)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "",
		"data":    results,
	})
}

// BackfillTokenDailyStat 回填历史消耗统计数据（管理员接口）
// 用于首次部署或日志删除后重建统计数据
func BackfillTokenDailyStat(c *gin.Context) {
	days, err := strconv.Atoi(c.Query("days"))
	if err != nil || days <= 0 {
		days = 30 // 默认回填30天
	}
	if days > 365 {
		days = 365 // 最多回填一年
	}

	go func() {
		common.SysLog(fmt.Sprintf("[TokenDailyStat] 开始回填 %d 天的数据...", days))
		if err := model.BackfillTokenDailyStat(days); err != nil {
			common.SysError(fmt.Sprintf("[TokenDailyStat] 回填失败: %s", err.Error()))
		} else {
			common.SysLog(fmt.Sprintf("[TokenDailyStat] 回填 %d 天数据完成", days))
		}
	}()

	c.JSON(200, gin.H{
		"success": true,
		"message": fmt.Sprintf("已开始后台回填 %d 天的数据，请查看日志了解进度", days),
	})
}
