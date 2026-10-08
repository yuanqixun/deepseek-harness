# Desktop 私有更新管理

## Purpose

定义显式配置的 Windows Desktop 构件如何匿名查询私有更新策略、报告当前客户端版本、下载兼容的签名更新并应用强制更新要求。

## ADDED Requirements

### Requirement: 私有更新仅由 Windows 构件显式启用

Desktop 打包 SHALL 仅在选择命名环境时读取该环境的 `desktop.updates` 配置，并且只允许将该配置绑定到 Windows x64 构件。配置 SHALL 包含 HTTPS 检测接口 URL、发布通道和一个或多个允许的 HTTPS feed 来源；不得包含用户名、密码或 API 密钥。未选择环境 SHALL 保持现有更新配置和策略来源不变。

#### Scenario: 显式打包私有 Windows 环境

- **WHEN** Windows x64 打包命令选择有效的 `--config-env <name>`
- **THEN** 构件仅包含所选环境的检测接口、通道和允许的 feed 来源
- **AND** 构件不包含认证凭据或其他环境配置

#### Scenario: 未选择私有环境

- **WHEN** Desktop 打包未选择命名环境
- **THEN** 打包过程不读取私有更新配置
- **AND** 现有更新服务、检查流程和策略来源保持不变

#### Scenario: 私有配置用于不支持的目标

- **WHEN** 私有更新环境被用于非 Windows x64 目标或包含无效 URL
- **THEN** 打包在产出构件前失败并指出无效配置

### Requirement: 客户端匿名检查并报告版本

选择私有环境的 Windows 客户端 SHALL 通过 HTTPS `POST /v1/desktop/updates/check` 发送版本化 JSON 请求；接口版本前缀 SHALL 与私有插件市场的 `/v1/...` 一致。请求 SHALL 包含协议版本、部署环境、发布通道、Desktop 版本、平台、架构及随包 dsh 版本。当前认证插件可提供用户 ID 时，请求 MAY 包含不透明的 `userId`；缺少用户 ID SHALL NOT 阻止检查。请求 SHALL NOT 要求登录、携带认证令牌或生成持久安装标识。

#### Scenario: 匿名客户端报告当前版本

- **WHEN** 未登录客户端按计划或由用户触发更新检查
- **THEN** 客户端匿名发送部署、通道和已安装版本信息
- **AND** 检查结果不依赖 `userId`

#### Scenario: 已认证客户端提供用户标识

- **WHEN** 当前认证插件提供 `userId`
- **THEN** 检查请求可携带该 `userId` 供后台统计版本分布或稳定分组
- **AND** 请求不携带登录令牌或其他认证凭据

#### Scenario: 认证插件不可用

- **WHEN** 未启用认证插件、当前用户未登录或身份信息不可用
- **THEN** 客户端省略 `userId` 并继续匿名检查

### Requirement: 检测响应统一决定可用版本与强制策略

更新服务 SHALL 为客户端返回有效的无更新结果或一个兼容更新结果。更新结果 SHALL 提供语义化版本、允许来源内的 HTTPS `feedUrl` 及最低支持版本和强制更新期限等策略信息。服务 SHALL 能按部署和通道控制发布暂停、灰度比例、最低支持版本与强制期限。无 `userId` 的匿名客户端 SHALL 仅在版本进入全量发布时获得该版本；有 `userId` 时服务端 SHALL 为同一部署和通道稳定分配灰度结果。客户端 SHALL 拒绝未知协议版本、无效响应和不在配置允许来源中的 feed。

#### Scenario: 通道内无可用更新

- **WHEN** 客户端当前版本已是该部署和通道可用版本，或发布暂停/灰度规则未选中该客户端
- **THEN** 服务端返回有效的无更新结果
- **AND** 客户端保持当前安装版本且不启动下载

#### Scenario: 用户进入灰度发布

- **WHEN** 服务端按部署、通道和 `userId` 将客户端分入已开放的灰度比例
- **THEN** 响应提供该更新版本、feed 和适用的强制策略
- **AND** 同一 `userId` 在相同部署和通道中获得稳定的灰度归属

#### Scenario: 匿名客户端等待全量发布

- **WHEN** 客户端没有 `userId` 且更新尚未进入全量发布
- **THEN** 客户端不获取该灰度版本
- **AND** 当通道对匿名客户端全量开放后，客户端可获取该版本

#### Scenario: 响应指向未允许的下载来源

- **WHEN** 服务端返回的 `feedUrl` 不是 HTTPS，或其来源不在构件配置的允许列表中
- **THEN** 客户端拒绝该响应并报告检查失败
- **AND** 不向该来源发出 feed 或制品请求

### Requirement: 下载使用标准 feed、签名与完整性校验

客户端 SHALL 将接受的 `feedUrl` 交给现有 Electron generic 更新器，并读取 Windows channel YAML、NSIS 安装包及关联的 SHA-512 信息。Feed 和制品 SHALL 可由客户端匿名读取。下载 SHALL 保留现有 Windows 发布者签名和 SHA-512 校验。存在有效 `.blockmap` 时客户端 SHOULD 执行差分下载；差分资源缺失或差分下载/准备失败时 SHALL 回退完整安装包。完整包校验失败时 SHALL 保留可重试失败状态。

#### Scenario: 下载标准 Windows feed

- **WHEN** 检测响应包含允许的 feed URL 且用户确认下载
- **THEN** Electron 更新器读取 channel YAML 和安装包元数据
- **AND** 客户端检查安装包摘要和 Windows 发布者签名

#### Scenario: 差分下载可用

- **WHEN** feed 和服务器提供匹配的 `.blockmap`
- **THEN** 更新器可下载与当前版本之间的差分内容
- **AND** 完成后的目标文件仍通过完整性和发布者签名检查

#### Scenario: 差分资源不可用

- **WHEN** `.blockmap` 缺失、不可读取或差分下载失败
- **THEN** 客户端回退到完整安装包下载
- **AND** 完整下载仍经过摘要和发布者签名检查

### Requirement: 私有更新保留现有确认和失败语义

私有 Windows 更新 SHALL 保留现有自动/手动检查调度、下载确认、安装确认、重启前任务处理和强制更新 UI。普通更新检查故障 SHALL NOT 阻止应用启动或继续使用。传输、协议和解析故障 SHALL NOT 清除已知强制更新要求；只有有效服务响应明确解除强制状态时，客户端才可解除该要求。检测请求是首期版本统计入口；客户端 SHALL NOT 为本能力发送独立下载、安装或心跳事件。

#### Scenario: 普通检查服务暂时不可用

- **WHEN** 私有更新接口超时、不可用或返回无效响应，且客户端没有已知强制要求
- **THEN** 客户端报告更新检查失败
- **AND** 应用仍可正常启动和使用

#### Scenario: 强制更新期间接口暂时不可用

- **WHEN** 客户端已有强制更新决定且后续检测请求失败
- **THEN** 客户端保留强制更新 UI 和阻止使用状态
- **AND** 仅有效响应明确解除强制状态后才恢复普通使用

#### Scenario: 检测请求用于版本统计

- **WHEN** 客户端执行版本检查
- **THEN** 后台可使用该请求内的平台、架构、通道和版本字段统计客户端版本分布
- **AND** 客户端不额外发送下载或安装完成事件
