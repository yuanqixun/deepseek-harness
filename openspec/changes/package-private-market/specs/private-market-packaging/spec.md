# Spec Delta

## Purpose

定义 DSH 本地 Web 开发如何通过显式命名环境加载独立私有市场插件，以及 Desktop 打包如何配送插件并隔离环境配置与默认运行行为。

## ADDED Requirements

### Requirement: 部署环境配置通过显式选择器加载

本地 Web 开发和 Desktop 打包 SHALL 接受通用的 `--config-env <name>` 选择器，并从 `DSH_CONFIG_ENV_DIR/<name>/config.json` 读取外部部署环境文件。选择器存在时，配置目录变量必须设置且文件必须可读，否则该次显式开发启动或 Desktop 打包失败。文件 SHALL 为 JSON，包含必填 `schemaVersion`、`environment` 和产品命名空间；当前变更只要求并解析 `plugins.privateMarket`，其内包含必填 `catalogUrl`、`registryUrl` 和可选 `catalogCredentialRef`。`schemaVersion` 当前为 `1`，`environment` 必须匹配选择器。环境名 SHALL 是单一路径段，拒绝绝对路径、斜杠和 `..`。当前消费的 `plugins.privateMarket` 对象内未知字段和未支持 schema version SHALL 导致失败。两个 URL SHALL 使用 HTTP 或 HTTPS，且不得包含 userinfo、query 或 fragment。根级其他产品命名空间和 `plugins` 下的其他命名空间 SHALL 可以作为不透明 JSON 对象存在，但本变更 SHALL NOT 消费、复制或写入构建记录。fallback registry 与插件来源 integrity 不属于环境配置，分别沿用现有 fallback 配置和打包输入。未提供选择器时，DSH SHALL NOT 要求插件来源或市场配置，也 SHALL 保持现有启动及打包行为。

#### Scenario: 本地 Web 显式加载市场环境

- **WHEN** 开发者运行 `pnpm run dev:web -- --config-env hxfl`，且 `$DSH_CONFIG_ENV_DIR/hxfl/config.json` 的 `plugins.privateMarket` 与插件来源有效
- **THEN** dev-web 从独立插件来源构建/监视市场插件
- **AND** 仅为本次 Web 进程加载市场 bundle 和该环境配置
- **AND** 不持久化修改 profile 或 DSH_HOME

#### Scenario: 本地 Web 不选择市场环境

- **WHEN** 开发者运行 dev-web 且未提供 `--config-env`
- **THEN** DSH 不要求市场来源或环境配置
- **AND** Web 启动与插件加载沿用当前行为

#### Scenario: 显式选择不存在或无效的环境

- **WHEN** 对应 `config.json` 缺失、环境字段无效、文件内环境名不匹配、schema 不支持或配置文件无法读取
- **THEN** 本次显式市场启动或构建在 Web 服务启动/发行构件形成前失败
- **AND** 错误指出环境名或无效字段

### Requirement: 插件来源独立且发行版本可复现

市场功能源码 SHALL 保持在独立 `dsh-private-market` 仓库。DSH 本地开发 SHALL 默认使用 sibling checkout `../deepseek-harness-plugins/dsh-private-market` 并允许 `DSH_PRIVATE_MARKET_SOURCE` 覆盖。Desktop 打包 SHALL 将构建后的插件 tarball SHA-512 integrity 与环境记录绑定。来源缺失或 Host/Remote/Client 产物不完整时，显式市场运行/打包 SHALL 失败，不得产生不完整构件。

#### Scenario: sibling checkout 本地开发

- **WHEN** 本地显式选择市场环境且 sibling checkout 存在并通过包验证
- **THEN** DSH 从该独立仓库构建市场插件，不复制源码进 monorepo

#### Scenario: Desktop 打包记录插件制品

- **WHEN** Desktop 打包显式选择私有市场环境
- **THEN** 打包流程从独立插件仓库构建 Host、Remote 和 Client 产物，并将插件与定制 DSH CLI tarball 纳入本目标的 package set
- **AND** Desktop 构建记录绑定插件 tarball SHA-512 integrity、环境名和配置摘要

### Requirement: 本地 Web 市场配置不得污染持久 profile

指定本地 Web 环境时，DSH SHALL 通过仅用于本次启动的临时配置 overlay 引用市场插件，并设置选择环境的插件配置。overlay SHALL NOT 写入已有 profile 文件或 DSH_HOME。未选择市场环境时，不得装载市场插件。

#### Scenario: 市场预览退出

- **WHEN** 带环境参数启动的本地 Web 进程退出
- **THEN** 临时 overlay 随本次运行清理或不再被后续运行引用
- **AND** 用户的 profile 依赖、bundle 选择和用户 patch 保持不变

### Requirement: 发行构件配送默认关闭的 Official 市场 bundle

本地 Web 显式选择环境时 SHALL 仅为当前运行加载 sibling 插件；选择环境的 Desktop 构件 SHALL 携带独立插件，并在 Plugins 页面列为可显式启用的 Official optional bundle。默认 profile 和随附模板 SHALL NOT 选择市场。DSH SHALL 提供一个 optional bundle 清单扩展入口：Desktop CLI 安装清单的 `dsh.optionalBundles` 可追加本构件携带的市场包，未带该字段时 Plugin Manager 沿用现有内置清单。未选择市场环境的 Desktop 构件 SHALL NOT 添加市场项，也 SHALL NOT 携带市场插件包或环境配置。

#### Scenario: Desktop 选择市场环境打包

- **WHEN** Desktop 打包命令使用 `--config-env <name>` 且输入有效
- **THEN** Desktop 安装包携带所选环境的市场插件和可选 bundle 元数据
- **AND** 市场未被新建或随附 profile 默认启用

#### Scenario: 管理员显式启用已配送 bundle

- **WHEN** 管理员在 profile 中启用构件提供的 Official 市场 bundle
- **THEN** profile 加载该插件并显示市场入口
- **AND** Host Remote 使用构件绑定的市场目录配置

#### Scenario: 不带市场环境的 Desktop 打包

- **WHEN** Desktop 打包未提供 `--config-env`
- **THEN** 构件不包含市场插件或市场 optional bundle 项
- **AND** 默认 profile、安装清单和启动行为保持现状

### Requirement: 环境配置只绑定到被选择的运行或构件

市场运行/构建 SHALL 只读取选择环境的 `config.json`，并从 `plugins.privateMarket` 提取 `catalogUrl`、`registryUrl` 和可选 `catalogCredentialRef`；其他环境不得进入 overlay、插件 bundle、安装包或构建记录。其他产品命名空间（包括预留给未来 Desktop 更新设置的 `desktop`）不由本变更解释或转发。配置文件 SHALL NOT 保存凭据值。`catalogCredentialRef` SHALL 只作为 Host 凭据服务查找名；凭据值 SHALL NOT 进入构建进程公开配置、Client bundle、安装包或构建记录。Desktop 构建记录 SHALL 绑定环境名、规范化 `plugins.privateMarket` 配置摘要及插件 tarball SHA-512 integrity。

#### Scenario: 使用不同环境构建

- **WHEN** 两次构建分别选择不同命名环境
- **THEN** 每个运行/构件只包含本次选择的非秘密字段
- **AND** 构建记录分别与其环境名、配置摘要和产物绑定

#### Scenario: 运行时解析凭据引用

- **WHEN** 所选环境提供 `catalogCredentialRef`
- **THEN** Host 使用该引用向运行时凭据服务读取秘密
- **AND** 构件和 Client 只携带引用名，不携带凭据值

### Requirement: 所选私有 registry 覆盖主 registry 并保留 fallback

本地市场 Web overlay 和启用市场 bundle 的 Desktop profile SHALL 将选择环境的 `plugins.privateMarket.registryUrl` 配为 Plugin Manager 主 registry。市场安装和普通手动安装 SHALL 共用该主 registry。DSH SHALL 原样保留相应运行/构件既有 `fallbackRegistries` 与回退顺序；未选择配置环境时 registry 配置不变。

#### Scenario: 安装请求使用私有主 registry

- **WHEN** 所选环境的 `plugins.privateMarket.registryUrl` 与 DSH 当前主 registry 不同
- **THEN** 市场安装和普通手动插件安装都从该私有 registry 开始
- **AND** 现有 fallback 顺序和失败分类保持不变

#### Scenario: 私有主 registry 触发 fallback

- **WHEN** 私有主源发生现有安装逻辑可恢复的错误
- **THEN** DSH 按现有顺序查询已配置 fallback
- **AND** DSH 不新增仅供市场使用的 registry 算法

### Requirement: 市场错误与 DSH 核心行为隔离

市场插件来源或配置在明确选择市场时无效，SHALL 只阻止本次显式市场开发启动或目标构件打包。市场启用后的目录故障 SHALL 由市场插件报告为不可用状态。未选择市场环境的 Web/profile SHALL NOT 加载市场插件。DSH SHALL 保持 Agent、Session、loop、持久化格式和进程级未捕获异常策略不变。

#### Scenario: 市场目录不可用

- **WHEN** 已启用的市场插件无法读取其配置目录
- **THEN** 插件报告市场不可用
- **AND** DSH Agent、Session 和 loop 语义不变

#### Scenario: 检查无市场核心行为

- **WHEN** profile 或构件未显式选择/启用市场
- **THEN** DSH 不加载市场插件
- **AND** 原有默认 profile 与本地 Web/Desktop 启动行为不变
