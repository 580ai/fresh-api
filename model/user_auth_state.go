package model

import (
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// UserAuthState 是鉴权链路每个请求都要比对的最小快照：状态、角色和会话版本号。
// 单独抽出来而不是复用 UserBase，是因为 UserBase 还带着额度等高频变动字段，
// 那些字段有独立的原子更新路径，不适合放进按请求校验的结构里。
type UserAuthState struct {
	Id          int
	Status      int
	Role        int
	AuthVersion int
}

type cachedAuthState struct {
	state   UserAuthState
	expires time.Time
}

var (
	userAuthStateCache   sync.Map // map[int]cachedAuthState
	userAuthStateVersion sync.Map // map[int]uint64，用于让并发中的旧读结果失效
	authStateVersionSeq  uint64
)

// authStateCacheTTL 控制单机缓存的存活时间。改了密码/禁用/降权后本机会主动失效，
// 多机部署时其他节点最多滞后这么久。设为 0 可完全关闭缓存，每个请求都查库。
func authStateCacheTTL() time.Duration {
	return time.Duration(common.GetEnvOrDefault("USER_AUTH_STATE_CACHE_SECONDS", 5)) * time.Second
}

// GetUserAuthState 读取用户鉴权状态，带短 TTL 单机缓存。
// 数据库错误会向上返回，由调用方决定失败关闭。
func GetUserAuthState(userId int) (UserAuthState, error) {
	ttl := authStateCacheTTL()
	if ttl <= 0 {
		return loadUserAuthState(userId)
	}

	now := time.Now()
	if cached, ok := userAuthStateCache.Load(userId); ok {
		entry := cached.(cachedAuthState)
		if now.Before(entry.expires) {
			return entry.state, nil
		}
	}

	versionBefore := currentAuthStateVersion(userId)
	state, err := loadUserAuthState(userId)
	if err != nil {
		return UserAuthState{}, err
	}

	// 查询期间该用户被写操作失效过，则丢弃这次可能过期的结果
	if currentAuthStateVersion(userId) != versionBefore {
		return state, nil
	}

	userAuthStateCache.Store(userId, cachedAuthState{
		state:   state,
		expires: now.Add(ttl),
	})
	return state, nil
}

func loadUserAuthState(userId int) (UserAuthState, error) {
	var user User
	err := DB.Select("id", "status", "role", "auth_version").First(&user, "id = ?", userId).Error
	if err != nil {
		return UserAuthState{}, err
	}
	return UserAuthState{
		Id:          user.Id,
		Status:      user.Status,
		Role:        user.Role,
		AuthVersion: user.AuthVersion,
	}, nil
}

func currentAuthStateVersion(userId int) uint64 {
	if v, ok := userAuthStateVersion.Load(userId); ok {
		return v.(uint64)
	}
	return 0
}

// InvalidateUserAuthState 清除某个用户的鉴权状态缓存。
// 用户状态、角色或会话版本发生变化后必须调用，否则本机会在 TTL 内继续放行。
func InvalidateUserAuthState(userId int) {
	authStateVersionSeq++
	userAuthStateVersion.Store(userId, authStateVersionSeq)
	userAuthStateCache.Delete(userId)
}

// BumpUserAuthVersion 递增会话版本号并清空鉴权缓存。
// 递增后该用户所有既有 session（包括当前设备）在下次请求时都会失效。
func BumpUserAuthVersion(userId int) error {
	if userId == 0 {
		return nil
	}
	err := DB.Model(&User{}).Where("id = ?", userId).
		UpdateColumn("auth_version", gorm.Expr("auth_version + 1")).Error
	if err != nil {
		return err
	}
	InvalidateUserAuthState(userId)
	return InvalidateUserCache(userId)
}
