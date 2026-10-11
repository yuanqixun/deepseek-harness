# Tasks

## 1. 定义品牌配置

- [x] 1.1 新增独立的 `desktop.branding` 读取和校验，支持 `displayName`、`iconSet`、可选 `artifactNameBase`、空值默认及安全文件名验证。
- [x] 1.2 在 `envs/local/config.json` 设置 `displayName: "金租办公"` 和 `hxfl` 图标套装；新增 `envs/hxfl/config.json`，保留 `envs/superbpm/config.json` 不配置品牌。
- [x] 1.3 让 Desktop 打包入口在版本发现之前加载品牌，并将规范化结果传入构建子进程和完成记录；缺少品牌时保持现有默认行为。

## 2. 应用运行时和安装器品牌化

- [x] 2.1 将环境显示名称投影到应用中英文菜单、欢迎页、更新界面、关于面板、托盘提示和 macOS 权限说明。
- [x] 2.2 将名称投影到 Windows 安装/卸载界面；README 只补充 `desktop.branding` 配置说明，不改文档中的既有 DSH 品牌称呼。
- [x] 2.3 固定 Electron `userData` 和 `sessionData` 的现有路径，并验证 `appId`、协议、DSH_HOME 和更新分发身份不随品牌变化。
- [x] 2.4 将 Desktop 环境显示名及 `iconSet` 中的侧栏 SVG 标记传入官方客户端品牌插槽；未配置品牌时保留 DSH 字标，侧栏标记跟随当前文字颜色。

## 3. 接入完整图标套装

- [x] 3.1 建立仓库内 `dsh` 图标套装引用，保持现有 Windows/macOS 应用图标、Windows 托盘 ICO 和安装器图像字节/外观，并纳入侧栏 SVG 标记。
- [x] 3.2 让 Windows/macOS Builder 配置及 Windows 安装器资源准备使用所选套装中的平台资源。
- [x] 3.3 在打包前验证目标所需资源齐全且可读；未知或不完整套装失败，不静默替换。
- [x] 3.4 增加仅含华夏金租红色图案的完整 `hxfl` 资源套装，并让 `local` 与新增 `hxfl` 环境选择该套装。

## 4. 统一制品文件名与更新发布链

- [x] 4.1 让 electron-builder 版本化文件名按 `artifactNameBase` 生成，默认跟随 `displayName` 并保留当前版本、平台、架构和构建模式后缀。
- [x] 4.2 同步 macOS 制品整理、私有更新制品验证、上传计划和远端版本发现，移除各自对 `deepseek-harness` 前缀的固定假设。
- [x] 4.3 将环境名和规范化品牌值绑定到成功的 Desktop 构建记录；上传时验证当前选择和构建品牌一致。
- [x] 4.4 保持 `dsh-latest-*` 稳定下载别名、channel YAML 文件名、更新 feed 语义、签名和差分更新资源校验不变。

## 5. 验证和使用说明

- [x] 5.1 为品牌解析覆盖缺失/空值、local 与 hxfl 配置、无效名称、未知/不完整图标套装及不同环境隔离。
- [x] 5.2 为运行时品牌文案、稳定 `userData`/`sessionData` 路径、稳定 `appId` 和 NSIS 升级身份增加有针对性的验证。
- [x] 5.3 为 Windows/macOS 命名覆盖生成、更新元数据一致性、上传环境匹配和版本发现增加定向验证。
- [x] 5.4 更新 Desktop 配置使用说明，说明 `local`/`hxfl` 品牌、“留空使用 DSH 默认值”、图标套装约定和 `--config-env` 选择方式；保持说明文档中现有 DSH 品牌文字不变。
- [x] 5.5 运行变更范围内的 Desktop 打包配置/更新测试、相关文档检查和 `openspec validate configure-desktop-environment-branding --strict --no-interactive`。
