package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type recordingRetryBillingSettler struct {
	preConsumedQuota int
	reserveErr       error
	reserveTargets   []int
}

func (s *recordingRetryBillingSettler) Settle(int) error {
	return nil
}

func (s *recordingRetryBillingSettler) Refund(*gin.Context) {}

func (s *recordingRetryBillingSettler) NeedsRefund() bool {
	return false
}

func (s *recordingRetryBillingSettler) GetPreConsumedQuota() int {
	return s.preConsumedQuota
}

func (s *recordingRetryBillingSettler) Reserve(targetQuota int) error {
	s.reserveTargets = append(s.reserveTargets, targetQuota)
	if s.reserveErr != nil {
		return s.reserveErr
	}
	if targetQuota > s.preConsumedQuota {
		s.preConsumedQuota = targetQuota
	}
	return nil
}

func TestGetChannelReservesTieredQuotaBeforeSettingUpCrossGroupRetry(t *testing.T) {
	ctx, info, retryParam, billing := setupCrossGroupRetryBillingTest(t)

	channel, apiErr := getChannel(ctx, info, retryParam)

	require.Nil(t, apiErr)
	require.NotNil(t, channel)
	assert.Equal(t, []int{200}, billing.reserveTargets)
	assert.Equal(t, 200, billing.GetPreConsumedQuota())
	assert.Equal(t, "retry", info.UsingGroup)
	assert.Equal(t, 2.0, info.TieredBillingSnapshot.GroupRatio)
	assert.Equal(t, 200, info.TieredBillingSnapshot.EstimatedQuotaAfterGroup)
	assert.Equal(t, 200, info.PriceData.QuotaToPreConsume)
	assert.Equal(t, channel.Id, common.GetContextKeyInt(ctx, constant.ContextKeyChannelId))
	assert.Equal(t, channel.Key, common.GetContextKeyString(ctx, constant.ContextKeyChannelKey))
}

func TestGetChannelStopsBeforeSetupWhenCrossGroupReserveFails(t *testing.T) {
	ctx, info, retryParam, billing := setupCrossGroupRetryBillingTest(t)
	billing.reserveErr = types.NewErrorWithStatusCode(
		errors.New("insufficient quota for retry group"),
		types.ErrorCodeInsufficientUserQuota,
		http.StatusForbidden,
		types.ErrOptionWithSkipRetry(),
	)
	common.SetContextKey(ctx, constant.ContextKeyChannelId, 991)
	common.SetContextKey(ctx, constant.ContextKeyChannelKey, "old-channel-key")

	channel, apiErr := getChannel(ctx, info, retryParam)

	require.Nil(t, channel)
	require.NotNil(t, apiErr)
	assert.Equal(t, http.StatusForbidden, apiErr.StatusCode)
	assert.Equal(t, types.ErrorCodeInsufficientUserQuota, apiErr.GetErrorCode())
	assert.True(t, types.IsSkipRetryError(apiErr))
	assert.Equal(t, []int{200}, billing.reserveTargets)
	assert.Equal(t, 100, billing.GetPreConsumedQuota())
	assert.Equal(t, 991, common.GetContextKeyInt(ctx, constant.ContextKeyChannelId))
	assert.Equal(t, "old-channel-key", common.GetContextKeyString(ctx, constant.ContextKeyChannelKey))
}

func setupCrossGroupRetryBillingTest(t *testing.T) (*gin.Context, *relaycommon.RelayInfo, *service.RetryParam, *recordingRetryBillingSettler) {
	t.Helper()

	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.ChannelAutoEnable{}))

	originalMemoryCacheEnabled := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = false
	t.Cleanup(func() {
		common.MemoryCacheEnabled = originalMemoryCacheEnabled
	})

	savedGroupRatios := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"initial":1,"retry":2}`))
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(savedGroupRatios))
	})

	priority := int64(0)
	weight := uint(100)
	channel := &model.Channel{
		Type:        constant.ChannelTypeOpenAI,
		Key:         "retry-channel-key",
		Status:      common.ChannelStatusEnabled,
		Name:        "retry-channel",
		Weight:      &weight,
		Models:      "retry-billing-model",
		Group:       "retry",
		Priority:    &priority,
		CreatedTime: common.GetTimestamp(),
	}
	require.NoError(t, db.Create(channel).Error)
	require.NoError(t, db.Create(&model.Ability{
		Group:     "retry",
		Model:     "retry-billing-model",
		ChannelId: channel.Id,
		Enabled:   true,
		Priority:  &priority,
		Weight:    weight,
	}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	common.SetContextKey(ctx, constant.ContextKeyMultiGroupIndex, 1)

	billing := &recordingRetryBillingSettler{preConsumedQuota: 100}
	info := &relaycommon.RelayInfo{
		OriginModelName: "retry-billing-model",
		TokenGroup:      "initial,retry",
		UserGroup:       "initial",
		UsingGroup:      "initial",
		ChannelMeta:     &relaycommon.ChannelMeta{},
		Billing:         billing,
		PriceData: types.PriceData{
			QuotaToPreConsume: 100,
			GroupRatioInfo: types.GroupRatioInfo{
				GroupRatio: 1,
			},
		},
		TieredBillingSnapshot: &billingexpr.BillingSnapshot{
			BillingMode:               billing_setting.BillingModeTieredExpr,
			GroupRatio:                1,
			EstimatedQuotaBeforeGroup: 100,
			EstimatedQuotaAfterGroup:  100,
		},
	}
	retryParam := &service.RetryParam{
		Ctx:         ctx,
		TokenGroup:  info.TokenGroup,
		ModelName:   info.OriginModelName,
		RequestPath: ctx.Request.URL.Path,
		Retry:       common.GetPointer(0),
	}

	return ctx, info, retryParam, billing
}
