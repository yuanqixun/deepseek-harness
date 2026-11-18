# 提案：Desktop 本人 token 用量

## Why

登录用户需要在 Desktop 对照自己的 TokenHub Key，并查看近期 token 消耗。现有模型 Key 弹窗只显示状态；aicode 已提供当前 Key 的用量统计和掩码，但现有本人查询接口要求管理页面权限。

## What Changes

- 将登录后账户菜单中的模型 Key 状态入口改为“用量统计”，扩展其弹窗，标题为“Token 用量”，显示当前用户、Key 掩码、现有状态、最近一次整体刷新时间，以及今日、本周、本月的总 token。
- 打开弹窗时查询，提供整体刷新和失败周期的单独重试；失败不得显示为零。
- aicode 增加登录用户本人只读接口，复用现有 Key 和用量服务，不改变管理页面接口的权限。
- `dsh-pro-auth` 使用现有 Aicode OAuth2 身份调用接口，经 Host 向 Client 提供脱敏状态；Desktop 不直接访问 TokenHub。

## Capabilities

### New Capabilities

- `desktop-token-usage`：登录用户查看本人当前 Key 掩码和三个自然周期的 token 消耗。

### Modified Capabilities

无。

## Impact

涉及 `aicode-app-dsh` 的本人接口、私有 `dsh-pro-auth` 插件的 Host、Client 与本地化，以及 Desktop 私有插件打包版本和联调。现有管理接口、Key 申请与轮换、模型凭据优先级不变；不展示或复制完整 Key，不提供额度或剩余百分比。
