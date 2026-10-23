package ratio_setting

import (
	"encoding/json"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

// TextModelTier 文本模型阶梯价格
type TextModelTier struct {
	MaxTokens int     `json:"max_tokens"` // 该阶梯的最大token数
	Input     float64 `json:"input"`      // 输入价格 ($/1M tokens)
	Output    float64 `json:"output"`     // 输出价格 ($/1M tokens)
}

// TextModelPrice 文本模型特殊价格配置
type TextModelPrice struct {
	Tiers         []TextModelTier `json:"tiers"`          // 非思考模式阶梯价格
	ThinkingTiers []TextModelTier `json:"thinking_tiers"` // 思考模式阶梯价格（可选）
}

// textModelPriceMap stores text model prices
// Format: {"model_name": TextModelPrice}
var textModelPriceMap = make(map[string]TextModelPrice)
var textModelPriceMapMutex sync.RWMutex

// GetTextModelPriceMap returns the text model price map
func GetTextModelPriceMap() map[string]TextModelPrice {
	textModelPriceMapMutex.RLock()
	defer textModelPriceMapMutex.RUnlock()
	return textModelPriceMap
}

// GetTextModelPrice returns the text model price for a model
func GetTextModelPrice(modelName string) (TextModelPrice, bool) {
	textModelPriceMapMutex.RLock()
	defer textModelPriceMapMutex.RUnlock()
	price, ok := textModelPriceMap[modelName]
	if !ok || (len(price.Tiers) == 0 && len(price.ThinkingTiers) == 0) {
		return TextModelPrice{}, false
	}
	return price, true
}

// GetTextModelTierPrice 根据输入token数和是否启用思考模式获取对应的阶梯价格
// 返回: inputPrice, outputPrice ($/1M tokens), found
func GetTextModelTierPrice(modelName string, inputTokens int, enableThinking bool) (float64, float64, bool) {
	textModelPriceMapMutex.RLock()
	defer textModelPriceMapMutex.RUnlock()

	price, ok := textModelPriceMap[modelName]
	if !ok {
		return 0, 0, false
	}

	// 选择使用的阶梯（思考模式或非思考模式）
	tiers := price.Tiers
	if enableThinking && len(price.ThinkingTiers) > 0 {
		tiers = price.ThinkingTiers
	}

	if len(tiers) == 0 {
		return 0, 0, false
	}

	// 根据输入token数找到对应的阶梯
	for _, tier := range tiers {
		if inputTokens <= tier.MaxTokens {
			return tier.Input, tier.Output, true
		}
	}

	// 如果超过所有阶梯，使用最后一个阶梯的价格
	lastTier := tiers[len(tiers)-1]
	return lastTier.Input, lastTier.Output, true
}

// TextModelPrice2JSONString converts the text model price map to a JSON string
func TextModelPrice2JSONString() string {
	textModelPriceMapMutex.RLock()
	defer textModelPriceMapMutex.RUnlock()
	jsonBytes, err := json.Marshal(textModelPriceMap)
	if err != nil {
		common.SysLog("error marshalling text model price: " + err.Error())
		return "{}"
	}
	return string(jsonBytes)
}

// UpdateTextModelPriceByJSONString updates the text model price map from a JSON string
func UpdateTextModelPriceByJSONString(jsonStr string) error {
	textModelPriceMapMutex.Lock()
	defer textModelPriceMapMutex.Unlock()
	newMap := make(map[string]TextModelPrice)
	err := json.Unmarshal([]byte(jsonStr), &newMap)
	if err != nil {
		return err
	}
	textModelPriceMap = newMap
	InvalidateExposedDataCache()
	return nil
}

// GetTextModelPriceCopy returns a copy of the text model price map
func GetTextModelPriceCopy() map[string]TextModelPrice {
	textModelPriceMapMutex.RLock()
	defer textModelPriceMapMutex.RUnlock()
	copyMap := make(map[string]TextModelPrice, len(textModelPriceMap))
	for modelName, price := range textModelPriceMap {
		copyPrice := TextModelPrice{
			Tiers:         make([]TextModelTier, len(price.Tiers)),
			ThinkingTiers: make([]TextModelTier, len(price.ThinkingTiers)),
		}
		copy(copyPrice.Tiers, price.Tiers)
		copy(copyPrice.ThinkingTiers, price.ThinkingTiers)
		copyMap[modelName] = copyPrice
	}
	return copyMap
}
