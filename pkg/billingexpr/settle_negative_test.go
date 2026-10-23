package billingexpr_test

import (
	"math"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestComputeTieredQuotaWithRequest_ClampsNegativeCharge(t *testing.T) {
	tests := []struct {
		name    string
		expr    string
		request billingexpr.RequestInput
	}{
		{
			name: "conditional expression returns a negative charge",
			expr: `header("x-billing-mode") == "credit" ? tier("credit", -2) : tier("normal", p)`,
			request: billingexpr.RequestInput{
				Headers: map[string]string{"x-billing-mode": "credit"},
			},
		},
		{
			name: "tiny negative charge rounds to zero",
			expr: `tier("tiny-negative", -0.25)`,
		},
		{
			name: "negative charge would underflow int32 quota",
			expr: `tier("underflow", -1e20)`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			snap := &billingexpr.BillingSnapshot{
				BillingMode:  "tiered_expr",
				ExprString:   tt.expr,
				ExprHash:     billingexpr.ExprHashString(tt.expr),
				GroupRatio:   1,
				QuotaPerUnit: 1_000_000,
			}

			result, err := billingexpr.ComputeTieredQuotaWithRequest(snap, billingexpr.TokenParams{P: 100}, tt.request)
			require.NoError(t, err)
			assert.Zero(t, result.ActualQuotaBeforeGroup, "settlement consumers must never receive a negative pre-group charge")
			assert.Zero(t, result.ActualQuotaAfterGroup, "settlement consumers must never receive a negative final charge")
		})
	}
}

func TestComputeTieredQuotaWithRequest_ClampsNonFiniteCharge(t *testing.T) {
	tests := []struct {
		name        string
		expr        string
		params      billingexpr.TokenParams
		groupRatio  float64
		customRatio bool
		wantQuota   int
		wantKind    common.QuotaClampKind
		wantClamped int
	}{
		{
			name:        "expression result is NaN",
			expr:        `tier("nan", p / c)`,
			params:      billingexpr.TokenParams{},
			wantKind:    common.QuotaClampNaN,
			wantClamped: 0,
		},
		{
			name:        "expression result is positive infinity",
			expr:        `tier("positive-infinity", p / c)`,
			params:      billingexpr.TokenParams{P: 1},
			groupRatio:  2,
			customRatio: true,
			wantQuota:   math.MaxInt32,
			wantKind:    common.QuotaClampOverflow,
			wantClamped: math.MaxInt32,
		},
		{
			name:        "expression result is negative infinity",
			expr:        `tier("negative-infinity", p / c)`,
			params:      billingexpr.TokenParams{P: -1},
			wantKind:    common.QuotaClampUnderflow,
			wantClamped: 0,
		},
		{
			name:        "group ratio makes quota NaN",
			expr:        `tier("zero", p)`,
			params:      billingexpr.TokenParams{},
			groupRatio:  math.Inf(1),
			customRatio: true,
			wantKind:    common.QuotaClampNaN,
			wantClamped: 0,
		},
		{
			name:        "group ratio makes quota negative infinity",
			expr:        `tier("positive", p)`,
			params:      billingexpr.TokenParams{P: 1},
			groupRatio:  math.Inf(-1),
			customRatio: true,
			wantKind:    common.QuotaClampUnderflow,
			wantClamped: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			groupRatio := 1.0
			if tt.customRatio {
				groupRatio = tt.groupRatio
			}
			snap := &billingexpr.BillingSnapshot{
				BillingMode:  "tiered_expr",
				ExprString:   tt.expr,
				ExprHash:     billingexpr.ExprHashString(tt.expr),
				GroupRatio:   groupRatio,
				QuotaPerUnit: 1_000_000,
			}

			result, err := billingexpr.ComputeTieredQuotaWithRequest(snap, tt.params, billingexpr.RequestInput{})
			require.NoError(t, err)
			assert.False(t, math.IsNaN(result.ActualQuotaBeforeGroup))
			assert.False(t, math.IsInf(result.ActualQuotaBeforeGroup, 0))
			assert.GreaterOrEqual(t, result.ActualQuotaBeforeGroup, 0.0)
			assert.Equal(t, tt.wantQuota, result.ActualQuotaAfterGroup)
			require.NotNil(t, result.Clamp, "non-finite settlement must retain a saturation audit marker")
			assert.Equal(t, tt.wantKind, result.Clamp.Kind)
			assert.Equal(t, tt.wantClamped, result.Clamp.Clamped)
		})
	}
}
