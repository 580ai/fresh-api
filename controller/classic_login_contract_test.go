package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// classicLoginResponse 是 web/classic 登录页消费的响应结构。
// 字段缺失即代表旧的 cookie session 协议回归，classic 会「登录后空白并跳回登录页」。
type classicLoginResponse struct {
	Success bool            `json:"success"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

type classicLoginChallenge struct {
	RequireVerification bool   `json:"require_verification"`
	FlowToken           string `json:"flow_token"`
	ExpiresAt           int64  `json:"expires_at"`
	Methods             []struct {
		Method    string `json:"method"`
		Available bool   `json:"available"`
	} `json:"methods"`
}

type classicLoginBundle struct {
	AccessToken     string `json:"access_token"`
	TokenType       string `json:"token_type"`
	AccessExpiresAt int64  `json:"access_expires_at"`
	Session         struct {
		SID         string `json:"sid"`
		Current     bool   `json:"current"`
		LoginMethod string `json:"login_method"`
	} `json:"session"`
	User struct {
		Id       int    `json:"id"`
		Username string `json:"username"`
		Role     int    `json:"role"`
	} `json:"user"`
}

func classicLoginRequest(t *testing.T, router *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

// TestClassicPasswordLoginReturnsChallengeThenBundle 锁定 classic 登录页依赖的两段式协议：
//  1. 密码正确但账号启用了 2FA 时，/api/user/login 必须返回登录挑战而不是用户资料。
//     旧版本前端把挑战当作用户资料写进 localStorage，随后 console 的请求 401，
//     全局错误处理清空用户并跳回登录页——也就是线上看到的「空白后回到登录页」。
//  2. /api/user/login/verify 必须返回 access_token + user，classic 才能落盘并携带 Bearer。
func TestClassicPasswordLoginReturnsChallengeThenBundle(t *testing.T) {
	user, _ := setupSecurityEnrollmentTest(t)
	factor := &model.TwoFA{UserId: user.Id, Secret: "JBSWY3DPEHPK3PXP", IsEnabled: true}
	require.NoError(t, model.DB.Create(factor).Error)

	router := gin.New()
	router.POST("/api/user/login", Login)
	router.POST("/api/user/login/verify", VerifyLogin)

	loginBody, err := common.Marshal(map[string]string{"username": user.Username, "password": "enrollment-password"})
	require.NoError(t, err)
	loginResponse := classicLoginRequest(t, router, http.MethodPost, "/api/user/login", string(loginBody))

	var login classicLoginResponse
	require.NoError(t, common.Unmarshal(loginResponse.Body.Bytes(), &login), loginResponse.Body.String())
	require.True(t, login.Success, loginResponse.Body.String())

	var challenge classicLoginChallenge
	require.NoError(t, common.Unmarshal(login.Data, &challenge))

	// 挑战不能被误当成已登录的用户资料：没有 id，也不该带 access_token。
	require.True(t, challenge.RequireVerification, "2FA 账号登录必须返回登录挑战")
	assert.NotEmpty(t, challenge.FlowToken)
	assert.NotZero(t, challenge.ExpiresAt)
	require.NotEmpty(t, challenge.Methods)
	available := false
	for _, method := range challenge.Methods {
		if method.Method == "2fa" {
			require.True(t, method.Available, "已启用 2FA 的账号必须提供 2fa 验证方式")
			available = true
		}
	}
	assert.True(t, available, "登录挑战缺少 2fa 选项")
	assert.NotContains(t, string(login.Data), `"access_token"`, "主认证通过但未完成 2FA 时不得签发 access token")
	assert.NotContains(t, string(login.Data), `"username"`, "挑战响应不应包含用户资料")
	assert.Empty(t, loginResponse.Header().Values("Set-Cookie"), "挑战阶段不得下发 refresh cookie")

	code, err := totp.GenerateCode(factor.Secret, time.Now())
	require.NoError(t, err)
	verifyBody, err := common.Marshal(map[string]string{
		"flow_token": challenge.FlowToken,
		"method":     "2fa",
		"code":       code,
	})
	require.NoError(t, err)
	verifyResponse := classicLoginRequest(t, router, http.MethodPost, "/api/user/login/verify", string(verifyBody))

	var verified classicLoginResponse
	require.NoError(t, common.Unmarshal(verifyResponse.Body.Bytes(), &verified), verifyResponse.Body.String())
	require.True(t, verified.Success, verifyResponse.Body.String())

	var bundle classicLoginBundle
	require.NoError(t, common.Unmarshal(verified.Data, &bundle))

	// classic 落盘与后续请求依赖这些字段
	assert.NotEmpty(t, bundle.AccessToken, "验证通过后必须返回 access_token")
	assert.Equal(t, "Bearer", bundle.TokenType)
	assert.Greater(t, bundle.AccessExpiresAt, time.Now().Unix())
	require.NotEmpty(t, bundle.Session.SID, "缺失 session.sid 会导致刷新时按错误会话轮换")
	assert.True(t, bundle.Session.Current)
	// login_method 记录的是主认证方式（密码），2FA 是附加因子，不写入该字段
	assert.Equal(t, "password", bundle.Session.LoginMethod)
	assert.Equal(t, user.Id, bundle.User.Id)
	assert.Equal(t, user.Username, bundle.User.Username)
	assert.Equal(t, user.Role, bundle.User.Role)

	identity, err := service.ParseAccessToken(bundle.AccessToken)
	require.NoError(t, err)
	assert.Equal(t, user.Id, identity.UserID)

	// refresh cookie 必须落在 /api/user/auth 路径下，classic 的刷新请求才带得上。
	cookies := verifyResponse.Header().Values("Set-Cookie")
	require.NotEmpty(t, cookies)
	assert.True(t,
		strings.Contains(strings.Join(cookies, "\n"), "Path=/api/user/auth"),
		"refresh cookie 的 Path 必须覆盖 /api/user/auth，实际: %v", cookies,
	)
}

// TestClassicLoginWithout2FAReturnsBundleDirectly 保证未启用 2FA 的账号仍是一步返回 bundle。
func TestClassicLoginWithout2FAReturnsBundleDirectly(t *testing.T) {
	user, _ := setupSecurityEnrollmentTest(t)

	router := gin.New()
	router.POST("/api/user/login", Login)

	loginBody, err := common.Marshal(map[string]string{"username": user.Username, "password": "enrollment-password"})
	require.NoError(t, err)
	response := classicLoginRequest(t, router, http.MethodPost, "/api/user/login", string(loginBody))

	var login classicLoginResponse
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &login), response.Body.String())
	require.True(t, login.Success, response.Body.String())

	var bundle classicLoginBundle
	require.NoError(t, common.Unmarshal(login.Data, &bundle))
	assert.NotEmpty(t, bundle.AccessToken)
	assert.Equal(t, user.Id, bundle.User.Id, "未启用 2FA 时必须直接返回用户资料")
	assert.Equal(t, user.Username, bundle.User.Username)
	assert.NotEmpty(t, bundle.Session.SID)
}
