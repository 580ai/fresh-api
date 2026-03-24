package helper

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

const (
	userIdCacheLogFile = "logs/userid_cache.log"
	maxPrefixLen       = 200
)

var (
	userIdLogOnce sync.Once
	userIdLogFile *os.File
	userIdLogMu   sync.Mutex
)

func initUserIdLogFile() {
	userIdLogOnce.Do(func() {
		if err := os.MkdirAll("logs", 0755); err != nil {
			common.SysError(fmt.Sprintf("[UserIdCacheLog] failed to create logs dir: %v", err))
			return
		}
		f, err := os.OpenFile(userIdCacheLogFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			common.SysError(fmt.Sprintf("[UserIdCacheLog] failed to open log file: %v", err))
			return
		}
		userIdLogFile = f
	})
}

func writeUserIdLog(entry map[string]interface{}) {
	initUserIdLogFile()
	if userIdLogFile == nil {
		return
	}
	data, err := json.Marshal(entry)
	if err != nil {
		return
	}
	data = append(data, '\n')

	userIdLogMu.Lock()
	defer userIdLogMu.Unlock()
	_, _ = userIdLogFile.Write(data)
}

func truncateStr(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) > maxLen {
		return string(runes[:maxLen])
	}
	return s
}

// LogUserIdInject 在注入 simulate_user_id 时调用，记录请求关联信息
func LogUserIdInject(userId, systemPrefix, firstMsgPrefix string, msgCount int) {
	entry := map[string]interface{}{
		"time":             time.Now().UTC().Format(time.RFC3339),
		"event":            "inject",
		"user_id":          userId,
		"system_prefix":    truncateStr(systemPrefix, maxPrefixLen),
		"first_msg_prefix": truncateStr(firstMsgPrefix, maxPrefixLen),
		"msg_count":        msgCount,
	}
	writeUserIdLog(entry)
}

// LogUserIdCacheUsage 在响应返回后调用，记录缓存命中统计
func LogUserIdCacheUsage(userId string, cacheCreation, cacheRead, input int) {
	entry := map[string]interface{}{
		"time":                  time.Now().UTC().Format(time.RFC3339),
		"event":                 "usage",
		"user_id":               userId,
		"cache_creation_tokens": cacheCreation,
		"cache_read_tokens":     cacheRead,
		"input_tokens":          input,
	}
	writeUserIdLog(entry)
}

// ExtractLogFieldsFromRequest 从结构化请求中提取日志字段（非透传模式）
func ExtractLogFieldsFromRequest(system any, messages []dto.ClaudeMessage) (systemPrefix, firstMsgPrefix string, msgCount int) {
	systemPrefix = extractSystemText(system)
	firstMsgPrefix = extractFirstUserMessage(messages)
	msgCount = len(messages)
	return
}

// ExtractLogFieldsFromRaw 从原始 JSON body 中提取日志字段（透传模式）
func ExtractLogFieldsFromRaw(bodyMap map[string]interface{}) (systemPrefix, firstMsgPrefix string, msgCount int) {
	if sys, ok := bodyMap["system"]; ok && sys != nil {
		switch v := sys.(type) {
		case string:
			systemPrefix = v
		default:
			if b, err := json.Marshal(v); err == nil {
				systemPrefix = string(b)
			}
		}
	}

	if msgs, ok := bodyMap["messages"].([]interface{}); ok {
		msgCount = len(msgs)
		for _, msg := range msgs {
			msgMap, ok := msg.(map[string]interface{})
			if !ok {
				continue
			}
			if msgMap["role"] == "user" {
				switch v := msgMap["content"].(type) {
				case string:
					firstMsgPrefix = v
				default:
					if b, err := json.Marshal(v); err == nil {
						firstMsgPrefix = string(b)
					}
				}
				break
			}
		}
	}
	return
}
