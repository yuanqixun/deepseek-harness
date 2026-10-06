# Tasks

以下为实施任务。真实 CAS 与目标应用未验证的能力不得以协议桩或本地模拟标记完成。CAS 登录与跨应用代理分开验收：代理前置条件未满足时，可实现并验证登录准入，但不得声称跨应用 API 已完成。设计见 [design.md](design.md)，验收要求见各规格。

## 1. CAS 登录与代理票据前置验证

- [ ] 1.1 使用当前 Apereo CAS 8.0.2 验证 `/login`、严格注册的 `http://127.0.0.1:<port>/<callback-path>`、同一 service 的 `/p3/serviceValidate` 和重放拒绝；确认 CAS 对 loopback 动态端口规则，必要时选固定端口并验证占用失败。
- [ ] 1.2 验证 CAS 如何安全向 localhost DSH 交付 PGT：优先检查使用 DSH 实例公钥加密并在验票响应返回的配置；记录版本、注册项、密钥归属及失败行为，不开放不受限公网 callback。
- [ ] 1.3 指定至少一个目标应用和具体只读 API，确认其能以 CAS `/p3/proxyValidate` 或等价能力验证面向该 service 的 PT，并记录用户属性、权限、拒绝和日志行为。
- [ ] 1.4 使用真实 CAS 和目标 API 完成本机浏览器登录、ST 验票、PGT 获取、target service 对应 PT 签发及只读 API 调用；测试错 service、重放 ST/PT、错误用户和未授权代理。如果 CAS 不能安全交付 PGT 或目标 API 不接受 PT，暂停代理功能并先修订设计。

## 2. 独立插件与命名 profile

- [ ] 2.1 创建 private `@deepseek-ai/dsh-pro-auth` 的 share/企业入口、Host/Client 导出、分面 tsconfig 和 bundle；精确登记 workspace 与构建检查，验证干净安装、独立构建及导出解析。
- [ ] 2.2 提供企业 profile 安装/装配步骤及经过校验的 CAS/callback/资源配置；测试 `cas-pro-auth-superbpm` 使用 `https://sso.superbpm.com/cas`、其他企业配置不继承该地址、官方不发 CAS 请求、非法配置明确失败且未知 profile 不回退，实际运行文档中的 profile 命令。
- [ ] 2.3 新增通用 profile 必需准入声明及启动传递，企业安装同时登记；测试覆盖 overlay、禁用/卸载、缺失声明、缺失 provider、HMR 和重启，更新配置文档及适用升级说明。

## 3. 通用 Host 准入与 Web bootstrap

- [ ] 3.1 清点实际 HTTP/RPC、直接文件/终端、WS、后台和工具执行入口，完成准入服务三角色与入口分类；用测试 provider 和缺漏入口反例验证执行中的覆盖检查。
- [ ] 3.2 接通 HTTP、直接路由、WS upgrade/消息/订阅撤销，保留本机传输认证；直接请求验证未认证与 provider dispose 后均被拒绝，官方 profile 行为不变。
- [ ] 3.3 接通模型 pre-step、工具 pre-execute/最终 guard、排队/计划/子任务启动及最小收尾；测试在线 CAS 身份校验与退出竞态、旧代次拒绝、运行中操作落盘和停止入口，不修改 agent-loop。
- [ ] 3.4 实现业务加载前的最小 Web bootstrap 与安全状态通道；测试登录页不依赖业务事件流、不泄漏业务数据，补本地化 UI 快照、相关 keyless 会话快照及所属 README/JSDoc/架构文档。

## 4. CAS localhost 登录与本地会话

- [ ] 4.1 实现受配置约束的 CAS `/login` URL 与精确 loopback callback；Host 绑定 listener 后构造原始 `service` 值，callback 固定 path，不接受用户提供的 authority。
- [ ] 4.2 实现随机 state、一次性 ST、原始 service 绑定及 `/p3/serviceValidate` XML 响应处理；测试路由冲突、IPv4/受支持 IPv6、无业务 cookie 回跳、伪造/重复参数、取消/超时、多标签页和验票响应丢失。
- [ ] 4.3 建立按 profile 和 Host 实例隔离的本地登录状态；测试多个独立进程、多个设备用户、同机不同端口、重启、旧回调和退出竞争，不让其他实例的结果改变当前准入。
- [ ] 4.4 审计 callback、网络日志、错误对象、Client 状态和模型/Session 输出，测试 ST、PGT、PT 和用户敏感属性不出现；完成页清理 URL，失败不降级到传统凭据或官方认证。

## 5. CAS 代理访问与 Web 调试

- [ ] 5.1 仅在任务 1.4 通过后实现 PGT 安全获取和保管；多 Host 实例生成各自密钥并按当前身份/代次隔离 PGT，测试轮换、失效、退出清除和错误绑定拒绝。
- [ ] 5.2 提供仅 Host 可用的资源 ID 代理调用，按已登记 target service 向 CAS 申请 PT；验证 HTTPS origin/规范化路径/方法与当前代次，禁止重定向携带 PT，并拒绝绝对 URL、路径逃逸和跨 origin。
- [ ] 5.3 实现一个已确认目标 API 的只读调试操作及结果字段筛选；测试 PT 成功、错 service/身份、401、403、资源断网和 CAS 不可用，并更新消费者接口文档。
- [ ] 5.4 完成 Web 登录、账号、安全错误、重试和资源调试界面，使用 locale 与既有 UI 原语；组件与 UI 快照覆盖弹窗失败、重载、多标签页、退出与并行实例状态，确保凭据独立于模型配置。

## 6. 多实例验收与交付

- [ ] 6.1 使用多个真实测试用户，在各自电脑启动独立 DSH Web 并登录同一 CAS；验证 localhost/NAT、不同 callback 端口、CAS SSO、退出隔离、重启和日志脱敏。不将其解释为共享 Host 多用户支持。
- [ ] 6.2 使用至少一个真实目标应用验收不同用户对应的 PT、错误 target service 和权限拒绝；若前置能力未获 CAS/目标应用支持，保持代理相关任务未完成并更新提案。
- [ ] 6.3 验证必需 profile 的 HTTP/WS/后台绕过失败、provider 缺失和禁用拒绝、运行中退出；验证官方 Web/Platform 登录与模型配置回归，确认本变更不要求 Desktop 改造。
- [ ] 6.4 执行按改动范围选择的单元/生命周期/UI/会话快照、类型/构建、文档及严格 OpenSpec 检查；逐项核对四份规格并记录实际结果，外部未验证项保持未完成。
