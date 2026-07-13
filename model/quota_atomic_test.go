package model

import (
	"errors"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupAtomicQuotaTest(t *testing.T, batchUpdateEnabled bool) {
	t.Helper()

	oldRedisEnabled := common.RedisEnabled
	oldBatchUpdateEnabled := common.BatchUpdateEnabled
	common.RedisEnabled = false
	common.BatchUpdateEnabled = false
	batchUpdate()
	require.NoError(t, DB.Exec("DELETE FROM tokens").Error)
	require.NoError(t, DB.Exec("DELETE FROM users").Error)
	common.BatchUpdateEnabled = batchUpdateEnabled

	t.Cleanup(func() {
		common.BatchUpdateEnabled = false
		batchUpdate()
		common.RedisEnabled = oldRedisEnabled
		common.BatchUpdateEnabled = oldBatchUpdateEnabled
	})
}

func getAtomicQuotaTestUser(t *testing.T, id int) User {
	t.Helper()
	var user User
	require.NoError(t, DB.First(&user, id).Error)
	return user
}

func getAtomicQuotaTestToken(t *testing.T, id int) Token {
	t.Helper()
	var token Token
	require.NoError(t, DB.First(&token, id).Error)
	return token
}

func TestConsumeUserQuotaExactAndInsufficient(t *testing.T) {
	setupAtomicQuotaTest(t, false)
	require.NoError(t, DB.Create(&User{Id: 9301, Username: "atomic-user-exact", Quota: 100}).Error)

	require.NoError(t, ConsumeUserQuota(9301, 100))
	assert.Equal(t, 0, getAtomicQuotaTestUser(t, 9301).Quota)

	err := ConsumeUserQuota(9301, 1)
	require.ErrorIs(t, err, ErrInsufficientUserQuota)
	assert.Equal(t, 0, getAtomicQuotaTestUser(t, 9301).Quota)
}

func TestUserQuotaPrimitivesBypassBatchUpdater(t *testing.T) {
	setupAtomicQuotaTest(t, true)
	require.NoError(t, DB.Create(&User{Id: 9302, Username: "atomic-user-batch", Quota: 100}).Error)

	require.NoError(t, ConsumeUserQuota(9302, 40))
	require.NoError(t, RestoreUserQuota(9302, 15))
	assert.Equal(t, 75, getAtomicQuotaTestUser(t, 9302).Quota)

	batchUpdate()
	assert.Equal(t, 75, getAtomicQuotaTestUser(t, 9302).Quota)
}

func TestConsumeUserQuotaConcurrentCallsDoNotOverdraw(t *testing.T) {
	setupAtomicQuotaTest(t, true)
	require.NoError(t, DB.Create(&User{Id: 9303, Username: "atomic-user-concurrent", Quota: 100}).Error)

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			errs <- ConsumeUserQuota(9303, 80)
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	successes := 0
	insufficient := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrInsufficientUserQuota):
			insufficient++
		default:
			require.NoError(t, err)
		}
	}
	assert.Equal(t, 1, successes)
	assert.Equal(t, 1, insufficient)
	assert.Equal(t, 20, getAtomicQuotaTestUser(t, 9303).Quota)
}

func TestFiniteTokenQuotaPrimitivesAreAtomicAndBypassBatchUpdater(t *testing.T) {
	setupAtomicQuotaTest(t, true)
	require.NoError(t, DB.Create(&Token{
		Id:          9401,
		UserId:      9301,
		Key:         "atomic-token-finite",
		RemainQuota: 100,
		UsedQuota:   10,
	}).Error)

	require.NoError(t, ConsumeTokenQuota(9401, "atomic-token-finite", 100))
	token := getAtomicQuotaTestToken(t, 9401)
	assert.Equal(t, 0, token.RemainQuota)
	assert.Equal(t, 110, token.UsedQuota)

	err := ConsumeTokenQuota(9401, "atomic-token-finite", 1)
	require.ErrorIs(t, err, ErrInsufficientTokenQuota)
	token = getAtomicQuotaTestToken(t, 9401)
	assert.Equal(t, 0, token.RemainQuota)
	assert.Equal(t, 110, token.UsedQuota)

	require.NoError(t, RestoreTokenQuota(9401, "atomic-token-finite", 40))
	batchUpdate()
	token = getAtomicQuotaTestToken(t, 9401)
	assert.Equal(t, 40, token.RemainQuota)
	assert.Equal(t, 70, token.UsedQuota)
}

func TestUnlimitedTokenQuotaPrimitivesPreserveReversibleAccounting(t *testing.T) {
	setupAtomicQuotaTest(t, true)
	require.NoError(t, DB.Create(&Token{
		Id:             9402,
		UserId:         9302,
		Key:            "atomic-token-unlimited",
		RemainQuota:    0,
		UsedQuota:      10,
		UnlimitedQuota: true,
	}).Error)

	require.NoError(t, ConsumeTokenQuota(9402, "atomic-token-unlimited", 60))
	token := getAtomicQuotaTestToken(t, 9402)
	assert.Equal(t, -60, token.RemainQuota)
	assert.Equal(t, 70, token.UsedQuota)

	require.NoError(t, RestoreTokenQuota(9402, "atomic-token-unlimited", 60))
	batchUpdate()
	token = getAtomicQuotaTestToken(t, 9402)
	assert.Equal(t, 0, token.RemainQuota)
	assert.Equal(t, 10, token.UsedQuota)
}

func TestConsumeFiniteTokenQuotaConcurrentCallsDoNotOverdraw(t *testing.T) {
	setupAtomicQuotaTest(t, true)
	require.NoError(t, DB.Create(&Token{
		Id:          9403,
		UserId:      9303,
		Key:         "atomic-token-concurrent",
		RemainQuota: 100,
	}).Error)

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			errs <- ConsumeTokenQuota(9403, "atomic-token-concurrent", 80)
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	successes := 0
	insufficient := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrInsufficientTokenQuota):
			insufficient++
		default:
			require.NoError(t, err)
		}
	}
	assert.Equal(t, 1, successes)
	assert.Equal(t, 1, insufficient)
	token := getAtomicQuotaTestToken(t, 9403)
	assert.Equal(t, 20, token.RemainQuota)
	assert.Equal(t, 80, token.UsedQuota)
}
