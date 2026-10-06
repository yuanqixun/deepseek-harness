# CAS Proxy Resource Access

## Purpose

允许 DSH Host 在 CAS 与目标应用均支持代理票据时，通过 PGT 为预登记的 CAS service 获取一次性 PT 并调用其 API。CAS Service Ticket 仅用于登录，不是跨应用凭据。

## ADDED Requirements

### Requirement: 代理授权来自 CAS PGT/PT

系统 SHALL 使用经 CAS 验证交付的 PGT 请求目标 service 的一次性 PT。目标 API SHALL 验证 PT 并确认用户身份与该 service 匹配。系统 SHALL NOT 因应用接入同一 CAS 就假设 API 接受 PT，也 SHALL NOT 把 ST、PGT 或 PT 当作通用 Bearer token。

#### Scenario: 已批准的 CAS 代理资源

- **WHEN** CAS 已授权该 DSH service 获取 PGT，且目标 API 支持代理票据验证
- **THEN** Host 为登记的 target service 申请 PT 并调用对应 API，目标应用验证 PT 后返回授权结果

#### Scenario: 目标应用不接受 PT

- **WHEN** 目标仅接受 CAS 浏览器会话、Service Ticket 或其他 API 凭据
- **THEN** Host 不发送 ST/PGT/PT 冒充受支持凭据，并报告该资源尚不支持

### Requirement: localhost PGT 交付必须安全

系统 SHALL NOT 将 CAS 服务器不可达的 localhost `pgtUrl` 当作可用回调。只有 CAS 8.0.2 已验证支持将 PGT 加密到 DSH 实例公钥并在验票响应中返回，或存在经安全评审的等价机制时，才可启用本机代理访问。各 Host 私钥 SHALL 留在本机 Host。

#### Scenario: CAS 无法安全交付 PGT

- **WHEN** CAS 只能向 DSH 的 localhost 发起 PGT 回调，或验票响应未提供受保护的 PGT
- **THEN** DSH 保持 CAS 登录可用但禁用跨应用代理，不开放任意公网 callback

#### Scenario: 多台电脑各自取得 PGT

- **WHEN** 多个用户在不同电脑运行独立 DSH 并登录
- **THEN** 每台 Host 的 PGT 交付只可由对应本机私钥读取，不共享代理凭据

### Requirement: Host 限制 PT 的用途

资源请求 SHALL 使用 profile 登记的资源 ID、HTTPS origin、target service、路径和方法。Host SHALL 为正确的目标 service 请求 PT，不自动跟随带 PT 请求的重定向。Client 与模型 SHALL 只能获得允许的业务结果，不能读取或导出代理凭据。

#### Scenario: 未登记资源或目标不匹配

- **WHEN** 请求指向未知资源、其他 origin、未登记路径或不同 CAS target service
- **THEN** Host 在发出网络请求前拒绝调用

#### Scenario: 目标重定向

- **WHEN** 已登记 API 返回重定向
- **THEN** Host 不将 PT 转发到 Location 指定的目的地

### Requirement: Web 调试使用已授权只读操作

Web SHALL 提供显式触发的预登记只读 CAS 资源操作，仅显示允许的结果字段和安全错误。真实目标 API 必须验收 PT 成功与无效/错误 service 拒绝；模拟结果不能代替真实验收。

#### Scenario: 真实代理票据验收

- **WHEN** 用户通过 CAS 登录并调用已确认支持 PT 的只读 API
- **THEN** 目标应用验证用户对应 PT 后返回业务结果，界面和日志不包含 ST、PGT 或 PT
