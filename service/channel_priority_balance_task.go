package service

import (
	"fmt"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

const (
	priorityBalanceP1Limit  = 7
	priorityBalanceP2Limit  = 10
	priorityBalanceP1Value  = int64(0)
	priorityBalanceP2Value  = int64(10)
	priorityBalanceP3Value  = int64(100)
	priorityBalanceRPMLimit = 10
)

// 提升与补给的 tier 顺序：t4 → t3 → t2 → t1
// 与 anthropic_batch 创建时的 weight 映射对应：t1=0, t2=2, t3=3, t4=4
var priorityBalanceTierOrder = []int{4, 3, 2, 0}

var (
	priorityBalanceOnce    sync.Once
	priorityBalanceRunning int32
)

// StartChannelPriorityBalanceTask 启动渠道优先级自动平衡定时任务
func StartChannelPriorityBalanceTask() {
	if !common.IsMasterNode {
		return
	}

	priorityBalanceOnce.Do(func() {
		common.SysLog("channel priority balance task started")
		go func() {
			// 首次启动等待一段时间，让系统完全初始化
			time.Sleep(30 * time.Second)

			ticker := time.NewTicker(time.Minute)
			defer ticker.Stop()

			for {
				if operation_setting.IsChannelPriorityBalanceEnabled() {
					runChannelPriorityBalanceOnce()
				}
				<-ticker.C
			}
		}()
	})
}

// runChannelPriorityBalanceOnce 执行一次平衡检测
func runChannelPriorityBalanceOnce() {
	if !atomic.CompareAndSwapInt32(&priorityBalanceRunning, 0, 1) {
		common.SysLog("channel priority balance task is already running, skip this round")
		return
	}
	defer atomic.StoreInt32(&priorityBalanceRunning, 0)

	channels, err := loadAnthropicBatchChannels()
	if err != nil {
		common.SysError(fmt.Sprintf("priority balance: failed to load channels: %v", err))
		return
	}
	if len(channels) == 0 {
		return
	}

	p1, p2, p3 := bucketizeByPriority(channels)

	rpmMap, err := model.GetChannelRpmFromLogs()
	if err != nil {
		common.SysError(fmt.Sprintf("priority balance: failed to load rpm: %v", err))
		// rpm 拉取失败时仍尝试做补给，但跳过提升阶段
		rpmMap = nil
	}

	promoted := 0
	if rpmMap != nil && hasHotChannel(p2, rpmMap) && len(p1) < priorityBalanceP1Limit {
		if cand := pickPromotionCandidate(p2, rpmMap); cand != nil {
			weight := safeWeight(cand)
			if err := model.UpdateChannelPriorityAndWeight(cand.Id, priorityBalanceP1Value, weight); err != nil {
				common.SysError(fmt.Sprintf(
					"priority balance: promote channel #%d failed: %v", cand.Id, err))
			} else {
				common.SysLog(fmt.Sprintf(
					"priority balance: promoted channel #%d (%s) tier=t%d rpm=%d to P1",
					cand.Id, cand.Name, tierOf(cand), rpmMap[cand.Id]))
				promoted = 1
				p2 = removeChannel(p2, cand.Id)
				p1 = append(p1, cand)
			}
		}
	}

	refilled := 0
	need := priorityBalanceP2Limit - len(p2)
	if need > 0 && len(p3) > 0 {
		picks := takeRefillCandidates(p3, need)
		for _, cand := range picks {
			weight := safeWeight(cand)
			if err := model.UpdateChannelPriorityAndWeight(cand.Id, priorityBalanceP2Value, weight); err != nil {
				common.SysError(fmt.Sprintf(
					"priority balance: refill channel #%d failed: %v", cand.Id, err))
				continue
			}
			common.SysLog(fmt.Sprintf(
				"priority balance: refilled channel #%d (%s) tier=t%d from P3 to P2",
				cand.Id, cand.Name, tierOf(cand)))
			refilled++
		}
	}

	if promoted > 0 || refilled > 0 {
		common.SysLog(fmt.Sprintf(
			"priority balance summary: promoted=%d refilled=%d p1=%d p2=%d p3=%d",
			promoted, refilled, len(p1), len(p2)+refilled, len(p3)-refilled))
	}
}

// loadAnthropicBatchChannels 仅加载 type=ChannelTypeAnthropicBatch 的渠道
func loadAnthropicBatchChannels() ([]*model.Channel, error) {
	var channels []*model.Channel
	err := model.DB.Where("type = ?", constant.ChannelTypeAnthropicBatch).
		Find(&channels).Error
	if err != nil {
		return nil, err
	}
	return channels, nil
}

func bucketizeByPriority(channels []*model.Channel) (p1, p2, p3 []*model.Channel) {
	for _, ch := range channels {
		var prio int64
		if ch.Priority != nil {
			prio = *ch.Priority
		}
		switch prio {
		case priorityBalanceP1Value:
			p1 = append(p1, ch)
		case priorityBalanceP2Value:
			p2 = append(p2, ch)
		case priorityBalanceP3Value:
			p3 = append(p3, ch)
		}
	}
	return
}

func tierOf(c *model.Channel) int {
	if c == nil || c.Weight == nil {
		return 0
	}
	return int(*c.Weight)
}

func safeWeight(c *model.Channel) uint {
	if c == nil || c.Weight == nil {
		return 0
	}
	return *c.Weight
}

func hasHotChannel(channels []*model.Channel, rpmMap map[int]int) bool {
	for _, ch := range channels {
		if rpmMap[ch.Id] > priorityBalanceRPMLimit {
			return true
		}
	}
	return false
}

// pickPromotionCandidate 按 t4→t3→t2→t1 的 tier 顺序挑一个 P2 渠道；同 tier 内取 rpm 最高的。
func pickPromotionCandidate(p2 []*model.Channel, rpmMap map[int]int) *model.Channel {
	for _, tier := range priorityBalanceTierOrder {
		var inTier []*model.Channel
		for _, ch := range p2 {
			if tierOf(ch) == tier {
				inTier = append(inTier, ch)
			}
		}
		if len(inTier) == 0 {
			continue
		}
		sort.SliceStable(inTier, func(i, j int) bool {
			ri, rj := rpmMap[inTier[i].Id], rpmMap[inTier[j].Id]
			if ri != rj {
				return ri > rj
			}
			return inTier[i].Id < inTier[j].Id
		})
		return inTier[0]
	}
	return nil
}

// takeRefillCandidates 按 t4→t3→t2→t1 顺序从 P3 取最多 n 个渠道；同 tier 内按 id asc 稳定排序。
func takeRefillCandidates(p3 []*model.Channel, n int) []*model.Channel {
	if n <= 0 {
		return nil
	}
	picks := make([]*model.Channel, 0, n)
	for _, tier := range priorityBalanceTierOrder {
		if len(picks) >= n {
			break
		}
		var inTier []*model.Channel
		for _, ch := range p3 {
			if tierOf(ch) == tier {
				inTier = append(inTier, ch)
			}
		}
		if len(inTier) == 0 {
			continue
		}
		sort.SliceStable(inTier, func(i, j int) bool {
			return inTier[i].Id < inTier[j].Id
		})
		for _, ch := range inTier {
			if len(picks) >= n {
				break
			}
			picks = append(picks, ch)
		}
	}
	return picks
}

func removeChannel(list []*model.Channel, id int) []*model.Channel {
	for i, ch := range list {
		if ch.Id == id {
			return append(list[:i], list[i+1:]...)
		}
	}
	return list
}
