# Tasks

## 1. 通用环境配置文件与私有市场命名空间

- [x] 1.1 定义 `$DSH_CONFIG_ENV_DIR/<environment>/config.json` 的版本化 JSON 结构：根级 `schemaVersion`、`environment` 和产品命名空间；当前私有市场配置位于 `plugins.privateMarket`。
- [x] 1.2 为本地 Web 与 Desktop 打包实现通用 `--config-env <name>` 参数解析；无参数时不读取环境配置或加载市场。
- [x] 1.3 解析器按 `<config-dir>/<name>/config.json` 查找；校验环境名为单一路径段、文件环境名匹配、schema version/字段有效、URL scheme/组成有效、凭据引用格式有效。
- [x] 1.4 仅提取并严格校验当前消费的 `plugins.privateMarket` 字段；对后续产品命名空间仅作不透明输入，不消费、不复制、不记录；构建记录绑定环境名和规范化私有市场配置摘要，不含 secret value 或其他环境。

## 2. 本地 Web 开发加载

- [x] 2.1 让 `dev:web` 接收并消费 `--config-env <name>`，未传参数时保持当前启动路径。
- [x] 2.2 从 sibling checkout 或 `DSH_PRIVATE_MARKET_SOURCE` 校验并构建/监视独立插件的 Host、Remote、Client 产物。
- [x] 2.3 仅为当前 Web 启动生成临时配置 overlay，引用市场 bundle 和 `plugins.privateMarket` 配置，并将其 `registryUrl` 设为当前 Plugin Manager 主 registry。
- [x] 2.4 验证本地 Web 不写入用户 profile/DSH_HOME；缺来源或坏配置仅使明确请求市场的启动失败。

## 3. 本地 Web 与 Desktop 构件组合

- [x] 3.1 本地 Web 与 Desktop 打包入口支持 `--config-env <name>`；未选择时不要求插件来源或市场配置。
- [x] 3.2 本地开发及 Desktop 打包使用 sibling checkout，允许 `DSH_PRIVATE_MARKET_SOURCE` 覆盖；以生成的插件 tarball SHA-512 integrity 记录准确制品，不依赖浮动 `latest`。
- [x] 3.3 本地 Web 将构建产物复制到临时运行时目录，Desktop 将插件 tarball 与带精确插件依赖的 DSH CLI tarball 组合；不复制功能源码进 DSH monorepo。
- [x] 3.4 通过 Desktop CLI 安装清单的 `dsh.optionalBundles` 扩展 Official optional bundle 名单；只对选择了市场环境的构件添加，内置默认名单和默认 profile 模板保持不变。
- [x] 3.5 所选环境的目录 URL、credential reference 和 registry URL 注入当前 Web overlay 或 Desktop 插件 bundle；market bundle 保持默认关闭。
- [x] 3.6 Desktop 构建记录保存环境名、非秘密配置摘要和插件 tarball integrity。

## 4. Registry 行为与隔离验证

- [x] 4.1 本地 Web 显式选择环境和启用市场 bundle 的 Desktop profile 将 `registryUrl` 设为 Plugin Manager 主 registry；保留各自既有 `fallbackRegistries`。
- [x] 4.2 验证 optional bundle 可由安装清单扩展而不改变未扩展时的现有名单；Plugin Manager 安装器继续使用现有主 registry 与 fallback 顺序。
- [x] 4.3 验证无市场环境时普通 Web 开发、默认 profile、构件清单与 registry 配置保持现状；插件不可用状态由独立市场插件负责报告。
- [x] 4.4 验证缺失来源、缺环境、无效 URL、peer 版本不兼容和 Host/Remote/Client 产物缺失会使显式市场启动或打包失败。
- [x] 4.5 检查当前构件只含所选环境字段，不写入凭据值或其他产品/环境配置；构建记录绑定实际插件 tarball integrity。
- [x] 4.6 OpenSpec 严格校验、目标文件 lint、针对性测试、类型检查、文档检查与包闭包检查通过。
