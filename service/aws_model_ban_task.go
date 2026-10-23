package service

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func StartAwsModelBanTask() {
	for {
		time.Sleep(60 * time.Second)
		executeAwsModelBanTask()
	}
}

func executeAwsModelBanTask() {
	// Check if enabled
	enabled := getAwsSetting("aws_setting.enabled")
	if enabled != "true" {
		return
	}

	// Get configured groups
	groupsStr := getAwsSetting("aws_setting.groups")
	if groupsStr == "" {
		return
	}
	var groups []string
	err := json.Unmarshal([]byte(groupsStr), &groups)
	if err != nil || len(groups) == 0 {
		return
	}

	// Get keywords
	keywordsStr := getAwsSetting("aws_setting.keywords")
	if keywordsStr == "" {
		return
	}
	keywords := parseKeywords(keywordsStr)
	if len(keywords) == 0 {
		return
	}

	// Get ban duration
	banDurationStr := getAwsSetting("aws_setting.ban_duration")
	banDuration, err := strconv.Atoi(banDurationStr)
	if err != nil || banDuration <= 0 {
		banDuration = 60 // default 60 minutes
	}

	// Phase 1: Scan recent error logs (last 2 minutes to avoid missing any)
	sinceTimestamp := time.Now().Unix() - 120
	logs, err := model.GetRecentErrorLogs(sinceTimestamp, groups)
	if err != nil {
		common.SysError(fmt.Sprintf("AWS ban task: failed to get error logs: %s", err.Error()))
		return
	}

	// Phase 2 & 3: Match keywords and ban models
	for _, logEntry := range logs {
		if logEntry.ModelName == "" || logEntry.ChannelId == 0 || logEntry.Group == "" {
			continue
		}

		// Check if content matches any keyword
		contentLower := strings.ToLower(logEntry.Content)
		matched := false
		for _, keyword := range keywords {
			if strings.Contains(contentLower, keyword) {
				matched = true
				break
			}
		}
		if !matched {
			continue
		}

		// Check if already banned
		_, err := model.GetActiveAwsModelBan(logEntry.Group, logEntry.ChannelId, logEntry.ModelName)
		if err == nil {
			// Already banned, skip
			continue
		}

		// Ban the model
		now := time.Now().Unix()
		channelName := model.GetChannelNameById(logEntry.ChannelId)
		ban := &model.AwsModelBan{
			Group:        logEntry.Group,
			ChannelId:    logEntry.ChannelId,
			ChannelName:  channelName,
			ModelName:    logEntry.ModelName,
			ErrorContent: logEntry.Content,
			BanTime:      now,
			UnbanTime:    now + int64(banDuration*60),
			Status:       1,
		}

		err = model.CreateAwsModelBan(ban)
		if err != nil {
			common.SysError(fmt.Sprintf("AWS ban task: failed to create ban record: %s", err.Error()))
			continue
		}

		// Disable the ability
		err = model.DisableModelAbility(logEntry.Group, logEntry.ModelName, logEntry.ChannelId)
		if err != nil {
			common.SysError(fmt.Sprintf("AWS ban task: failed to disable ability: %s", err.Error()))
		}

		common.SysLog(fmt.Sprintf("AWS ban task: banned model %s in group %s channel %d (%s) for %d minutes",
			logEntry.ModelName, logEntry.Group, logEntry.ChannelId, channelName, banDuration))
	}

	// Phase 4: Restore expired bans
	expiredBans, err := model.GetExpiredAwsModelBans()
	if err != nil {
		common.SysError(fmt.Sprintf("AWS ban task: failed to get expired bans: %s", err.Error()))
		return
	}

	for _, ban := range expiredBans {
		// Re-enable the ability
		err = model.EnableModelAbility(ban.Group, ban.ModelName, ban.ChannelId)
		if err != nil {
			common.SysError(fmt.Sprintf("AWS ban task: failed to enable ability: %s", err.Error()))
			continue
		}

		// Delete the ban record
		err = model.RestoreAwsModelBan(ban.Id)
		if err != nil {
			common.SysError(fmt.Sprintf("AWS ban task: failed to delete ban record: %s", err.Error()))
			continue
		}

		common.SysLog(fmt.Sprintf("AWS ban task: restored model %s in group %s channel %d (%s)",
			ban.ModelName, ban.Group, ban.ChannelId, ban.ChannelName))
	}
}

func getAwsSetting(key string) string {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	return common.OptionMap[key]
}

func parseKeywords(keywordsStr string) []string {
	lines := strings.Split(keywordsStr, "\n")
	var keywords []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			keywords = append(keywords, strings.ToLower(line))
		}
	}
	return keywords
}
