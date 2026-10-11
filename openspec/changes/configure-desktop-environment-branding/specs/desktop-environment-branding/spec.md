# Spec Delta

## Purpose

定义 Desktop 如何从显式选择的命名环境读取显示名称、图标套装和版本化安装制品基础名称，同时保持既有应用身份、数据目录及升级路径。

## ADDED Requirements

### Requirement: Desktop 品牌来自所选命名环境

Desktop 打包 SHALL 从被选择的 `$DSH_CONFIG_ENV_DIR/<name>/config.json` 独立读取 `desktop.branding`，支持可选 `displayName`、`iconSet` 和 `artifactNameBase`。品牌配置 SHALL 与 `desktop.updates` 分开校验和消费。缺少字段或空字符串 SHALL 分别回退到现有 DSH 显示名称、现有 DSH 图标套装和既有 `deepseek-harness` 制品前缀；`artifactNameBase` 缺省且 `displayName` 有效时 SHALL 使用该显示名称。仅所选环境的规范化品牌值 SHALL 进入构件与构建记录。无效名称、无效套装或配置文件错误 SHALL 在构件生成前报告并失败。

#### Scenario: 金租办公环境选择品牌资源

- **WHEN** Desktop 打包选择 `local` 或 `hxfl` 且 `desktop.branding.displayName` 为“金租办公”、`iconSet` 为 `hxfl`
- **THEN** 构件使用“金租办公”作为用户可见名称
- **AND** 构件使用仓库中不含文字的华夏金租红色图案资源
- **AND** 版本化制品基础名称默认跟随“金租办公”
- **AND** `superbpm` 配置和其他未选择环境不进入该构件

#### Scenario: 环境未配置品牌

- **WHEN** 未选择命名环境，或所选环境缺少 `desktop.branding`，或品牌字段为空
- **THEN** Desktop 使用现有 DSH 显示名称、图标套装和制品前缀
- **AND** 打包及更新行为沿用当前配置

#### Scenario: 配置未知图标套装或无效名称

- **WHEN** 所选环境引用不存在/不完整的图标套装，或名称含路径分隔、控制字符等不能安全用作品牌/单段文件名前缀的字符
- **THEN** 打包在生成安装器或更新制品前失败
- **AND** 不回退到其他套装或生成部分构件

### Requirement: 完整图标套装随环境应用

Desktop SHALL 通过仓库内套装标识选择所需品牌图标。一个有效套装 SHALL 为 DSH 客户端侧栏提供单色 SVG 品牌标记，为目标平台提供应用图标，并提供 Windows 托盘图标、Windows 安装器品牌图和卸载侧栏图。打包 SHALL 验证所选套装的目标资源存在且可读，再将它们用于应用、托盘、客户端侧栏和安装/卸载界面。DSH 默认套装 SHALL 保留当前跟踪的图标外观。

#### Scenario: 使用 DSH 套装打包 Windows

- **WHEN** 所选环境选择 DSH 图标套装且目标为 Windows
- **THEN** Windows 应用图标、托盘图标、安装器品牌图和卸载侧栏图来自同一套资源
- **AND** 现有安装器图片格式转换与签名步骤继续执行

#### Scenario: 使用 DSH 套装打包 macOS

- **WHEN** 所选环境选择 DSH 图标套装且目标为 macOS
- **THEN** macOS 应用包使用该套装的 macOS 图标
- **AND** 构件签名与公证继续作用于最终图标资源

### Requirement: 用户可见名称使用环境品牌

选择有效的 `displayName` 时，Desktop SHALL 在中英文应用菜单、欢迎页、更新界面、关于面板、托盘提示、系统权限说明、安装/卸载提示及 DSH 客户端侧栏品牌名称中显示该名称。客户端侧栏标记 SHALL 来自所选 `iconSet` 的 `sidebar-mark.svg`，并按侧栏文字颜色显示；未配置品牌时保留原 DSH 字标。说明性文档中的现有 DSH 名称 SHALL 保持不变；配置及打包说明 SHALL 描述新增环境字段。

#### Scenario: 使用 local 品牌启动应用

- **WHEN** 使用 `local` 配置构建的 Desktop 启动
- **THEN** 应用窗口、菜单、欢迎/更新/关于界面和系统权限说明中的产品名称显示“金租办公”
- **AND** Windows 安装/卸载提示使用相同产品名称
- **AND** DSH 客户端侧栏以该名称替代官方文字字标，并显示所选图标套装中的侧栏标记

#### Scenario: 不配置品牌名称

- **WHEN** Desktop 未配置有效 `displayName`
- **THEN** 所有上述位置继续显示当前 DSH 名称

### Requirement: 品牌改名保持 Desktop 安装和更新身份

更换 `displayName`、`iconSet` 或 `artifactNameBase` SHALL NOT 更改 Desktop `appId`、`dsh` 协议、用户 DSH_HOME、Electron 既有 `userData`/`sessionData` 路径或更新 distribution/channel。Windows 与 macOS 的现有安装 SHALL 可继续由同一应用身份升级；运行时使用新名称 SHALL NOT 将既有用户设置或会话数据写入新目录。

#### Scenario: 带品牌升级现有安装

- **WHEN** 现有 DSH 安装升级到使用环境化显示名称的版本
- **THEN** 安装身份和更新目标保持不变
- **AND** 应用继续读取原 `userData`、`sessionData` 和 DSH_HOME

#### Scenario: 从环境品牌配置回退

- **WHEN** 从所选环境移除品牌配置并生成后续版本
- **THEN** 构件恢复 DSH 默认显示名、图标和制品前缀
- **AND** 同一安装仍可升级，既有数据路径保持不变

### Requirement: 安装和更新制品共享环境化基础名称

版本化安装器、updater 负载、blockmap 元数据和构建记录 SHALL 使用同一 `artifactNameBase` 与既有版本、平台、架构和构建模式后缀规则。构建入口 SHALL 在版本发现和打包前解析品牌。macOS 制品整理、私有更新元数据校验、上传规划及远端版本发现 SHALL 使用构建记录绑定的同一环境品牌。上传 SHALL 拒绝与当前选择环境/品牌不匹配的构建记录。现有 `dsh-latest-*` 稳定下载别名和 channel 元数据文件名保持不变。

#### Scenario: 打包与上传使用一致的环境品牌

- **WHEN** Desktop 使用 `local` 品牌生成 Windows 或 macOS 发布构件并上传
- **THEN** 安装器和 updater 负载的基础名称为“金租办公”
- **AND** channel YAML 中的文件 URL、blockmap、构建记录及上传计划都引用同一文件名
- **AND** 上传器验证所选配置与构建记录中的品牌一致

#### Scenario: 更新制品命名不匹配

- **WHEN** 生成的 updater metadata、文件名、blockmap 或构建记录与选中品牌不一致
- **THEN** 本地制品验证或上传规划失败
- **AND** 不发布不完整或身份不匹配的更新 feed

#### Scenario: 版本发现选择下一个版本

- **WHEN** Desktop 为配置了非默认基础名称的环境发现已发布版本
- **THEN** 本地与远端版本发现只识别对应命名规则下的 DSH Desktop 制品
- **AND** 不因品牌前缀变化重复占用或复用已发布版本
