package service

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/go-redis/redis/v8"
)

const (
	// Redis key prefix for channel rate limiting
	channelRateLimitKeyPrefix = "channel_rpm:"
	// Rate limit window duration (1 minute)
	rateLimitWindow = 60 * time.Second
)

// 内存限流器，用于 Redis 不可用时的降级方案
var (
	memoryRateLimiter     = make(map[int]*channelRateLimitBucket)
	memoryRateLimiterLock sync.RWMutex
)

// channelRateLimitBucket 内存滑动窗口桶
type channelRateLimitBucket struct {
	timestamps []int64
	lock       sync.Mutex
}

// CheckChannelRateLimit 检查渠道是否超过 RPM 限制
// 返回 true 表示允许请求，false 表示超限
// 此函数会同时记录请求（原子操作），无需再调用 RecordChannelRequest
// 此函数设计为 fail-open：任何错误都返回 true（允许请求）
func CheckChannelRateLimit(channelId int) bool {
	// 获取渠道的 RPM 限制
	maxRPM := model.GetChannelMaxRPM(channelId)
	if maxRPM <= 0 {
		// 没有设置限制或限制为0，允许所有请求
		return true
	}

	// 尝试使用 Redis
	if common.RedisEnabled && common.RDB != nil {
		allowed, err := checkAndRecordRateLimitRedis(channelId, maxRPM)
		if err != nil {
			// Redis 出错，降级到内存限流器
			common.SysLog(fmt.Sprintf("channel rate limit redis error for channel #%d: %v, falling back to memory", channelId, err))
			return checkAndRecordRateLimitMemory(channelId, maxRPM)
		}
		return allowed
	}

	// Redis 不可用，使用内存限流器
	return checkAndRecordRateLimitMemory(channelId, maxRPM)
}

// RecordChannelRequest 记录一次渠道请求
// 注意：CheckChannelRateLimit 已经包含记录逻辑，此函数保留用于兼容
func RecordChannelRequest(channelId int) {
	// CheckChannelRateLimit 已经在检查时记录了请求，这里不需要再记录
	// 保留空函数以保持接口兼容
}

// checkAndRecordRateLimitRedis 使用 Redis 检查限流并记录（原子操作）
func checkAndRecordRateLimitRedis(channelId int, maxRPM int) (bool, error) {
	ctx := context.Background()
	key := fmt.Sprintf("%s%d", channelRateLimitKeyPrefix, channelId)
	now := time.Now().Unix()
	windowStart := now - 60 // 1分钟窗口

	// 使用 Redis 事务实现原子操作
	pipe := common.RDB.TxPipeline()

	// 1. 移除窗口外的旧记录
	pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart))

	// 2. 统计当前窗口内的请求数
	countCmd := pipe.ZCard(ctx, key)

	_, err := pipe.Exec(ctx)
	if err != nil {
		return true, err // fail-open
	}

	currentCount := countCmd.Val()

	// 检查是否超限
	if currentCount >= int64(maxRPM) {
		return false, nil
	}

	// 未超限，记录本次请求
	member := fmt.Sprintf("%d", time.Now().UnixNano())
	pipe2 := common.RDB.Pipeline()
	pipe2.ZAdd(ctx, key, &redis.Z{Score: float64(now), Member: member})
	pipe2.Expire(ctx, key, 2*time.Minute)
	_, err = pipe2.Exec(ctx)
	if err != nil {
		// 记录失败也允许请求通过（fail-open）
		common.SysLog(fmt.Sprintf("channel rate limit record failed for channel #%d: %v", channelId, err))
	}

	return true, nil
}

// checkAndRecordRateLimitMemory 使用内存检查限流并记录（原子操作）
func checkAndRecordRateLimitMemory(channelId int, maxRPM int) bool {
	memoryRateLimiterLock.Lock()
	bucket, exists := memoryRateLimiter[channelId]
	if !exists {
		bucket = &channelRateLimitBucket{
			timestamps: make([]int64, 0, 100),
		}
		memoryRateLimiter[channelId] = bucket
	}
	memoryRateLimiterLock.Unlock()

	bucket.lock.Lock()
	defer bucket.lock.Unlock()

	now := time.Now().Unix()
	windowStart := now - 60

	// 清理过期记录并统计
	validCount := 0
	newTimestamps := make([]int64, 0, len(bucket.timestamps))
	for _, ts := range bucket.timestamps {
		if ts > windowStart {
			newTimestamps = append(newTimestamps, ts)
			validCount++
		}
	}

	// 检查是否超限
	if validCount >= maxRPM {
		bucket.timestamps = newTimestamps
		return false
	}

	// 未超限，记录本次请求
	newTimestamps = append(newTimestamps, now)
	bucket.timestamps = newTimestamps

	return true
}

// GetChannelCurrentRPM 获取渠道当前的 RPM（用于监控/展示）
func GetChannelCurrentRPM(channelId int) int64 {
	if common.RedisEnabled && common.RDB != nil {
		ctx := context.Background()
		key := fmt.Sprintf("%s%d", channelRateLimitKeyPrefix, channelId)
		now := time.Now().Unix()
		windowStart := now - 60

		// 先清理过期记录
		common.RDB.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart))

		// 统计当前数量
		count, err := common.RDB.ZCard(ctx, key).Result()
		if err != nil {
			return 0
		}
		return count
	}

	// 内存模式
	memoryRateLimiterLock.RLock()
	bucket, exists := memoryRateLimiter[channelId]
	memoryRateLimiterLock.RUnlock()

	if !exists {
		return 0
	}

	bucket.lock.Lock()
	defer bucket.lock.Unlock()

	now := time.Now().Unix()
	windowStart := now - 60
	count := int64(0)
	for _, ts := range bucket.timestamps {
		if ts > windowStart {
			count++
		}
	}
	return count
}

// ClearChannelRateLimit 清除渠道的限流记录（用于测试或重置）
func ClearChannelRateLimit(channelId int) {
	if common.RedisEnabled && common.RDB != nil {
		ctx := context.Background()
		key := fmt.Sprintf("%s%d", channelRateLimitKeyPrefix, channelId)
		common.RDB.Del(ctx, key)
	}

	memoryRateLimiterLock.Lock()
	delete(memoryRateLimiter, channelId)
	memoryRateLimiterLock.Unlock()
}
