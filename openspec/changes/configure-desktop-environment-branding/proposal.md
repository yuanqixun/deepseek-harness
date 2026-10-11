# 提案：按环境配置 Desktop 品牌

## Why

企业部署需要按所选 Desktop 环境发布不同的显示名称、图标和安装文件名。当前命名和图标在 Desktop 打包代码中固定，且制品名被更新清单、上传校验和远端版本发现共同使用。只修改 electron-builder 配置会产生无法校验或发布的构件。

## What Changes

- 在 `desktop.branding` 下配置 `displayName`、`iconSet` 和可选 `artifactNameBase`，与 `desktop.updates` 分开解析。
- 为 `envs/local/config.json` 设置显示名称“金租办公”并选择 `hxfl` 图标套装；新增可通过 `--config-env hxfl` 选择的完整 `envs/hxfl/config.json`，使用相同品牌资源。`superbpm` 不配置品牌时沿用 DSH 默认值。
- 让用户可见的桌面界面、系统应用名称、安装/卸载提示和图标读取所选环境的品牌。说明文档中的 DSH 品牌文字不改；仅补充新配置的使用说明。
- 让版本化安装包及更新负载沿用当前版本、平台、架构和构建后缀规则，基础名称默认跟随 `displayName`，并支持单独覆盖。
- 保持 `appId`、协议、更新分发标识、用户数据目录及既有安装升级身份不变。
- **非目标：** 不修改 `superbpm` 的品牌，不改变私有更新协议、更新通道或 DSH 文档中的产品名称。

## Capabilities

### New Capabilities

- desktop-environment-branding: 通过命名环境为 Desktop 构件选择显示名称、图标套装和安装包基础名称，并让打包及更新制品保持一致。

### Modified Capabilities

无。OpenSpec 当前没有已应用的正式 specs。

## Impact

- `envs/local/config.json`、`envs/hxfl/config.json` 与 Desktop 打包环境配置读取。
- Electron Builder 元数据、运行时中英文界面、macOS 权限说明、Windows NSIS 安装器提示和图标资源准备。
- macOS/Windows 版本化产物命名、更新元数据验证、上传规划和远端版本发现。
- Desktop 环境配置说明及相关打包测试。
