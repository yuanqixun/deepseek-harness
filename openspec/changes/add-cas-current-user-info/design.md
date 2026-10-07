# 设计

## Context

`dsh-pro-auth` Host 状态 RPC 已返回 `username` 与 `displayName`，Client 控制器在内存中保存已认证身份，并且 Host 已实现 `logout` RPC。DSH 设置壳的 `settings.launcher` 插槽用于替换侧栏设置触发器，owner 已提供 `openSettings()` 和 `openOnboarding(id)` 操作。当前 CAS parser 将显示名设为用户名。

## Goals / Non-Goals

**Goals：** 在 Web profile 使用单一的侧栏账户菜单访问 CAS 用户详情、现有设置和当前 DSH profile 退出流程，并为未来菜单项提供可组合扩展点。

**Non-Goals：** 注销浏览器 CAS SSO 会话、修改 CAS 服务端、添加 profile 外身份入口、资料编辑、额外 CAS 属性解析、邮箱/部门/角色或头像。

## Decisions

- 注册到既有 `settings.launcher` 单槽。它位于侧栏设置触发器位置，owner 已向启动器提供侧栏宽度、打开设置和显式打开 onboarding 的函数；不再使用单独的 `sidebar.footer.action`，也不修改核心侧栏布局。
- 侧栏入口始终只显示用户图标，不在侧栏常驻显示用户名；已认证时悬浮提示显示用户名。菜单首项以用户名和用户图标显示 CAS 身份，选择后打开 Modal；用户名与显示名相同时详情只显示一次。
- 菜单内置用户名/用户图标、设置/齿轮图标和“登出”/退出图标。设置项调用 owner 的 `openSettings()`；登出项调用 Host 现有 `logout` RPC，RPC 完成后通过 `openOnboarding('dsh-pro-auth')` 回到 CAS 登录界面。
- 退出只清除本地 DSH 进程持有的 CAS 身份，不请求 CAS `/logout`，也不宣称关闭浏览器全局 SSO 会话。
- 用户选择“登出”后先显示本地确认对话框；只有确认才调用 logout RPC，取消则保留当前身份。面向用户的说明仅解释退出当前 DSH 账号并返回登录页面，不提 CAS 会话实现。
- 登录 onboarding 使用标准 `Modal` 标题“系统登录”、单点登录主操作和“取消并关闭”操作。说明用户如何开始验证、在哪里完成，以及返回 DSH 后会自动继续。Modal 遮罩阻止背景交互，并将 DSH 根节点设为 inert；取消尝试关闭当前 Web 标签，若浏览器禁止脚本关闭则导航到 `about:blank`。
- 由账户菜单注册的 slot 声明 `dsh-pro-auth.menu.item` 子列表，并把子列表作为 `Menu` 的组件子项渲染。后续插件可以贡献独立的本地化菜单行并复用 `MenuItemButton` 键盘遍历。
- 启动器与 onboarding 共用同一个 `CasLoginController`，不增加 RPC 轮询器；退出、refresh 和连接重置令旧身份立即失效。Profile 未加载插件时其 `settings.launcher` 无替换注册，原设置触发器继续作为 fallback。
- 身份只驻留 Host/Client 内存，不保存至设置、Session、日志、分析事件或模型可见请求。

## Risks / Trade-offs

- CAS 解析器当前令 `displayName` 与 `username` 相同，因此详情首版通常只显示账号标识。后续属性展示必须先扩展 CAS 身份合同。
- 本地退出后，浏览器的 CAS cookie 可能仍有效；用户重新登录时 CAS 可能免密回跳。真正结束 SSO 会话需要另行实现并验证 CAS `/logout` 流程。
- 插件启用后会替换 Web profile 现有设置启动器，因此菜单必须包含设置操作且遵循 settings launcher 的无障碍、宽窄态行为。

## Migration Plan

不迁移持久化数据或修改 CAS 服务端配置。只有加载 `dsh-pro-auth` 的 Web profile 替换设置启动器；其他 profile 保持原入口。卸载插件后原设置触发器恢复，无需清理身份存储。
