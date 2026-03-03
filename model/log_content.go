package model

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/bytedance/gopkg/util/gopool"
)

// LogContent 日志内容结构
type LogContent struct {
	LogId        int    `json:"log_id"`
	RequestId    string `json:"request_id"`
	RequestBody  string `json:"request_body"`
	ResponseBody string `json:"response_body"`
	CreatedAt    int64  `json:"created_at"`
}

const (
	maxLogFileSize = 1024 * 1024 * 1024 // 1GB 单个文件最大大小
)

var (
	logContentFile     *os.File
	logContentFileMu   sync.Mutex
	logContentFilePath string
	logContentFileSize int64
)

// getLogContentFile 获取日志文件句柄，按日期和大小轮转
func getLogContentFile() (*os.File, error) {
	logContentFileMu.Lock()
	defer logContentFileMu.Unlock()

	// 检查是否需要轮转（文件过大）
	if logContentFile != nil && logContentFileSize >= maxLogFileSize {
		logContentFile.Close()
		logContentFile = nil
	}

	// 检查日期是否变化
	dateStr := time.Now().Format("2006-01-02")
	basePath := filepath.Join(*common.LogDir, "content_"+dateStr)

	// 如果文件未初始化或日期变化
	if logContentFile == nil || !isCurrentDateFile(logContentFilePath, dateStr) {
		if logContentFile != nil {
			logContentFile.Close()
		}
		if err := initLogContentFile(basePath); err != nil {
			return nil, err
		}
	}

	return logContentFile, nil
}

// isCurrentDateFile 检查文件路径是否属于当前日期
func isCurrentDateFile(path, dateStr string) bool {
	expected := "content_" + dateStr
	return len(path) > 0 && filepath.Base(path)[:len(expected)] == expected
}

// initLogContentFile 初始化日志文件
func initLogContentFile(basePath string) error {
	// 目录已在 common.InitEnv 中创建，这里确保存在
	if err := os.MkdirAll(*common.LogDir, 0755); err != nil {
		return err
	}

	// 查找可用的文件名（支持同一天多个文件）
	logContentFilePath = findAvailableLogFile(basePath)

	file, err := os.OpenFile(logContentFilePath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}

	// 获取当前文件大小
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return err
	}
	logContentFileSize = info.Size()
	logContentFile = file
	return nil
}

// findAvailableLogFile 查找可用的日志文件名
func findAvailableLogFile(basePath string) string {
	// 先尝试基础文件名
	path := basePath + ".log"
	info, err := os.Stat(path)
	if err != nil || info.Size() < maxLogFileSize {
		return path
	}

	// 如果基础文件已满，查找带序号的文件
	for i := 1; ; i++ {
		path = fmt.Sprintf("%s_%d.log", basePath, i)
		info, err := os.Stat(path)
		if err != nil || info.Size() < maxLogFileSize {
			return path
		}
	}
}

// RecordLogContent 异步记录日志内容到文件
func RecordLogContent(logId int, requestId string, requestBody string, responseBody string) {
	if !operation_setting.IsLogContentEnabled() {
		return
	}

	if requestBody == "" && responseBody == "" {
		return
	}

	gopool.Go(func() {
		logContent := &LogContent{
			LogId:        logId,
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

		file, err := getLogContentFile()
		if err != nil {
			common.SysLog("failed to get log content file: " + err.Error())
			return
		}

		logContentFileMu.Lock()
		defer logContentFileMu.Unlock()

		data := append(jsonData, '\n')
		if _, err := file.Write(data); err != nil {
			common.SysLog("failed to write log content: " + err.Error())
		} else {
			logContentFileSize += int64(len(data))
		}
	})
}

// CloseLogContentFile 关闭日志文件
func CloseLogContentFile() {
	logContentFileMu.Lock()
	defer logContentFileMu.Unlock()
	if logContentFile != nil {
		logContentFile.Close()
		logContentFile = nil
	}
}
