# 设计：按环境配置 Desktop 品牌

## Context

Desktop 打包通过 `--config-env <name>` 或目标 `.env` 中的 `DSH_CONFIG_ENV` 选择 `$DSH_CONFIG_ENV_DIR/<name>/config.json`。`package-target.ts` 当前只读取 `desktop.updates`；`electron-builder-config.mjs` 固定产品名、图标和 `deepseek-harness` 文件名前缀。私有更新制品校验、macOS 产物整理、上传规划和远端版本发现也各自假设该前缀。

当前工作区的 `apps/desktop/.env.windows` 和 `.env.macos` 选择 `superbpm`。构建 `local` 环境时必须显式使用 `--config-env local`，或由目标 dotenv 选择 `local`。本提案不更改忽略文件中的本地发布选择。

Electron `productName` 同时影响系统展示名称和 Electron 推导的应用名称。应用主进程也将 `app.name` 用于 macOS 菜单，并依赖 Electron 的默认数据路径。品牌化不能让现有用户数据目录随着显示名称迁移。`appId` 还参与 Windows NSIS 升级标识及 macOS bundle identity。

## Goals / Non-Goals

**Goals:**

- 由命名环境配置 Desktop 可见品牌，并为后续增加图标套装提供稳定引用方式。
- 空缺或空白品牌字段沿用现有 DSH 名称、图标和制品前缀。
- 保持已有用户数据路径、应用标识和更新分发身份。
- 保证打包、更新清单、上传和版本发现对版本化文件名使用同一基础名称。

**Non-Goals:**

- 修改 `superbpm` 品牌或既有环境的协议 scheme、`appId`、更新 channel/distribution 或 DSH 主体文档中的产品表述。
- 改变 Desktop 的签名、公证、安装交互、更新接口或用户确认流程。

## Decisions

### 通过独立 `desktop.branding` 配置选择品牌

品牌字段和私有更新字段分属不同职责。打包入口读取被选择配置中的 `desktop.branding`，校验并规范化后传给 Electron Builder、运行时应用和制品处理脚本；不把未选择环境的内容复制进构件。

配置建议：

```json
{
  "desktop": {
    "branding": {
      "displayName": "金租办公",
      "iconSet": "hxfl"
    }
  }
}
```

`artifactNameBase` 可省略；省略时使用 `displayName`。当字段缺失或为空时，`displayName` 回退到 `DeepSeek Harness`，`iconSet` 回退到当前 DSH 资源，`artifactNameBase` 在未设置 `displayName` 时回退到既有 `deepseek-harness` 前缀。已显式提供但无效的套装名或基础名称使构建在产物生成前失败。

`envs/local/config.json` 和新增的 `envs/hxfl/config.json` 设置 `displayName` 为“金租办公”，并将 `iconSet` 设为 `hxfl` 图标套装；该套装以用户提供的华夏金租红色图案为基础，不含文字。`hxfl` 配置延续现有 `superbpm` 环境的插件市场和更新服务地址，`envs/superbpm/config.json` 保持不变。

### 使用命名图标套装覆盖完整品牌资源

`iconSet` 是仓库内套装标识，不是任意本机路径。资源套装包含客户端侧栏用的透明单色 `sidebar-mark.svg`、Windows/macOS 应用图标、Windows 托盘 ICO，以及 Windows 安装器的品牌图与卸载侧栏图。侧栏通过 SVG alpha 遮罩使用当前文字颜色。打包入口按套装标识解析目标平台需要的文件，并在打包前验证资源完整可读。`dsh` 套装沿用鲸鱼标记与当前已跟踪资源；`hxfl` 套装使用金租办公的无文字红色图案。以后新增套装只需增加完整资源并在环境配置中选择它。

Windows 安装器当前将源 PNG 转换为编译期 BMP。资源准备脚本读取所选套装，转换过程与现有签名及安装器构建步骤保持一致。macOS 继续使用 PNG 图标；Windows 使用 ICO/PNG 的现有资源约定。

### 只更改用户可见名称，固定内部身份和存储目录

运行时中英文界面、关于面板、系统菜单、托盘提示、macOS 麦克风说明和 Windows 安装/卸载提示使用规范化后的 `displayName`。说明文档中的 DSH 名称保持不变；README 只描述环境配置字段及打包方法。

Electron `productName` 按所选显示名称设置。主进程在 Electron ready 前显式固定现有 DSH `userData` 路径，并保持现有 `sessionData` 位置，避免其默认目录随应用名称变化。`appId`、NSIS 的派生升级标识、`dsh` 协议、DSH_HOME、更新 distribution 和 channel 保持现状。Windows 快捷方式与安装器产品展示名可以采用品牌名，已有应用仍由原身份升级。

### 以同一基础名称生成和验证所有版本化制品

版本化名称沿用既有模板：`<artifactNameBase>-<version>-<os>-<arch>[-unsigned|-internal].<ext>`。Windows 安装器和 updater 负载、macOS DMG 和 ZIP 使用同一基础名；对应 blockmap 和 channel YAML 继续由现有流程生成。稳定的 `dsh-latest-*` 下载别名及 channel YAML 文件名保持不变。

打包入口先解析所选品牌，再执行构建版本发现和 electron-builder 打包。构建完成记录绑定环境名和规范化品牌值；上传流程校验记录与当前选中配置一致。electron-builder artifactName、macOS 产物整理、私有更新制品校验、上传计划及远端版本发现统一使用该记录/解析结果，不再各自写死 `deepseek-harness`。

### 配置仍可省略，已选择的环境品牌必须完整

不选择命名环境时沿用现有 DSH 行为。选择环境但没有 `desktop.branding` 时也使用 DSH 默认品牌。`iconSet` 指向不存在或不完整的资源集、字段含路径穿越或控制字符，或制品基础名称不能作为单个文件名前缀时，打包快速失败；不得退回到另一套图标或产生部分构件。空字符串按未配置处理。

## Risks / Trade-offs

- 文件名前缀参与 feed URL 和远端版本扫描 → 同步更新所有制品消费者并记录配置，避免生成文件、更新 YAML 与上传器期望不一致。
- 中文显示名作为默认文件名基础 → 保持文件名作为单一路径段，校验并在生成的绝对 URL 中正确编码；用户可用 ASCII `artifactNameBase` 覆盖发布端文件名前缀。
- `productName` 影响 Electron 默认数据目录 → 显式固定原 `userData`/`sessionData` 路径，并测试升级前后路径相同。
- iconSet 资源存放在仓库中 → 环境配置只引用套装名，打包前验证所选套装完整，避免本机路径或不完整素材进入发布过程。
- 本地当前 dotenv 默认选择 `superbpm` → 打包命令必须显式选 `local` 才会使用“金租办公”。

## Migration Plan

1. 增加品牌配置读取、字段回退、资源套装解析和打包前验证；更新 `envs/local/config.json` 并新增 `envs/hxfl/config.json`。
2. 让运行时和安装器读取品牌名，并固定现有 appId、userData 和 sessionData。
3. 将品牌套装接入各平台应用、托盘及安装器资源准备。
4. 统一所有版本化制品生成、验证、上传和远端版本发现的命名规则，并把规范化品牌记录绑定到构建产物。
5. 覆盖缺省/空值、无效配置/资源、用户数据路径不变、名称/图标投影和更新制品一致性；更新 Desktop 配置使用说明并运行相关 Desktop 检查。

回退时从环境配置移除 `desktop.branding` 即恢复 DSH 默认显示名、现有图标及当前制品前缀。`appId`、用户数据目录和更新通道在正向及回退路径中保持不变。
