package service

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBillingSessionReserveMaterializesTrustedPreConsume(t *testing.T) {
	truncate(t)

	trustQuota := common.GetTrustQuota()
	initialEstimate := trustQuota * 4 / 5
	targetQuota := initialEstimate * 2
	availableQuota := targetQuota + trustQuota/2
	seedUser(t, 9201, availableQuota)
	seedToken(t, 9201, 9201, "reserve-trusted", availableQuota)

	ctx, _ := gin.CreateTestContext(nil)
	ctx.Set("token_quota", availableQuota)
	info := newReserveWalletBillingRelayInfo(9201, "reserve-trusted", false)
	require.Nil(t, PreConsumeBilling(ctx, initialEstimate, info))

	assert.Equal(t, availableQuota, getUserQuota(t, info.UserId))
	assert.Equal(t, availableQuota, getTokenRemainQuota(t, info.TokenId))
	assert.Equal(t, 0, getTokenUsedQuota(t, info.TokenId))
	assert.Equal(t, 0, info.Billing.GetPreConsumedQuota())
	assert.Equal(t, 0, info.FinalPreConsumedQuota)

	require.NoError(t, info.Billing.Reserve(targetQuota))

	assert.Equal(t, availableQuota-targetQuota, getUserQuota(t, info.UserId))
	assert.Equal(t, availableQuota-targetQuota, getTokenRemainQuota(t, info.TokenId))
	assert.Equal(t, targetQuota, getTokenUsedQuota(t, info.TokenId))
	assert.Equal(t, targetQuota, info.Billing.GetPreConsumedQuota())
	assert.Equal(t, targetQuota, info.FinalPreConsumedQuota)
}

func TestBillingSessionReserveWritesThroughBatchUpdates(t *testing.T) {
	truncate(t)

	previousBatchUpdateEnabled := common.BatchUpdateEnabled
	common.BatchUpdateEnabled = true
	t.Cleanup(func() {
		common.BatchUpdateEnabled = previousBatchUpdateEnabled
	})

	seedUser(t, 9202, 300)
	seedToken(t, 9202, 9202, "reserve-batch", 300)

	ctx, _ := gin.CreateTestContext(nil)
	info := newReserveWalletBillingRelayInfo(9202, "reserve-batch", true)
	require.Nil(t, PreConsumeBilling(ctx, 100, info))

	assert.Equal(t, 200, getUserQuota(t, info.UserId))
	assert.Equal(t, 200, getTokenRemainQuota(t, info.TokenId))
	assert.Equal(t, 100, getTokenUsedQuota(t, info.TokenId))

	require.NoError(t, info.Billing.Reserve(200))

	assert.Equal(t, 100, getUserQuota(t, info.UserId))
	assert.Equal(t, 100, getTokenRemainQuota(t, info.TokenId))
	assert.Equal(t, 200, getTokenUsedQuota(t, info.TokenId))
	assert.Equal(t, 200, info.Billing.GetPreConsumedQuota())
	assert.Equal(t, 200, info.FinalPreConsumedQuota)
}

func TestBillingSessionReserveRejectsInsufficientWalletQuota(t *testing.T) {
	truncate(t)
	seedUser(t, 9203, 150)
	seedToken(t, 9203, 9203, "reserve-wallet-insufficient", 300)

	ctx, _ := gin.CreateTestContext(nil)
	info := newReserveWalletBillingRelayInfo(9203, "reserve-wallet-insufficient", true)
	require.Nil(t, PreConsumeBilling(ctx, 100, info))
	require.Equal(t, 100, info.FinalPreConsumedQuota)

	err := info.Billing.Reserve(200)
	require.Error(t, err)
	var apiErr *types.NewAPIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, types.ErrorCodeInsufficientUserQuota, apiErr.GetErrorCode())
	assert.Equal(t, http.StatusForbidden, apiErr.StatusCode)

	assert.Equal(t, 50, getUserQuota(t, info.UserId))
	assert.Equal(t, 200, getTokenRemainQuota(t, info.TokenId))
	assert.Equal(t, 100, getTokenUsedQuota(t, info.TokenId))
	assert.Equal(t, 100, info.Billing.GetPreConsumedQuota())
	assert.Equal(t, 100, info.FinalPreConsumedQuota)
}

func TestBillingSessionReserveRollsBackWalletWhenTokenQuotaIsInsufficient(t *testing.T) {
	truncate(t)
	seedUser(t, 9204, 300)
	seedToken(t, 9204, 9204, "reserve-token-insufficient", 150)

	ctx, _ := gin.CreateTestContext(nil)
	info := newReserveWalletBillingRelayInfo(9204, "reserve-token-insufficient", true)
	require.Nil(t, PreConsumeBilling(ctx, 100, info))

	err := info.Billing.Reserve(200)
	require.Error(t, err)
	var apiErr *types.NewAPIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, types.ErrorCodePreConsumeTokenQuotaFailed, apiErr.GetErrorCode())
	assert.Equal(t, http.StatusForbidden, apiErr.StatusCode)

	assert.Equal(t, 200, getUserQuota(t, info.UserId))
	assert.Equal(t, 50, getTokenRemainQuota(t, info.TokenId))
	assert.Equal(t, 100, getTokenUsedQuota(t, info.TokenId))
	assert.Equal(t, 100, info.Billing.GetPreConsumedQuota())
	assert.Equal(t, 100, info.FinalPreConsumedQuota)
}

func TestBillingSessionReserveExtendsPreConsumeBeforeSettlement(t *testing.T) {
	truncate(t)
	seedUser(t, 9205, 300)
	seedToken(t, 9205, 9205, "reserve-success", 300)

	ctx, _ := gin.CreateTestContext(nil)
	info := newReserveWalletBillingRelayInfo(9205, "reserve-success", true)
	require.Nil(t, PreConsumeBilling(ctx, 100, info))
	require.NoError(t, info.Billing.Reserve(200))

	assert.Equal(t, 100, getUserQuota(t, info.UserId))
	assert.Equal(t, 100, getTokenRemainQuota(t, info.TokenId))
	assert.Equal(t, 200, getTokenUsedQuota(t, info.TokenId))
	assert.Equal(t, 200, info.Billing.GetPreConsumedQuota())
	assert.Equal(t, 200, info.FinalPreConsumedQuota)

	require.NoError(t, SettleBilling(ctx, info, 200))
	assert.Equal(t, 100, getUserQuota(t, info.UserId))
	assert.Equal(t, 100, getTokenRemainQuota(t, info.TokenId))
	assert.Equal(t, 200, getTokenUsedQuota(t, info.TokenId))
}

func TestBillingSessionSettleDoesNotChargeWalletWhenTokenQuotaIsInsufficient(t *testing.T) {
	truncate(t)
	seedUser(t, 9206, 300)
	seedToken(t, 9206, 9206, "settle-token-insufficient", 100)

	ctx, _ := gin.CreateTestContext(nil)
	info := newReserveWalletBillingRelayInfo(9206, "settle-token-insufficient", true)
	require.Nil(t, PreConsumeBilling(ctx, 100, info))

	err := SettleBilling(ctx, info, 200)
	require.ErrorIs(t, err, model.ErrInsufficientTokenQuota)
	assert.Equal(t, 200, getUserQuota(t, info.UserId))
	assert.Equal(t, 0, getTokenRemainQuota(t, info.TokenId))
	assert.Equal(t, 100, getTokenUsedQuota(t, info.TokenId))
}

func TestBillingSessionSettleRestoresTokenWhenWalletQuotaIsInsufficient(t *testing.T) {
	truncate(t)
	seedUser(t, 9207, 150)
	seedToken(t, 9207, 9207, "settle-wallet-insufficient", 300)

	ctx, _ := gin.CreateTestContext(nil)
	info := newReserveWalletBillingRelayInfo(9207, "settle-wallet-insufficient", true)
	require.Nil(t, PreConsumeBilling(ctx, 100, info))

	err := SettleBilling(ctx, info, 200)
	require.Error(t, err)
	var apiErr *types.NewAPIError
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, types.ErrorCodeInsufficientUserQuota, apiErr.GetErrorCode())
	assert.Equal(t, 50, getUserQuota(t, info.UserId))
	assert.Equal(t, 200, getTokenRemainQuota(t, info.TokenId))
	assert.Equal(t, 100, getTokenUsedQuota(t, info.TokenId))
}

func TestBillingSessionSettleDoesNotChargeSubscriptionWhenTokenQuotaIsInsufficient(t *testing.T) {
	truncate(t)
	seedUser(t, 9208, 0)
	seedToken(t, 9208, 9208, "settle-subscription-token-insufficient", 0)
	seedSubscription(t, 9208, 9208, 300, 100)

	info := &relaycommon.RelayInfo{
		UserId:   9208,
		TokenId:  9208,
		TokenKey: "settle-subscription-token-insufficient",
	}
	session := &BillingSession{
		relayInfo:        info,
		funding:          &SubscriptionFunding{subscriptionId: 9208, preConsumed: 100},
		preConsumedQuota: 100,
		tokenConsumed:    100,
	}

	err := session.Settle(200)
	require.ErrorIs(t, err, model.ErrInsufficientTokenQuota)
	assert.Equal(t, int64(100), getSubscriptionUsed(t, 9208))
}

func newReserveWalletBillingRelayInfo(id int, tokenKey string, forcePreConsume bool) *relaycommon.RelayInfo {
	return &relaycommon.RelayInfo{
		UserId:          id,
		TokenId:         id,
		TokenKey:        tokenKey,
		OriginModelName: "test-model",
		ForcePreConsume: forcePreConsume,
		UserSetting: dto.UserSetting{
			BillingPreference: "wallet_only",
		},
	}
}
