# Web Required Authentication

## Purpose

使启用企业 CAS 的本机 Web 在登录前仅提供受限认证与修复功能，并在 Host 业务入口执行强制准入。访问控制覆盖直接请求、流连接和后台新操作，不能依赖浏览器界面遮挡或认证插件始终存在。

## ADDED Requirements

### Requirement: 最小 Web 登录入口

CAS profile SHALL 在业务状态加载前显示登录界面，仅公开登录状态、开始/取消登录、退出及最小修复/收尾操作。原有 launch token/cookie 与 Host/Origin 检查 SHALL 保留；登录 bootstrap SHALL NOT 开放任意业务 RPC。

#### Scenario: 已有官方凭据

- **WHEN** 浏览器已有有效本机 cookie，Host 有模型 API Key 或官方账号，但没有本进程有效 CAS 登录
- **THEN** 用户只能进入企业登录或必要修复界面，不能加载会话、文件和工作区业务数据

#### Scenario: CAS 登录后模型未配置

- **WHEN** CAS 验票成功但用户尚未配置可用模型凭据
- **THEN** Web 工作区准入允许，模型配置仍按原有机制处理，不把 CAS ticket 用作模型凭据

### Requirement: 所有业务入口执行准入

系统 SHALL 对 HTTP/RPC、直接文件和终端操作、WebSocket upgrade/业务消息/订阅、排队输入、计划触发、模型步骤、工具及子任务启动执行准入。未分类业务 SHALL 默认受限，插件卸载 SHALL NOT 移除必需拒绝能力。

#### Scenario: 绕开界面直接调用

- **WHEN** 未通过 CAS 登录的调用者直接请求文件、业务 RPC、WS 或终端输入，即使具有有效本机传输凭据
- **THEN** 请求被拒绝，不产生新的业务执行或数据输出

#### Scenario: 没有浏览器请求的后台执行

- **WHEN** CAS 登录失效或用户退出后，排队输入、计划或子任务准备启动
- **THEN** 启动被拒绝，不能沿用之前的已认证状态

### Requirement: 本地登录代次与实例隔离

每个 DSH Host SHALL 独立维护 CAS 用户、本地认证代次和业务订阅。多个设备上的独立 Host SHALL NOT 共享登录状态；同机多个 Host SHALL 使用独立本地状态。当前单 Host SHALL 继续代表一个操作者，不支持多个用户共享同一工作区。

#### Scenario: 一台设备退出

- **WHEN** 一台设备上的用户退出或本地 CAS 登录失效
- **THEN** 该 Host 拒绝新的业务操作并撤销其业务订阅，其他设备上的 Host 不受影响

#### Scenario: 共享 Host 多用户

- **WHEN** 多个用户尝试在同一 DSH Host 建立各自的 CAS 登录
- **THEN** 系统不把单操作者连接映射宣称为多用户隔离；共享访问被拒绝或明确报告不支持

### Requirement: 允许收尾但不允许新步骤

失效前已进入执行的操作 SHALL 能完成结果落盘和资源释放，后续步骤 SHALL 被拒绝。停止任务、结束终端和应用退出 SHALL 保留本机传输认证；账号切换 SHALL 等待旧活动工作结束后才开放新身份工作区。

#### Scenario: 运行中失效

- **WHEN** 工具或子进程正在执行时用户退出
- **THEN** 当前操作可收尾，用户可停止它，但不能继续输入或启动后续工具和模型步骤

#### Scenario: 本机账号切换

- **WHEN** 用户更换 CAS 账号
- **THEN** 系统等待旧活动工作结束，说明本机历史数据和模型配置仍共用，不声称按 CAS 账号隔离数据
