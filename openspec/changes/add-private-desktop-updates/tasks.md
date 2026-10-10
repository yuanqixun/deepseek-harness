# Tasks

## 1. 定义私有 Windows 更新环境

- [x] 1.1 在命名环境配置中定义并校验 `desktop.updates`：检测接口 URL、发布通道和允许的 feed HTTPS 来源；拒绝秘密、非 HTTPS 地址和不受支持的目标平台。
- [x] 1.2 让 Windows x64 Desktop 打包通过 `--config-env <name>` 绑定所选配置；未选择时不读取私有设置，现有官方/测试构建配置不变。
- [x] 1.3 确保构件只包含所选环境的公开更新设置，不包含其他环境内容或认证凭据。

## 2. 实现并记录更新检测协议

- [x] 2.1 定义版本化 `POST /v1/desktop/updates/check` 请求与响应类型，并记录接口方法、字段、错误语义和示例 JSON。
- [x] 2.2 在 Host 更新检测中发送部署、通道、Desktop/平台/架构/dsh 版本及可选认证 `userId`；请求不带登录凭据，且不依赖 `userId` 才能检测。
- [x] 2.3 校验响应版本、更新版本、强制策略和 `feedUrl`；只允许构件配置指定的 HTTPS feed 来源。
- [x] 2.4 让私有 Windows 构件使用此响应作为更新与强制策略来源；其他目标继续走原来源。

## 3. 复用 Windows 下载、灰度和强制更新行为

- [x] 3.1 把有效更新的 `feedUrl` 交给现有 Electron 更新器，保留独立下载/安装确认和自动/手动检查调度。
- [x] 3.2 保留 Windows 签名与 SHA-512 校验，验证 NSIS `.blockmap` 差分下载，并在差分缺失或失败时回退完整安装包。
- [x] 3.3 按服务端强制期限和最低支持版本复用现有强制更新 UI；普通检测失败不阻止使用，服务错误不清除已知强制决定。
- [x] 3.4 按用户 ID 稳定灰度；无用户 ID 的匿名客户端只获得全量发布版本，不引入安装实例 ID。
- [x] 3.5 通过检测请求记录版本分布；不新增生命周期统计请求。

## 4. 扩展私有更新到 macOS

- [x] 4.1 扩展私有 `desktop.updates` 配置和目标校验，只允许 macOS arm64；macOS x64 和 Linux 仍须拒绝。
- [x] 4.2 让 macOS 私有构件使用相同的匿名检测协议和强制策略，同时保留未选择私有环境时的现有更新来源。
- [x] 4.3 发布并读取标准 `nightly-mac.yml` 与架构匹配的版本化 ZIP、`.zip.blockmap`；DMG 只用于直接安装，不作为 updater 负载。
- [ ] 4.4 验证有旧 `update.zip` 缓存时的差分尝试、无缓存时首次全量下载、差分失败后的完整 ZIP 回退及 SHA-512/代码签名校验。
- [x] 4.5 更新 macOS 私有更新配置、资源保留规则、API 清单和 Desktop 文档。

## 5. 验证 Windows/macOS 升级和发布接口

- [x] 5.1 使用 Windows 契约 fixture 验证更新/无更新、协议错误、feed 来源拒绝、暂停/灰度、最低版本、强制期限和服务故障语义。
- [ ] 5.2 使用适用的契约与集成验证覆盖 macOS 更新清单、架构筛选、旧 ZIP 缓存差分条件及完整 ZIP 回退。
- [x] 5.3 确认 Windows 更新资格验证覆盖完整包、差分包、缺失/拒绝 blockmap 回退、SHA-512、签名校验和失败后重试。
- [x] 5.4 更新 Desktop 中英文 README 与架构发布说明，列出两个平台检测接口、channel YAML、更新负载、blockmap、HTTP Range 要求及资源保留责任。
- [x] 5.5 运行适用的 Desktop 更新测试、文档快检、类型检查和 OpenSpec 严格校验。
- [ ] 5.6 在 Windows x64 签名发布环境验证私有更新构件、差分/完整包回退与安装器升级；在受支持的 macOS 环境验证 ZIP 更新、首次全量下载及后续缓存差分路径。

4.4、5.2 和 5.6 仍待真实 macOS 安装器更新资格验证，覆盖旧 ZIP 缓存差分、首次全量下载与回退。当前环境没有 `.env.macos` 签名/公证配置，也没有 Windows x64 与 PowerShell 环境，因此未将这些验收标记为完成。

## 6. 让本地打包脚本生成后管可发布的更新资源

- [x] 6.1 让 `build-win64.ps1` 和 `build-macos.sh` 接受可选的私有 `--config-env <name>` 并传递到 Desktop 打包入口；不选择时保持原行为。
- [x] 6.2 让 Windows 私有打包本地生成完整已签名 EXE、匹配的 `.exe.blockmap`、`nightly.yml` 和构建完成记录。
- [x] 6.3 让 macOS arm64 私有打包走已签名/公证的正式 DMG+ZIP 路径，并生成 `.zip.blockmap`、`nightly-mac.yml` 和构建完成记录。
- [x] 6.4 在私有更新配置下保留 `--publish never`，同时验证 electron-builder 会本地生成标准 channel YAML；不得访问管理后端或自动上传。
- [x] 6.5 校验清单中的版本化文件名、大小和 SHA-512 与完整更新负载一致；确保失败构建不会产生成功完成记录。
- [x] 6.6 更新两种打包脚本的帮助文本和 Desktop 文档，说明完整安装器、updater 负载、blockmap 与 channel YAML 的用途，以及 blockmap 不是独立 delta 文件。
