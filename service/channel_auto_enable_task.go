package service

import (
	"fmt"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

var (
	channelAutoEnableOnce    sync.Once
	channelAutoEnableRunning int32
)

// StartChannelAutoEnableTask 启动渠道自动启用定时任务
func StartChannelAutoEnableTask() {
	// 只在Master节点运行
	if !common.IsMasterNode {
		return
	}

	channelAutoEnableOnce.Do(func() {
		common.SysLog("channel auto enable task started")
		go func() {
			// 首次启动等待一段时间，让系统完全初始化
			time.Sleep(30 * time.Second)

			for {
				// 检查是否启用了自动启用功能
				if !operation_setting.IsChannelAutoEnableEnabled() {
					time.Sleep(1 * time.Minute)
					continue
				}

				// 获取测试间隔
				intervalMinutes := operation_setting.GetChannelAutoEnableInterval()
				common.SysLog(fmt.Sprintf("channel auto enable task will run every %d minutes", intervalMinutes))

				// 执行一次自动启用检测
				runChannelAutoEnableOnce()

				// 等待下一次执行
				time.Sleep(time.Duration(intervalMinutes) * time.Minute)
			}
		}()
	})
}

// runChannelAutoEnableOnce 执行一次渠道自动启用检测
func runChannelAutoEnableOnce() {
	// 防止并发执行
	if !atomic.CompareAndSwapInt32(&channelAutoEnableRunning, 0, 1) {
		common.SysLog("channel auto enable task is already running, skip this round")
		return
	}
	defer atomic.StoreInt32(&channelAutoEnableRunning, 0)

	common.SysLog("starting channel auto enable check...")

	// 获取需要测试的渠道（开启了自动启用且当前未启用的渠道）
	channels, err := model.GetAutoEnableChannelsToTest()
	if err != nil {
		common.SysError(fmt.Sprintf("failed to get auto enable channels: %v", err))
		return
	}

	if len(channels) == 0 {
		common.SysLog("no channels need auto enable check")
		return
	}

	common.SysLog(fmt.Sprintf("found %d channels need auto enable check", len(channels)))

	// 获取配置
	successRateThreshold := operation_setting.GetChannelAutoEnableSuccessRateThreshold()
	timeoutSeconds := operation_setting.GetChannelAutoEnableTimeout()

	for _, channel := range channels {
		// 测试渠道的所有模型
		successRate := testAllModelsForChannel(channel, timeoutSeconds)

		common.SysLog(fmt.Sprintf("channel #%d (%s) auto enable test result: %.1f%% success rate, threshold: %d%%",
			channel.Id, channel.Name, successRate, successRateThreshold))

		// 如果成功率达到阈值，启用渠道
		if successRate >= float64(successRateThreshold) {
			common.SysLog(fmt.Sprintf("channel #%d (%s) passed auto enable test, enabling...", channel.Id, channel.Name))
			enableChannelWithLog(channel)
		} else {
			common.SysLog(fmt.Sprintf("channel #%d (%s) failed auto enable test, waiting for next round", channel.Id, channel.Name))
		}

		// 渠道间隔一段时间，避免请求过于密集
		time.Sleep(time.Duration(common.RequestInterval))
	}

	common.SysLog("channel auto enable check completed")
}

// testAllModelsForChannel 测试渠道的所有模型，返回成功率
func testAllModelsForChannel(channel *model.Channel, timeoutSeconds int) float64 {
	models := channel.GetModels()
	if len(models) == 0 {
		common.SysLog(fmt.Sprintf("channel #%d (%s) has no models to test", channel.Id, channel.Name))
		return 0
	}

	common.SysLog(fmt.Sprintf("channel #%d (%s) testing %d models...", channel.Id, channel.Name, len(models)))

	successCount := 0
	totalCount := len(models)

	for _, modelName := range models {
		success := testSingleModelWithTimeout(channel, modelName, timeoutSeconds)
		if success {
			successCount++
		}
		// 每个模型测试间隔一小段时间
		time.Sleep(200 * time.Millisecond)
	}

	if totalCount == 0 {
		return 0
	}

	successRate := float64(successCount) / float64(totalCount) * 100
	common.SysLog(fmt.Sprintf("channel #%d (%s) test completed: %d/%d models success (%.1f%%)",
		channel.Id, channel.Name, successCount, totalCount, successRate))

	return successRate
}

// testSingleModelWithTimeout 带超时的单个模型测试
func testSingleModelWithTimeout(channel *model.Channel, modelName string, timeoutSeconds int) bool {
	resultChan := make(chan bool, 1)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				common.SysError(fmt.Sprintf("channel #%d model %s test panic: %v", channel.Id, modelName, r))
				resultChan <- false
			}
		}()

		if TestChannelForAutoEnable == nil {
			common.SysError("TestChannelForAutoEnable function not initialized")
			resultChan <- false
			return
		}

		success, err := TestChannelForAutoEnable(channel, modelName)
		if err != nil {
			common.SysLog(fmt.Sprintf("channel #%d model %s test failed: %v", channel.Id, modelName, err))
		}
		resultChan <- success
	}()

	select {
	case success := <-resultChan:
		return success
	case <-time.After(time.Duration(timeoutSeconds) * time.Second):
		common.SysLog(fmt.Sprintf("channel #%d model %s test timeout after %d seconds", channel.Id, modelName, timeoutSeconds))
		return false
	}
}

// enableChannelWithLog 启用渠道并记录操作日志
func enableChannelWithLog(channel *model.Channel) {
	// 记录旧状态
	oldStatus := channel.Status

	// 启用渠道
	success := model.UpdateChannelStatus(channel.Id, "", common.ChannelStatusEnabled, "")
	if success {
		// 记录操作日志
		model.RecordOperationLog(
			nil, // 没有 gin.Context，传 nil
			0,   // 系统操作，用户ID为0
			model.ModuleChannel,
			model.ActionEnable,
			strconv.Itoa(channel.Id),
			channel.Name,
			map[string]interface{}{"status": oldStatus},
			map[string]interface{}{"status": common.ChannelStatusEnabled},
			"系统自动启用：渠道测试成功率达标",
		)

		// 发送通知
		subject := fmt.Sprintf("通道「%s」（#%d）已被自动启用", channel.Name, channel.Id)
		content := fmt.Sprintf("通道「%s」（#%d）测试成功率达标，已被系统自动启用", channel.Name, channel.Id)
		NotifyRootUser(formatNotifyType(channel.Id, common.ChannelStatusEnabled), subject, content)

		common.SysLog(fmt.Sprintf("channel #%d (%s) has been auto enabled", channel.Id, channel.Name))
	} else {
		common.SysError(fmt.Sprintf("failed to auto enable channel #%d (%s)", channel.Id, channel.Name))
	}
}

// TestChannelForAutoEnable 供自动启用任务调用的渠道测试函数
// 返回 (是否成功, 错误信息)
var TestChannelForAutoEnable func(channel *model.Channel, testModel string) (bool, error)
