# 提案：add-cas-current-user-info

## Why

用户通过 CAS 登录后，DSH Web 需要一个统一的账户入口来查看当前身份、打开设置或退出当前 DSH 登录。将这些操作收进侧栏底部菜单，也为后续增加当前用户相关入口提供稳定扩展点。

## What Changes

- 由 `dsh-pro-auth` 替换 Web 设置壳的 `settings.launcher`，在侧栏底部提供唯一的账户入口；原有设置按钮由账户菜单中的设置项取代。
- 账户菜单显示已确认的 CAS 身份，并提供用户信息、打开现有设置面板和退出当前 DSH profile 登录的操作。
- 退出登录调用现有 Host logout RPC，清除当前 DSH 进程中的 CAS 身份并重新显示 CAS 登录流程；不主动结束浏览器中的 CAS SSO 会话。
- 在账户菜单中提供一个类型化子插槽，使后续插件可添加本地化的当前用户相关菜单项。
- 复用插件当前认证状态；刷新、连接重置、provider 不可用或退出登录后不得继续展示旧身份。
- 只显示 `dsh-pro-auth` 当前提供的 `username` 与 `displayName`。CAS 解析器目前将二者设为相同值；邮箱、部门、角色和头像不在本变更范围内。
- 未加载 `dsh-pro-auth` 的 profile 保持原有设置入口；身份不写入 DSH 设置、Session、日志、分析事件或模型上下文。

## Capabilities

### New Capabilities

- `cas-user-profile-entry`：在 Web 侧栏底部提供 CAS 账户菜单、身份详情、设置导航、当前 profile 退出及可扩展菜单项。

### Modified Capabilities

无。当前仓库尚无已登记的 OpenSpec capability。

## Impact

扩展 `dsh-pro-auth` Client UI，使用 `@deepseek-ai/dsh-client-ui-settings` 已有的 `settings.launcher` 插槽及插件现有状态 RPC/控制器。该插件声明一个账户菜单子插槽供后续菜单动作扩展。不增加核心侧栏插槽、CAS endpoint 或身份持久化。
