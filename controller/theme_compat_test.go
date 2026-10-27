package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 本部署保留双前端：classic 未被移除，因此 theme.frontend 仍然可以切回 classic。
// 校验逻辑本身不依赖数据库，这里只覆盖允许/拒绝的取值。
func TestUpdateOptionAcceptsClassicFrontendTheme(t *testing.T) {
	assert.NoError(t, validateThemeFrontendValue("classic"))
	assert.NoError(t, validateThemeFrontendValue("default"))
	assert.Error(t, validateThemeFrontendValue("legacy"))
	assert.Error(t, validateThemeFrontendValue(""))
}

func TestGetStatusAdvertisesActiveDashboard(t *testing.T) {
	previousMap := common.OptionMap
	common.OptionMap = map[string]string{}
	t.Cleanup(func() { common.OptionMap = previousMap })
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

	GetStatus(context)

	var payload struct {
		Success bool           `json:"success"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
	assert.True(t, payload.Success)
	// 默认主题由 system_setting.ThemeSettings.Frontend 决定（本部署为 classic）
	assert.Contains(t, []string{"default", "classic"}, payload.Data["theme"])
}
