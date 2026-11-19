# Desktop 环境隔离设计

[English](2026-11-19-desktop-environment-isolation-design.md) | 中文

## 目标

让 Windows `hxfl`、`hxfluat` 和 `superbpm` Desktop 构建可以并存，并分别保存 Harness 与 Electron 数据。每个构建从所选 `envs/<name>/config.json` 读取自身标识和 Windows 路径。

## 目标与范围

- 为每个环境设置首次安装目录、独立的 Windows 应用标识、`DSH_HOME` 和 Electron `userData` 目录。
- 保留现有 `hxfl` 应用标识，使当前安装可以原地升级；为三个环境配置独立数据位置。
- 保留自定义安装目录编辑器；配置目录仅作为默认值，更新继续使用已登记位置。
- 仅修改 Windows。macOS 打包及其当前应用标识和数据路径保持不变。
- 不把此前共享的 Harness 主目录复制或拆分到 UAT 或 Superbpm 主目录；无法可靠地按环境区分其中的内容。

## 方案

1. **从各环境配置读取 Windows 标识和路径（已选）。** `package-target.ts` 校验并嵌入所选值；Windows 安装器和 Desktop 启动时使用这些值。这样由一个环境文件统一维护设置，并保留现有安装器的路径检查和更新行为。
2. **继续以发布 dotenv 文件为准。** 将每个环境的值放进打包 preset，再单独传给安装器。这样会在 `envs/<name>/config.json` 以外重复维护部署标识，也更容易选错环境配置。
3. **运行时从产品名推导目录。** 这种方式不需要配置字段，但无法指定所需的 `D:\...` 安装路径，并且标识改变时会悄悄迁移用户数据。

## 配置与行为

在每个环境配置中增加经过校验的 Windows Desktop 设置：应用标识、默认安装目录、Harness 主目录和 Electron 用户数据目录。保留现有 `hxfl` Windows 应用标识 `com.deepseek.dsh`，并使用配置的 Harness 主目录 `%USERPROFILE%\\.dsh-hxfl` 和 Electron 用户数据目录 `%APPDATA%\\dsh-hxfl`。为 `hxfluat` 设置应用标识 `com.deepseek.dsh.hxfluat`，为 `superbpm` 设置应用标识 `com.deepseek.dsh.superbpm`。它们的 Harness 主目录分别为 `%USERPROFILE%\\.dsh-hxfl-uat` 和 `%USERPROFILE%\\.dsh-superbpm`，Electron 用户数据目录分别为 `%APPDATA%\\dsh-hxfl-uat` 和 `%APPDATA%\\dsh-superbpm`。首次安装默认目录使用 `D:\\dsh-hxfl`、`D:\\dsh-hxfl-uat` 和 `D:\\dsh-superbpm`。HXFL 的三个数据路径均取代此前默认值；已有数据仍保留在旧目录，不会自动迁移。

打包器在构建前校验所选配置，并将规范化的 Windows 设置嵌入应用。NSIS 欢迎页仅在新安装时使用配置的安装目录；现有检查仍要求目标为空、可写且位于固定本地磁盘。更新沿用已登记的安装目录。Desktop 在 Electron 就绪前解析当前 Windows 账户的 `%USERPROFILE%` 和 `%APPDATA%`，再设置 `DSH_HOME` 和 Electron `userData`。用户数据路径位于应用安装目录之外，因此卸载应用不会删除用户数据。

安装器保留用户显式传入的 `/D=` 目标，并拒绝与实际展开后的 Harness 或 Electron 用户数据目录重叠的安装路径。卸载器会保护有效 Harness 主目录；未设置 `DSH_HOME` 进程变量时使用环境配置中的默认目录。打包内的 Python 完整安装器每个用户仅支持一个已登记运行时，因此三个 Desktop 注册共享 `%LOCALAPPDATA%\\DeepSeek Harness\\Python\\3.14.10` 下的运行时；按应用 ID 记录所有权，最后一个已登记应用卸载后才移除运行时。每个环境也使用独立的应用 ID 更新缓存，避免卸载一个环境时删除另一个应用的待安装更新。

Windows 环境变量展开后，安装目录、有效 Harness 主目录、Electron 用户数据目录和共享 Python 运行时必须互不重叠。启动和安装器预检会拒绝重叠路径；卸载 Electron 数据时会保护 Harness 主目录和 Python 运行时。

此前各环境可能已把数据写入共享的 Harness 主目录或 Electron 用户数据目录；该设计将旧数据留在原目录，并让三个环境都使用各自配置的数据路径。它不会猜测历史记录属于哪个环境。Windows 会把新的 UAT 和 Superbpm 应用标识登记为新应用。保留旧的共享标识安装，因为它属于 `hxfl`；仅在确认隔离安装可用后，才删除使用单独环境应用标识登记的旧 UAT 或 Superbpm 安装。

## 实现

实现已加入所选配置的校验和嵌入；NSIS 应用默认目录时会保留显式目标和已登记位置；Desktop 在 Electron 就绪前解析数据路径；相关配置和数据保留行为均提供了中英文文档。升级指南说明 UAT 和 Superbpm 使用新的空主目录，并解释旧数据保留的位置。
