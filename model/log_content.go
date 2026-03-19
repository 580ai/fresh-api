package model

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/bytedance/gopkg/util/gopool"
)

// LogContent 日志内容结构
type LogContent struct {
	UserId       int    `json:"user_id"`
	RequestId    string `json:"request_id"`
	RequestBody  string `json:"request_body"`
	ResponseBody string `json:"response_body"`
	CreatedAt    int64  `json:"created_at"`
}

var (
	// 用于清理文件名中的非法字符
	invalidCharsRegex = regexp.MustCompile(`[<>:"/\|?*\x00-\x1f]`)
)

// getContentDir 获取 content 目录路径
func getContentDir() string {
	return filepath.Join(*common.LogDir, "content")
}

// sanitizeTokenName 清理令牌名称，使其可以作为文件名
func sanitizeTokenName(tokenName string) string {
	if tokenName == "" {
		return "unknown"
	}
	safe := invalidCharsRegex.ReplaceAllString(tokenName, "_")
	safe = strings.TrimSpace(safe)
	if safe == "" {
		return "unknown"
	}
	if len(safe) > 200 {
		safe = safe[:200]
	}
	return safe
}

// writeLogContentToFile 写入数据到指定令牌的文件（即开即关，不缓存句柄）
func writeLogContentToFile(tokenName string, data []byte) error {
	contentDir := getContentDir()
	if err := os.MkdirAll(contentDir, 0755); err != nil {
		return err
	}

	safeName := sanitizeTokenName(tokenName)
	filePath := filepath.Join(contentDir, safeName+".json")
	file, err := os.OpenFile(filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = file.Write(data)
	return err
}

// RecordLogContent 异步记录日志内容到文件（按令牌分文件）
func RecordLogContent(userId int, tokenName string, requestId string, requestBody string, responseBody string) {
	if !operation_setting.IsLogContentEnabledForUser(userId) {
		return
	}

	if requestBody == "" && responseBody == "" {
		return
	}

	gopool.Go(func() {
		logContent := &LogContent{
			UserId:       userId,
			RequestId:    requestId,
			RequestBody:  requestBody,
			ResponseBody: responseBody,
			CreatedAt:    common.GetTimestamp(),
		}

		jsonData, err := json.Marshal(logContent)
		if err != nil {
			common.SysLog("failed to marshal log content: " + err.Error())
			return
		}

		data := append(jsonData, '\n')
		if err := writeLogContentToFile(tokenName, data); err != nil {
			common.SysLog("failed to write log content: " + err.Error())
		}
	})
}

// CloseLogContentFile 保留接口兼容，当前实现无需关闭
func CloseLogContentFile() {
}
