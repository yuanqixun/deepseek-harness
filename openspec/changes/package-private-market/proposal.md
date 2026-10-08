# Proposal

## Why

企业用户需要在本地 Web 开发时显式加载独立维护的私有插件市场，并能为 Desktop 发行构件选择隔离的部署环境，把市场插件和该环境的目录地址、插件 registry 等配置一起固化。DSH 负责本地 Web 加载入口与 Desktop 构件集成；市场功能继续由独立插件仓库维护。

## What Changes

- 新增统一环境选择参数 `--config-env <name>`。本地 Web 开发通过 `pnpm run dev:web -- --config-env <name>` 从 sibling checkout 加载私有市场插件，并应用所选环境配置；不传参数时不加载插件且不要求市场配置。
- 环境配置按命名目录隔离：`--config-env hxfl` 读取 `$DSH_CONFIG_ENV_DIR/hxfl/config.json`，`superbpm` 则读取对应目录下的配置。本地 Web 开发指定环境时，从 sibling checkout 构建并仅在本次运行加载独立插件；Desktop 打包指定环境时，将该插件和配置绑定到构件；未指定时保持现有行为。
- 本地 Web 的显式市场 overlay 和 Desktop 已启用的市场 bundle 将私有 registry 设为 Plugin Manager 主 registry，作用于市场安装和普通插件安装；保留现有 fallbackRegistries 与回退策略。
- Desktop 构件将市场包作为默认关闭的 Official 可选 bundle 提供；只有显式选择环境才配送，默认 profile 模板不启用市场。安装清单中的 `dsh.optionalBundles` 扩展当前 Official bundle 名单。
- 允许运行时增加仅用于读取 optional-bundle 配送元数据、识别明确请求的本地 Web 市场环境所需的最小集成；不修改 Agent、Session、loop、持久化格式、会话语义或未启用 profile 的行为。市场加载/目录错误保持在插件内报告，不改变 DSH 进程级未捕获异常策略。
- **非目标**：不把市场 Host、目录协议或 UI 实现在 DSH 仓库；不把组织凭据值写进源码、插件 Client bundle、安装包或构建记录；不改变 Plugin Manager 安装算法或取消 registry fallback。

## Capabilities

### New Capabilities

- private-market-packaging: 在本地 Web 开发和 Desktop 构件中按命名环境加载或配送独立私有市场插件。

### Modified Capabilities

无。

## Impact

- `dev:web` 本地 Web 启动、Plugin Manager 安装清单读取、Desktop 参数解析与构件组合脚本，以及 Desktop 构建记录。
- 外部构建输入：插件来源、`$DSH_CONFIG_ENV_DIR/<environment>/config.json` 和 `--config-env` 选择器。环境目录由开发者、CI 或部署构建提供，不提交到 DSH 公共源码；配置只存 credential reference，credential value 仍由 Host 运行时凭据服务提供。
- Agent、Session、loop、会话持久化格式、默认 profile 模板和未选择市场环境的构件保持现有语义。
