package ratio_setting

import (
	"encoding/json"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

// specialModelPriceMap stores special model prices
// Format: {"model_name": {"1k": 0.04, "2k": 0.08, "4k": 0.16}}
var specialModelPriceMap = make(map[string]map[string]float64)
var specialModelPriceMapMutex sync.RWMutex

// GetSpecialModelPriceMap returns the special model price map
func GetSpecialModelPriceMap() map[string]map[string]float64 {
	specialModelPriceMapMutex.RLock()
	defer specialModelPriceMapMutex.RUnlock()
	return specialModelPriceMap
}

// GetSpecialModelPrice returns the special prices for a model
func GetSpecialModelPrice(modelName string) (map[string]float64, bool) {
	specialModelPriceMapMutex.RLock()
	defer specialModelPriceMapMutex.RUnlock()
	prices, ok := specialModelPriceMap[modelName]
	if !ok || len(prices) == 0 {
		return nil, false
	}
	// Return a copy to prevent external modification
	copyPrices := make(map[string]float64, len(prices))
	for k, v := range prices {
		copyPrices[k] = v
	}
	return copyPrices, true
}

// SpecialModelPrice2JSONString converts the special model price map to a JSON string
func SpecialModelPrice2JSONString() string {
	specialModelPriceMapMutex.RLock()
	defer specialModelPriceMapMutex.RUnlock()
	jsonBytes, err := json.Marshal(specialModelPriceMap)
	if err != nil {
		common.SysLog("error marshalling special model price: " + err.Error())
		return "{}"
	}
	return string(jsonBytes)
}

// UpdateSpecialModelPriceByJSONString updates the special model price map from a JSON string
func UpdateSpecialModelPriceByJSONString(jsonStr string) error {
	specialModelPriceMapMutex.Lock()
	defer specialModelPriceMapMutex.Unlock()
	newMap := make(map[string]map[string]float64)
	err := json.Unmarshal([]byte(jsonStr), &newMap)
	if err != nil {
		return err
	}
	specialModelPriceMap = newMap
	InvalidateExposedDataCache()
	return nil
}

// GetSpecialModelPriceCopy returns a copy of the special model price map
func GetSpecialModelPriceCopy() map[string]map[string]float64 {
	specialModelPriceMapMutex.RLock()
	defer specialModelPriceMapMutex.RUnlock()
	copyMap := make(map[string]map[string]float64, len(specialModelPriceMap))
	for modelName, prices := range specialModelPriceMap {
		copyPrices := make(map[string]float64, len(prices))
		for k, v := range prices {
			copyPrices[k] = v
		}
		copyMap[modelName] = copyPrices
	}
	return copyMap
}
