# 设计：Desktop 私有更新管理

## Context

Desktop 当前支持 Windows x64 和 macOS arm64/x64 发布构件。此私有更新提案只面向 Windows x64 和 macOS arm64。普通更新使用 Electron `electron-updater` 的 generic feed，并由客户端按现有计划轮询；用户仍分别确认下载和安装。Windows 发布物包含 channel YAML、NSIS 安装包与 `.exe.blockmap`；macOS 发布物包含 `nightly-mac.yml`、供更新器使用的 ZIP 与 `.zip.blockmap`，DMG 用于直接安装，不是更新器的更新负载。Desktop 另有强制更新策略请求，负责阻止继续使用和展示强制更新 UI，但不选择普通更新 feed。

私有更新应把发布选择和强制策略集中到一个匿名检测接口，同时复用现有客户端下载、签名校验、重启和强制更新 UI。Windows 与 macOS 共享检测请求/响应协议，但按目标平台读取不同 channel metadata 与更新负载。后台管理系统由后续项目实现，DSH 定义请求与响应协议及客户端行为。

## Goals / Non-Goals

**Goals:**

- 只让显式绑定私有环境的 Windows x64 和 macOS arm64 构件访问私有更新服务。
- 通过一次匿名检测请求发送客户端版本信息和可选 `userId`，由后台决定更新可用性及强制策略。
- 用已有 Electron 更新器读取标准 channel feed；Windows 与 macOS 均尝试其原生差分下载，并在条件不满足或失败时回退完整包。
- 让服务故障不阻断普通使用，并保留客户端已接收的强制更新决定。

**Non-Goals:**

- 实现后管、服务端存储、管理页面、发布工作流或 COS/CDN 运维。
- 为匿名用户引入稳定安装 ID，或对匿名客户端按实例进行部分灰度。
- 改变未显式选择私有环境的更新配置、客户端的下载/安装确认或 Desktop 签名策略。
- 单独收集下载、安装或重启事件。

## Decisions

### 用命名环境显式绑定私有服务

复用 `--config-env <name>` 和 `$DSH_CONFIG_ENV_DIR/<name>/config.json`。在 `desktop.updates` 命名空间内读取检测接口 HTTPS URL、发布通道和允许的 feed HTTPS 来源。私有更新配置只适用于 `win32-x64` 和 `darwin-arm64`；显式配置却用于其他目标（包括 macOS x64）时，构建失败。URL 不包含用户名、密码、查询参数或片段，配置不保存秘密。未选择环境时不读取私有更新设置，现有官方/测试更新配置保持不变。

配置示例：

```json
{
  "schemaVersion": 1,
  "environment": "hxfl",
  "desktop": {
    "updates": {
      "checkUrl": "https://updates.example/v1/desktop/updates/check",
      "channel": "stable",
      "feedOrigins": ["https://downloads.example"]
    }
  }
}
```

### 用一个 POST 接口返回版本选择和强制策略

客户端向固定版本路径 `POST /v1/desktop/updates/check` 发送 JSON，与私有插件市场的 `/v1/...` 接口前缀一致。请求包含协议版本、部署环境、通道、Desktop 版本、平台、架构、随包 dsh 版本，以及可选 `userId`。API 不要求登录或 API 密钥。`userId` 仅来自已启用认证插件当前可用的身份信息；缺失时照常检测；令牌和其他凭据永不发送。

响应区分无可用更新与可用更新。可用更新携带版本、`feedUrl` 及服务端策略字段，包括暂停/灰度结果、最低支持版本和强制期限。客户端只接受配置允许来源中的 HTTPS feed URL，不从渲染进程接收下载地址。服务端根据部署和通道选择发行版本，不向客户端暴露管理后台凭据。

### 后台根据 userId 稳定分组

服务端可使用可选 `userId` 稳定决定用户是否进入某个灰度比例。没有 `userId` 的匿名客户端只在通道达到全量发布时获得该更新；本变更不生成或持久化安装标识。检测请求本身提供客户端版本统计；首期不发送独立生命周期事件。

### 沿用 Electron generic feed 与受限来源

客户端把响应中的 `feedUrl` 交给现有 Electron 更新器。Feed 按平台提供标准 channel YAML：Windows 使用 `nightly.yml` 和版本化 NSIS `.exe`，macOS 使用 `nightly-mac.yml` 和目标架构匹配的版本化 `.zip`。制品元数据提供大小和 SHA-512；对应的 `.exe.blockmap` 或 `.zip.blockmap` 必须与同版本制品一起发布。下载地址可来自单独 CDN，但其 HTTPS 来源须在构件配置中允许。SHA-512 完整性、Windows 发布者签名验证及 macOS 代码签名验证继续生效。差分准备或校验失败时，客户端重试完整更新负载；完整包也失败时保留可重试错误状态。

### 按平台使用 Electron 差分更新

此方案依据仓库锁定的 `electron-builder@26.15.3` 和 `electron-updater@6.8.9`。升级这些依赖时，须重新验证两平台的 blockmap 请求、差分失败回退和签名校验。

Windows 使用 electron-builder NSIS target 的 `differentialPackage: true`。构建产出版本化 `.exe` 及 `.exe.blockmap`；后管发布当前版本的 YAML、EXE 和 blockmap，并保留客户端仍可能请求的历史版本 blockmap。客户端由 `electron-updater` 读取 blockmap 和新安装包的 range 数据来组装目标 EXE。缺少旧版 map、HTTP Range 不可用、差分失败或完整 SHA-512 不匹配时，更新器走完整 EXE 下载路径，再执行已有签名和摘要校验。无需人工生成 delta 文件。该选项是 Windows NSIS 配置，不应被当作 macOS 差分开关。

macOS 使用 electron-builder 生成的版本化 ZIP 和 `.zip.blockmap`，`electron-updater` 以 ZIP 作为更新负载；DMG 仅用于用户直接安装。Mac updater 只有在本机 updater cache 中存在先前成功下载的 `update.zip` 时才尝试差分。由 DMG 首次安装、缓存被清除或找不到旧 ZIP 的客户端会完整下载目标 ZIP；成功后更新器缓存新 ZIP，后续更新才可能差分。服务器须托管目标 ZIP 的 blockmap，并保留仍可能被客户端请求的旧 blockmap。差分完成后仍校验目标 ZIP 的 SHA-512 和 macOS 签名；差分不成功时完整下载。`differentialPackage` 不控制这一路径，也不需要额外的 macOS delta 构建目标。

两个平台的差分都属于下载优化，不是服务端发布正确性的前提。每个目标版本都必须有可校验的完整更新负载和标准 YAML；服务端必须允许完整负载的匿名 HTTPS 下载，不能只提供差分片段。版本化制品和 blockmap 发布后必须保持字节不变；若要启用差分，制品源站/CDN 必须正确支持 HTTP Range 并返回匹配的 `206 Partial Content`/`Content-Range`，不能对 range 请求的制品做会改变字节偏移的动态压缩或转换。Range 不可用时更新器可以回退完整下载。首次 macOS 更新可能是完整下载；Windows 在缺少差分元数据或差分失败时也可能完整下载。后管可记录检测接口中的版本与用户 ID，但首期不统计实际差分字节数或下载完成事件。

### 本地脚本生成可发布的完整产物集

显式传入 `--config-env <name>` 时，两个仓库根目录脚本都选择私有更新构建模式并把配置环境传给 Desktop 打包入口。Windows x64 生成完整 NSIS EXE、`.exe.blockmap`、`nightly.yml` 和目标构建记录；macOS arm64 生成完整 DMG 安装器、供更新器使用的 ZIP、`.zip.blockmap`、`nightly-mac.yml` 和目标构建记录。channel YAML 使用版本化制品文件名并记录大小和 SHA-512，使后管可将这组本地文件发布到其为检测接口返回的 feed 目录。macOS 私有构建走签名及公证的正式 DMG+ZIP 路径，不能复用当前仅生成未签名内部 DMG 的路径。

脚本只生成本地完整文件和 Electron updater 元数据，不访问升级后管或上传制品。现有 `--publish never` 行为保留；私有配置也必须让 electron-builder 本地生成适用平台的 channel YAML 和 blockmap。脚本输出的是可进行差分下载所需的 blockmap，不是针对某一组旧、新版本预先计算的 delta 文件。构建完成记录只在完整打包、签名、公证和制品校验成功后写入；失败不得留下可被后续发布误认的成功记录。

### 保留现有交互并区分普通检查失败

私有更新沿用当前自动/手动检查调度、下载确认、安装确认和强制更新 UI。普通检查故障不阻止应用启动或使用。网络、JSON 或协议错误不清除已知强制决定；只有有效响应明确解除强制状态时才清除。该行为只替代显式选择私有环境构件的更新策略请求；其他构件继续使用原有策略来源。

## API 清单

| 接口/资源 | 方法 | 用途 | 实现方 |
|---|---|---|---|
| `/v1/desktop/updates/check` | `POST` | 接收部署/通道、客户端版本和可选 `userId`；返回无更新或可用版本、feed URL 与强制策略 | 后续管理后台 |
| `{feedUrl}/nightly.yml` | `GET` | Electron generic provider 读取 Windows 版本、NSIS EXE 地址、大小及 SHA-512 | 后续管理后台或其静态文件源 |
| `{feedUrl}/nightly-mac.yml` | `GET` | Electron generic provider 读取 macOS 版本、架构对应 ZIP 地址、大小及 SHA-512 | 后续管理后台或其静态文件源 |
| `{artifactUrl}` | `GET` | 下载签名 Windows NSIS EXE 或 macOS ZIP；启用差分时须支持字节 Range 请求，同时支持完整 GET 回退 | 后续管理后台/CDN |
| `{artifactUrl}.blockmap` | `GET` | 提供该版本 EXE/ZIP 的差分 map；启用差分发布时，旧版本 map 需在客户端可能请求期间保留 | 后续管理后台/CDN |
| `desktop/dsh-latest-macos-<arch>.dmg`（可选） | `GET` | 向用户提供直接下载安装的 macOS DMG；不是 electron-updater ZIP feed 的更新负载 | 后续管理后台/CDN |

本地打包不产生 HTTP 接口或远程写入。每次私有构建目录应提供上述平台更新文件和对应 channel YAML；Windows EXE 同时是完整安装包和 updater 负载，macOS DMG 是完整安装包、ZIP 是 updater 负载。后管另行负责发布文件、feed YAML 与旧 blockmap 保留。

检测请求的 JSON 格式：

```json
{
  "protocolVersion": 1,
  "distribution": "hxfl",
  "channel": "stable",
  "client": {
    "version": "1.2.3",
    "platform": "win32",
    "arch": "x64",
    "dshVersion": "1.2.3",
    "userId": "optional-current-user-id"
  }
}
```

`userId` 可省略；其他客户端身份字段由已打包程序提供，服务端不得要求客户端补交令牌。请求体不得包含安装路径或主机名。

`feedUrl` 按 `client.platform` 和 `client.arch` 指向目标专属目录，例如 `.../hxfl/stable/win-x64/` 或 `.../hxfl/stable/mac-arm64/`。Electron 分别读取 Windows `nightly.yml` 或 macOS `nightly-mac.yml`。私有服务不为 macOS x64 客户端提供此 feed。

有更新时的响应示例：

```json
{
  "protocolVersion": 1,
  "release": {
    "version": "1.2.4",
    "feedUrl": "https://downloads.example/hxfl/stable/win-x64/"
  },
  "policy": {
    "minimumSupportedVersion": "1.2.3",
    "forceAfter": "2026-10-15T00:00:00Z"
  }
}
```

有效响应使用相同的 `protocolVersion`，并同时包含 `release` 和 `policy`：`release` 为 `null` 表示当前客户端无可用更新，否则包含语义化 `version` 和 `feedUrl`；`policy.minimumSupportedVersion` 与 `policy.forceAfter` 均为 `null` 表示没有强制更新要求，否则表示低于最低版本的客户端在该 RFC 3339 时间起必须更新。有效响应明确清除当前强制状态时将两个策略字段都置为 `null`。在强制时间已到且客户端低于最低支持版本时，响应必须提供可用的兼容 `release`。传输失败或无效响应不是清除强制状态的有效响应。

首期没有单独的下载、安装或客户端心跳接口。Electron feed 和制品资源须可供客户端匿名读取；下载安全依赖允许来源、HTTPS、SHA-512、Windows 发布者签名和 macOS 代码签名校验。

## Risks / Trade-offs

- 匿名接口可被外部调用 → 仅暴露版本检测和公开 feed 定位数据，不接受客户端发布操作；后台应对检测请求限流。
- `userId` 属于关联性较强的数据 → 只在认证插件已有当前用户 ID 时按请求发送，不额外生成标识或发送凭据。
- 更新响应可选择下载来源 → 构件内固定允许来源并拒绝其他 HTTPS 主机，安装包仍需 SHA-512 与发布者签名验证。
- Electron 差分行为受目标平台、更新器缓存和 feed 资源保留影响 → 用真实 Windows NSIS 和 macOS ZIP 构件分别验证；资格检查覆盖 macOS 首次全量下载、后续缓存差分尝试、Windows blockmap 差分尝试，以及两个平台的完整包回退。
- 管理后台尚未实现 → 本提案提供完整接口清单和 JSON 协议；DSH 可用契约 fixture 验证客户端，联调需等待服务端实现。

## Migration Plan

1. 定义并校验私有 `desktop.updates` 环境配置、POST JSON 协议和响应类型；生成的构件只携带公开地址、通道和允许来源。
2. 为私有 Windows 和 macOS 构件接入检测客户端；未选择私有环境的构件继续使用原更新源与策略客户端。
3. 按平台把检测结果转换为现有更新器候选版本与强制更新状态；下载始终经允许来源验证并复用现有安装确认。
4. 对 Windows/macOS channel YAML、完整负载、差分前提与失败回退、无更新、暂停、灰度、强制期限和服务不可用完成契约验证。
5. 联调时由管理后台实现 API 清单中的检测与 feed 资源；私有发布先面向测试通道，再开放目标通道。

回退到未配置私有环境的构件继续使用现有更新源。已配置私有服务的构件若服务暂时不可用，普通使用保持开放；已收到的强制要求仍按其原决定执行。
