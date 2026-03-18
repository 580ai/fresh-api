package model

import "github.com/QuantumNous/new-api/common"

// DayTimestampExpr returns a SQL expression that truncates created_at to day boundary,
// compatible with MySQL (SIGNED), PostgreSQL and SQLite (BIGINT).
func DayTimestampExpr(column string) string {
	castType := "BIGINT"
	if common.UsingMySQL {
		castType = "SIGNED"
	}
	return "CAST(FLOOR(" + column + " / 86400) * 86400 AS " + castType + ")"
}

// GetDBTimestamp returns a UNIX timestamp from database time.
// Falls back to application time on error.
func GetDBTimestamp() int64 {
	var ts int64
	var err error
	switch {
	case common.UsingPostgreSQL:
		err = DB.Raw("SELECT EXTRACT(EPOCH FROM NOW())::bigint").Scan(&ts).Error
	case common.UsingSQLite:
		err = DB.Raw("SELECT strftime('%s','now')").Scan(&ts).Error
	default:
		err = DB.Raw("SELECT UNIX_TIMESTAMP()").Scan(&ts).Error
	}
	if err != nil || ts <= 0 {
		return common.GetTimestamp()
	}
	return ts
}
