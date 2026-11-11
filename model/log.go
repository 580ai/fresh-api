package model

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"

	"gorm.io/gorm"
)

func applyExplicitLogTextFilter(tx *gorm.DB, column string, value string) (*gorm.DB, error) {
	if value == "" {
		return tx, nil
	}
	if strings.Contains(value, "%") {
		condition, pattern, err := buildLogLikeCondition(column, value)
		if err != nil {
			return nil, err
		}
		return tx.Where(condition, pattern), nil
	}
	return tx.Where(column+" = ?", value), nil
}

func buildLogLikeCondition(column string, value string) (string, string, error) {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		pattern, err := sanitizeClickHouseLikePattern(value)
		if err != nil {
			return "", "", err
		}
		return column + " LIKE ?", pattern, nil
	}

	pattern, err := sanitizeLikePattern(value)
	if err != nil {
		return "", "", err
	}
	return column + " LIKE ? ESCAPE '!'", pattern, nil
}

func sanitizeClickHouseLikePattern(input string) (string, error) {
	input = strings.ReplaceAll(input, `\`, `\\`)
	input = strings.ReplaceAll(input, `_`, `\_`)

	if err := validateLikePattern(input); err != nil {
		return "", err
	}
	return input, nil
}

type Log struct {
	Id                int    `json:"id" gorm:"index:idx_created_at_id,priority:2;index:idx_user_id_id,priority:2"`
	UserId            int    `json:"user_id" gorm:"index:idx_user_id_id,priority:1"`
	CreatedAt         int64  `json:"created_at" gorm:"bigint;index:idx_created_at_id,priority:1;index:idx_created_at_type"`
	Type              int    `json:"type" gorm:"index:idx_created_at_type"`
	Content           string `json:"content"`
	Username          string `json:"username" gorm:"index;index:index_username_model_name,priority:2;default:''"`
	TokenName         string `json:"token_name" gorm:"index;default:''"`
	ModelName         string `json:"model_name" gorm:"index:index_username_model_name,priority:1;default:''"`
	Quota             int    `json:"quota" gorm:"default:0"`
	PromptTokens      int    `json:"prompt_tokens" gorm:"default:0"`
	CompletionTokens  int    `json:"completion_tokens" gorm:"default:0"`
	UseTime           int    `json:"use_time" gorm:"default:0"`
	IsStream          bool   `json:"is_stream"`
	ChannelId         int    `json:"channel" gorm:"index"`
	ChannelName       string `json:"channel_name" gorm:"->"`
	TokenId           int    `json:"token_id" gorm:"default:0;index"`
	Group             string `json:"group" gorm:"index"`
	Ip                string `json:"ip" gorm:"index;default:''"`
	RequestId         string `json:"request_id,omitempty" gorm:"type:varchar(64);index:idx_logs_request_id;default:''"`
	UpstreamRequestId string `json:"upstream_request_id,omitempty" gorm:"type:varchar(128);index:idx_logs_upstream_request_id;default:''"`
	Other             string `json:"other"`
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
	LogTypeLogin   = 7
)

func ensureLogRequestId(log *Log) {
	if log != nil && log.RequestId == "" {
		log.RequestId = common.NewRequestId()
	}
}

func createLog(log *Log) error {
	ensureLogRequestId(log)
	return LOG_DB.Create(log).Error
}

func clickHouseLogOrder(prefix string) string {
	return prefix + "created_at desc, " + prefix + "request_id desc"
}

func assignDisplayLogIds(logs []*Log, startIdx int) {
	for i := range logs {
		logs[i].Id = startIdx + i + 1
	}
}

func formatUserLogs(logs []*Log, startIdx int) {
	for i := range logs {
		logs[i].ChannelName = ""
		logs[i].Other = formatLogOtherJSON(logs[i].Other, logOtherVisibilityUser)
	}
	assignDisplayLogIds(logs, startIdx)
}

// FormatAdminLogs removes root-only diagnostics while retaining operational
// admin_info. Root callers must not pass their results through this formatter.
func FormatAdminLogs(logs []*Log) {
	for i := range logs {
		logs[i].Other = formatLogOtherJSON(logs[i].Other, logOtherVisibilityAdmin)
	}
}

// FormatRootLogs normalizes legacy metadata into the current scoped shape
// without removing root-only diagnostics.
func FormatRootLogs(logs []*Log) {
	for i := range logs {
		logs[i].Other = formatLogOtherJSON(logs[i].Other, logOtherVisibilityRoot)
	}
}

func GetLogByTokenId(tokenId int) (logs []*Log, err error) {
	order := "id desc"
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		order = clickHouseLogOrder("")
	}
	err = LOG_DB.Model(&Log{}).Where("token_id = ?", tokenId).Order(order).Limit(common.MaxRecentItems).Find(&logs).Error
	formatUserLogs(logs, 0)
	return logs, err
}

func RecordLog(userId int, logType int, content *common.Message) {
	if logType == LogTypeConsume && !common.LogConsumeEnabled {
		return
	}
	username, _ := GetUsernameById(userId, false)
	other := NewLogOther()
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      logType,
		Content:   other.setContent([]*common.Message{content}),
		Other:     other.JSONString(),
	}
	err := createLog(log)
	if err != nil {
		common.SysLog(common.LogText("failed to record log: %s", err.Error()))
	}
}

// RecordLogWithAdminInfo stores operator metadata under other.admin_info and
// an optional, user-visible operation descriptor under other.op for localization.
func RecordLogWithAdminInfo(userId int, logType int, content string, adminInfo *AuditAdminInfo, operation *AuditOperation, request ...*gin.Context) {
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
	if logType == LogTypeManage {
		var c *gin.Context
		if len(request) > 0 {
			c = request[0]
		}
		actorRole := 0
		if c != nil {
			actorRole = c.GetInt("role")
		}
		RecordAuditLog(c, AuditLog{UserId: userId, Username: username, ActorRole: actorRole, Category: AuditCategoryOperation, Content: content, Other: AuditOther{AdminInfo: adminInfo, Op: operation}, Success: true})
		return
	}
	if len(request) > 0 && request[0] != nil {
		log.RequestId = request[0].GetString(common.RequestIdKey)
	}
	if adminInfo != nil || operation != nil {
		data, err := common.Marshal(AuditOther{AdminInfo: adminInfo, Op: operation})
		if err != nil {
			common.SysError(common.LogText("failed to encode log admin info: %s", err.Error()))
			return
		}
		log.Other = string(data)
	}
	if err := createLog(log); err != nil {
		common.SysLog(common.LogText("failed to record log: %s", err.Error()))
	}
}

// RecordLoginLog writes new login events to the independent audit table.
// username 由调用方传入（登录流程已持有用户对象），避免额外的数据库查询。
// content 为英文兜底文本（用于导出）；action+params 供前端本地化渲染。
// other 包含 login_method、user_agent 等结构化信息。
func RecordLoginLog(userId, actorRole int, username string, content string, ip string, action string, params map[string]any, other AuditOther, request ...*gin.Context) {
	other.Op = &AuditOperation{Action: action, Params: params}
	var c *gin.Context
	if len(request) > 0 {
		c = request[0]
	}
	RecordAuditLog(c, AuditLog{UserId: userId, Username: username, ActorRole: actorRole, Category: AuditCategoryLogin, Action: action, Content: content, Ip: ip, Other: other, Success: true})
}

// RecordOperationAuditLog writes new operation/security events to the audit table.
// logUserId 为日志归属者，管理审计日志应归属实际操作者；目标资源/用户放入
// action params。username 内部按 logUserId 查询。content 为英文兜底文本（供导出使用）。
// action+params 写入 Other.op，供前端本地化渲染（普通用户可见，不含敏感信息）。
// adminInfo 存放操作者身份（写入 Other.admin_info，普通用户查询时剥离）；
// auditInfo 存放路由/方法/结果等中间件兜底信息（写入 Other.audit_info，普通用户查询时剥离）。
func RecordOperationAuditLog(logUserId, actorRole int, content string, ip string, action string, params map[string]any, adminInfo *AuditAdminInfo, auditInfo *AuditRequestInfo, request ...*gin.Context) {
	username, _ := GetUsernameById(logUserId, false)
	other := AuditOther{
		Op:        &AuditOperation{Action: action, Params: params},
		AdminInfo: adminInfo,
		AuditInfo: auditInfo,
	}
	var c *gin.Context
	if len(request) > 0 {
		c = request[0]
	}
	category := AuditCategoryOperation
	if adminInfo == nil {
		category = AuditCategorySecurity
	}
	status, success := 200, true
	if auditInfo != nil {
		status = auditInfo.Status
		success = auditInfo.Success
	}
	RecordAuditLog(c, AuditLog{UserId: logUserId, Username: username, ActorRole: actorRole, Category: category, Action: action, Content: content, Ip: ip, Status: status, Success: success, Other: other})
}

func RecordTopupLog(userId int, content *common.Message, callerIp string, paymentMethod string, callbackPaymentMethod string) {
	username, _ := GetUsernameById(userId, false)
	other := NewLogOther()
	other.MergeAdmin(map[string]any{
		"server_ip":               common.GetIp(),
		"node_name":               common.NodeName,
		"caller_ip":               callerIp,
		"payment_method":          paymentMethod,
		"callback_payment_method": callbackPaymentMethod,
		"version":                 common.Version,
	})
	log := &Log{
		UserId:    userId,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      LogTypeTopup,
		Content:   other.setContent([]*common.Message{content}),
		Ip:        callerIp,
		Other:     other.JSONString(),
	}
	err := createLog(log)
	if err != nil {
		common.SysLog(common.LogText("failed to record topup log: %s", err.Error()))
	}
}

func RecordErrorLog(c *gin.Context, userId int, channelId int, modelName string, tokenName string, content string, tokenId int, useTimeSeconds int,
	isStream bool, group string, other *LogOther) {
	logger.LogInfo(c, common.LogText("record error log: userId=%d, channelId=%d, modelName=%s, tokenName=%s, content=%s", userId, channelId, modelName, tokenName, common.LocalLogPreview(content)))
	username := c.GetString("username")
	requestId := c.GetString(common.RequestIdKey)
	upstreamRequestId := c.GetString(common.UpstreamRequestIdKey)
	otherStr := other.JSONString()
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
		RequestId:         requestId,
		UpstreamRequestId: upstreamRequestId,
		Other:             otherStr,
	}
	err := createLog(log)
	if err != nil {
		logger.LogError(c, common.LogText("failed to record log: %s", err.Error()))
	}
}

type RecordConsumeLogParams struct {
	ChannelId        int               `json:"channel_id"`
	PromptTokens     int               `json:"prompt_tokens"`
	CompletionTokens int               `json:"completion_tokens"`
	ModelName        string            `json:"model_name"`
	TokenName        string            `json:"token_name"`
	Quota            int               `json:"quota"`
	Content          []*common.Message `json:"content"`
	TokenId          int               `json:"token_id"`
	UseTimeSeconds   int               `json:"use_time_seconds"`
	IsStream         bool              `json:"is_stream"`
	Group            string            `json:"group"`
	Other            *LogOther         `json:"other"`
	// [CUSTOM] 请求/响应原文，仅在开启日志内容记录时落库
	RequestBody  string `json:"request_body,omitempty"`
	ResponseBody string `json:"response_body,omitempty"`
}

func RecordConsumeLog(c *gin.Context, userId int, params RecordConsumeLogParams) {
	if !common.LogConsumeEnabled {
		return
	}
	logger.LogDebug(c, "record consume log: userId=%d, params=%s", userId, common.GetJsonString(params))
	username := c.GetString("username")
	requestId := c.GetString(common.RequestIdKey)
	upstreamRequestId := c.GetString(common.UpstreamRequestIdKey)
	createdAt := common.GetTimestamp()
	other := params.Other
	content := other.setContent(params.Content)
	otherStr := other.JSONString()
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
		CreatedAt:        createdAt,
		Type:             LogTypeConsume,
		Content:          content,
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
		RequestId:         requestId,
		UpstreamRequestId: upstreamRequestId,
		Other:             otherStr,
	}
	err := createLog(log)
	if err != nil {
		logger.LogError(c, common.LogText("failed to record log: %s", err.Error()))
	}
	// 记录请求和响应内容到文件（按令牌分文件）
	if err == nil {
		RecordLogContent(userId, params.TokenName, requestId, params.RequestBody, params.ResponseBody, LogContentUsage{
			PromptTokens:     params.PromptTokens,
			CompletionTokens: params.CompletionTokens,
			ModelName:        params.ModelName,
			IsStream:         params.IsStream,
		})
	}
	if common.DataExportEnabled {
		var cacheReadTokens, cacheCreationTokens int
		if other != nil {
			cacheReadTokens, _ = other.public["cache_tokens"].(int)
			// The settlement path already normalizes the cache creation total.
			// Do not add the 5m/1h breakdown again or infer tokens from prices.
			cacheCreationTokens, _ = other.public["cache_write_tokens"].(int)
		}
		LogQuotaData(QuotaDataLogParams{
			UserID:              userId,
			Username:            username,
			ModelName:           params.ModelName,
			Quota:               params.Quota,
			CreatedAt:           createdAt,
			TokenUsed:           params.PromptTokens + params.CompletionTokens,
			CacheReadTokens:     int64(cacheReadTokens),
			CacheCreationTokens: int64(cacheCreationTokens),
			UseGroup:            params.Group,
			TokenID:             params.TokenId,
			ChannelID:           params.ChannelId,
			NodeName:            common.NodeName,
		})
	}
}

type RecordTaskBillingLogParams struct {
	UserId    int
	LogType   int
	Content   []*common.Message
	ChannelId int
	ModelName string
	Quota     int
	TokenId   int
	Group     string
	Other     *LogOther
	NodeName  string // 任务发起节点；为空时回退当前节点
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
	createdAt := common.GetTimestamp()
	other := params.Other
	log := &Log{
		UserId:    params.UserId,
		Username:  username,
		CreatedAt: createdAt,
		Type:      params.LogType,
		Content:   other.setContent(params.Content),
		TokenName: tokenName,
		ModelName: params.ModelName,
		Quota:     params.Quota,
		ChannelId: params.ChannelId,
		TokenId:   params.TokenId,
		Group:     params.Group,
		Other:     other.JSONString(),
	}
	err := createLog(log)
	if err != nil {
		common.SysLog(common.LogText("failed to record task billing log: %s", err.Error()))
	}
	if params.LogType == LogTypeConsume && common.DataExportEnabled {
		nodeName := params.NodeName
		if nodeName == "" {
			nodeName = common.NodeName
		}
		LogQuotaData(QuotaDataLogParams{
			UserID:    params.UserId,
			Username:  username,
			ModelName: params.ModelName,
			Quota:     params.Quota,
			CreatedAt: createdAt,
			UseGroup:  params.Group,
			TokenID:   params.TokenId,
			ChannelID: params.ChannelId,
			NodeName:  nodeName,
		})
	}
}

// LogFilter is the usage-log search shared by the log list and the log export.
// Username and Channel are administrator filters.
type LogFilter struct {
	Type              int
	StartTimestamp    int64
	EndTimestamp      int64
	ModelName         string
	Username          string
	TokenName         string
	Channel           int
	Group             string
	RequestId         string
	UpstreamRequestId string
	// UserId 仅管理端筛选使用，0 表示不限制
	UserId int
}

func (f LogFilter) apply(tx *gorm.DB) (*gorm.DB, error) {
	var err error
	if f.Type != LogTypeUnknown {
		tx = tx.Where("logs.type = ?", f.Type)
	}
	if tx, err = applyExplicitLogTextFilter(tx, "logs.model_name", f.ModelName); err != nil {
		return nil, err
	}
	if tx, err = applyExplicitLogTextFilter(tx, "logs.username", f.Username); err != nil {
		return nil, err
	}
	if f.TokenName != "" {
		tx = tx.Where("logs.token_name = ?", f.TokenName)
	}
	if f.RequestId != "" {
		tx = tx.Where("logs.request_id = ?", f.RequestId)
	}
	if f.UpstreamRequestId != "" {
		tx = tx.Where("logs.upstream_request_id = ?", f.UpstreamRequestId)
	}
	if f.StartTimestamp != 0 {
		tx = tx.Where("logs.created_at >= ?", f.StartTimestamp)
	}
	if f.EndTimestamp != 0 {
		tx = tx.Where("logs.created_at <= ?", f.EndTimestamp)
	}
	if f.UserId != 0 {
		// [CUSTOM] 管理端按用户 ID 筛选
		tx = tx.Where("logs.user_id = ?", f.UserId)
	}
	if f.Channel != 0 {
		tx = tx.Where("logs.channel_id = ?", f.Channel)
	}
	if f.Group != "" {
		tx = tx.Where("logs."+logGroupCol+" = ?", f.Group)
	}
	return tx, nil
}

func GetAllLogs(filter LogFilter, startIdx int, num int) (logs []*Log, total int64, err error) {
	tx, err := filter.apply(LOG_DB)
	if err != nil {
		return nil, 0, err
	}
	err = tx.Model(&Log{}).Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	order := "logs.created_at desc, logs.id desc"
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		order = clickHouseLogOrder("logs.")
	}
	err = tx.Order(order).Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		return nil, 0, err
	}
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		assignDisplayLogIds(logs, startIdx)
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

func GetUserLogs(userId int, filter LogFilter, startIdx int, num int) (logs []*Log, total int64, err error) {
	tx, err := filter.apply(LOG_DB.Where("logs.user_id = ?", userId))
	if err != nil {
		return nil, 0, err
	}
	err = tx.Model(&Log{}).Limit(logSearchCountLimit).Count(&total).Error
	if err != nil {
		common.SysError(common.LogText("failed to count user logs: %s", err.Error()))
		return nil, 0, common.NewMessage("Failed to query logs")
	}
	order := "logs.id desc"
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		order = clickHouseLogOrder("logs.")
	}
	err = tx.Order(order).Limit(num).Offset(startIdx).Find(&logs).Error
	if err != nil {
		common.SysError(common.LogText("failed to search user logs: %s", err.Error()))
		return nil, 0, common.NewMessage("Failed to query logs")
	}

	formatUserLogs(logs, startIdx)
	return logs, total, err
}

// StreamAllLogs calls fn with each log matching filter, newest first, as an
// administrator with role sees it. Rows are read one at a time, so an export
// never holds the whole result in memory.
func StreamAllLogs(ctx context.Context, filter LogFilter, role int, fn func(*Log) error) error {
	tx, err := filter.apply(LOG_DB.WithContext(ctx))
	if err != nil {
		return err
	}
	visibility := logOtherVisibilityAdmin
	if role >= common.RoleRootUser {
		visibility = logOtherVisibilityRoot
	}
	channelNames := make(map[int]string)
	return streamLogs(tx, "logs.created_at desc, logs.id desc", func(log *Log) error {
		if log.ChannelId != 0 {
			name, ok := channelNames[log.ChannelId]
			if !ok {
				if channel, err := CacheGetChannel(log.ChannelId); err == nil {
					name = channel.Name
				}
				channelNames[log.ChannelId] = name
			}
			log.ChannelName = name
		}
		log.Other = formatLogOtherJSON(log.Other, visibility)
		return fn(log)
	})
}

// StreamUserLogs is StreamAllLogs for one user's own logs, shaped like the
// user log list.
func StreamUserLogs(ctx context.Context, userId int, filter LogFilter, fn func(*Log) error) error {
	tx, err := filter.apply(LOG_DB.WithContext(ctx).Where("logs.user_id = ?", userId))
	if err != nil {
		return err
	}
	count := 0
	return streamLogs(tx, "logs.id desc", func(log *Log) error {
		count++
		log.Id = count
		log.ChannelName = ""
		log.Other = formatLogOtherJSON(log.Other, logOtherVisibilityUser)
		return fn(log)
	})
}

func streamLogs(tx *gorm.DB, order string, fn func(*Log) error) error {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		order = clickHouseLogOrder("logs.")
	}
	rows, err := tx.Model(&Log{}).Order(order).Rows()
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var log Log
		if err := LOG_DB.ScanRows(rows, &log); err != nil {
			return err
		}
		if err := fn(&log); err != nil {
			return err
		}
	}
	return rows.Err()
}

type Stat struct {
	Quota int `json:"quota"`
	Rpm   int `json:"rpm"`
	Tpm   int `json:"tpm"`
}

func SumUsedQuota(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string, channel int, group string, userId int) (stat Stat, err error) {
	tx := LOG_DB.Table("logs").Select("COALESCE(sum(quota), 0) quota")

	// 为rpm和tpm创建单独的查询
	rpmTpmQuery := LOG_DB.Table("logs").Select("count(*) rpm, COALESCE(sum(prompt_tokens), 0) + COALESCE(sum(completion_tokens), 0) tpm")

	if tx, err = applyExplicitLogTextFilter(tx, "username", username); err != nil {
		return stat, err
	}
	if rpmTpmQuery, err = applyExplicitLogTextFilter(rpmTpmQuery, "username", username); err != nil {
		return stat, err
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
	if tx, err = applyExplicitLogTextFilter(tx, "model_name", modelName); err != nil {
		return stat, err
	}
	if rpmTpmQuery, err = applyExplicitLogTextFilter(rpmTpmQuery, "model_name", modelName); err != nil {
		return stat, err
	}
	if channel != 0 {
		tx = tx.Where("channel_id = ?", channel)
		rpmTpmQuery = rpmTpmQuery.Where("channel_id = ?", channel)
	}
	if userId != 0 {
		tx = tx.Where("user_id = ?", userId)
		rpmTpmQuery = rpmTpmQuery.Where("user_id = ?", userId)
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
		common.SysError(common.LogText("failed to query log stat: %s", err.Error()))
		return stat, common.NewMessage("Failed to query statistics")
	}
	var rateStat struct {
		Rpm int
		Tpm int
	}
	if err := rpmTpmQuery.Scan(&rateStat).Error; err != nil {
		common.SysError(common.LogText("failed to query rpm/tpm stat: %s", err.Error()))
		return stat, common.NewMessage("Failed to query statistics")
	}
	stat.Rpm = rateStat.Rpm
	stat.Tpm = rateStat.Tpm

	return stat, nil
}

func SumUsedToken(logType int, startTimestamp int64, endTimestamp int64, modelName string, username string, tokenName string) (token int) {
	tx := LOG_DB.Table("logs").Select("COALESCE(sum(prompt_tokens), 0) + COALESCE(sum(completion_tokens), 0)")
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

func CountOldLog(ctx context.Context, targetTimestamp int64) (int64, error) {
	var total int64
	if err := LOG_DB.WithContext(ctx).Model(&Log{}).Where("created_at < ?", targetTimestamp).Count(&total).Error; err != nil {
		return 0, err
	}
	return total, nil
}

func DeleteOldLogBatch(ctx context.Context, targetTimestamp int64, limit int) (int64, error) {
	if limit <= 0 {
		limit = 100
	}
	if nil != ctx.Err() {
		return 0, ctx.Err()
	}

	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		// ClickHouse DELETE is a heavy mutation that rewrites data parts, so
		// per-batch mutations would be pathologically slow. Remove all matching
		// rows in a single synchronous mutation regardless of limit; the reported
		// count lets the caller's progress loop complete in one pass.
		total, err := CountOldLog(ctx, targetTimestamp)
		if err != nil {
			return 0, err
		}
		if total == 0 {
			return 0, nil
		}
		if err := LOG_DB.WithContext(ctx).Exec(
			"ALTER TABLE logs DELETE WHERE created_at < ? SETTINGS mutations_sync = 1",
			targetTimestamp,
		).Error; err != nil {
			return 0, err
		}
		return total, nil
	}

	result := LOG_DB.WithContext(ctx).Where("created_at < ?", targetTimestamp).Limit(limit).Delete(&Log{})
	if nil != result.Error {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

func DeleteOldLog(ctx context.Context, targetTimestamp int64, limit int) (int64, error) {
	if limit <= 0 {
		limit = 100
	}

	var total int64 = 0

	for {
		if nil != ctx.Err() {
			return total, ctx.Err()
		}

		rowsAffected, err := DeleteOldLogBatch(ctx, targetTimestamp, limit)
		if nil != err {
			return total, err
		}

		total += rowsAffected

		if rowsAffected < int64(limit) {
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

// GetChannelRpmFromLogs 获取每个渠道最近 60 秒的消费请求数（RPM）
func GetChannelRpmFromLogs() (map[int]int, error) {
	startTime := time.Now().Add(-60 * time.Second).Unix()

	type rpmRow struct {
		ChannelId int
		Rpm       int
	}
	var rows []rpmRow
	err := LOG_DB.Model(&Log{}).
		Select("channel_id, COUNT(*) as rpm").
		Where("type = ? AND created_at >= ? AND channel_id > 0", LogTypeConsume, startTime).
		Group("channel_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	result := make(map[int]int, len(rows))
	for _, r := range rows {
		result[r.ChannelId] = r.Rpm
	}
	return result, nil
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
