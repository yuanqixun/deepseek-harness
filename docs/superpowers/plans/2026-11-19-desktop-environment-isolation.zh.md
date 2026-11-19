# Desktop 环境隔离实施计划

[English](2026-11-19-desktop-environment-isolation.md) | 中文

> **面向 agentic worker：** 必须使用 `superpowers:executing-plans` 子技能，按任务逐项执行本计划。步骤使用复选框（`- [ ]`）跟踪。

**目标：** 让 Windows `hxfl`、`hxfluat` 和 `superbpm` Desktop 构建可以并存，并分别保存 Harness 与 Electron 数据。

**架构：** 从所选 `envs/<name>/config.json` 读取 Windows 标识和目录设置，在专用解析器中校验，并将规范化设置嵌入应用元数据和生成的 NSIS include。Desktop 启动时解析 `%USERPROFILE%` 和 `%APPDATA%`，再设置 `DSH_HOME`、`userData`、`sessionData` 和日志目录。

**技术栈：** TypeScript、Node ESM 打包脚本、Electron、electron-builder、NSIS、JSON 环境配置、Markdown 升级指南。

**规格：** `docs/superpowers/specs/2026-11-19-desktop-environment-isolation-design.md`

## 全局约束

- 配置的安装目录和运行时数据目录仅适用于 Windows；macOS 打包和现有路径保持不变。
- 保留 `hxfl` Windows 应用标识 `com.deepseek.dsh`；使用配置的 Harness 主目录 `%USERPROFILE%\\.dsh-hxfl` 和 Electron 用户数据目录 `%APPDATA%\\dsh-hxfl`。
- 将 `hxfluat` 配置为 `com.deepseek.dsh.hxfluat`、`%USERPROFILE%\\.dsh-hxfl-uat` 和 `%APPDATA%\\dsh-hxfl-uat`。
- 将 `superbpm` 配置为 `com.deepseek.dsh.superbpm`、`%USERPROFILE%\\.dsh-superbpm` 和 `%APPDATA%\\dsh-superbpm`。
- 首次安装默认目录使用 `D:\\dsh-hxfl`、`D:\\dsh-hxfl-uat` 和 `D:\\dsh-superbpm`；保留目录编辑功能，更新仍使用已登记位置。
- HXFL 选定的数据路径替换了旧默认目录；已有文件仍留在旧路径，不会自动迁移。
- 不把现有共享 Harness 主目录中的记录复制或拆分到新的 UAT 或 Superbpm 主目录。
- 保留现有 Windows 安装器检查：固定本地磁盘、可写空间、磁盘剩余空间以及目标目录为空或已登记。

## 审查重点

- 缺少或格式错误的 Windows 隔离配置必须让打包停止，并指出具体字段；任务 1 负责配置校验。
- 不安全路径或不支持的环境变量 token 必须在打包前报错；任务 1 负责路径校验。
- NSIS 引号处理必须保留已校验安装路径中的空格和反斜杠；任务 2 负责生成设置。
- 即使安装包携带新的默认目录，更新也必须保留已登记的安装路径；任务 2 仅在首次安装时设置默认目录。
- 必须保留调用者传入的 `/D=` 目标；任务 2 仅当 `/D=` 和已登记位置均不存在时应用配置默认值。
- 配置的 Python 完整安装器仅有一个当前用户产品注册；任务 2 按应用 ID 管理共享运行时所有权，避免一个应用的卸载移除另一个应用的运行时。
- 更新缓存写入和清理必须使用相同的环境专属名称；任务 2 同步改写 Windows 更新元数据和 NSIS 缓存设置。
- 环境变量展开后，所选安装路径、有效数据路径和共享 Python 运行时不得重叠；任务 2 在目标账户中检查，并在卸载时保护 Harness 主目录和运行时。
- 启动时必须在 Electron 就绪前设置两个 Electron 存储路径，同时保持 macOS 默认值不变；任务 3 负责启动顺序。

---

## 文件清单

- `apps/desktop/scripts/desktop-windows-environment.mjs`：读取、校验并规范化所选 Windows 应用标识和路径。
- `apps/desktop/scripts/package-target.ts`：加载所选 Windows 设置，并将规范化值传给打包器。
- `apps/desktop/scripts/electron-builder-config.mjs`：嵌入运行时设置并生成 NSIS 配置。
- `apps/desktop/scripts/installer.nsh`：为新安装选择配置目录，并在更新时保留已登记目录。
- `apps/desktop/installer/path.nsh`：拒绝与有效用户数据路径重叠的安装路径。
- `apps/desktop/installer/uninstall.nsh`：保护配置的 Harness 主目录和共享 Python 运行时，并仅删除环境专属 Electron 数据和更新缓存。
- `apps/desktop/scripts/python-runtime-installer.ps1`：协调已安装 Desktop 标识之间共享的 Python 运行时所有权。
- `apps/desktop/scripts/windows-directory-installer.mjs`：在生成的 NSIS 中使用所选环境的更新缓存名称。
- `apps/desktop/src/main.ts`：在 Electron 就绪前解析打包后的 Windows 存储设置。
- `apps/desktop/src/desktop-windows-environment.ts`：展开两个支持的 Windows 目录 token 并解析运行时路径。
- `envs/hxfl/config.json`、`envs/hxfluat/config.json`、`envs/superbpm/config.json`：声明每个环境的 Windows 标识和目录。
- `apps/desktop/README.md`、`apps/desktop/README.zh.md`、`apps/desktop/packaging/README.md`、`apps/desktop/packaging/README.zh.md`：说明配置、数据归属和安装行为。
- `docs/upgrade-guide/v0.2.1-rc.3/desktop-environment-isolation/guide.md`、`.zh.md`、`.i18n.yaml`：说明数据目录行为和旧版注册迁移。

## 任务

### 任务 1：定义并校验 Windows 环境设置

**文件：**

- 新建：`apps/desktop/scripts/desktop-windows-environment.mjs`
- 修改：`apps/desktop/scripts/package-target.ts`
- 修改：`envs/hxfl/config.json`
- 修改：`envs/hxfluat/config.json`
- 修改：`envs/superbpm/config.json`

- [x] 用 `appId`、`installDirectory`、`dshHome` 和 `userDataDirectory` 定义 `desktop.windows`；所选 Windows 构建遇到未知或缺少字段时拒绝继续。
- [x] 校验反向 DNS 应用标识；要求绝对本地 Windows 目录；数据路径只允许 `%USERPROFILE%` 和 `%APPDATA%` token；拒绝应用安装目录与数据目录彼此重叠。
- [x] 保留当前 `hxfl` 值，并按规格设置已批准的 `hxfluat` 和 `superbpm` 标识及独立数据目录。
- [x] 仅对 Windows 目标加载这些设置；从环境配置覆盖 `DSH_DESKTOP_APP_ID`，且不改变 macOS 配置。
- [x] 保持 `envs/local/config.json` 可用于没有部署隔离字段的 Windows 本地构建；三个部署环境必须提供完整的 `desktop.windows` 对象。

### 任务 2：嵌入 Windows 设置并选择首次安装目录

**文件：**

- 修改：`apps/desktop/scripts/electron-builder-config.mjs`
- 修改：`apps/desktop/scripts/installer.nsh`

- [x] 将规范化的 Windows 设置写入 `extraMetadata`，以便安装后的应用读取 `DSH_HOME` 和 `userDataDirectory`。
- [x] 生成包含已校验安装目录的 NSIS include，并在自定义安装器中包含；仅在不是已登记安装的更新时将 `$INSTDIR` 设为该目录。
- [x] 为卸载器提供配置的 Electron 用户数据路径，使其删除对应环境目录而不触碰其他环境数据。
- [x] 更新写入和安装日志使用按应用 ID 隔离的更新缓存；卸载时只删除该应用的缓存。
- [x] 共享已登记的 Python 3.14.10 运行时并按应用 ID 跟踪所有权；仍有其他已登记应用时，卸载不得移除共享运行时。
- [x] 保留显式 `/D=` 路径，并拒绝与展开后的 Harness 或 Electron 数据目录重叠的安装目录。
- [x] 保持现有自定义路径编辑器和校验流程；更新继续使用已登记的 `$INSTDIR`。

### 任务 3：在 Electron 就绪前隔离运行时存储

**文件：**

- 新建：`apps/desktop/src/desktop-windows-environment.ts`
- 修改：`apps/desktop/src/main.ts`

- [x] 从当前 Windows 进程环境解析 `%USERPROFILE%` 和 `%APPDATA%`；未解析 token 或非绝对路径必须报错。
- [x] 从打包的 `package.json` 元数据读取 `dshDesktopWindowsEnvironment`，并在 Desktop 路径或 Host 启动解析 Harness 主目录之前设置 `process.env.DSH_HOME`。
- [x] 在 `app.whenReady()` 前将 Electron `userData` 和 `sessionData` 设置为 `userDataDirectory`；macOS 及没有打包 Windows 设置的开发构建继续使用当前路径。
- [x] Windows 日志写入配置的 Electron 用户数据目录，并保留现有 macOS 日志路径。

### 任务 4：记录环境设置和升级影响

**文件：**

- 修改：`apps/desktop/README.md`
- 修改：`apps/desktop/README.zh.md`
- 修改：`apps/desktop/packaging/README.md`
- 修改：`apps/desktop/packaging/README.zh.md`
- 新建：`docs/upgrade-guide/v0.2.1-rc.3/desktop-environment-isolation/guide.md`
- 新建：`docs/upgrade-guide/v0.2.1-rc.3/desktop-environment-isolation/guide.zh.md`
- 新建：`docs/upgrade-guide/v0.2.1-rc.3/desktop-environment-isolation/guide.i18n.yaml`

- [x] 说明 `desktop.windows` 字段、首次安装默认目录、运行时数据位置，以及程序文件和用户数据的区别。
- [x] 说明 `hxfl` 保留当前数据；UAT 和 Superbpm 从独立的空主目录开始，历史共享数据保留在旧 HXFL 目录。
- [x] 说明旧共享标识安装仍属于 HXFL，必须保留；只有确认隔离安装正常后，才可删除使用其他环境专属标识注册的旧 UAT 或 Superbpm 安装。
- [x] 用两种语言编写升级指南并记录翻译配对。

## 验证说明

本次会话的更高优先级指令禁止添加或运行产品测试，因此未添加或运行产品测试套件及 Windows 安装器 smoke test。`pnpm run build` 通过；`pnpm run verify-md-wrap` 检查了 2,266 个文件；指定文档的翻译配对检查和 `git diff --check` 通过。曾运行 `pnpm run doc-sync`，43 个门中 42 个通过；其翻译配对门最初因本计划和规格尚无中文版本而失败。现已补齐并登记中文配对，指定范围检查通过。该命令还运行了仓库的文档标准测试门；本次实施不应再次运行它。
