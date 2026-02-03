package ratio_setting

import (
	"encoding/json"
	"errors"
	"sort"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/types"
)

var groupRatio = map[string]float64{
	"default": 1,
	"vip":     1,
	"svip":    1,
}

var groupRatioMutex sync.RWMutex

// 分组排序，存储分组名称的有序列表
var groupOrder = []string{}
var groupOrderMutex sync.RWMutex

var (
	GroupGroupRatio = map[string]map[string]float64{
		"vip": {
			"edit_this": 0.9,
		},
	}
	groupGroupRatioMutex sync.RWMutex
)

var defaultGroupSpecialUsableGroup = map[string]map[string]string{
	"vip": {
		"append_1":   "vip_special_group_1",
		"-:remove_1": "vip_removed_group_1",
	},
}

type GroupRatioSetting struct {
	GroupRatio              map[string]float64                      `json:"group_ratio"`
	GroupGroupRatio         map[string]map[string]float64           `json:"group_group_ratio"`
	GroupSpecialUsableGroup *types.RWMap[string, map[string]string] `json:"group_special_usable_group"`
}

var groupRatioSetting GroupRatioSetting

func init() {
	groupSpecialUsableGroup := types.NewRWMap[string, map[string]string]()
	groupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)

	groupRatioSetting = GroupRatioSetting{
		GroupSpecialUsableGroup: groupSpecialUsableGroup,
		GroupRatio:              groupRatio,
		GroupGroupRatio:         GroupGroupRatio,
	}

	config.GlobalConfig.Register("group_ratio_setting", &groupRatioSetting)
}

func GetGroupRatioSetting() *GroupRatioSetting {
	if groupRatioSetting.GroupSpecialUsableGroup == nil {
		groupRatioSetting.GroupSpecialUsableGroup = types.NewRWMap[string, map[string]string]()
		groupRatioSetting.GroupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)
	}
	return &groupRatioSetting
}

func GetGroupRatioCopy() map[string]float64 {
	groupRatioMutex.RLock()
	defer groupRatioMutex.RUnlock()

	groupRatioCopy := make(map[string]float64)
	for k, v := range groupRatio {
		groupRatioCopy[k] = v
	}
	return groupRatioCopy
}

func ContainsGroupRatio(name string) bool {
	groupRatioMutex.RLock()
	defer groupRatioMutex.RUnlock()

	_, ok := groupRatio[name]
	return ok
}

func GroupRatio2JSONString() string {
	groupRatioMutex.RLock()
	defer groupRatioMutex.RUnlock()

	jsonBytes, err := json.Marshal(groupRatio)
	if err != nil {
		common.SysLog("error marshalling model ratio: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateGroupRatioByJSONString(jsonStr string) error {
	groupRatioMutex.Lock()
	defer groupRatioMutex.Unlock()

	groupRatio = make(map[string]float64)
	return json.Unmarshal([]byte(jsonStr), &groupRatio)
}

func GetGroupRatio(name string) float64 {
	groupRatioMutex.RLock()
	defer groupRatioMutex.RUnlock()

	ratio, ok := groupRatio[name]
	if !ok {
		common.SysLog("group ratio not found: " + name)
		return 1
	}
	return ratio
}

func GetGroupGroupRatio(userGroup, usingGroup string) (float64, bool) {
	groupGroupRatioMutex.RLock()
	defer groupGroupRatioMutex.RUnlock()

	gp, ok := GroupGroupRatio[userGroup]
	if !ok {
		return -1, false
	}
	ratio, ok := gp[usingGroup]
	if !ok {
		return -1, false
	}
	return ratio, true
}

func GroupGroupRatio2JSONString() string {
	groupGroupRatioMutex.RLock()
	defer groupGroupRatioMutex.RUnlock()

	jsonBytes, err := json.Marshal(GroupGroupRatio)
	if err != nil {
		common.SysLog("error marshalling group-group ratio: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateGroupGroupRatioByJSONString(jsonStr string) error {
	groupGroupRatioMutex.Lock()
	defer groupGroupRatioMutex.Unlock()

	GroupGroupRatio = make(map[string]map[string]float64)
	return json.Unmarshal([]byte(jsonStr), &GroupGroupRatio)
}

func CheckGroupRatio(jsonStr string) error {
	checkGroupRatio := make(map[string]float64)
	err := json.Unmarshal([]byte(jsonStr), &checkGroupRatio)
	if err != nil {
		return err
	}
	for name, ratio := range checkGroupRatio {
		if ratio < 0 {
			return errors.New("group ratio must be not less than 0: " + name)
		}
	}
	return nil
}

// GetGroupOrder 获取分组排序列表
func GetGroupOrder() []string {
	groupOrderMutex.RLock()
	defer groupOrderMutex.RUnlock()

	orderCopy := make([]string, len(groupOrder))
	copy(orderCopy, groupOrder)
	return orderCopy
}

// GroupOrder2JSONString 将分组排序转换为JSON字符串
func GroupOrder2JSONString() string {
	groupOrderMutex.RLock()
	defer groupOrderMutex.RUnlock()

	jsonBytes, err := json.Marshal(groupOrder)
	if err != nil {
		common.SysLog("error marshalling group order: " + err.Error())
		return "[]"
	}
	return string(jsonBytes)
}

// UpdateGroupOrderByJSONString 通过JSON字符串更新分组排序
func UpdateGroupOrderByJSONString(jsonStr string) error {
	groupOrderMutex.Lock()
	defer groupOrderMutex.Unlock()

	var newOrder []string
	if jsonStr == "" {
		groupOrder = []string{}
		return nil
	}
	err := json.Unmarshal([]byte(jsonStr), &newOrder)
	if err != nil {
		return err
	}
	groupOrder = newOrder
	return nil
}

// GetSortedGroupNames 获取排序后的分组名称列表
// 如果设置了排序，按排序返回；否则按字母顺序返回
func GetSortedGroupNames() []string {
	groupRatioMutex.RLock()
	allGroups := make([]string, 0, len(groupRatio))
	for name := range groupRatio {
		allGroups = append(allGroups, name)
	}
	groupRatioMutex.RUnlock()

	groupOrderMutex.RLock()
	orderList := make([]string, len(groupOrder))
	copy(orderList, groupOrder)
	groupOrderMutex.RUnlock()

	if len(orderList) == 0 {
		// 没有设置排序，按字母顺序返回
		sort.Strings(allGroups)
		return allGroups
	}

	// 创建排序映射
	orderMap := make(map[string]int)
	for i, name := range orderList {
		orderMap[name] = i
	}

	// 按排序返回，未在排序列表中的放到最后
	sort.Slice(allGroups, func(i, j int) bool {
		orderI, okI := orderMap[allGroups[i]]
		orderJ, okJ := orderMap[allGroups[j]]
		if okI && okJ {
			return orderI < orderJ
		}
		if okI {
			return true
		}
		if okJ {
			return false
		}
		// 都不在排序列表中，按字母顺序
		return allGroups[i] < allGroups[j]
	})

	return allGroups
}
