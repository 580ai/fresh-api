package helper

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

func FlushWriter(c *gin.Context) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("flush panic recovered: %v", r)
		}
	}()

	if c == nil || c.Writer == nil {
		return nil
	}

	if c.Request != nil && c.Request.Context().Err() != nil {
		return fmt.Errorf("request context done: %w", c.Request.Context().Err())
	}

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		return errors.New("streaming error: flusher not found")
	}

	flusher.Flush()
	return nil
}

func SetEventStreamHeaders(c *gin.Context) {
	// 检查是否已经设置过头部
	if _, exists := c.Get("event_stream_headers_set"); exists {
		return
	}

	// 设置标志，表示头部已经设置过
	c.Set("event_stream_headers_set", true)

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
}

func ClaudeData(c *gin.Context, resp dto.ClaudeResponse) error {
	jsonData, err := common.Marshal(resp)
	if err != nil {
		common.SysError("error marshalling stream response: " + err.Error())
	} else {
		c.Render(-1, common.CustomEvent{Data: fmt.Sprintf("event: %s\n", resp.Type)})
		c.Render(-1, common.CustomEvent{Data: "data: " + string(jsonData)})
	}
	_ = FlushWriter(c)
	return nil
}

func ClaudeChunkData(c *gin.Context, resp dto.ClaudeResponse, data string) {
	c.Render(-1, common.CustomEvent{Data: fmt.Sprintf("event: %s\n", resp.Type)})
	c.Render(-1, common.CustomEvent{Data: fmt.Sprintf("data: %s\n", data)})
	_ = FlushWriter(c)
}

func ResponseChunkData(c *gin.Context, resp dto.ResponsesStreamResponse, data string) {
	c.Render(-1, common.CustomEvent{Data: fmt.Sprintf("event: %s\n", resp.Type)})
	c.Render(-1, common.CustomEvent{Data: fmt.Sprintf("data: %s", data)})
	_ = FlushWriter(c)
}

func StringData(c *gin.Context, str string) error {
	if c == nil || c.Writer == nil {
		return errors.New("context or writer is nil")
	}

	if c.Request != nil && c.Request.Context().Err() != nil {
		return fmt.Errorf("request context done: %w", c.Request.Context().Err())
	}

	c.Render(-1, common.CustomEvent{Data: "data: " + str})
	return FlushWriter(c)
}

func PingData(c *gin.Context) error {
	if c == nil || c.Writer == nil {
		return errors.New("context or writer is nil")
	}

	if c.Request != nil && c.Request.Context().Err() != nil {
		return fmt.Errorf("request context done: %w", c.Request.Context().Err())
	}

	if _, err := c.Writer.Write([]byte(": PING\n\n")); err != nil {
		return fmt.Errorf("write ping data failed: %w", err)
	}
	return FlushWriter(c)
}

func ObjectData(c *gin.Context, object interface{}) error {
	if object == nil {
		return errors.New("object is nil")
	}
	jsonData, err := common.Marshal(object)
	if err != nil {
		return fmt.Errorf("error marshalling object: %w", err)
	}
	return StringData(c, string(jsonData))
}

func Done(c *gin.Context) {
	_ = StringData(c, "[DONE]")
}

func WssString(c *gin.Context, ws *websocket.Conn, str string) error {
	if ws == nil {
		logger.LogError(c, "websocket connection is nil")
		return errors.New("websocket connection is nil")
	}
	//common.LogInfo(c, fmt.Sprintf("sending message: %s", str))
	return ws.WriteMessage(1, []byte(str))
}

func WssObject(c *gin.Context, ws *websocket.Conn, object interface{}) error {
	jsonData, err := common.Marshal(object)
	if err != nil {
		return fmt.Errorf("error marshalling object: %w", err)
	}
	if ws == nil {
		logger.LogError(c, "websocket connection is nil")
		return errors.New("websocket connection is nil")
	}
	//common.LogInfo(c, fmt.Sprintf("sending message: %s", jsonData))
	return ws.WriteMessage(1, jsonData)
}

func WssError(c *gin.Context, ws *websocket.Conn, openaiError types.OpenAIError) {
	if ws == nil {
		return
	}
	errorObj := &dto.RealtimeEvent{
		Type:    "error",
		EventId: GetLocalRealtimeID(c),
		Error:   &openaiError,
	}
	_ = WssObject(c, ws, errorObj)
}

func GetResponseID(c *gin.Context) string {
	logID := c.GetString(common.RequestIdKey)
	return fmt.Sprintf("chatcmpl-%s", logID)
}

func GetLocalRealtimeID(c *gin.Context) string {
	logID := c.GetString(common.RequestIdKey)
	return fmt.Sprintf("evt_%s", logID)
}

func GenerateStartEmptyResponse(id string, createAt int64, model string, systemFingerprint *string) *dto.ChatCompletionsStreamResponse {
	return &dto.ChatCompletionsStreamResponse{
		Id:                id,
		Object:            "chat.completion.chunk",
		Created:           createAt,
		Model:             model,
		SystemFingerprint: systemFingerprint,
		Choices: []dto.ChatCompletionsStreamResponseChoice{
			{
				Delta: dto.ChatCompletionsStreamResponseChoiceDelta{
					Role:    "assistant",
					Content: common.GetPointer(""),
				},
			},
		},
	}
}

func GenerateStopResponse(id string, createAt int64, model string, finishReason string) *dto.ChatCompletionsStreamResponse {
	return &dto.ChatCompletionsStreamResponse{
		Id:                id,
		Object:            "chat.completion.chunk",
		Created:           createAt,
		Model:             model,
		SystemFingerprint: nil,
		Choices: []dto.ChatCompletionsStreamResponseChoice{
			{
				FinishReason: &finishReason,
			},
		},
	}
}

func GenerateFinalUsageResponse(id string, createAt int64, model string, usage dto.Usage) *dto.ChatCompletionsStreamResponse {
	return &dto.ChatCompletionsStreamResponse{
		Id:                id,
		Object:            "chat.completion.chunk",
		Created:           createAt,
		Model:             model,
		SystemFingerprint: nil,
		Choices:           make([]dto.ChatCompletionsStreamResponseChoice, 0),
		Usage:             &usage,
	}
}

// claudeUserIdNamespace 用于 UUID v5 生成的固定命名空间
var claudeUserIdNamespace = uuid.MustParse("6ba7b810-9dad-11d1-80b4-00c04fd430c8")

// GenerateStableUserId 基于请求内容生成稳定的 user_id，提高前缀缓存命中率。
// 同一个 system prompt 的请求会分配到同一个缓存池。
// 格式: user_{64位Hex}_account__session_{UUID}
func GenerateStableUserId(system any, messages []dto.ClaudeMessage) string {
	// 提取 system prompt 文本作为缓存指纹的主要依据
	// 同一个 system prompt 的所有请求共享缓存池，前缀匹配由 API 自动完成
	systemText := extractSystemText(system)

	// 提取第一条 user message 进一步区分不同会话
	firstUserMsg := extractFirstUserMessage(messages)

	// 纯靠内容指纹：同一个 Claude Code 会话的 system prompt 包含
	// 项目路径、CLAUDE.md 等，天然唯一；首条消息进一步区分
	identifier := fmt.Sprintf("%s|%s", systemText, firstUserMsg)

	// 生成稳定的 64 位 Hex（SHA256）
	hash := sha256.Sum256([]byte(identifier))
	hexPart := hex.EncodeToString(hash[:]) // 64 位 hex

	// 生成稳定的 UUID（UUID v5）
	uuidPart := uuid.NewSHA1(claudeUserIdNamespace, []byte(identifier))

	return fmt.Sprintf("user_%s_account__session_%s", hexPart, uuidPart.String())
}

// GenerateStableUserIdFromRaw 从原始 JSON body 中提取内容生成稳定的 user_id（透传模式用）
func GenerateStableUserIdFromRaw(bodyMap map[string]interface{}) string {
	systemText := ""
	if sys, ok := bodyMap["system"]; ok && sys != nil {
		switch v := sys.(type) {
		case string:
			systemText = v
		default:
			// system 是数组格式，序列化后取哈希
			if b, err := json.Marshal(v); err == nil {
				systemText = string(b)
			}
		}
	}

	firstUserMsg := ""
	if msgs, ok := bodyMap["messages"].([]interface{}); ok && len(msgs) > 0 {
		for _, msg := range msgs {
			msgMap, ok := msg.(map[string]interface{})
			if !ok {
				continue
			}
			if msgMap["role"] == "user" {
				switch v := msgMap["content"].(type) {
				case string:
					firstUserMsg = v
				default:
					if b, err := json.Marshal(v); err == nil {
						firstUserMsg = string(b)
					}
				}
				break
			}
		}
	}

	identifier := fmt.Sprintf("%s|%s", systemText, firstUserMsg)

	hash := sha256.Sum256([]byte(identifier))
	hexPart := hex.EncodeToString(hash[:])

	uuidPart := uuid.NewSHA1(claudeUserIdNamespace, []byte(identifier))

	return fmt.Sprintf("user_%s_account__session_%s", hexPart, uuidPart.String())
}

// extractSystemText 从 ClaudeRequest.System 提取文本内容
func extractSystemText(system any) string {
	if system == nil {
		return ""
	}
	switch v := system.(type) {
	case string:
		return v
	case []dto.ClaudeMediaMessage:
		var texts []string
		for _, msg := range v {
			if msg.Type == "text" {
				texts = append(texts, msg.GetText())
			}
		}
		return fmt.Sprintf("%v", texts)
	default:
		if b, err := json.Marshal(v); err == nil {
			return string(b)
		}
		return fmt.Sprintf("%v", v)
	}
}

// extractFirstUserMessage 从消息列表中提取第一条 user 消息的文本
func extractFirstUserMessage(messages []dto.ClaudeMessage) string {
	for _, msg := range messages {
		if msg.Role != "user" {
			continue
		}
		switch v := msg.Content.(type) {
		case string:
			return v
		default:
			if b, err := json.Marshal(v); err == nil {
				return string(b)
			}
			return fmt.Sprintf("%v", v)
		}
	}
	return ""
}
