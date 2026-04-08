package setting

import (
	"encoding/json"
	"fmt"
	"math"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

var ModelRequestRateLimitEnabled = false
var ModelRequestRateLimitDurationMinutes = 1
var ModelRequestRateLimitCount = 0
var ModelRequestRateLimitSuccessCount = 1000
var ModelRequestRateLimitGroup = map[string][2]int{}
var ModelRequestRateLimitMutex sync.RWMutex

// UserRequestRateLimitMap 用户级别的请求速率限制，key为用户ID，value为[总请求数, 成功请求数]
var UserRequestRateLimitMap = map[int][2]int{}
var UserRequestRateLimitMutex sync.RWMutex

func ModelRequestRateLimitGroup2JSONString() string {
	ModelRequestRateLimitMutex.RLock()
	defer ModelRequestRateLimitMutex.RUnlock()

	jsonBytes, err := json.Marshal(ModelRequestRateLimitGroup)
	if err != nil {
		common.SysLog("error marshalling model ratio: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateModelRequestRateLimitGroupByJSONString(jsonStr string) error {
	ModelRequestRateLimitMutex.RLock()
	defer ModelRequestRateLimitMutex.RUnlock()

	ModelRequestRateLimitGroup = make(map[string][2]int)
	return json.Unmarshal([]byte(jsonStr), &ModelRequestRateLimitGroup)
}

func GetGroupRateLimit(group string) (totalCount, successCount int, found bool) {
	ModelRequestRateLimitMutex.RLock()
	defer ModelRequestRateLimitMutex.RUnlock()

	if ModelRequestRateLimitGroup == nil {
		return 0, 0, false
	}

	limits, found := ModelRequestRateLimitGroup[group]
	if !found {
		return 0, 0, false
	}
	return limits[0], limits[1], true
}

func CheckModelRequestRateLimitGroup(jsonStr string) error {
	checkModelRequestRateLimitGroup := make(map[string][2]int)
	err := json.Unmarshal([]byte(jsonStr), &checkModelRequestRateLimitGroup)
	if err != nil {
		return err
	}
	for group, limits := range checkModelRequestRateLimitGroup {
		if limits[0] < 0 || limits[1] < 1 {
			return fmt.Errorf("group %s has negative rate limit values: [%d, %d]", group, limits[0], limits[1])
		}
		if limits[0] > math.MaxInt32 || limits[1] > math.MaxInt32 {
			return fmt.Errorf("group %s [%d, %d] has max rate limits value 2147483647", group, limits[0], limits[1])
		}
	}

	return nil
}

// UserRequestRateLimitMap2JSONString 将用户速率限制映射转为JSON字符串
func UserRequestRateLimitMap2JSONString() string {
	UserRequestRateLimitMutex.RLock()
	defer UserRequestRateLimitMutex.RUnlock()

	// 将 map[int][2]int 转换为 map[string][2]int 以便JSON序列化
	strMap := make(map[string][2]int)
	for k, v := range UserRequestRateLimitMap {
		strMap[fmt.Sprintf("%d", k)] = v
	}
	jsonBytes, err := json.Marshal(strMap)
	if err != nil {
		common.SysLog("error marshalling user request rate limit map: " + err.Error())
	}
	return string(jsonBytes)
}

// UpdateUserRequestRateLimitMapByJSONString 从JSON字符串更新用户速率限制映射
func UpdateUserRequestRateLimitMapByJSONString(jsonStr string) error {
	UserRequestRateLimitMutex.Lock()
	defer UserRequestRateLimitMutex.Unlock()

	strMap := make(map[string][2]int)
	err := json.Unmarshal([]byte(jsonStr), &strMap)
	if err != nil {
		return err
	}
	newMap := make(map[int][2]int)
	for k, v := range strMap {
		var userId int
		_, err := fmt.Sscanf(k, "%d", &userId)
		if err != nil {
			return fmt.Errorf("invalid user id: %s", k)
		}
		newMap[userId] = v
	}
	UserRequestRateLimitMap = newMap
	return nil
}

// GetUserRateLimit 获取指定用户的速率限制
func GetUserRateLimit(userId int) (totalCount, successCount int, found bool) {
	UserRequestRateLimitMutex.RLock()
	defer UserRequestRateLimitMutex.RUnlock()

	if UserRequestRateLimitMap == nil {
		return 0, 0, false
	}

	limits, found := UserRequestRateLimitMap[userId]
	if !found {
		return 0, 0, false
	}
	return limits[0], limits[1], true
}

// CheckUserRequestRateLimitMap 校验用户速率限制JSON格式
func CheckUserRequestRateLimitMap(jsonStr string) error {
	strMap := make(map[string][2]int)
	err := json.Unmarshal([]byte(jsonStr), &strMap)
	if err != nil {
		return err
	}
	for userIdStr, limits := range strMap {
		var userId int
		_, err := fmt.Sscanf(userIdStr, "%d", &userId)
		if err != nil {
			return fmt.Errorf("invalid user id: %s", userIdStr)
		}
		if userId <= 0 {
			return fmt.Errorf("user id must be positive: %s", userIdStr)
		}
		if limits[0] < 0 || limits[1] < 1 {
			return fmt.Errorf("user %s has invalid rate limit values: [%d, %d]", userIdStr, limits[0], limits[1])
		}
		if limits[0] > math.MaxInt32 || limits[1] > math.MaxInt32 {
			return fmt.Errorf("user %s [%d, %d] has max rate limits value 2147483647", userIdStr, limits[0], limits[1])
		}
	}
	return nil
}
