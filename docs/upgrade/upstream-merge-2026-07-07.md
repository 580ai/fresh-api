# 2026-07-07 上游 new-api 合并记录

## 合并范围

- 目标分支：`self`
- 上游仓库：`https://github.com/QuantumNous/new-api`
- 上游版本：`v1.0.0-rc.18`
- 上游提交：`c9943d37a`
- 合并前备份分支：`self-before-upstream-20260707` (`e763c4975`)

## 主要上游更新

- 引入系统任务框架、系统信息面板、权限/授权策略同步、请求体限制和 SSRF 保护增强。
- 引入 Advanced Custom 渠道、OpenAI Responses 兼容转换、Gemini Responses 转换、Codex 订阅渠道更新。
- 前端 default 迁移到新的 Rsbuild/Bun workspace 结构，新增系统信息、数据表、钱包、订阅、模型设置等页面能力。
- classic 前端从 Vite 迁移到 Rsbuild，并改为共享 `web/bun.lock` workspace 锁文件。

## 已保留的本地二开能力

- 保留 `Anthropic Claude批量` 渠道类型 `9001`，并继续加入流式支持。
- 保留多分组 token 选择、跨分组重试、渠道优先级监控、渠道统计、自动启用、批量启停和渠道模型补丁接口。
- 保留渠道 BaseURL 管理员开关：系统设置中可配置，default 渠道抽屉会按该开关禁用/清空自定义 BaseURL。
- 保留登录/注册页自定义布局、手机号验证码注册、`/code` 和 `/out` 相关 classic dev proxy。
- 保留钱包页隐藏邀请奖励入口的二开策略。
- 保留本地操作日志，同时合并上游管理审计记录。
- 保留 Claude metadata 注入、Gemini image config 处理等本地 relay 行为，并按项目规范改用 `common.Marshal/common.Unmarshal`。

## 冲突处理说明

- `go.mod/go.sum`：以上游依赖版本为主，保留本地 `github.com/xuri/excelize/v2`；执行 `go mod tidy` 重新规整。
- `main.go`：删除已失效的旧 `AutomaticallyTestChannels` 调用，改用上游 system task runner 中已注册的 `channel_test` 定时任务。
- `service/channel_select.go`：为本地多分组选择补齐上游新增的 `RequestPath` 参数，保证 Advanced Custom 渠道按路径过滤。
- `controller/channel-priority-monitor.go`、`controller/channel-test.go`：适配上游 `testChannel` 新签名，后台任务使用 root 用户作为测试用户。
- `relay/channel/openai/chat_via_responses.go`、`relay/channel/gemini/relay_responses.go`：修复上游转换状态重构后遗漏的变量/返回值适配。
- `web/classic/rsbuild.config.ts`：保留本地代理配置，并为 classic 构建添加 `date-fns` v2 alias，避免 Semi UI 与 workspace 根部 `date-fns` v4 冲突。
- 前端 i18n：已运行 default 的 `bun run i18n:sync`，为新增 BaseURL 开关文案补齐 `en/zh/fr/ja/ru/vi`。

## 验证结果

- 通过：`go mod tidy`
- 通过：`go test ./...`
- 通过：`bun install`（`web/` workspace）
- 通过：`bun run --cwd default typecheck`
- 通过：`bun run --cwd default build`
- 通过：`bun run --cwd classic build`
- 未通过但未在本次合并中扩展修复：`bun run --cwd default lint`，当前 default 前端存在大量上游/既有 oxlint 基线问题。
- 未通过但未在本次合并中扩展修复：`go vet ./...`，当前存在既有 vet 告警，包括 `CustomEvent` 拷贝锁、若干 adaptor unreachable code 等。

## 后续建议

- 单独开任务清理 default 前端 oxlint 基线，再把 lint 纳入合并门禁。
- 单独开任务清理 `go vet` 基线，再把 vet 纳入后端门禁。
- 上线前重点回归渠道新增/编辑、BaseURL 开关、多分组路由、Anthropic 批量渠道、classic 登录注册、钱包充值与订阅购买流程。
