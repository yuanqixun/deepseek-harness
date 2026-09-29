# 企业认证插件装配

## Purpose

在同一 DSH 仓库中按功能维护可选企业插件，使共用认证实现与企业配置分别管理，并通过显式开发装配和 Desktop 打包启用，减少上游升级时的源码冲突及部署配置混用。

## ADDED Requirements

### Requirement: 按功能插件组织企业代码

认证插件 SHALL 命名为 `dsh-pro-auth`，在本仓库 `pro/dsh-pro-auth/` 维护；`share/` 保存共用实现，`hxfl/` 和 `superbpm/` 保存各企业配置和必要适配。插件 SHALL 不依赖独立 Git 仓库或子模块；未来其他功能可在 `pro/` 下平级维护，本次不创建用量插件。

#### Scenario: 同一插件支持两个企业

- **WHEN** 构建分别选择 `hxfl` 和 `superbpm`
- **THEN** 两者复用同一份认证实现，只装配选定企业的配置，不复制整套插件代码

### Requirement: 开发时显式启用

插件 SHALL 可单独构建与打包，并通过 DSH profile 和 overlay 显式装配。源码存在 SHALL NOT 自动启用认证；受支持的 Node 应用运行 SHALL 继续经 `dsh` profiles 启动。

#### Scenario: 启用或省略企业装配

- **WHEN** 开发者分别启动配置了企业认证和未配置企业认证的 profile
- **THEN** 前者加载插件及选定企业配置，后者不触发企业登录流程

### Requirement: Desktop 发行产物自包含

企业 Desktop 包 SHALL 包含插件的 Host / Client 产物及选定企业的非敏感配置，并在 Desktop 专用 profile 启用。安装后 SHALL 不依赖开发源码目录或 Git 仓库获取插件代码；该要求不代表认证服务可离线使用。

#### Scenario: 干净机器安装企业版

- **WHEN** 在没有开发仓库、不能访问 Git 的机器安装企业 Desktop 包
- **THEN** 插件仍可加载，并通过所选企业登录服务完成认证

#### Scenario: 企业构建缺失输入

- **WHEN** 选择企业发行版但插件产物、必需配置或兼容依赖缺失
- **THEN** 构建明确失败，不生成默默省略认证的企业发行包

### Requirement: 企业配置与凭据隔离

系统 SHALL 仅装配选定企业配置，认证地址 SHALL 来自经过验证的部署配置；密钥 SHALL 不提交至企业配置目录或作为共用源码常量。凭据 SHALL 按企业和签发环境隔离，不自动迁移至另一个企业。

#### Scenario: 切换构建目标

- **WHEN** 同一检出先构建 `hxfl` 再构建 `superbpm`
- **THEN** 后一产物不残留前一企业的认证地址或凭据，不以已有异企业凭据跳过登录

### Requirement: 升级兼容有明确验证

交付 SHALL 验证插件加载、企业配置选择、桌面启动、登录准入及普通发行版回归。企业实现 SHALL 使用明确的扩展接口；不得通过复制原生主入口、运行时替换内部方法或前端遮罩宣称实现零侵入强制认证。现有扩展点不足时 SHALL 先列明最小通用接入需求再实施。

#### Scenario: 上游变更导致插件不兼容

- **WHEN** 更新 DSH 后插件接口、桌面启动或准入路径发生不兼容变化
- **THEN** 兼容验证阻止企业发行通过，不通过静默关闭认证规避错误
