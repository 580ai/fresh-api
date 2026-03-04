package model

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

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

// tokenFileManager 管理每个令牌的文件句柄
type tokenFileManager struct {
	files map[string]*os.File
	mu    sync.Mutex
}

var (
	tokenFileMgr = &tokenFileManager{
		files: make(map[string]*os.File),
	}
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
	// 替换非法字符为下划线
	safe := invalidCharsRegex.ReplaceAllString(tokenName, "_")
	// 去除首尾空格
	safe = strings.TrimSpace(safe)
	// 如果为空，返回默认值
	if safe == "" {
		return "unknown"
	}
	// 限制长度（防止文件名过长）
	if len(safe) > 200 {
		safe = safe[:200]
	}
	return safe
}

// getTokenFile 获取指定令牌的文件句柄
func (m *tokenFileManager) getTokenFile(tokenName string) (*os.File, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	safeName := sanitizeTokenName(tokenName)

	// 检查是否已有打开的文件
	if file, exists := m.files[safeName]; exists {
		return file, nil
	}

	// 确保 content 目录存在
	contentDir := getContentDir()
	if err := os.MkdirAll(contentDir, 0755); err != nil {
		return nil, err
	}

	// 创建/打开文件
	filePath := filepath.Join(contentDir, safeName+".json")
	file, err := os.OpenFile(filePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}

	m.files[safeName] = file
	return file, nil
}

// writeToFile 写入数据到指定令牌的文件
func (m *tokenFileManager) writeToFile(tokenName string, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	safeName := sanitizeTokenName(tokenName)
	file, exists := m.files[safeName]
	if !exists {
		return nil // 文件不存在，跳过
	}

	_, err := file.Write(data)
	return err
}

// RecordLogContent 异步记录日志内容到文件（按令牌分文件）
func RecordLogContent(userId int, tokenName string, requestId string, requestBody string, responseBody string) {
	if !operation_setting.IsLogContentEnabled() {
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

		// 获取文件句柄
		_, err = tokenFileMgr.getTokenFile(tokenName)
		if err != nil {
			common.SysLog("failed to get token log file: " + err.Error())
			return
		}

		// 写入数据（每行一个JSON）
		data := append(jsonData, '\n')
		if err := tokenFileMgr.writeToFile(tokenName, data); err != nil {
			common.SysLog("failed to write log content: " + err.Error())
		}
	})
}

// CloseLogContentFile 关闭所有日志文件
func CloseLogContentFile() {
	tokenFileMgr.mu.Lock()
	defer tokenFileMgr.mu.Unlock()
	for name, file := range tokenFileMgr.files {
		if file != nil {
			file.Close()
		}
		delete(tokenFileMgr.files, name)
	}
}
