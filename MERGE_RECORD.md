# 合并记录

## 分支说明

- `self`: 自定义功能开发分支
- `origin/main`: 远程主分支 (new-api 官方)

---

## 上游合并基准

**本次合并到的 origin/main 提交**: `982dc5c5` - chore: update .gitattributes

下次合并时，从此提交之后的新提交开始合并。

---

## self 分支新增功能

| 提交 | 功能描述 |
|------|----------|
| `7ead9160` | 新增手机注册逻辑；使用 VITE_PHONE_REGISTER 开关切换手机/邮箱注册 |
| `d9710692` | 新增操作日志功能；其他用户可提升至超级管理员 |
| `3e3e08b5` | 修复上游任务状态变更导致视频任务重复退款 |
| `604daf95` | 增加超时率显示 |
| `b90c36b0` | 增加渠道成功率功能 |
| `1009339c` | 新增文本模型阶梯计费 |
| `448790fb` | 修改画图模型分辨率计费为动态添加 |
| `e6b6db97` | 增加 gemini-3-pro-image-preview 模型 1k、2k、4k 定价 |
| `95accbe9` | 新增令牌可以多选分组；运营设置里面设置每个分组的重试次数 |
| `404e43eb` | 新增渠道优先级监控设置前端UI |
| `5544d4bf` | 新增渠道优先级监控设置后端逻辑 |
| `4c1e3b2f` | 定时任务检测处理 |
| `e69850c4` | 修正：一个模型只有一个渠道则直接跳过；优先级按分层进行调节 |
| `待提交` | 新增渠道自动启用功能 |

---

## 文件级别变更清单

> 此表格记录每个功能涉及的文件变更，方便合并时快速定位冲突文件

### 渠道自动启用功能 (待提交)

**新增文件** (合并时无冲突):
| 文件路径 | 说明 |
|----------|------|
| `model/channel_auto_enable.go` | 渠道自动启用配置表模型 |
| `setting/operation_setting/channel_auto_enable_setting.go` | 自动启用设置配置 |
| `service/channel_auto_enable_task.go` | 自动启用定时任务 |
| `controller/channel-auto-enable.go` | 自动启用API控制器 |

**修改文件** (合并时可能冲突):
| 文件路径 | 修改内容 | 冲突风险 |
|----------|----------|----------|
| `model/main.go` | AutoMigrate 添加 ChannelAutoEnable, OperationLog | 中 |
| `model/operation_log.go` | userId=0 时显示"系统" | 低 |
| `router/api-router.go` | 添加 /channel/auto-enable 路由组 | 中 |
| `main.go` | 启动 StartChannelAutoEnableTask | 低 |
| `controller/channel-test.go` | 添加 TestChannelForAutoEnableImpl 函数 | 中 |
| `web/src/components/table/channels/modals/EditChannelModal.jsx` | 添加自动启用开关 | 高 |
| `web/src/pages/Setting/Operation/SettingsCreditLimit.jsx` | 添加自动启用设置卡片 | 高 |
| `web/src/components/settings/OperationSetting.jsx` | 添加 channel_auto_enable_setting 配置项 | 中 |

### 操作日志功能 (d9710692)

**新增文件**:
| 文件路径 | 说明 |
|----------|------|
| `model/operation_log.go` | 操作日志模型 |
| `controller/operation-log.go` | 操作日志API |

**修改文件**:
| 文件路径 | 修改内容 |
|----------|----------|
| `router/api-router.go` | 添加操作日志路由 |
| 各 controller 文件 | 添加 RecordOperationLog 调用 |

### 渠道优先级监控 (404e43eb, 5544d4bf, 4c1e3b2f, e69850c4)

**新增文件**:
| 文件路径 | 说明 |
|----------|------|
| `controller/channel-priority-monitor.go` | 优先级监控控制器 |
| `service/channel_priority_task.go` | 优先级监控定时任务 |
| `setting/operation_setting/channel_priority_setting.go` | 优先级监控设置 |

**修改文件**:
| 文件路径 | 修改内容 |
|----------|----------|
| `web/src/pages/Setting/Operation/SettingsMonitoring.jsx` | 添加优先级监控UI |

---

## 高冲突风险文件

> 这些文件经常被修改，合并时需要特别注意

| 文件路径 | 原因 | 建议 |
|----------|------|------|
| `router/api-router.go` | 多功能都需要添加路由 | 在文件末尾添加自定义路由，便于识别 |
| `model/main.go` | 多功能需要 AutoMigrate | 在 AutoMigrate 末尾添加自定义模型 |
| `main.go` | 启动任务注册 | 在文件末尾集中添加自定义任务启动 |
| `web/src/components/settings/OperationSetting.jsx` | 设置页配置项 | 自定义配置项加注释标记 |

---

## 本次合并修复的冲突

1. `setting/ratio_setting/group_ratio.go` - 修复 `groupRatioMutex` 和 `groupRatio` 未定义，改用 `groupRatioMap.ReadAll()`
2. `dto/gemini.go` - 删除重复的 `UnmarshalJSON` 方法
3. `model/log.go` - 新增 `GetChannelStatsFromLogs` 和 `GetAllChannelStatsFromLogs` 函数
4. `model/task.go` - 新增 `TaskBulkUpdate` 函数 (接受 `[]string` 类型)
5. `controller/redemption.go` - 移除未使用的 `errors` 导入
6. `controller/channel-priority-monitor.go` - `testChannel` 调用添加第4个参数
7. `web/src/pages/Setting/Operation/SettingsMonitoring.jsx` - 删除重复的变量声明

---

## 下次合并步骤

```bash
git fetch origin
git merge origin/main
# 解决冲突后更新本文档
```

---

## 合并最佳实践

### 1. 新功能开发规范
- **优先创建新文件**：将逻辑放在独立文件中，减少冲突
- **修改现有文件时**：在修改处添加注释标记，如 `// [CUSTOM] 渠道自动启用`
- **集中注册点**：路由、任务启动等尽量在文件末尾集中添加

### 2. 提交规范
- 每个功能使用单独提交，提交信息格式：`[CUSTOM] 功能描述`
- 复杂功能拆分为多个提交，便于 cherry-pick

### 3. 合并前检查
```bash
# 查看上游有哪些文件变更
git diff origin/main --name-only

# 查看可能冲突的文件
git diff origin/main --name-only | grep -E "(router|main.go|model/main)"
```

### 4. 冲突解决后
- 更新本文档的"上游合并基准"
- 记录解决的冲突到"本次合并修复的冲突"
- 运行测试确保功能正常

---

*最后更新: 2025-02-27*
