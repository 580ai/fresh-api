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

// ModelPriorityConfig 模型优先级配置
type ModelPriorityConfig struct {
	Model        string
	BasePriority int64
}

// ChannelTestResult 渠道测试结果
type ChannelTestResult struct {
	ChannelId    int
	Model        string
	ResponseTime int64 // 毫秒
	Success      bool
	Error        error
}

// ParseModelPriorities 解析模型优先级配置
// 格式：model:priority，一行一个
func ParseModelPriorities(config string) []ModelPriorityConfig {
	var result []ModelPriorityConfig
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
		result = append(result, ModelPriorityConfig{
			Model:        modelName,
			BasePriority: priority,
		})
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
	// 如果超出所有层级，返回最后一层
	return len(tiers) - 1
}

// TestChannelsForModel 测试指定模型的所有渠道
func TestChannelsForModel(modelName string, timeoutSeconds int) []ChannelTestResult {
	var results []ChannelTestResult
	var mu sync.Mutex
	var wg sync.WaitGroup

	// 获取所有启用的渠道
	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		common.SysError(fmt.Sprintf("获取渠道列表失败: %v", err))
		return results
	}

	// 筛选支持该模型的渠道
	var targetChannels []*model.Channel
	for _, channel := range channels {
		if channel.Status != common.ChannelStatusEnabled {
			continue
		}
		models := channel.GetModels()
		for _, m := range models {
			if m == modelName {
				targetChannels = append(targetChannels, channel)
				break
			}
		}
	}

	if len(targetChannels) == 0 {
		common.SysLog(fmt.Sprintf("没有找到支持模型 %s 的启用渠道", modelName))
		return results
	}

	common.SysLog(fmt.Sprintf("开始测试模型 %s，共 %d 个渠道", modelName, len(targetChannels)))

	// 并发测试渠道
	for _, channel := range targetChannels {
		wg.Add(1)
		ch := channel
		gopool.Go(func() {
			defer wg.Done()

			tik := time.Now()
			result := testChannel(ch, modelName, "")
			tok := time.Now()
			responseTime := tok.Sub(tik).Milliseconds()

			testResult := ChannelTestResult{
				ChannelId:    ch.Id,
				Model:        modelName,
				ResponseTime: responseTime,
				Success:      result.localErr == nil && result.newAPIError == nil,
			}

			if result.localErr != nil {
				testResult.Error = result.localErr
			} else if result.newAPIError != nil {
				testResult.Error = result.newAPIError
			}

			// 检查是否超时
			if responseTime > int64(timeoutSeconds)*1000 {
				testResult.Success = false
				testResult.Error = fmt.Errorf("响应超时: %dms > %ds", responseTime, timeoutSeconds)
			}

			mu.Lock()
			results = append(results, testResult)
			mu.Unlock()

			// 更新渠道响应时间
			ch.UpdateResponseTime(responseTime)
		})
	}

	wg.Wait()
	return results
}

// AssignPriorityAndWeight 根据测试结果分配优先级和权重
// basePriority: 起始优先级（如果为0，则使用渠道原有优先级）
// 响应时间越短，优先级越大，权重越大
func AssignPriorityAndWeight(results []ChannelTestResult, basePriority int64, tiers []operation_setting.ResponseTimeTier) {
	if len(results) == 0 {
		return
	}

	// 只处理成功的结果
	var successResults []ChannelTestResult
	for _, r := range results {
		if r.Success {
			successResults = append(successResults, r)
		}
	}

	if len(successResults) == 0 {
		common.SysLog("没有成功的测试结果，跳过优先级分配")
		return
	}

	// 按层级分组
	tierGroups := make(map[int][]ChannelTestResult)
	for _, r := range successResults {
		tierIdx := GetTierIndex(r.ResponseTime, tiers)
		tierGroups[tierIdx] = append(tierGroups[tierIdx], r)
	}

	// 对每个层级内的渠道按响应时间排序（从短到长）
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

	// 分配优先级
	// 第1层（响应最快）的渠道优先级最大，从 basePriority 开始递减
	currentPriority := basePriority

	for _, tierIdx := range tierIndices {
		group := tierGroups[tierIdx]
		tier := tiers[tierIdx]

		// 计算该层级内的权重
		// 响应时间越短，权重越大
		minTime := int64(tier.Min * 1000)
		maxTime := int64(tier.Max * 1000)
		timeRange := maxTime - minTime
		if timeRange <= 0 {
			timeRange = 1
		}

		for _, r := range group {
			channel, err := model.GetChannelById(r.ChannelId, true)
			if err != nil {
				common.SysError(fmt.Sprintf("获取渠道 %d 失败: %v", r.ChannelId, err))
				continue
			}

			// 设置优先级
			var newPriority int64
			if basePriority > 0 {
				newPriority = currentPriority
				currentPriority--
			} else {
				// 使用渠道原有优先级，同层内递减
				if channel.Priority != nil {
					newPriority = *channel.Priority
				}
			}

			// 计算权重：响应时间越短，权重越大
			// 权重范围：10-100
			var newWeight uint
			if r.ResponseTime <= minTime {
				newWeight = 100
			} else if r.ResponseTime >= maxTime {
				newWeight = 10
			} else {
				// 线性插值：响应时间越短，权重越大
				ratio := float64(maxTime-r.ResponseTime) / float64(timeRange)
				newWeight = uint(10 + ratio*90)
			}

			// 更新渠道
			err = model.UpdateChannelPriorityAndWeight(r.ChannelId, newPriority, newWeight)
			if err != nil {
				common.SysError(fmt.Sprintf("更新渠道 %d 优先级和权重失败: %v", r.ChannelId, err))
				continue
			}

			common.SysLog(fmt.Sprintf("渠道 %d (%s) 模型 %s: 响应时间 %dms, 层级 %d, 优先级 %d, 权重 %d",
				r.ChannelId, channel.Name, r.Model, r.ResponseTime, tierIdx+1, newPriority, newWeight))
		}
	}
}

var channelPriorityMonitorOnce sync.Once
var channelPriorityMonitorRunning bool
var channelPriorityMonitorLock sync.Mutex

// AutomaticallyRunChannelPriorityMonitor 自动运行渠道优先级监控
func AutomaticallyRunChannelPriorityMonitor() {
	// 只在Master节点运行
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
	modelConfigs := ParseModelPriorities(setting.ModelPriorities)
	if len(modelConfigs) == 0 {
		common.SysLog("没有配置需要监控的模型，跳过")
		return fmt.Errorf("没有配置需要监控的模型")
	}

	tiers := setting.ResponseTimeTiers
	if len(tiers) == 0 {
		// 使用默认分层
		tiers = []operation_setting.ResponseTimeTier{
			{Min: 0, Max: 3},
			{Min: 3, Max: 10},
			{Min: 10, Max: 30},
			{Min: 30, Max: 9999},
		}
	}

	// 对每个配置的模型进行测试和优先级分配
	for _, config := range modelConfigs {
		common.SysLog(fmt.Sprintf("测试模型: %s, 起始优先级: %d", config.Model, config.BasePriority))

		// 测试该模型的所有渠道
		results := TestChannelsForModel(config.Model, setting.TimeoutSeconds)

		// 分配优先级和权重
		AssignPriorityAndWeight(results, config.BasePriority, tiers)

		// 短暂休息，避免请求过于密集
		time.Sleep(time.Second)
	}

	common.SysLog("渠道优先级监控任务完成")
	return nil
}

// RunChannelPriorityMonitorAPI 手动触发渠道优先级监控的API接口
func RunChannelPriorityMonitorAPI(c *gin.Context) {
	setting := operation_setting.GetChannelPriorityMonitorSetting()
	if setting.ModelPriorities == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "请先配置需要监控的模型",
		})
		return
	}

	// 异步执行
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
