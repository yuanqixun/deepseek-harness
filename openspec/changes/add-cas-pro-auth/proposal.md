# Proposal: add-cas-pro-auth

## Why

本机运行 DSH 的用户需要通过命名 profile 选择预置的企业 CAS 服务，在登录成功后才能使用 Web 工作区，并由本机 Host 按 CAS 代理协议访问明确授权的 CAS 应用。首期先验证 localhost Web 登录和一个目标应用，不承担 Desktop 启动、欢迎页或安装包改造。

## What Changes

- 新增独立 Host/Client 插件 `cas-pro-auth`，以 private 包 `@deepseek-ai/dsh-pro-auth` 和 Cordis bundle 分发。命名 profile 组合官方 Web 基础 bundle 与一个企业配置；通过现有 `dsh --profile <name>` 启动，不增加 Node 应用入口。
- 普通官方 profile 保持既有 DeepSeek Platform 登录、模型凭据和工作区行为，不自动启用企业认证或联系 CAS。“默认用官方”指保留官方装配，不改变 CLI 当前要求选择 profile 的语义，也不把官方版改成必须登录。
- **BREAKING（仅显式选择必需 CAS 认证的 profile）**：工作区、业务 HTTP/RPC、WebSocket 和后台新操作必须通过企业认证；已有浏览器 cookie、模型 API Key、官方账号和跳过入口均不能代替 CAS 登录。认证插件缺失、禁用、加载失败或凭据失效时拒绝业务访问。
- `cas-pro-auth-superbpm` profile 预置 CAS 根地址 `https://sso.superbpm.com/cas`。其他企业 profile 使用各自登记的 CAS 地址，不从 Superbpm 配置继承；官方 profile 不访问 CAS。
- DSH Web 使用 CAS 原生 `/login` 和 `/p3/serviceValidate`：同机浏览器登录后将一次性 Service Ticket 回跳到本机 Host，Host 使用签发时完全相同的 `service` 值向 CAS 验票，并建立 DSH 自己的本机会话。云端 CAS 不主动连接用户的 localhost。
- 登录 Service Ticket（ST）绑定一个 `service` 且只能验票一次，不作为下游应用凭据。跨应用调用若要纳入首期，必须使用 CAS Proxy Authentication：DSH 获取受控的 Proxy-Granting Ticket（PGT），按已登记的目标 service 向 CAS 换取一次性 Proxy Ticket（PT），由目标应用对 PT 执行 CAS proxy validation。CAS 必须能安全地向 localhost DSH 交付 PGT，且目标应用 API 必须实际支持 PT 验证；同属一个 CAS 的普通 Web 登录不代表它的 API 接受 PT。
- 新增 Web 登录状态与账号入口，以及协议无关的必需准入支持。CAS 登录和代理票据逻辑归插件；启动要求、业务入口拒绝及撤销执行归通用 Host 能力，不修改 agent-loop。

## Capabilities

### New Capabilities

- `cas-pro-auth-profile`: 官方与企业 profile 的选择、预置 CAS 配置、必需认证声明和插件装配。
- `cas-loopback-login`: 浏览器到 localhost 的 CAS Service Ticket 回跳、服务端验票及本机认证生命周期。
- `web-required-auth`: Web 启动认证、业务请求与后台执行准入、失效撤销和安全收尾。
- `cas-proxy-resource-access`: Host 通过 CAS PGT/PT 调用经过登记且实际支持 CAS proxy validation 的应用资源。

### Modified Capabilities

无。当前 `openspec/specs/` 尚无已登记能力；旧提案的未归档规格不作为本变更的已实现前提。

## Impact

DSH 侧涉及 profile/启动配置、Connection、Gateway、业务与后台准入消费者，以及新增插件的 Host/Client、凭据记录和 Web 界面。CAS 管理方需确认 localhost service 注册、Service Ticket 验票和 PGT 安全交付方式；目标应用方需确认具体 API 是否接受并验证 CAS Proxy Ticket。PGT 无法安全交付或目标 API 不接受 PT 时，跨应用 API 调用不具备前置条件，须先调整方案，不能改用复用 ST 或未受目标信任的 Bearer token。

本提案独立于 [add-private-desktop-cas-login](../add-private-desktop-cas-login/proposal.md)。不修改或归档旧提案，不继承其云端轮询协议、Desktop 任务或已完成标记；本需求后续以本提案为实施依据。旧 `dsh-auth /api/v1` 的应用令牌只具有该服务定义的用途，不直接复用为 CAS 代理票据。

首期限定浏览器与 DSH Host 位于同一电脑、单一操作者、本机 Web 调试。不实现共享服务器多用户会话与数据隔离、Desktop、任意 HTTP 代理、CAS 密码收集、静默续期或 CAS 全局单点注销。详细机制及外部前置条件见 [design.md](design.md)，验收与实施顺序见 [tasks.md](tasks.md)。
