# 实施追踪

本记录把本变更的规格、实施任务和验收证据对应起来。`sso-cas/dsh-auth` 的服务端任务在相邻 `sso-cas` 工作区执行，不进入本仓库 Git 历史；基础代码提交为 `c302eba`、`bf10e90` 和 `2d46406`，后续实现仍有未提交改动。最近一次完整 `mvn -Ppostgres-integration verify` 通过 13 项单元测试和 28 项 PostgreSQL 集成测试（其中 opt-in 本机 PostgreSQL 竞态用例按预期跳过）；受控慢速验票竞态用例另在本机 PostgreSQL 通过。全部本地测试均未访问真实 CAS。CAS 协议单测使用受控本地 HTTP endpoint。真实 CAS 验票、CAS/代理日志和云端验收仍由任务 10 负责。

## 企业 CAS 登录

| Requirement / Scenario | 实施任务 | 验收证据 |
| --- | --- | --- |
| 无客户端回调的登录闭环 / 内网客户端登录 | 2.3, 3.1–3.5, 4.1–4.4, 7.2–7.6, 10.1 | `api-v1.openapi.yaml`、dsh-auth 集成测试、DSH Host 轮询测试、真实 CAS 记录 |
| 每次请求的身份与领取证明 / 多客户端共享出口和账号 | 2.3, 4.1, 7.3, 10.2 | 并发请求与跨客户端领取反例 |
| 每次请求的身份与领取证明 / 请求创建重试或冲突 | 2.3, 7.3 | 相同 verifier 重试和冲突绑定测试 |
| 每次请求的身份与领取证明 / 仅持有授权链接 | 2.3, 7.2, 10.2 | 缺失 verifier 的查询、取消和兑换反例 |
| CAS 验票与浏览器往返关联 / 旧回跳在新请求后到达 | 3.2–3.3, 10.2 | 延迟回跳与取消竞争测试 |
| CAS 验票与浏览器往返关联 / 无效票据或服务不匹配 | 3.2, 3.5, 10.1 | CAS 验票失败、日志脱敏和浏览器错误页测试 |
| CAS 验票与浏览器往返关联 / 同一浏览器多标签页 | 3.1, 3.4, 10.2 | 浏览器会话占用测试 |
| 明确确认指定客户端 / 已登录 CAS 的用户确认请求 | 3.4, 10.1 | 已有 SSO 会话下的确认页测试 |
| 明确确认指定客户端 / 用户拒绝或伪造确认 | 3.4, 10.2 | CSRF 和拒绝终态反例 |
| 有限轮询与原子一次性兑换 / 并发兑换与响应丢失 | 4.1, 7.3, 10.2 | PostgreSQL 并发兑换与 Host 重新登录测试 |
| 有限轮询与原子一次性兑换 / 取消与兑换竞争 | 4.1, 4.3, 10.2 | 状态条件更新竞争测试 |
| 有限轮询与原子一次性兑换 / 跨实例查询及过期 | 2.4, 4.3, 7.3, 10.2 | `LoginRequestApiIT.secondInstanceSharesBrowserSessionApplicationSessionAndRevocation`、`confirmationAndExpiryRaceCannotApproveAnExpiredRequest` |
| 有限轮询与原子一次性兑换 / 客户端替换登录尝试 | 7.3, 7.5, 10.2 | 认证代次和迟到结果反例 |
| 可信用户与首期凭据用途 / 没有 TokenHub 的完整登录 | 4.2, 7.2–7.5, 10.1, 10.4 | `/me`、模型配置隔离和无 TokenHub 调用检查 |
| 可信用户与首期凭据用途 / 伪造资料或跨环境凭据 | 4.2, 7.4, 10.2 | 发行方、企业和应用绑定测试 |
| 应用退出与登录状态失效 / 应用退出成功 | 4.2, 7.5–7.6, 8.2, 10.1 | 本地清除、远端撤销和旧凭据反例 |
| 应用退出与登录状态失效 / 退出时网络失败 | 4.2, 7.5, 8.2 | 本地拒绝与远端未确认状态测试 |
| 凭据交付与展示隔离 / 检查一次登录的可见输出 | 3.5, 4.4, 7.4–7.6, 8.1–8.3, 10.4 | 日志、Client、模型请求和 Session 泄漏扫描 |

任务 4.3 的本地 PostgreSQL 双实例证据还包括 `cancellationAndExchangeCompeteAcrossInstancesAtOneBarrier` 与 `confirmationAndCancellationCompeteAcrossInstancesWithoutRevivingTheRequest`；测试通过屏障同时释放两个独立应用上下文中的请求，并检查最终请求状态及 app_session 数量。任务 4.4 的 dsh-auth 日志/数据库证据由 `LoginRequestApiIT.requestAndFailureLogsAndDatabaseDoNotExposeAuthenticationSecrets` 覆盖；README 的 curl 样例已经针对本地服务实际运行。真实 CAS 与反向代理日志仍由任务 3.5、10.4 验收。

任务 3.2 的 `CasTicketValidatorTest` 对受控协议 endpoint 覆盖 CAS 2.0 XML 成功身份、失败响应、固定 service 参数、恶意 service、重复/错误 user、超限响应及响应体超时。`LoginRequestApiIT.missingOrUnknownFlowCannotReachCASOrApproveARequest` 的缺失、未知和已占用 flow PostgreSQL 反例已通过。任务 3.3 的 `LoginRequestApiIT.expiredSlowCallbackCannotApproveOrChangeANewerBrowserFlow` 和 opt-in `BrowserAuthorizationRaceLocalIT` 控制 A 到期、B 在同一浏览器启动及 A 迟到回调；`LoginRequestApiIT.uncertainTicketValidationFailsTheFlowAndRequiresANewBrowserRoundTrip` 验证不确定验票后旧 flow 终结并要求新往返。所有这些用例均已通过。任务 3.4 的本地数据库用例覆盖确认、拒绝、CSRF、转义和过期；真实 CAS 已登录 session 的联调仍属 10.1。

## 桌面企业登录准入

| Requirement / Scenario | 实施任务 | 验收证据 |
| --- | --- | --- |
| 企业登录独立于模型凭据 / 已有模型凭据但没有企业登录 | 5.2–5.5, 6.1–6.3, 7.5, 8.3 | API Key、DeepSeek 账号和 Skip 绕过反例 |
| 企业登录独立于模型凭据 / 企业登录完成但没有模型凭据 | 6.3, 8.2 | 企业状态与模型配置流程分离测试 |
| Host 侧业务准入 / 绕过界面直接请求 | 5.1–5.4, 10.3 | HTTP、文件、终端和 WebSocket 直接请求反例 |
| Host 侧业务准入 / 未登录时发起认证 | 5.3, 6.2, 7.3, 8.1 | bootstrap 方法允许列表测试 |
| 登录失效后收回访问 / 已建立连接后的退出 | 5.4–5.6, 7.5, 10.3 | 既有连接、订阅和收尾入口测试 |
| 必需认证组件失效时拒绝访问 / 恢复模式禁用插件 | 5.2, 6.1, 6.4, 9.2, 10.3 | provider 缺失、插件禁用和修复路径测试 |
| 普通发行版行为保持 / 不启用插件的运行 | 5.2, 6.3, 7.7, 9.3, 10.3 | 普通 profile 和 Desktop 包回归 |

## Host 入口盘点与准入服务设计（任务 5.1）

| 入口类别 | 当前所有者与入口 | 准入要求及覆盖注意事项 |
| --- | --- | --- |
| Host RPC | `packages/api/gateway/src/index.ts` 的 Connection `/api` 拦截器以及 `TypertGateway.invoke()`、`stream()` | 在方法反射调用前检查每次业务操作；不能把已建立 Connection 或进程内 Gateway 调用当作登录凭据。 |
| WebSocket 流 | 同文件注册的 `/api/remote.mux` upgrade、每个逻辑流的 Gateway open 及 `$events` 转发 | upgrade 时检查连接资格；每条新流和订阅都检查当前代次，撤销时取消活跃业务流并阻止后续消息，不假设 upgrade 检查能覆盖连接生命周期。 |
| 直接 HTTP 文件与操作路由 | `packages/client/connection` 的 `fetch.register()` 分发；现有贡献位于 `api/session-controller/src/media-references.ts`、`session-query/session-log-export/src/index.ts`、`client/file-upload/src/index.ts`、`client/ui-deliverables/src/present-open.ts` | 在 handler 执行前统一检查路由级业务准入；保留现有 Host/Origin、连接和文件范围校验。登录、诊断及修复路由须由明确清单标为 bootstrap，未分类路由拒绝。 |
| 终端、工作区、任务、设置和账户 Remote | `packages/api/terminal-controller`、`workspace-controller`、`job-controller`、`settings-controller`、`account-controller` 及其 Remote 定义 | 普通业务方法默认受限；仅支持认证启动、必要诊断、任务停止和资源收尾的明确操作可单独列为受限维护能力。 |
| 模型步骤与工具执行 | agent 生命周期的 `agent/pre-step`、工具流水线的 pre-execute/final ToolGuard | 在异步模型步骤与工具执行发生前读取当前认证代次；最终执行点再次校验，避免较早的异步许可在退出后被复用。 |
| 排队输入、计划与子任务 | agent 输入领取、`schedule` 触发、`subagents.start()` 及其他主动启动工作的方法 | 新领取、新计划触发及新子任务属于业务操作；拒绝新工作不等于强行中止已执行操作，停止/收尾入口单独授权。 |

准入服务采用三个角色：通用 Service Definition 声明不可绕过的 `require` 与 `check` 操作；Host Provider 管理发行版必需标志、当前认证代次、活动检查和撤销通知；各 Remote、HTTP handler、agent/tool 与调度消费者在产生业务副作用前调用该服务。普通部署未声明必需准入时保持原行为；一旦 Desktop 启动器声明必需准入，Provider 缺失、加载失败或卸载都必须拒绝业务操作。认证与修复操作通过显式 bootstrap 分类开放，未知操作默认受限。任务 5.1 尚未完成：需据此定义 typed Service Definition/Provider/Consumer 接口并加入允许、拒绝、缺失及注销测试 Provider；任务 5.2–5.7 再逐类接线。

## 企业认证插件装配

| Requirement / Scenario | 实施任务 | 验收证据 |
| --- | --- | --- |
| 按功能插件组织企业代码 / 同一插件支持两个企业 | 7.1, 9.1, 9.3 | hxfl、superbpm 独立构建和产物清单 |
| 开发时显式启用 / 启用或省略企业装配 | 7.7, 9.1 | profile 与 overlay 解析测试 |
| Desktop 发行产物自包含 / 干净机器安装企业版 | 9.2–9.3, 10.3 | 不含源码目录的安装包 smoke |
| Desktop 发行产物自包含 / 企业构建缺失输入 | 9.2, 9.4 | 插件、配置和依赖缺失反例 |
| 企业配置与凭据隔离 / 切换构建目标 | 7.4, 9.1–9.3 | 企业配置和凭据隔离测试 |
| 升级兼容有明确验证 / 上游变更导致插件不兼容 | 9.4, 10.5 | 兼容性故障注入与回退演练 |
