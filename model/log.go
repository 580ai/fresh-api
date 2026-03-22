package model

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"

	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
)

type Log struct {
	Id               int    `json:"id" gorm:"index:idx_created_at_id,priority:1;index:idx_user_id_id,priority:2"`
	UserId           int    `json:"user_id" gorm:"index;index:idx_user_id_id,priority:1"`
	CreatedAt        int64  `json:"created_at" gorm:"bigint;index:idx_created_at_id,priority:2;index:idx_created_at_type"`
	Type             int    `json:"type" gorm:"index:idx_created_at_type"`
	Content          string `json:"content"`
	Username         string `json:"username" gorm:"index;index:index_username_model_name,priority:2;default:''"`
	TokenName        string `json:"token_name" gorm:"index;default:''"`
	ModelName        string `json:"model_name" gorm:"index;index:index_username_model_name,priority:1;default:''"`
	Quota            int    `json:"quota" gorm:"default:0"`
	PromptTokens     int    `json:"prompt_tokens" gorm:"default:0"`
	CompletionTokens int    `json:"completion_tokens" gorm:"default:0"`
	UseTime          int    `json:"use_time" gorm:"default:0"`
	IsStream         bool   `json:"is_stream"`
	ChannelId        int    `json:"channel" gorm:"index"`
	ChannelName      string `json:"channel_name" gorm:"->"`
	TokenId          int    `json:"token_id" gorm:"default:0;index"`
	Group            string `json:"group" gorm:"index"`
	Ip               string `json:"ip" gorm:"index;default:''"`
	RequestId        string `json:"request_id,omitempty" gorm:"type:varchar(64);index:idx_logs_request_id;default:''"`
	Other            string `json:"other"`
}

// don't use iota, avoid change log type value
const (
	LogTypeUnknown = 0
	LogTypeTopup   = 1
	LogTypeConsume = 2
	LogTypeManage  = 3
	LogTypeSystem  = 4
	LogTypeError   = 5
	LogTypeRefund  = 6
)

func formatUserLogs(logs []*Log, startIdx int) {
	for i := range logs {
		logs[i].ChannelName = ""
		var otherMap map[string]interface{}
		otherMap, _ = common.StrToMap(logs[i].Other)
		if otherMap != nil {
			// Remove admin-only debug fields.
			delete(otherMap, "admin_info")
			delete(otherMap, "reject_reason")
		}
		logs[i].Other = common.MapToJsonStr(otherMap)
		logs[i].Id = startIdx + i + 1
	}
}

func GetLogByTokenId(tokenId int) (logs []*Log, err error) {
	err = LOG_DB.Model(&Log{}).Where("token_id = ?", tokenId).Order("id desc").Limit(common.MaxRecentItems).Find(&logs).Error
	formatUserLogs(logs, 0)
	return logs, err
}

func RecordLog(userId int, logType int, content string) {
	if logType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(userId, false)
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      logType,
		Content:   content,
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		common.SysLog("failed to record log: " + err.Error())
	}
}

func RecordErrorLog(c *gin.Context, userId int, channelId int, modelName string, tokenName string, content string, tokenId int, useTimeSeconds int,
	isStream bool, group string, other map[string]interface{}) {
	logger.LogInfo(c, fmt.Sprintf("record error log: userId=%d, channelId=%d, modelName=%s, tokenName=%s, content=%s", userId, channelId, modelName, tokenName, content))
	username := c.GetString("username")
	requestId := c.GetString(common.RequestIdKey)
	otherStr := common.MapToJsonStr(other)
	// 判断是否需要记录 IP
	needRecordIp := false
	if settingMap, err := GetUserSetting(userId, false); err == nil {
		if settingMap.RecordIpLog {
			needRecordIp = true
		}
	}
	log := &Log{
		UserId:           userId,
		Username:         username,
		CreatedAt:        common.GetTimestamp(),
		Type:             LogTypeError,
		Content:          content,
		PromptTokens:     0,
		CompletionTokens: 0,
		TokenName:        tokenName,
		ModelName:        modelName,
		Quota:            0,
		ChannelId:        channelId,
		TokenId:          tokenId,
		UseTime:          useTimeSeconds,
		IsStream:         isStream,
		Group:            group,
		Ip: func() string {
			if needRecordIp {
				return c.ClientIP()
			}
			return ""
		}(),
		RequestId: requestId,
		Other:     otherStr,
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		logger.LogError(c, "failed to record log: "+err.Error())
	}
}

type RecordConsumeLogParams struct {
	ChannelId        int                    `json:"channel_id"`
	PromptTokens     int                    `json:"prompt_tokens"`
	CompletionTokens int                    `json:"completion_tokens"`
	ModelName        string                 `json:"model_name"`
	TokenName        string                 `json:"token_name"`
	Quota            int                    `json:"quota"`
	Content          string                 `json:"content"`
	TokenId          int                    `json:"token_id"`
	UseTimeSeconds   int                    `json:"use_time_seconds"`
	IsStream         bool                   `json:"is_stream"`
	Group            string                 `json:"group"`
	Other            map[string]interface{} `json:"other"`
	RequestBody      string                 `json:"request_body,omitempty"`  // 请求内容
	ResponseBody     string                 `json:"response_body,omitempty"` // 响应内容
}

func RecordConsumeLog(c *gin.Context, userId int, params RecordConsumeLogParams) {
	if !common.LogConsumeEnabled {
		return
	}
	username := c.GetString("username")
	requestId := c.GetString(common.RequestIdKey)
	otherStr := common.MapToJsonStr(params.Other)
	// 判断是否需要记录 IP
	needRecordIp := false
	if settingMap, err := GetUserSetting(userId, false); err == nil {
		if settingMap.RecordIpLog {
			needRecordIp = true
		}
	}
	log := &Log{
		UserId:           userId,
		Username:         username,
		CreatedAt:        common.GetTimestamp(),
		Type:             LogTypeConsume,
		Content:          params.Content,
		PromptTokens:     params.PromptTokens,
		CompletionTokens: params.CompletionTokens,
		TokenName:        params.TokenName,
		ModelName:        params.ModelName,
		Quota:            params.Quota,
		ChannelId:        params.ChannelId,
		TokenId:          params.TokenId,
		UseTime:          params.UseTimeSeconds,
		IsStream:         params.IsStream,
		Group:            params.Group,
		Ip: func() string {
			if needRecordIp {
				return c.ClientIP()
			}
			return ""
		}(),
		RequestId: requestId,
		Other:     otherStr,
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		logger.LogError(c, "failed to record log: "+err.Error())
	}
	// 记录请求和响应内容到文件（按令牌分文件）
	if err == nil {
		RecordLogContent(userId, params.TokenName, requestId, params.RequestBody, params.ResponseBody)
	}
	if common.DataExportEnabled {
		gopool.Go(func() {
			LogQuotaData(userId, username, params.ModelName, params.Quota, common.GetTimestamp(), params.PromptTokens+params.CompletionTokens)
		})
	}
}

type RecordTaskBillingLogParams struct {
	UserId    int
	LogType   int
	Content   string
	ChannelId int
	ModelName string
	Quota     int
	TokenId   int
	Group     string
	Other     map[string]interface{}
}

func RecordTaskBillingLog(params RecordTaskBillingLogParams) {
	if params.LogType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(params.UserId, false)
	tokenName := ""
	if params.TokenId > 0 {
		if token, err := GetTokenById(params.TokenId); err == nil {
			tokenName = token.Name
		}
	}
	log := &Log{
		UserId:    params.UserId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      params.LogType,
		Content:   params.Content,
		TokenName: tokenName,
		ModelName: params.ModelName,
		Quota:     params.Quota,
		ChannelId: params.ChannelId,
		TokenId:   params.TokenId,
		Group:     params.Group,
		Other:     common.MapToJsonStr(params.Other),
	}
	err := LOG_DB.Create(log).Error
	if err != nil {
		common.SysLog("failed to record task billing log: " + err.Error())
	}
}

func GetAllLogs(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, startIdx int, num int, channel int, group string, requestId string) (logs []*Log, total int64, err error) {
	var tx *gorm.DB
	if logType == LogTypeUnknown {
		tx = LOG_DB
	} else {
		tx = LOG_DB.Where("logs.type = ?", logType)
	}

	if modelName != "" {
		tx = tx.Where("logs.model_name like ?", modelName)
	}
	if username != "" {
		tx = tx.Where("logs.username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("logs.token_name = ?", tokenName)
	}
	if requestId != "" {
		tx = tx.Where("logs.request_id = ?", requestId)
	}
	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}
	if channel != 0 {
		tx = tx.Where("logs.channel_id = ?", channel)
	}
	if group != "" {
		tx = tx.Where("logs."+logGroupCol+" = ?", group)
	}
	err = tx.Model(&Log{}).Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	err = tx.Order("logs.id desc").Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		return nil, 0, err
	}

	channelIds := types.NewSet[int]()
	for _, log := range logs {
		if log.ChannelId != 0 {
			channelIds.Add(log.ChannelId)
		}
	}

	if channelIds.Len() > 0 {
		var channels []struct {
			Id   int    `gorm:"column:id"`
			Name string `gorm:"column:name"`
		}
		if common.MemoryCacheEnabled {
			// Cache get channel
			for _, channelId := range channelIds.Items() {
				if cacheChannel, err := CacheGetChannel(channelId); err == nil {
					channels = append(channels, struct {
						Id   int    `gorm:"column:id"`
						Name string `gorm:"column:name"`
					}{
						Id:   channelId,
						Name: cacheChannel.Name,
					})
				}
			}
		} else {
			// Bulk query channels from DB
			if err = DB.Table("channels").Select("id, name").Where("id IN ?", channelIds.Items()).Find(&channels).Error; err != nil {
				return logs, total, err
			}
		}
		channelMap := make(map[int]string, len(channels))
		for _, channel := range channels {
			channelMap[channel.Id] = channel.Name
		}
		for i := range logs {
			logs[i].ChannelName = channelMap[logs[i].ChannelId]
		}
	}

	return logs, total, err
}

const logSearchCountLimit = 10000

func GetUserLogs(userId int, logType int, startTimestamp int64, endTimestamp int64, modelName string, tokenName string, startIdx int, num int, group string, requestId string) (logs []*Log, total int64, err error) {
	var tx *gorm.DB
	if logType == LogTypeUnknown {
		tx = LOG_DB.Where("logs.user_id = ?", userId)
	} else {
		tx = LOG_DB.Where("logs.user_id = ? and logs.type = ?", userId, logType)
	}

	if modelName != "" {
		modelNamePattern, err := sanitizeLikePattern(modelName)
		if err != nil {
			return nil, 0, err
		}
		tx = tx.Where("logs.model_name LIKE ? ESCAPE '!'", modelNamePattern)
	}
	if tokenName != "" {
		tx = tx.Where("logs.token_name = ?", tokenName)
	}
	if requestId != "" {
		tx = tx.Where("logs.request_id = ?", requestId)
	}
	if startTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", endTimestamp)
	}
	if group != "" {
		tx = tx.Where("logs."+logGroupCol+" = ?", group)
	}
	err = tx.Model(&Log{}).Limit(logSearchCountLimit).Count(&total).Error
	if err != nil {
		common.SysError("failed to count user logs: " + err.Error())
		return nil, 0, errors.New("查询日志失败")
	}
	err = tx.Order("logs.id desc").Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		common.SysError("failed to search user logs: " + err.Error())
		return nil, 0, errors.New("查询日志失败")
	}

	formatUserLogs(logs, startIdx)
	return logs, total, err
}

type Stat struct {
	Quota int `json:"quota"`
	Rpm   int `json:"rpm"`
	Tpm   int `json:"tpm"`
}

func SumUsedQuota(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, channel int, group string) (stat Stat, err error) {
	tx := LOG_DB.Table("logs").Select("sum(quota) quota")

	// 为rpm和tpm创建单独的查询
	rpmTpmQuery := LOG_DB.Table("logs").Select("count(*) rpm, sum(prompt_tokens) + sum(completion_tokens) tpm")

	if username != "" {
		tx = tx.Where("username = ?", username)
		rpmTpmQuery = rpmTpmQuery.Where("username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
		rpmTpmQuery = rpmTpmQuery.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if modelName != "" {
		modelNamePattern, err := sanitizeLikePattern(modelName)
		if err != nil {
			return stat, err
		}
		tx = tx.Where("model_name LIKE ? ESCAPE '!'", modelNamePattern)
		rpmTpmQuery = rpmTpmQuery.Where("model_name LIKE ? ESCAPE '!'", modelNamePattern)
	}
	if channel != 0 {
		tx = tx.Where("channel_id = ?", channel)
		rpmTpmQuery = rpmTpmQuery.Where("channel_id = ?", channel)
	}
	if group != "" {
		tx = tx.Where(logGroupCol+" = ?", group)
		rpmTpmQuery = rpmTpmQuery.Where(logGroupCol+" = ?", group)
	}

	tx = tx.Where("type = ?", LogTypeConsume)
	rpmTpmQuery = rpmTpmQuery.Where("type = ?", LogTypeConsume)

	// 只统计最近60秒的rpm和tpm
	rpmTpmQuery = rpmTpmQuery.Where("created_at >= ?", time.Now().Add(-60*time.Second).Unix())

	// 执行查询
	if err := tx.Scan(&stat).Error; err != nil {
		common.SysError("failed to query log stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}
	if err := rpmTpmQuery.Scan(&stat).Error; err != nil {
		common.SysError("failed to query rpm/tpm stat: " + err.Error())
		return stat, errors.New("查询统计数据失败")
	}

	return stat, nil
}

func SumUsedToken(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string) (token int) {
	tx := LOG_DB.Table("logs").Select("ifnull(sum(prompt_tokens),0) + ifnull(sum(completion_tokens),0)")
	if username != "" {
		tx = tx.Where("username = ?", username)
	}
	if tokenName != "" {
		tx = tx.Where("token_name = ?", tokenName)
	}
	if startTimestamp != 0 {
		tx = tx.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		tx = tx.Where("created_at <= ?", endTimestamp)
	}
	if modelName != "" {
		tx = tx.Where("model_name = ?", modelName)
	}
	tx.Where("type = ?", LogTypeConsume).Scan(&token)
	return token
}

func DeleteOldLog(ctx context.Context, targetTimestamp int64, limit int) (int64, error) {
	var total int64 = 0

	for {
		if nil != ctx.Err() {
			return total, ctx.Err()
		}

		result := LOG_DB.Where("created_at < ?", targetTimestamp).Limit(limit).Delete(&Log{})
		if nil != result.Error {
			return total, result.Error
		}

		total += result.RowsAffected

		if result.RowsAffected < int64(limit) {
			break
		}
	}

	return total, nil
}

// ChannelStatsResult 渠道统计结果
type ChannelStatsResult struct {
	TotalCount   int
	SuccessCount int
	FailCount    int
	TimeoutCount int
}

// GetChannelStatsFromLogs 从日志中获取渠道统计数据（最近24小时）
func GetChannelStatsFromLogs() (map[int]*ChannelStatsResult, error) {
	// 最近24小时的时间戳
	startTime := time.Now().Add(-24 * time.Hour).Unix()

	// 查询消费日志统计
	type consumeStats struct {
		ChannelId int
		Total     int
	}
	var consumeResults []consumeStats
	err := LOG_DB.Model(&Log{}).
		Select("channel_id, COUNT(*) as total").
		Where("type = ? AND created_at >= ? AND channel_id > 0", LogTypeConsume, startTime).
		Group("channel_id").
		Scan(&consumeResults).Error
	if err != nil {
		return nil, err
	}

	// 查询错误日志统计
	type errorStats struct {
		ChannelId int
		Total     int
	}
	var errorResults []errorStats
	err = LOG_DB.Model(&Log{}).
		Select("channel_id, COUNT(*) as total").
		Where("type = ? AND created_at >= ? AND channel_id > 0", LogTypeError, startTime).
		Group("channel_id").
		Scan(&errorResults).Error
	if err != nil {
		return nil, err
	}

	// 合并统计结果
	results := make(map[int]*ChannelStatsResult)

	// 处理消费日志（成功的请求）
	for _, r := range consumeResults {
		if _, ok := results[r.ChannelId]; !ok {
			results[r.ChannelId] = &ChannelStatsResult{}
		}
		results[r.ChannelId].SuccessCount = r.Total
		results[r.ChannelId].TotalCount += r.Total
	}

	// 处理错误日志（失败的请求）
	for _, r := range errorResults {
		if _, ok := results[r.ChannelId]; !ok {
			results[r.ChannelId] = &ChannelStatsResult{}
		}
		results[r.ChannelId].FailCount = r.Total
		results[r.ChannelId].TotalCount += r.Total
	}

	// 注意：超时统计需要根据实际业务逻辑来判断
	// 这里暂时将超时计入失败数，如果有专门的超时标记字段可以单独统计

	return results, nil
}

// GetAllChannelStatsFromLogs 从日志中获取所有渠道统计数据（包括禁用的渠道，最近24小时）
func GetAllChannelStatsFromLogs() (map[int]*ChannelStatsResult, error) {
	return GetChannelStatsFromLogs()
}

// ==================== 令牌消耗统计功能 ====================

// TokenDailyQuota 令牌每日消耗聚合
type TokenDailyQuota struct {
	TokenId      int    `json:"token_id"`
	TokenName    string `json:"token_name"`
	DayTimestamp int64  `json:"day_timestamp"`
	Quota        int    `json:"quota"`
}

// GetTokenDailyQuotaPaged 分页查询：先查所有令牌（分页），再查消耗数据
// 采用混合查询策略：历史数据从 token_daily_stats 表查询，今日数据实时从 logs 表查询
func GetTokenDailyQuotaPaged(userId int, startTimestamp int64, endTimestamp int64, startIdx int, pageSize int, keyword string, sortField string, sortOrder string) (items []TokenDailyQuota, total int64, tokenIds []int, err error) {
	// 1. 从 tokens 表查该用户的令牌总数
	tokenQuery := DB.Table("tokens").Where("user_id = ? AND deleted_at IS NULL", userId)
	if keyword != "" {
		tokenQuery = tokenQuery.Where("name LIKE ?", "%"+keyword+"%")
	}
	err = tokenQuery.Count(&total).Error
	if err != nil {
		return
	}

	// 2. 获取分页的 token 列表（暂时保持原有逻辑，排序可能需要后续优化）
	if sortField != "" {
		if sortOrder == "" {
			sortOrder = "desc"
		}
		// 按消耗排序：LEFT JOIN logs 聚合（仅用于排序，实际数据从混合查询获取）
		var selectExpr string
		if sortField == "total" {
			selectExpr = "t.id as token_id, COALESCE(SUM(l.quota), 0) as sort_val"
		} else {
			dayExpr := DayTimestampExpr("l.created_at")
			selectExpr = "t.id as token_id, COALESCE(SUM(CASE WHEN " + dayExpr + " = " + sortField + " THEN l.quota ELSE 0 END), 0) as sort_val"
		}

		// args 顺序: JOIN条件(user_id, type, start, end) → WHERE条件(user_id, [keyword]) → LIMIT, OFFSET
		args := []interface{}{userId, LogTypeConsume, startTimestamp, endTimestamp, userId}
		keywordClause := ""
		if keyword != "" {
			keywordClause = " AND t.name LIKE ?"
			args = append(args, "%"+keyword+"%")
		}
		args = append(args, pageSize, startIdx)

		raw := "SELECT " + selectExpr +
			" FROM tokens t LEFT JOIN logs l ON t.id = l.token_id AND l.user_id = ? AND l.type = ? AND l.created_at >= ? AND l.created_at <= ?" +
			" WHERE t.user_id = ? AND t.deleted_at IS NULL" + keywordClause +
			" GROUP BY t.id ORDER BY sort_val " + sortOrder + ", t.id DESC LIMIT ? OFFSET ?"

		type sortRow struct {
			TokenId int `gorm:"column:token_id"`
		}
		var rows []sortRow
		err = DB.Raw(raw, args...).Scan(&rows).Error
		if err != nil {
			return
		}
		for _, r := range rows {
			tokenIds = append(tokenIds, r.TokenId)
		}
	} else {
		// 无排序：直接从 tokens 表按 id 分页（与令牌列表保持一致，按 id desc 排序）
		tq := DB.Table("tokens").Where("user_id = ? AND deleted_at IS NULL", userId)
		if keyword != "" {
			tq = tq.Where("name LIKE ?", "%"+keyword+"%")
		}
		err = tq.Order("id DESC").Offset(startIdx).Limit(pageSize).Pluck("id", &tokenIds).Error
		if err != nil || len(tokenIds) == 0 {
			return
		}
	}

	if len(tokenIds) == 0 {
		return
	}

	// 3. 混合查询：历史数据从 token_daily_stats 表，今日数据从 logs 表实时查询
	items, err = getTokenDailyQuotaHybrid(userId, tokenIds, startTimestamp, endTimestamp)
	return
}

// getTokenDailyQuotaHybrid 混合查询：历史数据从 token_daily_stats 表，今日数据从 logs 表
func getTokenDailyQuotaHybrid(userId int, tokenIds []int, startTimestamp int64, endTimestamp int64) ([]TokenDailyQuota, error) {
	todayStart := GetTodayStartTimestamp()
	var items []TokenDailyQuota

	// 情况1：查询范围完全在今天之前，只查统计表
	if endTimestamp < todayStart {
		stats, err := GetTokenDailyStatFromTable(userId, tokenIds, startTimestamp, endTimestamp)
		if err != nil {
			return nil, err
		}
		for _, s := range stats {
			items = append(items, TokenDailyQuota{
				TokenId:      s.TokenId,
				TokenName:    s.TokenName,
				DayTimestamp: s.DayTimestamp,
				Quota:        s.Quota,
			})
		}
		return items, nil
	}

	// 情况2：查询范围完全在今天，只查 logs 表
	if startTimestamp >= todayStart {
		return getTokenDailyQuotaFromLogs(userId, tokenIds, startTimestamp, endTimestamp)
	}

	// 情况3：查询范围跨越今天，需要合并两个数据源
	// 3.1 查询历史数据（今天之前）
	historyEnd := todayStart - 1
	stats, err := GetTokenDailyStatFromTable(userId, tokenIds, startTimestamp, historyEnd)
	if err != nil {
		return nil, err
	}
	for _, s := range stats {
		items = append(items, TokenDailyQuota{
			TokenId:      s.TokenId,
			TokenName:    s.TokenName,
			DayTimestamp: s.DayTimestamp,
			Quota:        s.Quota,
		})
	}

	// 3.2 查询今日数据（实时）
	todayItems, err := getTokenDailyQuotaFromLogs(userId, tokenIds, todayStart, endTimestamp)
	if err != nil {
		return nil, err
	}
	items = append(items, todayItems...)

	return items, nil
}

// getTokenDailyQuotaFromLogs 从 logs 表实时查询每日消耗数据
func getTokenDailyQuotaFromLogs(userId int, tokenIds []int, startTimestamp int64, endTimestamp int64) ([]TokenDailyQuota, error) {
	var items []TokenDailyQuota
	err := LOG_DB.Table("logs").
		Select("token_id, token_name, "+DayTimestampExpr("created_at")+" as day_timestamp, SUM(quota) as quota").
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at <= ? AND token_id IN ?",
			userId, LogTypeConsume, startTimestamp, endTimestamp, tokenIds).
		Group("token_id, token_name, " + DayTimestampExpr("created_at")).
		Order("token_id ASC, day_timestamp ASC").
		Find(&items).Error
	return items, err
}

// GetTokenDailyQuotaSummary 全量每日总计（不分页，用于底部汇总行）
// 只统计现存令牌的消耗，排除已删除令牌
// 采用混合查询策略：历史数据从 token_daily_stats 表查询，今日数据实时从 logs 表查询
func GetTokenDailyQuotaSummary(userId int, startTimestamp int64, endTimestamp int64, keyword string) ([]TokenDailyQuota, error) {
	// 先获取该用户所有现存令牌的 ID
	var existingTokenIds []int
	tokenQuery := DB.Table("tokens").Where("user_id = ? AND deleted_at IS NULL", userId)
	if keyword != "" {
		tokenQuery = tokenQuery.Where("name LIKE ?", "%"+keyword+"%")
	}
	if err := tokenQuery.Pluck("id", &existingTokenIds).Error; err != nil {
		return nil, err
	}
	if len(existingTokenIds) == 0 {
		return []TokenDailyQuota{}, nil
	}

	todayStart := GetTodayStartTimestamp()

	// 情况1：查询范围完全在今天之前，只查统计表
	if endTimestamp < todayStart {
		return getTokenDailyQuotaSummaryFromStats(userId, existingTokenIds, startTimestamp, endTimestamp)
	}

	// 情况2：查询范围完全在今天，只查 logs 表
	if startTimestamp >= todayStart {
		return getTokenDailyQuotaSummaryFromLogs(userId, existingTokenIds, startTimestamp, endTimestamp)
	}

	// 情况3：查询范围跨越今天，需要合并两个数据源
	var results []TokenDailyQuota

	// 3.1 查询历史数据（今天之前）
	historyEnd := todayStart - 1
	historyItems, err := getTokenDailyQuotaSummaryFromStats(userId, existingTokenIds, startTimestamp, historyEnd)
	if err != nil {
		return nil, err
	}
	results = append(results, historyItems...)

	// 3.2 查询今日数据（实时）
	todayItems, err := getTokenDailyQuotaSummaryFromLogs(userId, existingTokenIds, todayStart, endTimestamp)
	if err != nil {
		return nil, err
	}
	results = append(results, todayItems...)

	return results, nil
}

// getTokenDailyQuotaSummaryFromStats 从统计表查询汇总数据
func getTokenDailyQuotaSummaryFromStats(userId int, tokenIds []int, startTimestamp int64, endTimestamp int64) ([]TokenDailyQuota, error) {
	var results []TokenDailyQuota
	err := DB.Table("token_daily_stats").
		Select("0 as token_id, '' as token_name, day_timestamp, SUM(quota) as quota").
		Where("user_id = ? AND day_timestamp >= ? AND day_timestamp <= ? AND token_id IN ?",
			userId, startTimestamp, endTimestamp, tokenIds).
		Group("day_timestamp").
		Order("day_timestamp ASC").
		Find(&results).Error
	return results, err
}

// getTokenDailyQuotaSummaryFromLogs 从 logs 表实时查询汇总数据
func getTokenDailyQuotaSummaryFromLogs(userId int, tokenIds []int, startTimestamp int64, endTimestamp int64) ([]TokenDailyQuota, error) {
	var results []TokenDailyQuota
	err := LOG_DB.Table("logs").
		Select("0 as token_id, '' as token_name, "+DayTimestampExpr("created_at")+" as day_timestamp, SUM(quota) as quota").
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at <= ? AND token_id IN ?",
			userId, LogTypeConsume, startTimestamp, endTimestamp, tokenIds).
		Group(DayTimestampExpr("created_at")).
		Order("day_timestamp ASC").
		Find(&results).Error
	return results, err
}

// TokenModelDailyExportRow 导出用：token + model + day 三维聚合
type TokenModelDailyExportRow struct {
	TokenId      int    `gorm:"column:token_id"`
	TokenName    string `gorm:"column:token_name"`
	ModelName    string `gorm:"column:model_name"`
	DayTimestamp int64  `gorm:"column:day_timestamp"`
	Quota        int    `gorm:"column:quota"`
}

// GetTokenModelDailyQuotaAll 全量查询（导出用），按 token_id + model_name + day 三维聚合
func GetTokenModelDailyQuotaAll(userId int, startTimestamp int64, endTimestamp int64) ([]TokenModelDailyExportRow, error) {
	var results []TokenModelDailyExportRow
	err := LOG_DB.Table("logs").
		Select("token_id, token_name, model_name, "+DayTimestampExpr("created_at")+" as day_timestamp, SUM(quota) as quota").
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at <= ?",
			userId, LogTypeConsume, startTimestamp, endTimestamp).
		Group("token_id, token_name, model_name, " + DayTimestampExpr("created_at")).
		Order("token_id ASC, model_name ASC, day_timestamp ASC").
		Find(&results).Error
	return results, err
}

// TokenModelDailyQuota 模型维度每日消耗聚合
type TokenModelDailyQuota struct {
	ModelName    string `json:"model_name"`
	DayTimestamp int64  `json:"day_timestamp"`
	Quota        int    `json:"quota"`
}

// TokenModelSummary 单个模型的汇总信息
type TokenModelSummary struct {
	ModelName  string         `json:"model_name"`
	TotalCost  int            `json:"total_cost"`
	TotalCount int            `json:"total_count"`
	DailyData  map[string]int `json:"daily_data"`
}

// TokenModelPreviewResult 行内预览返回结构
type TokenModelPreviewResult struct {
	TopModels          []TokenModelSummary `json:"top_models"`
	OtherModelsSummary struct {
		Count     int `json:"count"`
		TotalCost int `json:"total_cost"`
	} `json:"other_models_summary"`
	HasMore bool `json:"has_more"`
}

// GetTokenModelDailyQuota 获取某Token在指定月份内按模型分组的每日消耗（Top 3 + 其余汇总）
func GetTokenModelDailyQuota(userId int, tokenId int, startTimestamp int64, endTimestamp int64) (*TokenModelPreviewResult, error) {
	// 1. 查询该 token 所有模型的总消耗和调用次数，按总金额降序
	type modelTotal struct {
		ModelName  string `gorm:"column:model_name"`
		TotalCost  int    `gorm:"column:total_cost"`
		TotalCount int    `gorm:"column:total_count"`
	}
	var modelTotals []modelTotal
	err := LOG_DB.Table("logs").
		Select("model_name, SUM(quota) as total_cost, COUNT(*) as total_count").
		Where("user_id = ? AND token_id = ? AND type = ? AND created_at >= ? AND created_at <= ?",
			userId, tokenId, LogTypeConsume, startTimestamp, endTimestamp).
		Group("model_name").
		Order("total_cost DESC").
		Find(&modelTotals).Error
	if err != nil {
		return nil, err
	}

	result := &TokenModelPreviewResult{}
	topCount := 3
	if len(modelTotals) < topCount {
		topCount = len(modelTotals)
	}

	// 收集 top 模型名称
	topModelNames := make([]string, topCount)
	for i := 0; i < topCount; i++ {
		topModelNames[i] = modelTotals[i].ModelName
	}

	// 2. 查询 top 模型的每日明细
	var dailyItems []TokenModelDailyQuota
	if len(topModelNames) > 0 {
		err = LOG_DB.Table("logs").
			Select("model_name, "+DayTimestampExpr("created_at")+" as day_timestamp, SUM(quota) as quota").
			Where("user_id = ? AND token_id = ? AND type = ? AND created_at >= ? AND created_at <= ? AND model_name IN ?",
				userId, tokenId, LogTypeConsume, startTimestamp, endTimestamp, topModelNames).
			Group("model_name, " + DayTimestampExpr("created_at")).
			Order("model_name ASC, day_timestamp ASC").
			Find(&dailyItems).Error
		if err != nil {
			return nil, err
		}
	}

	// 3. 组装 top_models
	dailyMap := make(map[string]map[string]int) // model_name -> day_str -> quota
	for _, item := range dailyItems {
		if dailyMap[item.ModelName] == nil {
			dailyMap[item.ModelName] = make(map[string]int)
		}
		dayStr := fmt.Sprintf("%d", item.DayTimestamp)
		dailyMap[item.ModelName][dayStr] += item.Quota
	}

	for i := 0; i < topCount; i++ {
		mt := modelTotals[i]
		summary := TokenModelSummary{
			ModelName:  mt.ModelName,
			TotalCost:  mt.TotalCost,
			TotalCount: mt.TotalCount,
			DailyData:  dailyMap[mt.ModelName],
		}
		if summary.DailyData == nil {
			summary.DailyData = make(map[string]int)
		}
		result.TopModels = append(result.TopModels, summary)
	}

	// 4. 计算"其余模型"汇总
	if len(modelTotals) > 3 {
		result.HasMore = true
		otherCount := len(modelTotals) - 3
		otherCost := 0
		for i := 3; i < len(modelTotals); i++ {
			otherCost += modelTotals[i].TotalCost
		}
		result.OtherModelsSummary.Count = otherCount
		result.OtherModelsSummary.TotalCost = otherCost
	}

	return result, nil
}

// TokenModelFullItem 全量模型列表单项
type TokenModelFullItem struct {
	ModelName  string `json:"model_name"`
	TotalCost  int    `json:"total_cost"`
	TotalCount int    `json:"total_count"`
}

// GetTokenModelFullList 获取某Token在指定月份内所有模型的消耗列表
func GetTokenModelFullList(userId int, tokenId int, startTimestamp int64, endTimestamp int64, sortBy string, sortOrder string) ([]TokenModelFullItem, error) {
	if sortBy == "" {
		sortBy = "total_cost"
	}
	if sortBy != "total_cost" && sortBy != "total_count" {
		sortBy = "total_cost"
	}
	if sortOrder == "" {
		sortOrder = "desc"
	}
	if sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "desc"
	}

	var results []TokenModelFullItem
	err := LOG_DB.Table("logs").
		Select("model_name, SUM(quota) as total_cost, COUNT(*) as total_count").
		Where("user_id = ? AND token_id = ? AND type = ? AND created_at >= ? AND created_at <= ?",
			userId, tokenId, LogTypeConsume, startTimestamp, endTimestamp).
		Group("model_name").
		Order(sortBy + " " + sortOrder).
		Find(&results).Error
	return results, err
}
