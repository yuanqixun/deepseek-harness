# SSO LLM Key 自动配置

## Purpose

定义企业 DSH 环境如何复用现有 Aicode OAuth2 登录态，为当前用户取得 TokenHub LLM Key，并保留环境模型端点、手工凭据优先级和身份隔离。

## ADDED Requirements

### Requirement: aicode Key 接入 SHALL 由环境显式启用

DSH SHALL 仅在所选环境显式启用 aicode Key 接入时调用 aicode-app-dsh。启用配置 SHALL 提供固定的 aicode DSH API origin、HTTP 超时和有限重试/退避策略；这些值 SHALL NOT 由用户请求覆盖。模型 `baseURL` SHALL 继续由 DSH 环境的模型配置决定。未启用的 profile SHALL 保留既有凭据解析行为且 SHALL NOT 调用 aicode。

#### Scenario: 启用企业环境

- **WHEN** Desktop 使用显式启用自动 Key 的企业环境
- **THEN** DSH 调用该环境配置的 aicode-app-dsh API
- **AND** 模型请求仍使用该环境配置的模型 `baseURL`

#### Scenario: 普通环境未启用

- **WHEN** Desktop 使用未启用自动 Key 的 profile
- **THEN** DSH 不调用 aicode Key API
- **AND** 模型凭据仍按既有方式解析

### Requirement: 手工模型凭据 SHALL 优先于自动 Key

DSH SHALL 先解析当前模型路由配置的 Key 引用。该引用已有非空且不属于插件管理的值时，DSH SHALL 将其视为手工 Key，直接使用、不调用 ensure 且不得覆盖。自动 Key SHALL 另存于按 Aicode 用户和 DSH 环境隔离的 credential record。由于模型提供方使用固定 Key 引用，ensure 成功后插件 MAY 将自动 Key 写入该引用，但 SHALL 记录所有权标记；登出或切换用户时，仅当引用值仍与所有权标记匹配才可清除。每个环境 SHALL 配置自己的模型 Key 引用。被模型服务拒绝的手工 Key SHALL NOT 自动替换。

#### Scenario: 用户已配置手工 Key

- **WHEN** SSO 成功且当前模型凭据引用已解析到非空 Key
- **THEN** DSH 使用该 Key 并跳过 aicode ensure

#### Scenario: 当前模型凭据缺失

- **WHEN** SSO 成功且当前模型凭据引用没有 Key
- **THEN** DSH 启动自动 ensure 流程

### Requirement: DSH SHALL 通过 aicode 换票 API 获取 OAuth2 Token

`dsh-pro-auth` SHALL 将 CAS Ticket 与本次登录原始 `service` 提交给环境配置的既有 `/dsh-auth`，并只在 Host 内存持有返回的 Aicode OAuth2 `accessToken`。DSH SHALL 使用该 Token 调用受保护的本人 Key ensure API；SHALL NOT 把 CAS Ticket 或本机用户名作为 ensure API 凭据。aicode-app-dsh SHALL 从认证上下文取得当前用户，且 SHALL NOT 接受请求体中的 `userId` 或 `username` 作为 Key 归属。ensure SHALL NOT 要求用户拥有手工 `dsh:llm-key:apply` 权限，也不得允许该用户访问其他用户的 Key。

#### Scenario: 已登录用户 ensure 本人 Key

- **WHEN** Desktop 先通过 `/dsh-auth` 换取有效 Aicode Token，再调用 ensure
- **THEN** aicode-app-dsh 只为 Token 当前用户执行 ensure
- **AND** 不要求用户具有手工 apply 权限

#### Scenario: 未认证或指定其他用户

- **WHEN** 请求缺少或携带无效 Aicode Token，或请求尝试指定其他用户
- **THEN** aicode-app-dsh 拒绝未认证请求或忽略/拒绝用户覆盖字段
- **AND** 不返回其他用户的 Key

### Requirement: 自动 ensure SHALL 返回当前 Key 且不轮转

aicode-app-dsh SHALL 对当前用户已有的可恢复 Key 返回当前明文值且 SHALL NOT 调用 TokenHub 创建或轮转操作。只有用户没有当前 Key、且服务端确认 TokenHub 不存在需要保留的旧 Key 时，服务端才 SHALL 创建 Key 并加密保存。若 TokenHub 已存在 Key 而 aicode 无可恢复密文，服务端 SHALL 返回明确的不可恢复状态且 SHALL NOT 自动轮转或重复创建。现有 `apply` 轮转操作和 `client/current` 只读操作 SHALL 保持原语义。

#### Scenario: 当前用户已有可恢复 Key

- **WHEN** 用户调用 ensure 且 aicode 已有其当前 Key 密文
- **THEN** aicode-app-dsh 返回该 Key
- **AND** TokenHub 不收到创建或轮转请求

#### Scenario: 当前用户没有 Key

- **WHEN** 用户调用 ensure 且 aicode 与 TokenHub 均无其当前 Key
- **THEN** aicode-app-dsh 创建并保存一把 Key 后返回明文
- **AND** 重复 ensure 不创建第二把 Key

#### Scenario: TokenHub 有 Key 但 aicode 密文丢失

- **WHEN** TokenHub 中存在该用户的既有 Key，但 aicode 没有可恢复的明文密文
- **THEN** aicode-app-dsh 返回可诊断的不可恢复状态
- **AND** 不轮转旧 Key或创建重复 Key

### Requirement: ensure SHALL 幂等并串行处理本人操作

aicode-app-dsh SHALL 接受稳定 `requestId` 并按当前用户串行化首次 ensure。并发请求、相同请求重放或上游结果不确定时，服务 SHALL NOT 重复创建或轮转 Key。TokenHub 操作结果未知时，服务端 SHALL 使用原请求标识核对状态；不能确认时返回可重试状态，不得使用新请求标识盲目重发。

#### Scenario: 并发首次 ensure

- **WHEN** 同一用户的两个请求同时 ensure 且该用户尚无 Key
- **THEN** TokenHub 最多收到一次创建请求
- **AND** 两个请求返回同一当前 Key 或明确的在途/可重试状态

#### Scenario: TokenHub 创建结果不确定

- **WHEN** TokenHub 可能已创建 Key，但 aicode-app-dsh 未收到确定响应
- **THEN** 服务端按原 `requestId` 核对操作结果
- **AND** 不发起新的创建或轮转操作

### Requirement: Key 和 Token SHALL 不进入非授权输出

DSH SHALL 将自动 Key 存入现有凭据服务，并按 Aicode 当前用户和 DSH 环境隔离。模型 Key SHALL NOT 出现在 profile、Session 事件、模型上下文、Client 登录状态、普通日志或错误响应中。若 Key 临时写入模型提供方配置的固定引用，该值 SHALL 只存在于 DSH credential service；所有权标记 SHALL 不包含 Key 明文。Aicode OAuth2 Token SHALL 只保存在 Host 内存，且 SHALL NOT 出现在普通 UI 状态、Session、模型输入或日志中。aicode-app-dsh SHALL 在 ensure 响应之外禁止记录 Key 明文、Token 或可恢复密文。

#### Scenario: 同一用户切换 DSH 环境

- **WHEN** 用户使用另一个启用环境登录
- **THEN** DSH 只使用该环境与当前用户对应的自动 Key
- **AND** 模型请求仍发送至新环境配置的 `baseURL`

#### Scenario: 同一环境切换用户

- **WHEN** DSH 从 Aicode 用户 A 切换为用户 B
- **THEN** DSH 不得向 B 的模型请求发送 A 的 Key
- **AND** B 只恢复或取得 B 自己的 Key

### Requirement: 自动 Key 无效 SHALL 更新一次且不重放请求

模型服务明确返回 aicode 自动 Key 无效时，DSH SHALL 通过现有 Aicode Token 调用 ensure 一次以刷新本地 Key。额度不足、模型权限不足或其他非凭据错误 SHALL NOT 触发刷新。触发拒绝的模型请求 SHALL 以原错误结束且 SHALL NOT 自动重放；新 Key SHALL 仅用于后续请求。手工 Key 的认证失败 SHALL NOT 触发该流程。

#### Scenario: aicode Key 已被轮转

- **WHEN** 模型服务拒绝本地自动 Key 且 aicode 已保存新当前 Key
- **THEN** DSH 更新当前用户和环境的自动凭据
- **AND** 原模型请求失败，后续请求使用新 Key

#### Scenario: ensure 返回相同 Key

- **WHEN** ensure 返回与被拒绝值相同的 Key
- **THEN** DSH 不将 Key 状态标记为已恢复
- **AND** 原模型请求保持失败且不自动重放
