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

*最后更新: 2025-02-25*
