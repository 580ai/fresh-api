package controller

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

// ChannelTestResult 渠道测试结果
type ChannelTestResult struct {
	ChannelId    int
	ChannelName  string
	Models       []string
	ResponseTime int64 // 毫秒
	Success      bool
	Error        error
}

// ParseModelPriorities 解析模型优先级配置
// 格式：model:priority，一行一个
func ParseModelPriorities(config string) map[string]int64 {
	result := make(map[string]int64)
	lines := strings.Split(config, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		modelName := strings.TrimSpace(parts[0])
		priority, err := strconv.ParseInt(strings.TrimSpace(parts[1]), 10, 64)
		if err != nil {
			continue
		}
		result[modelName] = priority
	}
	return result
}

// GetTierIndex 根据响应时间获取所属层级索引
func GetTierIndex(responseTimeMs int64, tiers []operation_setting.ResponseTimeTier) int {
	responseTimeSec := float64(responseTimeMs) / 1000.0
	for i, tier := range tiers {
		if responseTimeSec >= float64(tier.Min) && responseTimeSec < float64(tier.Max) {
			return i
		}
	}
	return len(tiers) - 1
}

// channelTestState 渠道测试状态
type channelTestState struct {
	result *ChannelTestResult
	done   chan struct{} // 测试完成信号
}

// RunChannelPriorityMonitorOptimized 优化版：按模型分组并行处理，分组内完成即处理
func RunChannelPriorityMonitorOptimized(
	timeoutSeconds int,
	modelPriorities map[string]int64,
	tiers []operation_setting.ResponseTimeTier,
) error {
	// 获取所有启用的渠道
	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		return fmt.Errorf("获取渠道列表失败: %v", err)
	}

	// 筛选启用的渠道
	var targetChannels []*model.Channel
	for _, channel := range channels {
		if channel.Status == common.ChannelStatusEnabled {
			targetChannels = append(targetChannels, channel)
		}
	}

	if len(targetChannels) == 0 {
		common.SysLog("没有找到启用的渠道")
		return nil
	}

	common.SysLog(fmt.Sprintf("开始测试所有渠道，共 %d 个", len(targetChannels)))

	// 为每个渠道创建测试状态
	channelStates := make(map[int]*channelTestState)
	for _, ch := range targetChannels {
		channelStates[ch.Id] = &channelTestState{
			result: nil,
			done:   make(chan struct{}),
		}
	}

	// 按模型分组：模型 -> 渠道ID列表
	modelChannels := make(map[string][]int)
	for _, ch := range targetChannels {
		models := ch.GetModels()
		for _, modelName := range models {
			modelChannels[modelName] = append(modelChannels[modelName], ch.Id)
		}
	}

	common.SysLog(fmt.Sprintf("按模型分组完成，共 %d 个模型分组", len(modelChannels)))

	// 用于记录最终的优先级和权重（多个分组取最大值）
	var finalMu sync.Mutex
	channelPriority := make(map[int]int64)
	channelWeight := make(map[int]uint)

	// 等待所有分组处理完成
	var groupWg sync.WaitGroup

	// 记录需要测试的渠道（排除只有一个渠道的分组）
	channelsToTest := make(map[int]bool)
	for modelName, channelIds := range modelChannels {
		if len(channelIds) <= 1 {
			common.SysLog(fmt.Sprintf("模型 %s: 只有 %d 个渠道，跳过测试", modelName, len(channelIds)))
			continue
		}
		for _, channelId := range channelIds {
			channelsToTest[channelId] = true
		}
	}

	if len(channelsToTest) == 0 {
		common.SysLog("没有需要测试的渠道（所有模型分组都只有一个渠道）")
		return nil
	}

	common.SysLog(fmt.Sprintf("需要测试的渠道数: %d", len(channelsToTest)))

	// 为每个模型分组启动一个 goroutine，等待该分组内所有渠道测试完成后立即处理
	for modelName, channelIds := range modelChannels {
		// 跳过只有一个渠道的分组
		if len(channelIds) <= 1 {
			continue
		}

		groupWg.Add(1)
		mName := modelName
		cIds := channelIds

		gopool.Go(func() {
			defer groupWg.Done()

			// 等待该分组内所有渠道测试完成
			for _, channelId := range cIds {
				if state, ok := channelStates[channelId]; ok {
					<-state.done // 等待该渠道测试完成
				}
			}

			// 收集该分组内的测试结果
			var successResults []*ChannelTestResult
			for _, channelId := range cIds {
				if state, ok := channelStates[channelId]; ok && state.result != nil && state.result.Success {
					successResults = append(successResults, state.result)
				}
			}

			if len(successResults) == 0 {
				common.SysLog(fmt.Sprintf("模型 %s: 没有成功的测试结果，跳过", mName))
				return
			}

			// 如果成功的结果只有一个，也跳过
			if len(successResults) == 1 {
				common.SysLog(fmt.Sprintf("模型 %s: 只有 1 个成功渠道，跳过优先级调整", mName))
				return
			}

			// 获取该模型的基准优先级
			basePriority, hasConfig := modelPriorities[mName]
			if !hasConfig {
				basePriority = 100
			}

			// 按响应时间分层
			tierGroups := make(map[int][]*ChannelTestResult)
			for _, r := range successResults {
				tierIdx := GetTierIndex(r.ResponseTime, tiers)
				tierGroups[tierIdx] = append(tierGroups[tierIdx], r)
			}

			// 对每个层级内的渠道按响应时间排序（从短到长，用于计算权重）
			for tierIdx := range tierGroups {
				sort.Slice(tierGroups[tierIdx], func(i, j int) bool {
					return tierGroups[tierIdx][i].ResponseTime < tierGroups[tierIdx][j].ResponseTime
				})
			}

			// 获取所有层级索引并排序
			var tierIndices []int
			for idx := range tierGroups {
				tierIndices = append(tierIndices, idx)
			}
			sort.Ints(tierIndices)

			// 计算优先级和权重
			// 同一层级内优先级相同，不同层级优先级递减
			for _, tierIdx := range tierIndices {
				group := tierGroups[tierIdx]
				tier := tiers[tierIdx]

				// 该层级的优先级 = 基准优先级 - 层级索引
				tierPriority := basePriority - int64(tierIdx)

				minTime := int64(tier.Min * 1000)
				maxTime := int64(tier.Max * 1000)
				timeRange := maxTime - minTime
				if timeRange <= 0 {
					timeRange = 1
				}

				for _, r := range group {
					// 计算权重：响应时间越短，权重越大（10-100）
					var newWeight uint
					if r.ResponseTime <= minTime {
						newWeight = 100
					} else if r.ResponseTime >= maxTime {
						newWeight = 10
					} else {
						ratio := float64(maxTime-r.ResponseTime) / float64(timeRange)
						newWeight = uint(10 + ratio*90)
					}

					// 更新最终优先级和权重（取最大值）
					finalMu.Lock()
					if existingPriority, ok := channelPriority[r.ChannelId]; !ok || tierPriority > existingPriority {
						channelPriority[r.ChannelId] = tierPriority
					}
					if existingWeight, ok := channelWeight[r.ChannelId]; !ok || newWeight > existingWeight {
						channelWeight[r.ChannelId] = newWeight
					}
					finalMu.Unlock()

					common.SysLog(fmt.Sprintf("模型 %s - 渠道 %d (%s): 响应时间 %dms, 层级 %d, 优先级 %d, 权重 %d",
						mName, r.ChannelId, r.ChannelName, r.ResponseTime, tierIdx+1, tierPriority, newWeight))
				}
			}

			common.SysLog(fmt.Sprintf("模型 %s 分组处理完成，共 %d 个成功渠道", mName, len(successResults)))
		})
	}

	// 只测试需要测试的渠道
	for _, channel := range targetChannels {
		// 跳过不需要测试的渠道
		if !channelsToTest[channel.Id] {
			// 直接关闭 done channel，避免分组等待
			if state, ok := channelStates[channel.Id]; ok {
				close(state.done)
			}
			continue
		}

		ch := channel
		gopool.Go(func() {
			models := ch.GetModels()
			testModel := ""
			if len(models) > 0 {
				testModel = models[0]
			}

			tik := time.Now()
			result := testChannel(ch, testModel, "")
			responseTime := time.Since(tik).Milliseconds()

			testResult := &ChannelTestResult{
				ChannelId:    ch.Id,
				ChannelName:  ch.Name,
				Models:       models,
				ResponseTime: responseTime,
				Success:      result.localErr == nil && result.newAPIError == nil,
			}

			if result.localErr != nil {
				testResult.Error = result.localErr
			} else if result.newAPIError != nil {
				testResult.Error = result.newAPIError
			}

			// 检查是否超时
			if timeoutSeconds > 0 && responseTime > int64(timeoutSeconds)*1000 {
				testResult.Success = false
				testResult.Error = fmt.Errorf("响应超时: %dms > %ds", responseTime, timeoutSeconds)
			}

			// 更新渠道响应时间
			ch.UpdateResponseTime(responseTime)

			// 保存结果并通知完成
			if state, ok := channelStates[ch.Id]; ok {
				state.result = testResult
				close(state.done)
			}
		})
	}

	// 等待所有分组处理完成
	groupWg.Wait()

	common.SysLog(fmt.Sprintf("所有模型分组处理完成，开始批量更新数据库"))

	// 批量更新渠道优先级和权重
	updatedCount := 0
	for channelId, priority := range channelPriority {
		weight := channelWeight[channelId]
		err := model.UpdateChannelPriorityAndWeight(channelId, priority, weight)
		if err != nil {
			common.SysError(fmt.Sprintf("更新渠道 %d 优先级和权重失败: %v", channelId, err))
		} else {
			updatedCount++
		}
	}

	common.SysLog(fmt.Sprintf("优先级和权重分配完成，共更新 %d 个渠道", updatedCount))
	return nil
}

var channelPriorityMonitorOnce sync.Once
var channelPriorityMonitorRunning bool
var channelPriorityMonitorLock sync.Mutex

// AutomaticallyRunChannelPriorityMonitor 自动运行渠道优先级监控
func AutomaticallyRunChannelPriorityMonitor() {
	if !common.IsMasterNode {
		return
	}

	channelPriorityMonitorOnce.Do(func() {
		for {
			setting := operation_setting.GetChannelPriorityMonitorSetting()
			if !setting.Enabled {
				time.Sleep(1 * time.Minute)
				continue
			}

			for {
				intervalMinutes := setting.IntervalMinutes
				if intervalMinutes <= 0 {
					intervalMinutes = 30
				}

				time.Sleep(time.Duration(intervalMinutes) * time.Minute)

				setting = operation_setting.GetChannelPriorityMonitorSetting()
				if !setting.Enabled {
					break
				}

				common.SysLog(fmt.Sprintf("自动执行渠道优先级监控，间隔 %d 分钟", intervalMinutes))
				runChannelPriorityMonitorInternal()
			}
		}
	})
}

// runChannelPriorityMonitorInternal 内部执行函数，带锁保护
func runChannelPriorityMonitorInternal() error {
	channelPriorityMonitorLock.Lock()
	if channelPriorityMonitorRunning {
		channelPriorityMonitorLock.Unlock()
		return fmt.Errorf("渠道优先级监控任务正在运行中")
	}
	channelPriorityMonitorRunning = true
	channelPriorityMonitorLock.Unlock()

	defer func() {
		channelPriorityMonitorLock.Lock()
		channelPriorityMonitorRunning = false
		channelPriorityMonitorLock.Unlock()
	}()

	setting := operation_setting.GetChannelPriorityMonitorSetting()

	common.SysLog("开始执行渠道优先级监控任务")

	// 解析模型优先级配置
	modelPriorities := ParseModelPriorities(setting.ModelPriorities)

	// 获取分层配置
	tiers := setting.ResponseTimeTiers
	if len(tiers) == 0 {
		tiers = []operation_setting.ResponseTimeTier{
			{Min: 0, Max: 3},
			{Min: 3, Max: 10},
			{Min: 10, Max: 30},
			{Min: 30, Max: 9999},
		}
	}

	// 使用优化版本
	err := RunChannelPriorityMonitorOptimized(setting.TimeoutSeconds, modelPriorities, tiers)
	if err != nil {
		return err
	}

	common.SysLog("渠道优先级监控任务完成")
	return nil
}

// RunChannelPriorityMonitorAPI 手动触发渠道优先级监控的API接口
func RunChannelPriorityMonitorAPI(c *gin.Context) {
	channelPriorityMonitorLock.Lock()
	if channelPriorityMonitorRunning {
		channelPriorityMonitorLock.Unlock()
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "渠道优先级监控任务正在运行中，请稍后再试",
		})
		return
	}
	channelPriorityMonitorLock.Unlock()

	gopool.Go(func() {
		err := runChannelPriorityMonitorInternal()
		if err != nil {
			common.SysError(fmt.Sprintf("渠道优先级监控执行失败: %v", err))
		}
	})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "渠道优先级监控任务已开始执行",
	})
}
