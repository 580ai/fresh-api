package model

import (
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// TokenDailyStat 令牌每日消耗统计表（持久化存储，不受日志删除影响）
type TokenDailyStat struct {
	Id        int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId    int    `json:"user_id" gorm:"index:idx_tds_user_day,priority:1;index:idx_tds_user_token_day,priority:1"`
	TokenId   int    `json:"token_id" gorm:"index:idx_tds_user_token_day,priority:2"`
	TokenName string `json:"token_name" gorm:"size:128;default:''"`
	ModelName string `json:"model_name" gorm:"size:128;default:'';index:idx_tds_user_token_day,priority:4"`
	// DayTimestamp 当天 0 点的 Unix 时间戳（UTC）
	DayTimestamp int64 `json:"day_timestamp" gorm:"index:idx_tds_user_day,priority:2;index:idx_tds_user_token_day,priority:3"`
	Quota        int   `json:"quota" gorm:"default:0"`
	Count        int   `json:"count" gorm:"default:0"`
	TokenUsed    int   `json:"token_used" gorm:"default:0"`
}

func (TokenDailyStat) TableName() string {
	return "token_daily_stats"
}

// AggregateTokenDailyStat 聚合指定日期的令牌消耗数据
// dayTimestamp: 当天 0 点的 UTC 时间戳
func AggregateTokenDailyStat(dayTimestamp int64) error {
	endTimestamp := dayTimestamp + 86400 - 1

	// 从 logs 表聚合数据
	type aggRow struct {
		UserId    int    `gorm:"column:user_id"`
		TokenId   int    `gorm:"column:token_id"`
		TokenName string `gorm:"column:token_name"`
		ModelName string `gorm:"column:model_name"`
		Quota     int    `gorm:"column:quota"`
		Count     int    `gorm:"column:count"`
		TokenUsed int    `gorm:"column:token_used"`
	}

	var rows []aggRow
	err := LOG_DB.Table("logs").
		Select("user_id, token_id, token_name, model_name, SUM(quota) as quota, COUNT(*) as count, SUM(prompt_tokens + completion_tokens) as token_used").
		Where("type = ? AND created_at >= ? AND created_at <= ?", LogTypeConsume, dayTimestamp, endTimestamp).
		Group("user_id, token_id, token_name, model_name").
		Find(&rows).Error
	if err != nil {
		return fmt.Errorf("aggregate logs failed: %w", err)
	}

	if len(rows) == 0 {
		return nil
	}

	// 批量插入或更新
	for _, r := range rows {
		stat := TokenDailyStat{
			UserId:       r.UserId,
			TokenId:      r.TokenId,
			TokenName:    r.TokenName,
			ModelName:    r.ModelName,
			DayTimestamp: dayTimestamp,
			Quota:        r.Quota,
			Count:        r.Count,
			TokenUsed:    r.TokenUsed,
		}

		// 使用 upsert 逻辑：如果已存在则更新，否则插入
		var existing TokenDailyStat
		result := DB.Where("user_id = ? AND token_id = ? AND model_name = ? AND day_timestamp = ?",
			r.UserId, r.TokenId, r.ModelName, dayTimestamp).First(&existing)

		if result.Error == nil && existing.Id > 0 {
			// 更新
			DB.Model(&existing).Updates(map[string]interface{}{
				"quota":      r.Quota,
				"count":      r.Count,
				"token_used": r.TokenUsed,
				"token_name": r.TokenName,
			})
		} else {
			// 插入
			DB.Create(&stat)
		}
	}

	return nil
}

// RunDailyStatAggregation 定时任务：每天凌晨聚合前一天的数据
func RunDailyStatAggregation() {
	for {
		now := time.Now().UTC()
		// 计算下一个凌晨 1 点（给一点缓冲时间确保前一天日志都写入了）
		next := time.Date(now.Year(), now.Month(), now.Day()+1, 1, 0, 0, 0, time.UTC)
		sleepDuration := next.Sub(now)

		common.SysLog(fmt.Sprintf("[TokenDailyStat] 下次聚合时间: %s (%.1f 小时后)", next.Format("2006-01-02 15:04:05"), sleepDuration.Hours()))
		time.Sleep(sleepDuration)

		// 聚合前一天的数据
		yesterday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).Unix()
		common.SysLog(fmt.Sprintf("[TokenDailyStat] 开始聚合 %s 的数据...", time.Unix(yesterday, 0).Format("2006-01-02")))

		if err := AggregateTokenDailyStat(yesterday); err != nil {
			common.SysError(fmt.Sprintf("[TokenDailyStat] 聚合失败: %s", err.Error()))
		} else {
			common.SysLog(fmt.Sprintf("[TokenDailyStat] 聚合 %s 完成", time.Unix(yesterday, 0).Format("2006-01-02")))
		}
	}
}

// BackfillTokenDailyStat 回填历史数据（手动调用）
// days: 回填最近多少天的数据
func BackfillTokenDailyStat(days int) error {
	now := time.Now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	for i := 1; i <= days; i++ {
		day := today.AddDate(0, 0, -i)
		dayTs := day.Unix()
		common.SysLog(fmt.Sprintf("[TokenDailyStat] 回填 %s ...", day.Format("2006-01-02")))
		if err := AggregateTokenDailyStat(dayTs); err != nil {
			common.SysError(fmt.Sprintf("[TokenDailyStat] 回填 %s 失败: %s", day.Format("2006-01-02"), err.Error()))
		}
	}
	return nil
}

// GetTokenDailyStatFromTable 从统计表查询历史数据
func GetTokenDailyStatFromTable(userId int, tokenIds []int, startTimestamp int64, endTimestamp int64) ([]TokenDailyStat, error) {
	var results []TokenDailyStat
	query := DB.Where("user_id = ? AND day_timestamp >= ? AND day_timestamp <= ?", userId, startTimestamp, endTimestamp)
	if len(tokenIds) > 0 {
		query = query.Where("token_id IN ?", tokenIds)
	}
	err := query.Find(&results).Error
	return results, err
}

// GetTodayStartTimestamp 获取今天 0 点的 UTC 时间戳
func GetTodayStartTimestamp() int64 {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).Unix()
}
