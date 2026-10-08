# Design

## Context

私有市场插件单独维护在 sibling project `deepseek-harness-plugins/dsh-private-market`。DSH 有可运行的 Web profile，也有携带 Web 应用的 Desktop 构件。Plugin Manager 的主 registry 与 fallbackRegistries 对 profile 中所有插件安装共用。用户希望本地 Web 开发和 Desktop 打包都能显式选择同一个命名环境，同时未选择时不增加市场加载或配置要求。

## Goals / Non-Goals

**Goals:**

- 用通用参数 `--config-env <name>` 显式选择部署环境；本地 `dev:web` 与 Desktop 打包读取同一个环境 `config.json`。
- 本地 Web 在选定环境时从 sibling checkout 加载市场插件，不把它安装进或写入用户 profile；未选择时不加载。
- 本地 Web 从所选环境加载 sibling 插件；Desktop 构件配送所选环境的独立插件，市场在 Plugins 页面中作为默认关闭的 Official 可选 bundle。
- 只将所选环境的目录 URL、registry URL 与可选 credential reference 绑定到当前运行或构件；secret value 仅由 Host 运行时凭据服务提供。
- 市场插件仅在显式选择后参与构件或本地运行。保持 Agent、Session、loop、持久化和无市场 profile 行为不变。

**Non-Goals:**

- 在 DSH 中实现市场目录服务、市场页面或插件搜索功能。
- 把企业 registry、目录地址或凭据值提交到 DSH 公共源码。
- 为市场安装单独实现 registry 路由，或变更 Plugin Manager 的 fallback 算法。
- 让打包时选择环境自动启用市场 bundle；管理员仍需在 profile 中显式启用。

## Decisions

### 统一命名环境选择器

引入通用参数 `--config-env <name>`。`DSH_CONFIG_ENV_DIR` 指向由部署配置仓库或本地私有配置目录提供的环境根目录；选择 `hxfl` 时读取 `<config-dir>/hxfl/config.json`，选择 `superbpm` 时读取 `<config-dir>/superbpm/config.json`。环境名是部署构建自己的标识，不复用 profile 名或 Desktop 更新通道名。选择器只接受单个路径段，拒绝绝对路径、斜杠和 `..`，配置文件中的 `environment` 必须与选择器完全相同。

每个 `config.json` 使用版本化 JSON 和产品命名空间。采用 JSON 而不采用 properties：配置含有嵌套的产品/能力字段，JSON 可直接映射 TypeScript 类型并进行 schema 校验，也便于按命名空间提取和规范化摘要；properties 对嵌套对象和后续扩展需要额外的命名约定与解析器。当前格式约定为：

```json
{
  "schemaVersion": 1,
  "environment": "hxfl",
  "plugins": {
    "privateMarket": {
      "catalogUrl": "https://plugins.hxfl.example/catalog.json",
      "catalogCredentialRef": "DSH_PRIVATE_MARKET_TOKEN",
      "registryUrl": "https://npm.hxfl.example/"
    }
  }
}
```

`schemaVersion`、`environment` 和当前功能需要的 `plugins.privateMarket` 必填；该对象内的 `catalogUrl`、`registryUrl` 必须是无 userinfo/query/fragment 的 HTTPS URL，`catalogCredentialRef` 可省略，非空时必须符合 DSH credential reference 命名规则。当前消费的 `plugins.privateMarket` 内未知字段和不支持的 schema version 均拒绝。根对象按产品命名空间扩展：已知命名空间 `plugins` 当前只消费并严格校验 `privateMarket`；后续 Desktop 更新配置放入根级 `desktop` 命名空间，由后续变更定义字段和消费者。当前加载器允许其他产品/插件命名空间作为不透明 JSON 对象存在，但不校验其内部字段、不使用、不复制到构件或写入构建记录。这样部署配置可以先共享一个文件，而每个构建只提取自己认识的配置。解析器只提取 `plugins.privateMarket`，不得把完整 JSON 当作 runtime config 转发。`fallbackRegistries` 不放入该文件，沿用被运行/打包 DSH 的现有值与顺序。插件仓库地址也不放入环境文件：本地开发使用 sibling 路径，Desktop 构件以插件 tarball SHA-512 integrity 记录其确切制品，与部署环境配置分离。

外部配置目录示例：

```text
private-market-config/
  hxfl/config.json
  superbpm/config.json
```

目录和其中的环境文件不提交到 DSH 公共源码，也不把未选中的环境文件复制进 Desktop 构件。

本地 Web 开发使用 `pnpm run dev:web -- --config-env <name>`。dev-web 脚本消费该参数而不是转发给 Web 应用；它验证来源与 `plugins.privateMarket` 配置、构建/监视 sibling 插件，并只为本次 Web 进程生成临时配置 overlay。overlay 增加市场 bundle 条目并覆盖当前 Plugin Manager registry，不修改 profile 文件或 DSH_HOME。该参数未提供时，dev-web 不要求 sibling 插件仓库或环境配置，启动路径维持当前行为。

Desktop 打包入口接受相同的 `--config-env <name>` 参数。选择器未提供时跳过市场构件集成；选择器存在时，环境缺失或无效即在产物形成前失败。包脚本不得把该参数意外传给 Electron Builder。

### 从独立 sibling 仓库加载并配送

本地开发默认从 `../deepseek-harness-plugins/dsh-private-market` 解析插件，也接受 `DSH_PRIVATE_MARKET_SOURCE` 覆盖。路径必须是独立 Git 仓库并包含预期包名、构建入口、Host/Remote/Client 产物和 bundle 元数据。带环境的本地 Web 启动验证插件来源后才启动；来源或构建失败时只使该次显式市场启动失败，不改变普通 Web 开发流程。

Desktop 打包从该来源构建插件，并生成独立插件 tarball 和带精确插件依赖的 DSH CLI tarball。构建记录以插件 tarball 的 SHA-512 integrity、环境名和所选配置摘要标识输入。不得复制插件功能源码进 DSH monorepo，也不得把 sibling checkout 浮动依赖带进构件。缺少输入或产物无效时，目标构建失败，不生成不完整构件。

### Official optional bundle 元数据

Plugin Manager 通过 app-boot 的 `OPTIONAL_BUNDLES` 和安装清单中的 `dsh.optionalBundles` 识别可由用户启用的 Official bundle。Desktop 打包仅在选择市场环境时将 `@deepseek-ai/dsh-private-market` 加入安装清单的扩展名单和依赖；市场包不加入任何默认 profile 模板。普通构建不修改安装清单。

本地 Web 开发不把 sibling checkout 加入安装级 Official 名单，而是由一次性的环境 overlay 显式引用该插件及其配置。因此不会持久化修改默认 profile，也不会影响其他 profile。运行时扩展只负责读取打包清单和处理明确选择的开发加载路径，不触及 Agent、Session、loop 或现有 bundle 安装/移除算法。

### 环境配置从外部注入

Desktop 构建或本地 Web 开发从 `DSH_CONFIG_ENV_DIR/<name>/config.json` 读取单一环境，由 `--config-env <name>` 选择。环境目录由开发者、CI 或部署构建任务提供，不提交 DSH 公共源码。当前变更只解析和消费 `plugins.privateMarket`，校验 schema、环境名、已支持命名空间字段和 URL；未来产品命名空间保持不透明且不被本变更消费。当前进程或构件只取得所选文件中的 `plugins.privateMarket` 非秘密字段；其他环境和其他产品命名空间不进入插件包、overlay、构件和构建记录。

`catalogCredentialRef` 只是 Host 凭据服务中的查找名。开发/部署运行时另行向 Host 凭据服务提供 secret value。凭据值不得进入环境配置文件、Client bundle、Desktop 安装包或构建记录。Desktop 构建记录保存环境名、规范化非秘密配置摘要和插件 tarball integrity，不保存环境文件原文。

### 私有 registry 覆盖主源，保留 fallback

本地 Web 显式市场 overlay 和 Desktop 中已启用的市场 bundle 会把所选环境 `plugins.privateMarket.registryUrl` 写入 Plugin Manager 的主 registry。市场浏览触发的 bundle 安装和普通手动安装都遵守同一主源。既有 `fallbackRegistries` 原样保留，继续按当前逻辑回退；无配置环境时，registry 配置不变。

因为 fallback 不变，私有主源失败时现有安装器可能继续查询 fallback。环境/发布维护者负责配置可信 fallback，并接受其可能收到私有包名查询的现状。该集成不引入市场专属安装 API。

### 打包隔离与失败处理

无 `--config-env` 时不得要求插件源或环境配置，也不得更改默认 profile、构件运行时 registry 或官方包清单。本地 Web 选定环境但遇到市场来源/配置错误时，向本次启动报告错误；打包选定环境但遇到错误时，在构件发布前失败。市场加载后目录不可用由独立插件显示局部不可用状态；未启用市场的 profile 不加载它。进程级未捕获异常继续服从 DSH 现行策略。

验证覆盖本地 Web overlay 隔离、Desktop 单环境配置、secret 不外泄、可选 bundle 默认关闭、registry 主源覆盖与 fallback 保留；普通无市场构建验证不需要额外输入且启动语义保持现状。

### 方案比较

- **采用：本地 Web 命令加载 sibling 插件，Desktop 打包合成带 SHA-512 integrity 的插件包与环境配置**。开发无需把插件装入持久 profile，构件可识别且环境明确。
- **将插件源码复制进 DSH monorepo**。会产生重复维护和独立插件发布耦合，违背插件独立维护目标。
- **发布时浮动安装 latest**。无法复现或准确审计构件内容，因此构件记录必须绑定准确的插件 tarball integrity。
- **仅让市场安装按钮临时选择 registry**。普通手动安装会继续使用另一个源，与已确认的构件/运行环境主源覆盖要求不符。
- **移除现有 fallback**。会改变安装器行为，超出本变更范围。

## Risks / Trade-offs

- [外部插件 API 与 DSH runtime 不匹配] → Desktop 打包前构建插件并验证 Host、Remote、Client、peer 版本，记录最终 tarball integrity。
- [optional bundle 名单此前为源码常量] → 增加一个仅由发行清单补充名称的运行时读取入口；无环境/无清单时沿用原名单和行为。
- [本地开发 overlay 影响持久 profile] → overlay 只在当前 dev-web 子进程生命周期内生成与使用，不写入 DSH_HOME。
- [私有 registry 覆盖普通安装] → 明确为所选环境内统一主源；管理员手动安装同样遵守该源。
- [fallback 可能查询公共 registry] → 保留用户确认的 fallback 行为，只使用该构件原有可信列表。
- [环境配置与产物错配] → Desktop 构建记录绑定环境名、配置摘要和插件 tarball integrity；打包前验证来源和配置。
- [sibling checkout 在 CI 缺失或漂移] → CI 检出经审核的插件源码，打包记录实际生成的 tarball integrity。
- [环境文件重命名或配置不匹配] → 路径固定为 `<config-dir>/<environment>/config.json`，文件内环境名须与命令参数匹配，字段使用版本化 schema 校验。
- [插件 UI/Host 加载失败] → 只报告市场插件不可用；未选择环境的 profile 不受影响，进程级异常沿用 DSH 策略。

## Migration Plan

本地开发者配置 `DSH_CONFIG_ENV_DIR`（目录内按环境名放置 `config.json`）和 sibling 插件 checkout 后，使用 `pnpm run dev:web -- --config-env hxfl` 启动市场开发模式；不带参数继续正常运行 Web。Desktop 打包任务提供插件源码和环境目录，再生成该环境构件。管理员安装构件后仍需在目标 profile 显式启用 Official 私有市场 bundle。回退时省略环境参数并重建普通构件，或恢复上一版构件；无需迁移 Session 或 profile 数据。
