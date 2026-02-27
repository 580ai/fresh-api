package service

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

type RetryParam struct {
	Ctx          *gin.Context
	TokenGroup   string
	ModelName    string
	Retry        *int
	resetNextTry bool
}

func (p *RetryParam) GetRetry() int {
	if p.Retry == nil {
		return 0
	}
	return *p.Retry
}

func (p *RetryParam) SetRetry(retry int) {
	p.Retry = &retry
}

func (p *RetryParam) IncreaseRetry() {
	if p.resetNextTry {
		p.resetNextTry = false
		return
	}
	if p.Retry == nil {
		p.Retry = new(int)
	}
	*p.Retry++
}

func (p *RetryParam) ResetRetryNextTry() {
	p.resetNextTry = true
}

// CacheGetRandomSatisfiedChannel tries to get a random channel that satisfies the requirements.
// 尝试获取一个满足要求的随机渠道。
//
// For multiple groups (comma-separated) with cross-group retry enabled:
// 对于多分组（逗号分隔）且启用了跨分组重试：
//
//   - Each group will exhaust all its priorities before moving to the next group.
//     每个分组会用完所有优先级后才会切换到下一个分组。
//
//   - Uses ContextKeyMultiGroupIndex to track current group index.
//     使用 ContextKeyMultiGroupIndex 跟踪当前分组索引。
//
// For "auto" tokenGroup with cross-group Retry enabled:
// 对于启用了跨分组重试的 "auto" tokenGroup：
//
//   - Each group will exhaust all its priorities before moving to the next group.
//     每个分组会用完所有优先级后才会切换到下一个分组。
//
//   - Uses ContextKeyAutoGroupIndex to track current group index.
//     使用 ContextKeyAutoGroupIndex 跟踪当前分组索引。
//
//   - Uses ContextKeyAutoGroupRetryIndex to track the global Retry count when current group started.
//     使用 ContextKeyAutoGroupRetryIndex 跟踪当前分组开始时的全局重试次数。
//
//   - priorityRetry = Retry - startRetryIndex, represents the priority level within current group.
//     priorityRetry = Retry - startRetryIndex，表示当前分组内的优先级级别。
//
//   - When GetRandomSatisfiedChannel returns nil (priorities exhausted), moves to next group.
//     当 GetRandomSatisfiedChannel 返回 nil（优先级用完）时，切换到下一个分组。
//
// Example flow (2 groups, each with 2 priorities, RetryTimes=3):
// 示例流程（2个分组，每个有2个优先级，RetryTimes=3）：
//
//	Retry=0: GroupA, priority0 (startRetryIndex=0, priorityRetry=0)
//	         分组A, 优先级0
//
//	Retry=1: GroupA, priority1 (startRetryIndex=0, priorityRetry=1)
//	         分组A, 优先级1
//
//	Retry=2: GroupA exhausted → GroupB, priority0 (startRetryIndex=2, priorityRetry=0)
//	         分组A用完 → 分组B, 优先级0
//
//	Retry=3: GroupB, priority1 (startRetryIndex=2, priorityRetry=1)
//	         分组B, 优先级1
func CacheGetRandomSatisfiedChannel(param *RetryParam) (*model.Channel, string, error) {
	var channel *model.Channel
	var err error
	selectGroup := param.TokenGroup
	userGroup := common.GetContextKeyString(param.Ctx, constant.ContextKeyUserGroup)

	// Check if tokenGroup contains multiple groups (comma-separated)
	// 检查 tokenGroup 是否包含多个分组（逗号分隔）
	if strings.Contains(param.TokenGroup, ",") && param.TokenGroup != "auto" {
		tokenGroups := strings.Split(param.TokenGroup, ",")
		// Filter empty groups
		// 过滤空分组
		validGroups := make([]string, 0, len(tokenGroups))
		for _, g := range tokenGroups {
			g = strings.TrimSpace(g)
			if g != "" {
				validGroups = append(validGroups, g)
			}
		}

		if len(validGroups) == 0 {
			return nil, selectGroup, errors.New("no valid groups found")
		}

		// [CUSTOM] 多分组模式默认跨分组重试，不检查 crossGroupRetry 设置
		// crossGroupRetry 仅对 "auto" 分组有效

		// Cross-group retry enabled, try each group in order
		// 启用跨分组重试，按顺序尝试每个分组
		startGroupIndex := 0
		if lastGroupIndex, exists := common.GetContextKey(param.Ctx, constant.ContextKeyMultiGroupIndex); exists {
			if idx, ok := lastGroupIndex.(int); ok {
				startGroupIndex = idx
			}
		}

		for i := startGroupIndex; i < len(validGroups); i++ {
			currentGroup := validGroups[i]
			priorityRetry := param.GetRetry()
			if i > startGroupIndex {
				priorityRetry = 0
			}
			logger.LogDebug(param.Ctx, "Multi-group selecting group: %s, priorityRetry: %d", currentGroup, priorityRetry)

			channel, _ = model.GetRandomSatisfiedChannel(currentGroup, param.ModelName, priorityRetry)
			if channel == nil {
				logger.LogDebug(param.Ctx, "No available channel in group %s for model %s at priorityRetry %d, trying next group", currentGroup, param.ModelName, priorityRetry)
				common.SetContextKey(param.Ctx, constant.ContextKeyMultiGroupIndex, i+1)
				param.SetRetry(0)
				continue
			}
			selectGroup = currentGroup
			// [CUSTOM] 设置选中的分组到 context，让后续的 HandleGroupRatio 能获取到正确的分组
			common.SetContextKey(param.Ctx, constant.ContextKeyMultiGroup, currentGroup)
			logger.LogDebug(param.Ctx, "Multi-group selected group: %s", currentGroup)

			// Use MaxRetryPerGroup config to limit retries per group
			// 使用 MaxRetryPerGroup 配置限制每个分组的重试次数
			maxRetryPerGroup := operation_setting.GetMaxRetryPerGroup()
			if priorityRetry >= maxRetryPerGroup-1 {
				logger.LogDebug(param.Ctx, "Current group %s retries exhausted (priorityRetry=%d >= MaxRetryPerGroup-1=%d), preparing switch to next group for next retry", currentGroup, priorityRetry, maxRetryPerGroup-1)
				common.SetContextKey(param.Ctx, constant.ContextKeyMultiGroupIndex, i+1)
				param.SetRetry(0)
				param.ResetRetryNextTry()
			} else {
				common.SetContextKey(param.Ctx, constant.ContextKeyMultiGroupIndex, i)
			}
			break
		}
		return channel, selectGroup, nil
	}

	if param.TokenGroup == "auto" {
		if len(setting.GetAutoGroups()) == 0 {
			return nil, selectGroup, errors.New("auto groups is not enabled")
		}
		autoGroups := GetUserAutoGroup(userGroup)

		// startGroupIndex: the group index to start searching from
		// startGroupIndex: 开始搜索的分组索引
		startGroupIndex := 0
		crossGroupRetry := common.GetContextKeyBool(param.Ctx, constant.ContextKeyTokenCrossGroupRetry)

		if lastGroupIndex, exists := common.GetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex); exists {
			if idx, ok := lastGroupIndex.(int); ok {
				startGroupIndex = idx
			}
		}

		for i := startGroupIndex; i < len(autoGroups); i++ {
			autoGroup := autoGroups[i]
			// Calculate priorityRetry for current group
			// 计算当前分组的 priorityRetry
			priorityRetry := param.GetRetry()
			// If moved to a new group, reset priorityRetry and update startRetryIndex
			// 如果切换到新分组，重置 priorityRetry 并更新 startRetryIndex
			if i > startGroupIndex {
				priorityRetry = 0
			}
			logger.LogDebug(param.Ctx, "Auto selecting group: %s, priorityRetry: %d", autoGroup, priorityRetry)

			channel, _ = model.GetRandomSatisfiedChannel(autoGroup, param.ModelName, priorityRetry)
			if channel == nil {
				// Current group has no available channel for this model, try next group
				// 当前分组没有该模型的可用渠道，尝试下一个分组
				logger.LogDebug(param.Ctx, "No available channel in group %s for model %s at priorityRetry %d, trying next group", autoGroup, param.ModelName, priorityRetry)
				// 重置状态以尝试下一个分组
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i+1)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupRetryIndex, 0)
				// Reset retry counter so outer loop can continue for next group
				// 重置重试计数器，以便外层循环可以为下一个分组继续
				param.SetRetry(0)
				continue
			}
			common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroup, autoGroup)
			selectGroup = autoGroup
			logger.LogDebug(param.Ctx, "Auto selected group: %s", autoGroup)

			// Prepare state for next retry
			// 为下一次重试准备状态
			// Use MaxRetryPerGroup config to limit retries per group
			// 使用 MaxRetryPerGroup 配置限制每个分组的重试次数
			maxRetryPerGroup := operation_setting.GetMaxRetryPerGroup()
			if crossGroupRetry && priorityRetry >= maxRetryPerGroup-1 {
				// Current group has exhausted all retries, prepare to switch to next group
				// This request still uses current group, but next retry will use next group
				// 当前分组已用完所有重试次数，准备切换到下一个分组
				// 本次请求仍使用当前分组，但下次重试将使用下一个分组
				logger.LogDebug(param.Ctx, "Current group %s retries exhausted (priorityRetry=%d >= MaxRetryPerGroup-1=%d), preparing switch to next group for next retry", autoGroup, priorityRetry, maxRetryPerGroup-1)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i+1)
				// Reset retry counter so outer loop can continue for next group
				// 重置重试计数器，以便外层循环可以为下一个分组继续
				param.SetRetry(0)
				param.ResetRetryNextTry()
			} else {
				// Stay in current group, save current state
				// 保持在当前分组，保存当前状态
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i)
			}
			break
		}
	} else {
		channel, err = model.GetRandomSatisfiedChannel(param.TokenGroup, param.ModelName, param.GetRetry())
		if err != nil {
			return nil, param.TokenGroup, err
		}
	}
	return channel, selectGroup, nil
}
