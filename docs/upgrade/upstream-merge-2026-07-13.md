# 2026-07-13 上游 new-api 合并记录

## 合并范围

- 目标分支：`self`
- 上游仓库：`https://github.com/QuantumNous/new-api`
- 上游分支：`upstream/main`
- 上游提交：`7c28993f6bd9e92616f3f578212577f8b7c40b45`
- 最近上游标签：`v1.0.0-rc.21`（目标提交位于该标签之后 2 个提交）
- 合并基线：`c9943d37ad93477dd937fc4901cc3c4e0fd8aaab`
- 合并前 `self`：`a3b74f9e5f1f419ea7ac5b4fe4fc9fd202384efe`
- 合并前备份分支：`self-before-upstream-20260713`

## 主要上游更新

- 引入统一的 `service/relayconvert` 请求/响应转换注册体系，重构 Claude、Gemini、OpenAI Responses 等协议转换。
- 引入 `BillingUsage`、安全额度饱和转换、缓存写入计费、动态/阶梯计费结算增强。
- 完善订阅重置、系统实例、模型价格端点、渠道设置、Advanced Custom 渠道和日志耗时指标。
- default 前端新增繁体中文、连接信息剪贴板导入、Playground 参数面板、订阅重置和多项表格/定价体验改进。
- 更新构建工作流，并明确部署环境需要 64 位操作系统和硬件架构。

## 已保留的本地二开能力

- 保留 `Anthropic Claude批量` 渠道类型 `9001` 及流式支持。
- 保留多分组 token 选择、跨分组重试、渠道优先级监控、渠道统计、自动启用、批量启停和渠道模型补丁接口。
- 保留渠道 BaseURL 管理员开关；剪贴板导入连接信息时也不能绕过该开关。
- 保留 Claude 稳定 `user_id` 注入、状态码映射及请求/响应内容日志。
- 保留 Gemini 请求/响应日志、状态码处理和 image config 行为，并接入上游转换架构。
- 保留本地“空输出不扣费”、请求/响应日志字段、multi-group 计费和不锁定硬编码模型倍率的策略。
- 保留登录/注册页布局、手机号验证码注册、classic dev proxy、隐藏钱包邀请奖励入口及本地操作日志等既有功能。
- 保留上游删除的 `output/posters/newapi-40k-stars-light.{png,svg}` 项目标识资源。

## 关键冲突与语义合并

- Claude/Gemini relay：采用上游 `relayconvert` 注册架构，同时迁移本地 metadata、日志、状态码和渠道 `9001` 行为。
- 计费：合并上游 quota saturation、`BillingUsage`、cache-write 和 tiered billing，同时保留本地空输出不扣费及日志字段。
- DeepSeek-via-Claude：语义集成 `wip/text-quota-20260713` 的缓存计费修复，并避免规范化后的 `BillingUsage` 被重复扣减缓存 token。
- `relay/helper/price.go`：保留 multi-group 价格处理，并纳入上游严格额度转换和阶梯计费预扣回退。
- multi-group 重试：切换分组时同步更新阶梯计费快照的分组倍率，并在下一次上游请求前按新倍率补足预扣；余额不足时返回 403 且不发送请求，最终结算按实际成功分组计费。
- 计费安全：阶梯表达式结算结果在公共边界保证非负，避免条件表达式或下溢产生额度返还；钱包和有限令牌通过跨数据库兼容的条件更新原子扣减，追加预扣、trusted 会话及 batch 模式都不能透支。
- 结算一致性：追加预扣和最终结算先锁定令牌额度，再提交钱包或订阅资金；资金提交失败会恢复令牌，避免两类额度永久分叉。额度写入后直接失效 Redis 快照，后续读取回源数据库。
- 空输出策略：仅文本生成端点在成功响应没有输出 token 时免扣；embedding、rerank、图片、音频和 moderation 等输入侧或按次计费端点仍正常结算。
- 模型倍率：合入 GPT-5.5/5.6 配置，同时继续遵循本地“不锁定硬编码倍率”的更新策略。
- default 渠道抽屉：保留上游剪贴板连接信息功能，并用管理员 BaseURL 开关约束导入结果。
- 前端 i18n：按 key 对 base/local/upstream 三方合并，再执行同步；避免新增 `zh-TW` 被错误用作其他语言的翻译来源。
- README：保留本地中文部署说明，并加入上游 64 位架构要求。

## 范围说明

- `origin/self_wjw` 中 Pluto 的 `07e13ac45`、`adcbd9b03` 从未进入合并前的 `self`，且基于已废弃的 `web/src`。本次只保护 `self` 已有功能，未擅自导入该独立开发分支；如需该功能，应单独迁移到当前前端架构。

## 验证结果

- 通过：`go test ./... -count=1`
- 通过：Claude、Gemini、relay helper、service 等重点包回归测试
- 通过：`bun install --frozen-lockfile`（`web/` workspace）
- 通过：`bun run --cwd default typecheck`
- 通过：`bun run --cwd default build`
- 通过：`bun run --cwd classic build`
- 通过：`bun run i18n:sync`，7 个 locale 均为 0 missing、0 extras、0 untranslated
- 通过：手工修改的 default 渠道抽屉单文件 oxlint
- 通过：`git diff --check`、`git diff --cached --check`
- 通过：树级 fork overlay 检查；合并前 217 个本地差异路径均未静默退化为纯上游版本
- 通过：阶梯计费空输出不扣费、非生成端点零 completion 仍计费、负额度/NaN/Inf 防护、trusted/batch 原子预扣及多分组重试倍率/补预扣回归测试

## 已知基线问题

- `go vet ./...` 仍报告既有的 `CustomEvent` mutex copy、IPv6 格式和若干 adaptor unreachable-code 告警；本次合并未引入新的同类失败。
- `bun run --cwd default lint` 仍有大量既有/上游 oxlint 告警；本次手工解决冲突的前端文件已单独通过 lint。
- Classic 渠道剪贴板填充在 BaseURL 开关关闭时仍会写入 `base_url`，后端随后拒绝该请求；该行为在合并前已经存在。
- `SpecialModelPrice` / `TextModelPrice` 仍可配置和展示，但当前结算链路未消费对应配置；Gemini 分辨率定价也存在同一历史断链。该问题早于本次合并，应另行恢复并补回归测试。
- `BillingUsage` 对“非空但 token 明细全为 0”的低概率输入仍可能优先于顶层 usage；尚未确认生产路径会构造该数据形状，建议后续增加协议样本验证。

## 发布说明

- 本次仅创建本地 merge commit，不推送远端；发布前仍应在预发布环境回归渠道新增/编辑、BaseURL 开关、多分组路由、Anthropic 批量渠道、计费结算、登录注册和钱包订阅流程。
