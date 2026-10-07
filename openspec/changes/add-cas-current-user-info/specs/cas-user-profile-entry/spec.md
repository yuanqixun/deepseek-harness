# Spec Delta

## Purpose

让用户在本机 DSH Web 中通过侧栏底部的统一账户菜单查看 CAS 身份、打开设置或退出当前 profile，同时保留菜单扩展能力并避免身份信息进入模型可见数据。

## ADDED Requirements

### Requirement: 提供统一 CAS 账户菜单

加载 `dsh-pro-auth` 的 Web profile SHALL 在现有 `settings.launcher` 位置显示一个仅含用户图标的账户入口，替代独立的设置触发器。入口 SHALL 在展开和收起的侧栏中保持可访问，并打开一个包含用户名（带用户图标）、设置（带齿轮图标）和“登出”（带退出图标）的菜单。未认证时显示 CAS 登录操作。

#### Scenario: 已认证用户打开账户菜单

- **WHEN** `dsh-pro-auth` 返回已认证身份且用户激活侧栏底部账户入口
- **THEN** 菜单首项以用户名和用户图标显示当前身份，且包含设置齿轮图标和标为“登出”的退出图标操作

#### Scenario: 用户选择设置

- **WHEN** 用户从账户菜单选择设置
- **THEN** 菜单关闭并打开 DSH 现有设置面板

#### Scenario: 侧栏收起

- **WHEN** 侧栏已收起且 `dsh-pro-auth` 已加载
- **THEN** 账户入口以可访问的头像或图标按钮显示，并提供本地化 Tooltip

#### Scenario: Profile 未加载 CAS provider

- **WHEN** Web profile 未加载 `dsh-pro-auth`
- **THEN** 不增加 CAS 账户菜单，现有设置入口保持不变

### Requirement: 查看已认证 CAS 用户信息

账户菜单 SHALL 仅使用 CAS provider 返回的已认证身份显示用户名作为用户信息菜单项文字，并配用户图标。仅当显示名与用户名不同时，详情 SHALL 单独显示显示名。用户 SHALL 可使用键盘打开和关闭菜单及详情。

#### Scenario: CAS 只提供用户名

- **WHEN** 已认证身份的用户名与显示名相同
- **THEN** 详情只显示一次账号标识，不虚构姓名、邮箱、部门、角色或头像

#### Scenario: CAS 提供不同的显示名

- **WHEN** 已认证身份的显示名与用户名不同
- **THEN** 详情使用本地化字段名称分别显示两者

### Requirement: 退出当前 DSH profile 登录

账户菜单 SHALL 提供退出当前 DSH profile 登录的操作。该操作 SHALL 调用 Host 已有 logout RPC，清除进程内身份并回到 CAS 登录流程；SHALL NOT 声称已结束浏览器里的 CAS SSO 会话。

#### Scenario: 用户退出当前 DSH 登录

- **WHEN** 已认证用户确认退出
- **THEN** Host 清除当前 profile 的身份，Web 隐藏旧身份并显示 CAS 登录流程

#### Scenario: 用户取消登出确认

- **WHEN** 已认证用户从确认对话框选择取消
- **THEN** 不调用 logout RPC，当前 CAS 身份保持有效

### Requirement: 阻塞式系统登录对话框

登录 onboarding SHALL 使用标题为“系统登录”的对话框，使用不暴露协议术语的本地化文案说明企业账号登录步骤、浏览器跳转和返回 DSH 后的自动继续行为。对话框 SHALL 显示单点登录和取消关闭操作，并在显示期间遮罩页面、禁止与背景交互。选择单点登录 SHALL 执行现有登录流程；选择取消 SHALL 尝试关闭当前 Web 页面，若浏览器阻止脚本关闭标签页则导航到空白页。

#### Scenario: 用户取消系统登录

- **WHEN** 用户在 CAS onboarding 中选择取消
- **THEN** 当前页面关闭或在浏览器禁止关闭标签时导航至空白页

### Requirement: 允许扩展账户菜单

`dsh-pro-auth` SHALL 声明一个类型化账户菜单子插槽，已加载该插件的其他插件可向菜单增加本地化的用户相关操作。扩展操作 SHALL 与内置菜单项共用相同菜单键盘交互。

#### Scenario: 插件增加用户相关入口

- **WHEN** 插件注册账户菜单子插槽的菜单项
- **THEN** 该操作在当前用户账户菜单中显示，并遵循统一菜单的键盘访问行为

### Requirement: 未确认认证时清除身份

认证状态处于加载中、未认证、不可用或无效时，账户菜单 SHALL 不显示旧身份；连接重置后 SHALL NOT 继续把旧身份显示为当前身份。

#### Scenario: 连接重置后状态不可用

- **WHEN** Host 连接重置且 CAS 状态刷新未确认已认证身份
- **THEN** 入口不展示旧身份或用户详情

#### Scenario: 身份信息隐私

- **WHEN** 用户打开或关闭账户菜单与详情
- **THEN** 身份只保留在 Host 与 Client 的内存状态中，不写入设置、Session 数据、日志、分析事件或模型上下文
