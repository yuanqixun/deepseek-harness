# CAS Profile Selection

## Purpose

允许本机 DSH 用户通过命名 profile 选择预置企业 CAS 配置，并在不改变官方 profile 行为的前提下启用独立认证插件。企业 profile 的必需认证声明必须在插件缺失或被禁用时继续约束业务访问。

## ADDED Requirements

### Requirement: 显式选择企业 profile

系统 SHALL 使用现有命名 profile 机制选择企业配置，普通官方 profile SHALL 保持既有登录和模型配置行为，不因安装企业插件而自动启用 CAS。未知 profile SHALL 明确失败。

#### Scenario: 官方与企业启动

- **WHEN** 用户分别启动官方 Web profile 和已安装的企业 profile
- **THEN** 前者不调用企业 CAS，后者只加载所选企业认证配置并进入受限登录状态

#### Scenario: profile 不存在

- **WHEN** 用户选择不存在的企业 profile
- **THEN** 启动报告配置缺失，不静默回退到官方 profile

### Requirement: 独立插件与预置配置

企业认证 SHALL 通过可独立构建的 Host/Client 插件和 bundle 装配，profile SHALL 预置 CAS 根地址、loopback callback 策略与经过登记的 CAS 代理资源。Superbpm profile SHALL 使用 `https://sso.superbpm.com/cas`。配置 SHALL NOT 包含用户密码或共享客户端秘密；缺失或非法配置 SHALL 在开放业务前失败。

#### Scenario: 配置缺失或非法

- **WHEN** CAS 根地址、callback 策略或资源代理授权参数缺失，或远端认证/资源端点不符合允许的 HTTPS 配置
- **THEN** 系统报告具体配置项错误且不开放业务，不选取另一个企业的默认值

#### Scenario: 切换企业

- **WHEN** 用户启动另一个企业 profile
- **THEN** 系统使用该 profile 的身份服务、资源允许列表与隔离的凭据记录，不复用前一企业认证结果

#### Scenario: Superbpm profile 使用指定 CAS

- **WHEN** 用户选择 `cas-pro-auth-superbpm`
- **THEN** profile 使用 `https://sso.superbpm.com/cas`；普通 profile 和其他企业 profile 不因此改变配置

### Requirement: 必需认证独立于可卸载 provider

企业 profile SHALL 在加载可卸载 bundle 前声明必需认证。安装或启用企业 bundle SHALL 同时登记该要求；声明不能由普通 overlay 或 provider 的卸载解除，缺失声明的企业插件 SHALL 拒绝启动。

#### Scenario: provider 缺失或卸载

- **WHEN** 企业 profile 的认证 provider 缺失、加载失败、禁用或运行中卸载
- **THEN** 业务访问保持或转入拒绝状态，只允许必要登录、修复和收尾操作

#### Scenario: 通过配置降低要求

- **WHEN** overlay 试图取消必需认证，或只启用企业插件而未登记 profile 要求
- **THEN** 系统拒绝该配置或保持原必需要求，不启动可绕过的企业认证模式
