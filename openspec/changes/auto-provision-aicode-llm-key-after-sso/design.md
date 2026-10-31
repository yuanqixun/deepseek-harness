# Design

## Context

现有 `aicode-cloud` 的 CAS SSO 设计由 Desktop 通过 loopback 接收 CAS Ticket，再向 `POST /dsh-auth` 换取 Aicode OAuth2 Token。受保护的 DSH API 使用该 Token。`aicode-app-dsh` 已有认证的 `/app-api/dsh/llm-key/client/current`，从当前登录用户读取本人 Key，但无 Key 时不创建；管理 `apply` 会申请或轮转 Key。

本变更复用现有登录令牌和 DSH Key 服务。CAS Ticket 不作为 API 凭据，DSH 不增加新的身份服务或向 aicode 转发客户端自报身份。模型服务的 `baseURL` 仍由当前 DSH 环境配置。

## Goals / Non-goals

**Goals:** 让显式启用 aicode 的 DSH 环境在 SSO 后为缺少手工模型凭据的当前用户准备 TokenHub Key；保留现有 Aicode OAuth2 认证、手工 Key 优先和不轮转已有 Key 的行为。

**Non-goals:** 新增 DSH 登录 broker 或第二种用户身份断言；改变 Aicode SSO；让 Desktop 调用 TokenHub；改变用户主动 Key 轮转接口。

## Decisions

### 1. 通过既有 aicode 换票 API 取得 OAuth2 Token

`dsh-pro-auth` 将 CAS Ticket 和本次登录原始 `service` 提交到环境固定的 aicode `/dsh-auth`。该端点验证 CAS 并返回 Aicode OAuth2 Token 与 `userId`；插件仅在 Host 内存保留 Token，再以该 Token 调用 Key ensure API。客户端状态只收到用户名和 Key 就绪状态，不包含 Token 或 Key 明文。aicode-app-dsh 通过现有认证过滤器解析当前用户；ensure 请求体不能指定其他用户。

该变更不增加独立 `sso-cas/dsh-auth` broker，不向 aicode 传递本机用户名或替代身份断言，也不调整现有 `/dsh-auth` 的 CAS 验票和 OAuth2 Token 签发。

### 2. 新增认证的本人 Key ensure API

新增 `POST /admin-api/dsh/llm-key/client/ensure`，要求有效 Aicode OAuth2 Bearer Token。现有 CAS SSO 通过 AdminAuthService 签发管理员类型 Token；`/app-api` 会要求会员类型 Token，不能用于该 SSO 返回值。请求包含稳定 `requestId`，不包含 `userId` 或 `username`。服务端从认证上下文取得当前用户，再执行专用 ensure 策略。该接口只要求已认证，并且只允许用户处理本人 Key，不授予手工 `dsh:llm-key:apply` 权限或管理员查询范围。Gateway 的现有 `/admin-api/dsh/**` 路由覆盖该接口。

若 aicode 当前用户已有加密保存的 Key，ensure 返回该 Key，不调用 TokenHub 写接口。若当前用户没有受管 Key，服务端检查 TokenHub 固定用户和固定名称 Key：不存在时只创建；存在但 aicode 没有可恢复的明文密文时，返回明确的人工恢复状态，不轮转或重复创建旧 Key。并发首次请求按用户串行化，以稳定 `requestId` 处理重试和不确定的上游结果。

`POST /admin-api/dsh/llm-key/apply` 继续供有权限的用户显式申请/轮转；`GET /app-api/dsh/llm-key/client/current` 继续只读且不创建。ensure 是独立的本人操作路径。

### 3. 手工 Key 与自动 Key 分开解析

DSH 先解析当前模型路由配置的 Key 引用。引用已有非空值且不属于插件管理的自动 Key 时，DSH 将其视为手工 Key，直接使用并跳过 ensure。自动 Key 另存于按 Aicode 用户和 DSH 环境隔离的 `CredentialKey` 记录；由于当前模型提供方只接受固定 `apiKeyEnv` 引用，ensure 成功后插件才将自动 Key 写入该引用，并用本地所有权标记区分自动值与手工值。退出或切换账号时，插件仅清除仍与所有权标记匹配的值；下次登录只恢复当前用户和环境的记录。

所有 Key 值仍由 DSH credential service 保存；profile 只包含模型 `baseURL`、模型 Key 引用和非秘密配置。每个环境使用各自的模型 Key 引用，避免不同环境同时运行时共用活动值。

### 4. 环境显式启用与登录后异步准备

每个 DSH 环境分别配置 aicode Key 接入开关、aicode API origin、模型 Key 凭据引用、请求超时、有限重试次数和退避策略。SSO 换票与 Key API 使用同一环境 origin；Desktop 包只携带选定环境的非敏感配置。aicode API origin 与模型 `baseURL` 是不同配置；本功能不改模型 endpoint。

SSO 成功且手工 Key 缺失时，DSH 后台启动 ensure，不等待接口完成才进入工作区。模型请求遇到正在进行的 ensure 时等待同一操作，不并发重复申请。网络错误按配置进行有限退避；达到上限后展示未就绪状态和手动重试。服务端用户未映射、用户停用、Key 密文丢失等不可重试错误显示可操作状态，不进行自动循环。

模型服务明确报告 aicode Key 无效时，DSH 后台调用 ensure 一次以取得服务端当前 Key。只有凭据错误触发刷新；额度不足、模型权限不足或其他业务拒绝不触发。当前模型请求原样失败，不自动重放；刷新成功后，新请求使用更新的 Key。若 ensure 返回与被拒绝的 Key 相同，状态不得标记为已恢复。

### 5. 秘密处理

`dsh-pro-auth` 通过现有 `/dsh-auth` 换票后只在 Host 内存保留 Aicode OAuth2 Token；Token 不能出现在普通 UI 状态、Session、模型输入或日志中。ensure 返回的模型 Key 只保存在 DSH credential service，并只交给模型认证路径；Key 不写入 profile、Session 事件、Client 状态、错误响应或普通日志。

aicode-app-dsh 继续加密保存可恢复的 Key，并只在经过认证的本人 ensure/current 响应中返回明文。ensure 请求体、响应体、Bearer Token 和 Key 明文不得进入 access log、异常或审计详情。

## Risks / Trade-offs

- Aicode OAuth2 Token 已由现有 SSO 发给 Desktop 并用于受保护 API；本变更不会扩大 Token 的现有客户端持有范围，但新增的 ensure API 必须从 Token 上下文确定用户并仅操作本人 Key。
- 若 TokenHub 已存在 Key，而 aicode 本地没有对应密文，TokenHub 不一定能再次返回明文。为遵守不轮转决策，ensure 需报告人工恢复状态，不得通过 `apply` 偷偷轮转。
- DSH 本地凭据文件按 OS 用户限制读取；同一 OS 用户下的其他进程仍可能读取，本功能不提供同 UID 隔离。
- 模型认证失败可能由上游策略变更引起；只处理明确的凭据无效响应，不自动重放原请求或旋转服务端 Key。

## Migration Plan

1. 在 `aicode-cloud` 创建本变更规格，并在 `aicode-app-dsh` 实现经 OAuth2 认证的本人 ensure API。
2. 使用现有 `/dsh-auth` 登录获取 Aicode Token，联调已有 Key 返回、首次创建、不需要 apply 权限、不可恢复旧密文、无效 Token 和跨用户访问拒绝。
3. 在 `dsh-pro-auth` 实现环境显式启用、凭据优先级、按用户/环境保存、状态与重试；不改变现有 CAS callback 或 Aicode Token 生命周期。
4. 分别验证普通 profile 与选定企业 Desktop 包；确认模型 `baseURL` 仍由环境控制，Key、Token 和 Ticket 不进入日志或 Session。
