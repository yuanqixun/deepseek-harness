# Design

## Context

本设计定义 [proposal](proposal.md) 中的本机 CAS 登录与受限跨应用访问。四份规格分别定义 [profile](specs/cas-pro-auth-profile/spec.md)、[本机登录](specs/cas-loopback-login/spec.md)、[Web 准入](specs/web-required-auth/spec.md)和[代理资源访问](specs/cas-proxy-resource-access/spec.md)。

Superbpm 的 CAS 地址为 `https://sso.superbpm.com/cas`。[本地部署配置](../../../../sso-cas/cas/config/cas.properties)使用 Apereo CAS 8.0.2，已配置 CAS 3.0 `/p3/serviceValidate`；公开 `/cas/login` 可用。DSH 直接使用现有 CAS 登录和验票端点。CAS `/p3/serviceValidate` 校验 ST 并返回身份属性，但 ST 绑定签发时的 `service` 且只能使用一次，不能作为多个应用的通用凭据。[CAS 协议规范](https://apereo.github.io/cas/8.0.x/protocol/CAS-Protocol-V2-Specification.html)

当前 [Connection](../../../packages/client/connection/src/rpc-host.ts) 将请求映射到单一 OperatorPeer；[Gateway](../../../packages/api/gateway/src/index.ts) 的 WebSocket upgrade 也有独立准入路径。已有本机 cookie 证明浏览器能连接 Host，不代表用户已通过企业 CAS 认证。通用必需准入需要在 Host 层实现，不能只靠登录页隐藏业务界面。

## Goals / Non-Goals

**Goals:** 使用命名 profile 启动企业 Web；同机浏览器完成 CAS 登录并回跳 localhost；Host 以原始 `service` 值验证 ST 并建立本地 CAS 登录态；必需准入覆盖 Web 与后台新操作；在 CAS 和目标 API 确认支持代理协议后，由 Host 通过 PGT/PT 调用至少一个预登记 API。多个用户可以各自在自己的电脑上运行独立 DSH 实例；同一用户也可以运行多个独立实例。

**Non-Goals:** 多个用户共享同一个 DSH Host 或工作区；Electron/原生欢迎页/打包；浏览器与 Host 分处两台电脑或 SSH 转发；CAS 密码收集；任意 HTTP 代理；把 ST 当作可重复使用的 access token；CAS 全局单点注销；自动修改用户默认 profile；对抗可修改本机程序与配置的同一 OS 用户。

## Decisions

### 1. 命名 profile 选择企业认证

独立包计划位于 `pro/dsh-pro-auth/`，共用实现放 `share/`，企业配置入口放 `hxfl/`、`superbpm/`。企业 profile 组合官方 Web bundles 和对应企业配置，通过现有 `dsh --profile <name>` 启动。Superbpm CAS 根地址固定为 `https://sso.superbpm.com/cas`；其他企业 profile 显式登记各自 CAS 地址，不继承 Superbpm 配置。官方 profile 不发出 CAS 请求。

拟新增启动器持有的 `dsh.profile.requiredAdmission: ["cas-pro-auth"]` 声明。启动器在载入可禁用 bundle 前读取该要求，并传给 Host。声明存在但 provider 缺失、加载失败或卸载时，Host 保持拒绝业务，只开放登录、修复和收尾；普通 overlay 不能移除必需声明。安装企业 bundle 必须同时登记该声明。

### 2. 普通 CAS 登录建立 DSH 本地身份

每个 DSH 进程在已启动的 Web listener 上注册固定 callback 路径，绑定可用 loopback 地址与端口。Host 构造完整 callback URI 作为 CAS `service`，浏览器打开 CAS `/login?service=...`；登录后浏览器携 ST 返回 callback。Host 将 ST 和完全相同的 `service` 发给 CAS `/p3/serviceValidate`，只接受当前未消费的成功验证，并从响应取得用户身份。云端 CAS 不需访问用户电脑，只有用户浏览器回连本机。

CAS 服务注册必须严格限制到 callback URI。动态端口仅在 CAS 8.0.2 实测 `serviceId` 规则可安全锚定 `http://127.0.0.1:<port>/<固定路径>` 后才启用；否则配置固定端口并在占用时失败。拒绝转发头或用户输入改写 callback authority。ST 仅处理一次，callback query、ST、验票响应中的敏感属性不得写入日志或 Client 状态。Host 验票成功后建立自身本地会话，不持有或转发 CAS 浏览器 cookie。

每个本机 DSH 实例管理自己的登录尝试、callback 监听、CAS 会话和凭据代次。多个独立电脑上的用户可使用同一 CAS 部署，各自获得各自的 ST 与本地状态；单一 CAS 浏览器 SSO cookie 可能减少重新输入密码，但不会合并实例会话或工作区身份。同一电脑上同时运行多个 DSH 实例时，每个实例必须使用独立端口和进程状态，service URI 必须与其 ST 精确对应。

### 3. 跨应用访问只使用 CAS 代理票据

CAS 代理访问使用 PGT 建立代理授权，再针对每个目标 `service` 向 CAS 申请单次 PT；Host 把 PT 交给已登记的目标 API，由目标应用通过 CAS `/p3/proxyValidate` 或等价 CAS 代理校验验证。一次 ST 登录不能直接产生跨应用 bearer token；目标应用接入同一个 CAS 也不自动意味着它的 API 接受 PT。[CAS Proxy Authentication](https://apereo.github.io/cas/8.0.x/authentication/Configuring-Proxy-Authentication.html)

常规 PGT callback 需要 CAS 服务端访问 `pgtUrl`，因此不能指向员工电脑的 localhost。优先验证 CAS 8.0.2 是否支持将 PGT 使用 DSH 实例公钥加密后包含在 `/p3/serviceValidate` 响应中，并确认服务注册会授权返回 PGT；每个 DSH 实例自行生成并保护私钥。该模式若在当前 CAS 构建或部署中不可用，不得改成向公网开放任意回调或把 PGT/ST 暴露给浏览器，应暂停跨应用功能并修订方案。

每个目标 API 必须提供接受 CAS PT 的认证入口，并完成真实用户身份与权限校验。资源登记只允许稳定资源 ID、固定 HTTPS origin、精确路径和方法；Host 每次按目标 service 申请 PT，拒绝 URL 重定向携带 PT。不得将 PT、PGT 或 ST 导出到 Client、模型、Session 或通用 HTTP 代理。资源返回只投影允许字段。

跨应用调用能力的启动条件是：CAS 运维方验证本机服务注册、ST 验票、PGT 加密交付、代理策略与 PT 签发；至少一个真实目标 API 验证 PT。未满足时可单独开发并测试登录准入，但不可将代理访问标记完成，也不可回退到复用 ST。

### 4. profile 配置和资源授权

企业配置只保存公开地址、callback 策略和资源白名单，不保存 CAS 用户密码。Superbpm 的 CAS base URL 为 `https://sso.superbpm.com/cas`；callback path 固定，由 Host 从监听地址构造 `service`。目标资源配置包含稳定 ID、HTTPS base URL、CAS `targetService`、允许路径/方法和可返回字段。不假定目标 API 接受通用 Bearer token。

登录尝试采用随机 state 和有效期，并绑定当前 profile、callback URI 和进程代次。ST 回调不依赖业务 cookie；除该精确 callback 外的路由仍保留既有本机传输认证和企业准入。重复、迟到、错误 service 或验票失败的回调不能建立登录态。

Host 按需申请 PT 并调用配置的资源；PT 单次用于精确的 CAS target service，不在浏览器端存储。网络或 CAS 验票不可用时暂停新操作；目标 403 表示资源授权不足，不应伪装成全局登录失效。退出立即关闭本地准入并清除本机状态；CAS TGT 和其他应用会话的全局退出不在本提案保证范围内。

### 5. Web bootstrap 与必需准入

保留本机 launch token/cookie 和 Host/Origin 检查。必需 CAS profile 在工作区数据与业务订阅初始化前显示最小登录和修复界面；该界面不能为了显示自身而先开放业务 RPC。HTTP/RPC、直接文件/终端路由、WebSocket upgrade/消息/订阅，以及排队输入、计划、模型步骤、工具和子任务启动均消费不可由企业插件卸载的准入要求。provider 未就绪或用户未登录时，静态登录页面可加载，但不得暴露会话、文件、模型凭据或工作区状态。

进程内维护单一操作者，继续是当前提案的运行模型。多个用户应各自启动隔离的本机 DSH Host；共享远程 Host、多用户身份映射和工作区数据隔离需要独立架构与后续提案。

## Risks / Trade-offs

- CAS 不允许 localhost callback 或动态端口匹配 → 使用明确配置的固定 loopback 端口并验证端口冲突失败；不放宽 service 注册范围。
- CAS 不安全交付本机 PGT → CAS 登录可独立工作，但跨应用代理暂停；不把 ST 伪装为 bearer token。
- 目标应用只保护浏览器页面、不接受 CAS PT 的 API → 不满足 Host 代用户调用需求，需目标应用增加服务端代理票据校验或另立经过双方确认的协议。
- 多个用户要求共用单一 DSH Host → 当前单 OperatorPeer 模型不支持，需先设计每用户连接与存储隔离。
- CAS 或目标 API 暂时不可达 → 拒绝新的受保护业务调用；已开始的操作可完成安全收尾。

## Migration Plan

1. 验证 CAS 8.0.2 的 loopback Service Ticket 流程、PGT 加密交付和至少一个目标 API 的 PT 校验。
2. 实现独立企业 profile、CAS Web 登录、本机认证状态和必需 Host 准入；保持普通官方 profile 不变。
3. 只有外部代理票据验收通过后，才实现受限资源 API 和 Web 调试入口。
4. 用多个独立本机进程与 CAS 测试用户验证 profile、端口、身份状态隔离；不将该测试解释为共享 Host 多用户支持。

## External Prerequisites

Superbpm CAS base URL 为 `https://sso.superbpm.com/cas`，CAS 版本为 8.0.2，现有部署配置 `/p3/serviceValidate`。仍需确认 localhost callback 的服务注册匹配规则、CasRegisteredService 允许返回 PGT 的策略、当前版本支持的 PGT 加密回传配置，以及至少一个目标 API 对 CAS PT 的实际校验。标准远程 PGT callback 不可达 localhost。CAS 登录所需 `/login` 与 `/p3/serviceValidate` 可独立测试；跨应用调用在 PGT 与目标 API 验证完成前保持未完成。

## References

- [CAS 登录与 Service Ticket 规范](https://apereo.github.io/cas/8.0.x/protocol/CAS-Protocol-V2-Specification.html)
- [CAS Proxy Authentication 与 PGT 加密回传](https://apereo.github.io/cas/8.0.x/authentication/Configuring-Proxy-Authentication.html)
- [CAS 代理服务授权策略](https://apereo.github.io/cas/8.0.x/services/Configuring-Service-Proxy-Policy.html)
- [Superbpm CAS 配置](../../../../sso-cas/cas/config/cas.properties)及 [dsh-auth CAS 接入说明](../../../../sso-cas/dsh-auth/README.md)
- [Host Connection 实现](../../../packages/client/connection/src/rpc-host.ts)与 [Gateway 实现](../../../packages/api/gateway/src/index.ts)
