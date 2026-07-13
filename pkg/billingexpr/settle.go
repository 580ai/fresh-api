package billingexpr

import (
	"math"

	"github.com/QuantumNous/new-api/common"
)

// quotaConversion converts raw expression output to quota based on the
// expression version. This is the central dispatch point for future versions
// that may use a different conversion formula.
func quotaConversion(exprOutput float64, snap *BillingSnapshot) float64 {
	switch snap.ExprVersion {
	default: // v1: coefficients are $/1M tokens prices
		return exprOutput / 1_000_000 * snap.QuotaPerUnit
	}
}

// ComputeTieredQuota runs the Expr from a frozen BillingSnapshot against
// actual token counts and returns the settlement result.
func ComputeTieredQuota(snap *BillingSnapshot, params TokenParams) (TieredResult, error) {
	return ComputeTieredQuotaWithRequest(snap, params, RequestInput{})
}

func ComputeTieredQuotaWithRequest(snap *BillingSnapshot, params TokenParams, request RequestInput) (TieredResult, error) {
	cost, trace, err := RunExprByHashWithRequest(snap.ExprString, snap.ExprHash, params, request)
	if err != nil {
		return TieredResult{}, err
	}

	quotaBeforeGroup := quotaConversion(cost, snap)
	var clamp *common.QuotaClamp
	switch {
	case math.IsNaN(quotaBeforeGroup):
		_, clamp = common.QuotaRoundChecked(quotaBeforeGroup)
		quotaBeforeGroup = 0
	case math.IsInf(quotaBeforeGroup, 1):
		_, clamp = common.QuotaRoundChecked(quotaBeforeGroup)
		quotaBeforeGroup = common.MaxQuota
	case math.IsInf(quotaBeforeGroup, -1):
		_, clamp = common.QuotaRoundChecked(quotaBeforeGroup)
		clamp.Clamped = 0
		quotaBeforeGroup = 0
	case quotaBeforeGroup < 0:
		quotaBeforeGroup = 0
	}
	quotaAfterGroup := quotaBeforeGroup * snap.GroupRatio
	if math.IsNaN(quotaAfterGroup) {
		if clamp == nil {
			_, clamp = common.QuotaRoundChecked(quotaAfterGroup)
		}
		quotaAfterGroup = 0
	} else if quotaAfterGroup < 0 || math.IsInf(quotaAfterGroup, -1) {
		if math.IsInf(quotaAfterGroup, -1) && clamp == nil {
			_, clamp = common.QuotaRoundChecked(quotaAfterGroup)
			clamp.Clamped = 0
		}
		quotaAfterGroup = 0
	}
	afterGroup, finalClamp := common.QuotaRoundChecked(quotaAfterGroup)
	if clamp == nil {
		clamp = finalClamp
	}
	crossed := trace.MatchedTier != snap.EstimatedTier

	return TieredResult{
		ActualQuotaBeforeGroup: quotaBeforeGroup,
		ActualQuotaAfterGroup:  afterGroup,
		MatchedTier:            trace.MatchedTier,
		CrossedTier:            crossed,
		Clamp:                  clamp,
	}, nil
}
