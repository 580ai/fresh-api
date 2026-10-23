package controller

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"

	"github.com/samber/lo"
)

const (
	anthropicBatchAggregateChunkSize = 5
	anthropicBatchPriority1Limit     = 7
	anthropicBatchPriority2Limit     = 10
	anthropicBatchPriority1Value     = int64(0)
	anthropicBatchPriority2Value     = int64(10)
	anthropicBatchPriority3Value     = int64(100)
	anthropicBatchKeySuffixLen       = 8
)

type anthropicBatchEntry struct {
	Key    string
	Amount float64
}

type anthropicBatchTier string

const (
	anthropicBatchTier1 anthropicBatchTier = "t1"
	anthropicBatchTier2 anthropicBatchTier = "t2"
	anthropicBatchTier3 anthropicBatchTier = "t3"
	anthropicBatchTier4 anthropicBatchTier = "t4"
)

var anthropicBatchLineRegexp = regexp.MustCompile(`^(\S+)\s*/\s*(\d+(?:\.\d+)?)\s*$`)

func anthropicBatchTierOf(amount float64) anthropicBatchTier {
	switch {
	case amount <= 100:
		return anthropicBatchTier1
	case amount <= 200:
		return anthropicBatchTier2
	case amount <= 400:
		return anthropicBatchTier3
	default:
		return anthropicBatchTier4
	}
}

func anthropicBatchWeightOf(tier anthropicBatchTier) uint {
	switch tier {
	case anthropicBatchTier2:
		return 2
	case anthropicBatchTier3:
		return 3
	case anthropicBatchTier4:
		return 4
	default:
		return 0
	}
}

func parseAnthropicBatchKeys(raw string) ([]anthropicBatchEntry, error) {
	lines := strings.Split(raw, "\n")
	entries := make([]anthropicBatchEntry, 0, len(lines))
	for idx, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		match := anthropicBatchLineRegexp.FindStringSubmatch(trimmed)
		if match == nil {
			return nil, fmt.Errorf("第 %d 行格式不正确，应为 sk-xxxxxxxx/100（金额）", idx+1)
		}
		amount, err := strconv.ParseFloat(match[2], 64)
		if err != nil || amount <= 0 {
			return nil, fmt.Errorf("第 %d 行金额无效", idx+1)
		}
		entries = append(entries, anthropicBatchEntry{Key: match[1], Amount: amount})
	}
	if len(entries) == 0 {
		return nil, fmt.Errorf("未解析到有效的密钥行")
	}
	return entries, nil
}

func countAnthropicBatchByPriority() (int64, int64, error) {
	var p1, p2 int64
	if err := model.DB.Model(&model.Channel{}).
		Where("type = ? AND priority = ?", constant.ChannelTypeAnthropicBatch, anthropicBatchPriority1Value).
		Count(&p1).Error; err != nil {
		return 0, 0, err
	}
	if err := model.DB.Model(&model.Channel{}).
		Where("type = ? AND priority = ?", constant.ChannelTypeAnthropicBatch, anthropicBatchPriority2Value).
		Count(&p2).Error; err != nil {
		return 0, 0, err
	}
	return p1, p2, nil
}

func formatAnthropicBatchAmount(amount float64) string {
	if amount == float64(int64(amount)) {
		return strconv.FormatInt(int64(amount), 10)
	}
	return strconv.FormatFloat(amount, 'f', -1, 64)
}

func anthropicBatchKeySuffix(key string) string {
	if len(key) <= anthropicBatchKeySuffixLen {
		return key
	}
	return key[len(key)-anthropicBatchKeySuffixLen:]
}

type anthropicBatchPlanItem struct {
	Tier        anthropicBatchTier
	Keys        []string
	Amount      float64 // 单号 = 该号金额；t1 聚合 = 组内金额合计
	AggregateIx int     // t1 聚合在本次提交内的序号；非 t1 不使用
}

func planAnthropicBatchItems(entries []anthropicBatchEntry) []anthropicBatchPlanItem {
	tiered := map[anthropicBatchTier][]anthropicBatchEntry{}
	for _, e := range entries {
		tier := anthropicBatchTierOf(e.Amount)
		tiered[tier] = append(tiered[tier], e)
	}

	items := make([]anthropicBatchPlanItem, 0, len(entries))

	// t1 聚合：每 anthropicBatchAggregateChunkSize 一组
	t1Chunks := lo.Chunk(tiered[anthropicBatchTier1], anthropicBatchAggregateChunkSize)
	for ix, chunk := range t1Chunks {
		keys := make([]string, 0, len(chunk))
		var sum float64
		for _, e := range chunk {
			keys = append(keys, e.Key)
			sum += e.Amount
		}
		items = append(items, anthropicBatchPlanItem{
			Tier:        anthropicBatchTier1,
			Keys:        keys,
			Amount:      sum,
			AggregateIx: ix,
		})
	}

	// 单号：按 t4 → t3 → t2 顺序追加
	for _, tier := range []anthropicBatchTier{anthropicBatchTier4, anthropicBatchTier3, anthropicBatchTier2} {
		for _, e := range tiered[tier] {
			items = append(items, anthropicBatchPlanItem{
				Tier:   tier,
				Keys:   []string{e.Key},
				Amount: e.Amount,
			})
		}
	}

	return items
}

func anthropicBatchPriorityFor(itemIndex int, p1Slots, p2Slots int) int64 {
	if itemIndex < p1Slots {
		return anthropicBatchPriority1Value
	}
	if itemIndex < p1Slots+p2Slots {
		return anthropicBatchPriority2Value
	}
	return anthropicBatchPriority3Value
}

func anthropicBatchChannelName(base string, item anthropicBatchPlanItem) string {
	if item.Tier == anthropicBatchTier1 {
		name := fmt.Sprintf("%s-%s-t1", base, formatAnthropicBatchAmount(item.Amount))
		if item.AggregateIx > 0 {
			name = fmt.Sprintf("%s-%d", name, item.AggregateIx+1)
		}
		return name
	}
	return fmt.Sprintf("%s-%s-%s", base, formatAnthropicBatchAmount(item.Amount), anthropicBatchKeySuffix(item.Keys[0]))
}

func buildAnthropicBatchChannels(template *model.Channel, entries []anthropicBatchEntry, createdTime int64) ([]model.Channel, error) {
	if template == nil {
		return nil, fmt.Errorf("渠道模板不能为空")
	}
	if strings.TrimSpace(template.Name) == "" {
		return nil, fmt.Errorf("渠道名称不能为空")
	}

	items := planAnthropicBatchItems(entries)
	if len(items) == 0 {
		return nil, fmt.Errorf("没有可创建的渠道")
	}

	existingP1, existingP2, err := countAnthropicBatchByPriority()
	if err != nil {
		return nil, fmt.Errorf("查询已有渠道数量失败: %w", err)
	}

	p1Slots := anthropicBatchPriority1Limit - int(existingP1)
	if p1Slots < 0 {
		p1Slots = 0
	}
	p2Slots := anthropicBatchPriority2Limit - int(existingP2)
	if p2Slots < 0 {
		p2Slots = 0
	}

	base := template.Name
	channels := make([]model.Channel, 0, len(items))

	for ix, item := range items {
		ch := *template
		ch.CreatedTime = createdTime
		ch.Name = anthropicBatchChannelName(base, item)
		ch.Key = strings.Join(item.Keys, "\n")

		priority := anthropicBatchPriorityFor(ix, p1Slots, p2Slots)
		priorityCopy := priority
		ch.Priority = &priorityCopy

		weight := anthropicBatchWeightOf(item.Tier)
		weightCopy := weight
		ch.Weight = &weightCopy

		if item.Tier == anthropicBatchTier1 {
			ch.ChannelInfo = model.ChannelInfo{
				IsMultiKey:   true,
				MultiKeySize: len(item.Keys),
				MultiKeyMode: constant.MultiKeyModeRandom,
			}
		} else {
			ch.ChannelInfo = model.ChannelInfo{}
		}

		channels = append(channels, ch)
	}

	return channels, nil
}

func handleAnthropicBatchAdd(req *AddChannelRequest) ([]model.Channel, error) {
	if req == nil || req.Channel == nil {
		return nil, fmt.Errorf("渠道信息不能为空")
	}
	if req.Channel.Type != constant.ChannelTypeAnthropicBatch {
		return nil, fmt.Errorf("anthropic_batch 模式仅支持「Anthropic Claude批量」类型")
	}
	entries, err := parseAnthropicBatchKeys(req.Channel.Key)
	if err != nil {
		return nil, err
	}
	channels, err := buildAnthropicBatchChannels(req.Channel, entries, common.GetTimestamp())
	if err != nil {
		return nil, err
	}
	return channels, nil
}
