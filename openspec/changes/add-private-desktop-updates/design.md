# 设计：Windows Desktop 私有更新管理

## Context

Desktop 当前支持 Windows x64 安装包。普通更新使用 Electron `electron-updater` 的 generic feed，并由客户端按现有计划轮询；用户仍分别确认下载和安装。Windows 发布物会生成 channel YAML、安装包与 `.blockmap`。Desktop 另有强制更新策略请求，负责阻止继续使用和展示强制更新 UI，但不选择普通更新 feed。

私有更新应把发布选择和强制策略集中到一个匿名检测接口，同时复用现有客户端下载、签名校验、重启和强制更新 UI。后台管理系统由后续项目实现，DSH 定义请求与响应协议及客户端行为。

## Goals / Non-Goals

**Goals:**

- 只让显式绑定私有环境的 Windows x64 构件访问私有更新服务。
- 通过一次匿名检测请求发送客户端版本信息和可选 `userId`，由后台决定更新可用性及强制策略。
- 用已有 Electron 更新器读取标准 channel feed，保留差分下载能力和完整包回退。
- 让服务故障不阻断普通使用，并保留客户端已接收的强制更新决定。

**Non-Goals:**

- 实现后管、服务端存储、管理页面、发布工作流或 COS/CDN 运维。
- 为匿名用户引入稳定安装 ID，或对匿名客户端按实例进行部分灰度。
- 改变官方更新环境、macOS 更新、客户端的下载/安装确认或 Desktop 签名策略。
- 单独收集下载、安装或重启事件。

## Decisions

### 用命名环境显式绑定私有服务

复用 `--config-env <name>` 和 `$DSH_CONFIG_ENV_DIR/<name>/config.json`。在 `desktop.updates` 命名空间内读取检测接口 HTTPS URL、发布通道和允许的 feed HTTPS 来源。私有更新配置只适用于 `win32-x64`；显式配置却用于其他目标时，构建失败。URL 不包含用户名、密码、查询参数或片段，配置不保存秘密。未选择环境时不读取私有更新设置，现有官方/测试更新配置保持不变。

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

客户端把响应中的 `feedUrl` 交给现有 Electron 更新器。Feed 提供 Windows channel YAML、版本安装包元数据、NSIS 安装包和可选 `.blockmap`。下载地址可来自单独 CDN，但其 HTTPS 来源须在构件配置中允许。SHA-512 完整性和现有 Windows 发布者签名验证继续生效。差分准备或校验失败时，客户端重试完整安装包；完整包也失败时保留可重试错误状态。

### 保留现有交互并区分普通检查失败

私有更新沿用当前自动/手动检查调度、下载确认、安装确认和强制更新 UI。普通检查故障不阻止应用启动或使用。网络、JSON 或协议错误不清除已知强制决定；只有有效响应明确解除强制状态时才清除。该行为只替代显式选择私有环境构件的更新策略请求；其他构件继续使用原有策略来源。

## API 清单

| 接口/资源 | 方法 | 用途 | 实现方 |
|---|---|---|---|
| `/v1/desktop/updates/check` | `POST` | 接收部署/通道、客户端版本和可选 `userId`；返回无更新或可用版本、feed URL 与强制策略 | 后续管理后台 |
| `{feedUrl}/nightly.yml` | `GET` | Electron generic provider 读取 Windows 版本、安装包地址、大小及 SHA-512 | 后续管理后台或其静态文件源 |
| `{artifactUrl}` | `GET` | 下载签名 NSIS 安装包 | 后续管理后台/CDN |
| `{artifactUrl}.blockmap` | `GET`，可选 | Electron 更新器执行差分下载；缺失或失败时使用完整安装包 | 后续管理后台/CDN |

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

首期没有单独的下载、安装或客户端心跳接口。Electron feed 和制品资源须可供客户端匿名读取；下载安全依赖允许来源、HTTPS、SHA-512 和 Windows 发布者签名校验。

## Risks / Trade-offs

- 匿名接口可被外部调用 → 仅暴露版本检测和公开 feed 定位数据，不接受客户端发布操作；后台应对检测请求限流。
- `userId` 属于关联性较强的数据 → 只在认证插件已有当前用户 ID 时按请求发送，不额外生成标识或发送凭据。
- 更新响应可选择下载来源 → 构件内固定允许来源并拒绝其他 HTTPS 主机，安装包仍需 SHA-512 与发布者签名验证。
- Electron 差分协议与 feed 细节受其实现约束 → 先用标准 Windows channel 文件和真实 NSIS 安装包验证，资格检查覆盖差分失败后的完整包回退。
- 管理后台尚未实现 → 本提案提供完整接口清单和 JSON 协议；DSH 可用契约 fixture 验证客户端，联调需等待服务端实现。

## Migration Plan

1. 定义并校验私有 `desktop.updates` 环境配置、POST JSON 协议和响应类型；生成的构件只携带公开地址、通道和允许来源。
2. 为私有 Windows 构件接入检测客户端；其他构件和平台继续使用原更新源与策略客户端。
3. 把检测结果转换为现有更新器候选版本与强制更新状态；下载始终经允许来源验证并复用现有安装确认。
4. 对标准 YAML、完整包、差分包、损坏/缺失 blockmap、无更新、暂停、灰度、强制期限和服务不可用完成契约验证。
5. 联调时由管理后台实现 API 清单中的检测与 feed 资源；私有发布先面向测试通道，再开放目标通道。

回退到未配置私有环境的构件继续使用现有更新源。已配置私有服务的构件若服务暂时不可用，普通使用保持开放；已收到的强制要求仍按其原决定执行。
