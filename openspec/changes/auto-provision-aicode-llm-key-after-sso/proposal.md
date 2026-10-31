# Proposal: SSO 后自动配置 aicode LLM Key

## Why

DSH Desktop 已通过 aicode 的 CAS SSO 登录，但用户仍可能需要手工填写模型 Key。`dsh-pro-auth` 可将 CAS Ticket 提交给 aicode 既有 `/dsh-auth` 换取当前用户的 OAuth2 Token，再使用该 Token 获取 aicode 已维护的 TokenHub Key。

## What Changes

- 企业 DSH 环境可显式启用自动 Key 配置，并配置 aicode DSH API 地址；未启用环境保持现有凭据行为。模型 `baseURL` 继续由 `local`、`hxfl` 等已选环境配置。
- `dsh-pro-auth` 将 CAS Ticket 与原始 loopback `service` 提交给现有 aicode `/dsh-auth`，取得 Aicode OAuth2 Token 后再调用 aicode-app-dsh 的专用 Key ensure 接口；不新增登录 broker、身份断言或 CAS 用户映射流程。
- aicode 从有效 OAuth2 Token 的当前用户上下文确定 Key 归属；接口不接受用户提交的 `userId` 或 `username`，也不要求用户拥有手工 `dsh:llm-key:apply` 权限。
- ensure 接口返回当前用户已有的 Key；仅在 aicode 无当前 Key 且能确认 TokenHub 中没有需要保留的旧 Key 时创建。该接口不轮转已有 Key；现有 `apply` 继续用于显式申请/轮转，`client/current` 继续保持只读。
- DSH 将自动 Key 与手工模型 Key 分开保存，并按当前 Aicode 用户和 DSH 环境隔离。手工 Key 优先；登录成功后后台启动自动配置，不阻塞进入 DSH。失败时显示状态并提供有限重试和手动重试。
- aicode 自动 Key 被模型服务明确判定为无效时，DSH 后台调用 ensure 接口刷新一次；原模型请求不自动重放。

## Capabilities

### New Capabilities

- `sso-llm-key-provisioning`：环境显式启用、复用现有 SSO Token、手工凭据优先、ensure 不轮转、身份与环境隔离、失败恢复及 Key 失效处理。

### Modified Capabilities

无。现有 CAS SSO、Aicode OAuth2 Token、Key 手工申请/轮转和 `client/current` 保持原有职责。

## Impact

- DSH 主仓：维护自动 Key 接入行为规格和环境/凭据集成要求。
- 私有 `dsh-pro-auth` 插件：实现环境配置、SSO 后凭据检查、ensure、模型凭据选择、Key 状态展示和重试；该插件仓库没有 OpenSpec，本提案维护其集成要求。
- `aicode-cloud`：增加与本提案配套的 OpenSpec 变更；依赖既有 `add-cas-sso-authentication` 和 `migrate-dsh-to-aicode-app-dsh` 设计。
- `aicode-app-dsh`：增加使用现有 Aicode OAuth2 身份的 Key ensure API；复用当前用户 Key 记录和加密存储，不改 Web 管理界面。
- TokenHub：仍仅由 aicode-app-dsh 服务端访问；DSH Desktop 不获得 TokenHub 管理凭据。

## Non-goals

- 不改变 CAS 登录、Aicode OAuth2 Token 签发或普通 DSH 业务 API 的认证方式。
- 不改变各环境的模型 `baseURL`、模型选择或请求协议。
- 不在 DSH 自动轮转已有 TokenHub Key，也不改变用户主动 `apply` 申请/轮转行为。
- 不把模型 Key、Aicode OAuth2 Token 或 CAS Ticket 写入 Session、模型上下文、日志或界面展示状态。
