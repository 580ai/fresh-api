package claude

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Adaptor struct {
}

// claudeUserIdNamespace 用于 UUID v5 生成的固定命名空间
var claudeUserIdNamespace = uuid.MustParse("6ba7b810-9dad-11d1-80b4-00c04fd430c8")

// generateStableUserId 基于用户ID生成稳定的 user_id
// 格式: user_{64位Hex}_account__session_{UUID}
func generateStableUserId(userId int) string {
	identifier := fmt.Sprintf("user_%d", userId)

	// 生成稳定的 64 位 Hex（SHA256）
	hash := sha256.Sum256([]byte(identifier))
	hexPart := hex.EncodeToString(hash[:]) // 64 位 hex

	// 生成稳定的 UUID（UUID v5）
	uuidPart := uuid.NewSHA1(claudeUserIdNamespace, []byte(identifier))

	return fmt.Sprintf("user_%s_account__session_%s", hexPart, uuidPart.String())
}

func (a *Adaptor) ConvertGeminiRequest(*gin.Context, *relaycommon.RelayInfo, *dto.GeminiChatRequest) (any, error) {
	//TODO implement me
	return nil, errors.New("not implemented")
}

func (a *Adaptor) ConvertClaudeRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.ClaudeRequest) (any, error) {
	// 模拟用户ID：基于用户身份生成稳定的 metadata.user_id
	if info.ChannelSetting.SimulateUserId && info.UserId > 0 {
		var existingMetadata map[string]interface{}

		if len(request.Metadata) > 0 {
			// 尝试解析现有的 metadata，保留其他字段
			if err := json.Unmarshal(request.Metadata, &existingMetadata); err != nil {
				existingMetadata = make(map[string]interface{})
			}
		} else {
			existingMetadata = make(map[string]interface{})
		}

		// 生成并设置稳定的 user_id
		stableUserId := generateStableUserId(info.UserId)
		existingMetadata["user_id"] = stableUserId

		metadataJSON, err := json.Marshal(existingMetadata)
		if err == nil {
			request.Metadata = metadataJSON
		}
	}

	return request, nil
}

func (a *Adaptor) ConvertAudioRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.AudioRequest) (io.Reader, error) {
	//TODO implement me
	return nil, errors.New("not implemented")
}

func (a *Adaptor) ConvertImageRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.ImageRequest) (any, error) {
	//TODO implement me
	return nil, errors.New("not implemented")
}

func (a *Adaptor) Init(info *relaycommon.RelayInfo) {
}

func (a *Adaptor) GetRequestURL(info *relaycommon.RelayInfo) (string, error) {
	baseURL := fmt.Sprintf("%s/v1/messages", info.ChannelBaseUrl)
	if info.IsClaudeBetaQuery {
		baseURL = baseURL + "?beta=true"
	}
	return baseURL, nil
}

func CommonClaudeHeadersOperation(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) {
	// common headers operation
	anthropicBeta := c.Request.Header.Get("anthropic-beta")
	if anthropicBeta != "" {
		req.Set("anthropic-beta", anthropicBeta)
	}
	model_setting.GetClaudeSettings().WriteHeaders(info.OriginModelName, req)
}

func (a *Adaptor) SetupRequestHeader(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) error {
	channel.SetupApiRequestHeader(info, c, req)
	req.Set("x-api-key", info.ApiKey)
	anthropicVersion := c.Request.Header.Get("anthropic-version")
	if anthropicVersion == "" {
		anthropicVersion = "2023-06-01"
	}
	req.Set("anthropic-version", anthropicVersion)
	CommonClaudeHeadersOperation(c, req, info)
	return nil
}

func (a *Adaptor) ConvertOpenAIRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (any, error) {
	if request == nil {
		return nil, errors.New("request is nil")
	}
	return RequestOpenAI2ClaudeMessage(c, *request)
}

func (a *Adaptor) ConvertRerankRequest(c *gin.Context, relayMode int, request dto.RerankRequest) (any, error) {
	return nil, nil
}

func (a *Adaptor) ConvertEmbeddingRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.EmbeddingRequest) (any, error) {
	//TODO implement me
	return nil, errors.New("not implemented")
}

func (a *Adaptor) ConvertOpenAIResponsesRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.OpenAIResponsesRequest) (any, error) {
	// TODO implement me
	return nil, errors.New("not implemented")
}

func (a *Adaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (any, error) {
	return channel.DoApiRequest(a, c, info, requestBody)
}

func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (usage any, err *types.NewAPIError) {
	info.FinalRequestRelayFormat = types.RelayFormatClaude
	if info.IsStream {
		return ClaudeStreamHandler(c, resp, info)
	} else {
		return ClaudeHandler(c, resp, info)
	}
}

func (a *Adaptor) GetModelList() []string {
	return ModelList
}

func (a *Adaptor) GetChannelName() string {
	return ChannelName
}
