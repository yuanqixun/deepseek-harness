# CAS Loopback Login

## Purpose

使同一电脑上的浏览器和 DSH Host 通过 CAS 原生登录完成身份验证。浏览器将一次性 Service Ticket 带回本机 callback，Host 向 CAS 验票并建立自己的本机会话；CAS 云端不主动连接员工电脑。

## ADDED Requirements

### Requirement: 使用 CAS Service Ticket 验证登录

系统 SHALL 使用 CAS `/login` 发起浏览器登录，并使用 `/p3/serviceValidate` 验证当前回调中的 ST。验票 SHALL 提交签发时完全相同的 `service` 值。ST SHALL NOT 被保存为可复用的下游凭据，也 SHALL NOT 被当作 Bearer token。

#### Scenario: CAS 登录成功

- **WHEN** 用户在浏览器完成 CAS 登录并回到本机 callback
- **THEN** Host 验证一次性 ST 和对应 `service`，成功后建立本地 CAS 登录态

#### Scenario: ST 无效、重放或 service 不一致

- **WHEN** ST 无效、已使用，或验票时的 `service` 与最初登录请求不同
- **THEN** Host 拒绝登录，不建立本机会话，也不尝试把 ST 用于其他应用

### Requirement: 浏览器交付本机回调

系统 SHALL 在 listener 就绪后使用 loopback 地址、实际端口和固定 callback 路径作为 CAS `service`。CAS SHALL 通过浏览器重定向交付 ST，不主动连接用户电脑。一个 DSH 实例 SHALL 仅绑定同机浏览器；远程浏览器访问自己的 localhost 不属于支持拓扑。

#### Scenario: 用户位于 NAT 后

- **WHEN** 本机可通过 HTTPS 访问 CAS，且用户在本机浏览器完成登录
- **THEN** 浏览器访问本机 callback，Host 可向 CAS 验票，无需开放公网入站端口

#### Scenario: 回调无法抵达

- **WHEN** callback 端口不可用、浏览器未返回或 CAS 登录失败
- **THEN** 登录保持未完成，业务继续受限；固定端口冲突时 Host 明确失败

### Requirement: 严格绑定 callback 与服务注册

callback SHALL 绑定当前 profile、完整 callback URI、随机 state 和认证代次。CAS 服务注册 SHALL 仅允许固定 loopback host、callback path 与受控端口规则。callback SHALL 不要求业务 cookie；该例外 SHALL NOT 放宽其他业务路由。回调 query、ST 和验票响应不得进入日志、Client、Session 或模型上下文。

#### Scenario: 多台电脑上的独立 DSH 登录

- **WHEN** 多个用户在不同电脑上启动独立 DSH 实例并通过同一 CAS 登录
- **THEN** 每个实例使用本机 listener、自己的 service URI、独立 ST 与本地认证状态；一个实例的退出或失效不改变其他实例状态

#### Scenario: 同机多个独立实例

- **WHEN** 同一电脑启动多个独立 DSH Host
- **THEN** 每个实例使用独立端口与认证状态，CAS service registration 只允许登记的 loopback callback 形式，票据不能跨实例使用

#### Scenario: 伪造或重复回调

- **WHEN** callback 的 state、service、参数数量或 ST 不符合当前登录尝试
- **THEN** Host 拒绝该回调，不取消其他实例的有效登录，也不建立本地会话

### Requirement: 登录状态按进程隔离

登录尝试和本地认证状态 SHALL 归属于单个 DSH Host 进程及其本机 profile。各实例 SHALL NOT 共享 Host 内存中的身份状态或复用其他 profile 的凭据。

#### Scenario: 退出与旧回调竞争

- **WHEN** 用户退出后，旧回调或旧验票请求才返回成功
- **THEN** Host 保持退出，不建立或恢复本地登录态

#### Scenario: 其他设备登录或退出

- **WHEN** 另一台电脑上的 DSH 实例登录或退出
- **THEN** 当前实例的本地准入状态不因该操作改变
