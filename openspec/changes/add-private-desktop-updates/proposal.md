# 提案：Desktop 私有更新管理

## Why

企业部署需要为 Windows 和 macOS Desktop 构件配置独立的更新服务，并通过匿名检测接口集中掌握客户端版本、选择发布对象和控制强制升级。DSH 需要先定义稳定的客户端接口，后续由独立管理后台实现服务端；本变更不建设该后台。

## What Changes

- Desktop 打包沿用 `--config-env <name>` 选择部署环境；仅显式选择环境的 Windows x64 和 macOS arm64 构件绑定私有更新接口和允许的下载源。未选择时保持现有更新配置，macOS x64 和 Linux 不接入此接口。
- 定义匿名 HTTPS `POST /v1/desktop/updates/check` 协议，与私有插件市场的 `/v1/...` 接口前缀一致。请求包含部署、通道和客户端版本信息，并在 `dsh-pro-auth` 可提供当前用户 ID 时可选携带 `userId`，不携带认证令牌。
- 检测响应统一给出更新选择和强制更新策略。服务端管理通道、暂停、灰度比例、最低支持版本与强制期限；客户端将允许的 `feedUrl` 交给现有 Electron 更新器读取标准更新 feed。
- 保留现有检查、下载和安装确认流程、Windows 发布者签名、macOS 代码签名/公证与完整性校验。Windows NSIS 使用版本化 EXE 和 `.blockmap` 尝试差分下载；macOS 使用版本化 ZIP、`.zip.blockmap` 和客户端缓存的旧 ZIP 尝试差分下载。差分条件不满足或失败时回退完整安装包；不单独生成或维护自定义差分包。
- 让 `build-win64.ps1` 与 `build-macos.sh` 在显式选择私有环境时，本地生成完整安装/更新负载、channel YAML、blockmap 和构建记录，供后管发布；打包脚本不自动上传。差分由客户端按 blockmap 与 HTTP Range 请求执行，构建产物不包含独立 delta 文件。
- 检测接口同时作为客户端版本统计入口；首期不增加下载或安装事件接口。
- **非目标：** 不实现管理后台、更新服务端、账号登录要求、下载凭据或独立安装事件采集。

## Capabilities

### New Capabilities

- desktop-private-update-management: 为显式选择部署环境的 Windows/macOS Desktop 构件定义并使用匿名更新策略接口。

### Modified Capabilities

无。OpenSpec 当前没有已应用的正式 specs。

## Impact

- Desktop 环境配置、Windows/macOS 本地打包脚本与构建产物、`electron-updater` 检查和强制更新策略、更新 feed 来源校验、Desktop 更新文档及发布验证。
- 私有环境配置提供 HTTPS 检测接口 URL、通道和下载 feed 允许来源；这些字段是公开服务定位信息，不包含密钥。
- 后续管理后台须实现本提案列出的检测接口和 Electron 标准 Windows/macOS feed 与制品读取接口；启用差分时支持 HTTP Range，并保留仍可能被客户端请求的版本化 blockmap。
