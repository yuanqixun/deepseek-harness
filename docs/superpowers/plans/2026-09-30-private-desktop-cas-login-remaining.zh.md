# Private Desktop CAS Login 剩余工作实施计划

[English](2026-09-30-private-desktop-cas-login-remaining.md) | 中文

> **面向智能体工作者：** 必须使用 `superpowers:executing-plans` 子技能，逐项实施本计划。步骤使用 `- [ ]` 语法跟踪。

**目标：** 完成 `add-private-desktop-cas-login` 中尚未勾选的实施项，涉及 `sso-cas/dsh-auth` 与 `deepseek-harness`；真实 CAS、云端部署和发行包联调证据留到云端阶段取得。

**架构：** 按 OpenSpec 任务顺序推进，并保持远端 dsh-auth 服务、DSH 通用准入、Desktop 启动引导和私有企业插件之间的职责划分。每个含代码阶段都收集本地可执行的静态、构建和数据库证据；若清单项要求的 CAS、多实例、Desktop 包或云端证据尚未取得，就继续保持未勾选。

**技术栈：** Spring Boot、PostgreSQL、Spring Session JDBC、CAS 2.0、TypeScript、Cordis、DSH Host/Desktop 构建工具、OpenSpec。

**规格：** `openspec/changes/add-private-desktop-cas-login/{proposal.md,design.md,api-v1.openapi.yaml,specs/**,tasks.md}` 与 `implementation-traceability.md`。

## 全局约束

- 不增加 TokenHub 集成、权限、额度或模型密钥行为。
- 生产登录、浏览器 flow 和应用会话状态不得使用进程内存储。
- 只有在 `tasks.md` 中每个验收条件都有证据后，才能勾选任务。
- 真实 CAS 浏览器验票、多实例竞争、Desktop 发行包检查和跨项目验收延后至云端部署；记录为待办，不得用模拟结果替代。
- 保留两个仓库已有的未提交改动；不要 reset、clean、覆盖无关文件、提交、推送或删除 Docker 卷。
- App1 继续作为演示应用，普通 DSH 发行版行为保持不变。
- 每个阶段结束后更新 OpenSpec 任务清单和进度摘要，并告知下一项建议。

## 审查重点

- 企业配置缺失或无效时，应用启动必须 fail closed；在 dsh-auth 配置工作中覆盖相关用例。
- 迟到的 CAS 回调不能恢复已取消或过期的请求；先覆盖本地可测状态转换，真实 CAS 回调证据延后取得。
- 已兑换的令牌不得再次返回，包括响应丢失后；现在实现原子事务，若本地无法执行 PostgreSQL 竞争或丢包验证，则将证据留待后续。
- 必需准入 Provider 缺失或已 dispose 时，业务路由不能放行；添加企业 Provider 前，先通过通用 Host 测试覆盖。
- 普通构建不得包含企业认证或访问 CAS；在构建组合阶段验证。

---

## 源码位置与阶段边界

- `sso-cas/dsh-auth/src/main/java/**`、`src/main/resources/**`、`README.md` 和 `docker-compose.yml` 负责服务配置、持久化、API、浏览器 flow 和部署说明。以现有未提交改动为起点并予以保留。
- `openspec/changes/add-private-desktop-cas-login/tasks.md`、`implementation-handoff.md` 和 `implementation-traceability.md` 负责跨仓库状态及证据链接。
- DSH 通用准入由现有 Host 服务及直接 HTTP、文件、终端、WebSocket、后台执行的所有者实现，具体范围见任务 5。通用 Host 包不得承载 CAS 专属策略。
- Desktop 启动引导和恢复工作由任务 6、9 所指的现有 Desktop 启动、欢迎页、恢复及打包模块负责。
- `pro/dsh-pro-auth/{share,hxfl,superbpm}` 负责版本化协议、Host/Client 插件及企业专属组合，对应任务 7–8。

## 实施阶段

### 阶段 1：dsh-auth 持久化与请求生命周期（任务 2.1–2.5）

- [ ] 对照任务 2.1 和 OpenAPI 配置限制检查当前模块；修正 `app_id` 的 128 与 255 长度不一致、无效配置未明确失败和健康检查问题。同步更新服务配置及文档。
- [ ] 补齐版本化 schema 约束及请求、浏览器 flow、会话的事务操作。将 CAS HTTP 调用留在窄服务接口之后，以便无需云端 CAS 也能检查事务行为。
- [ ] 补齐创建、状态查询、取消校验、重试绑定、proof 校验、限流、按数据库时间判断过期、终态保留和清理。
- [ ] 同步更新 dsh-auth 模块和部署文档，说明持久化及请求生命周期。

**阶段验收证据：** dsh-auth 编译通过；迁移和 Compose 配置有效；记录本地 PostgreSQL 启动及健康状态。本阶段不要求云端 CAS 测试。没有所需的可控数据库并发测试时，不得宣称并发验收完成。

### 阶段 2：CAS 浏览器授权实现（任务 3.1–3.5）

- [ ] 完成 CSRF 保护的授权开始操作、逐次浏览器 flow 绑定、不通过 GET 批准请求以及同一浏览器会话串行化。
- [ ] 完成固定 HTTPS 回调构造、精确 CAS service 注册、原始 service 保留、CAS 2.0 验票结果映射，以及有界的网络和 XML 失败处理。
- [ ] 完成 flow 原子处理、请求条件状态转换、账号／匹配码／设备确认、拒绝及安全 HTML 展示。
- [ ] 完成 cookie、缓存和 referrer 设置、反向代理日志脱敏说明、票据清理跳转及面向运维人员的云端 CAS 配置说明。

**阶段验收证据：** 静态检查、构建及本地可执行的页面和配置检查。真实 CAS 票据往返、代理日志检查以及跨实例迟到回调竞争须等云端部署后验证。

### 阶段 3：应用会话与部署语义（任务 4.1–4.4）

- [ ] 实现 approved 请求的一次性兑换、opaque token 摘要存储、`/me`、撤销、固定过期时间及符合 OpenAPI（`invalid_token`、HTTP 401）的错误响应。
- [ ] 使用可用数据库证据验证事务、身份和 app 绑定、过期及撤销令牌拒绝；若尚未验证丢失响应或并发，不得勾选对应验收。
- [ ] 文档说明响应丢失、数据库故障以及应用退出与 CAS 退出的区别；检查 verifier、CAS service ticket 和明文应用令牌没有泄漏到日志或数据库。

**阶段验收证据：** 构建和本地可执行的数据库检查。若尚未执行可控竞争或丢失响应验收，则保留待办；本阶段不需要云端 CAS 测试。

### 阶段 4：DSH 通用准入与安全收尾（任务 5.1–5.7）

- [ ] 在修改前盘点直接 HTTP、文件、终端、WebSocket、订阅、排队输入、调度器、模型步骤、工具执行和 subagent 启动入口。
- [ ] 定义通用的必需 Provider 服务及撤销生命周期；只有声明必需准入的构建才在 Provider 缺失或 dispose 时 fail closed。
- [ ] 将准入接入每个业务入口，同时保留本地传输认证及必要的诊断、停止和收尾操作。
- [ ] 增加入口覆盖检查、提案要求的针对性测试和快照，并更新对应 README、JSDoc 和架构文档。

**阶段验收证据：** 所有已盘点入口的针对性 Host 测试及静态检查；不依赖 CAS。

### 阶段 5：Desktop 启动、恢复与引导（任务 6.1–6.4）

- [ ] 从 Desktop 启动器向 Host 传入不可变的必需认证策略，不依赖用户可编辑的 bundle 配置。
- [ ] 增加受限的 bootstrap 接口；Provider 不可用时展示通用修复状态。
- [ ] 将原生欢迎页、工作区进入、启动恢复和认证代次检查接入流程，同时不改变普通 Desktop 的原有行为。
- [ ] 更新 Desktop 文档及启动／恢复路径的针对性快照。

**阶段验收证据：** 针对性 Desktop/Host 测试和适用的本地构建。真实企业包检查保留到阶段 7、8。

### 阶段 6：dsh-pro-auth Host 插件（任务 7.1–7.7）

- [ ] 建立私有 workspace 包及 share/host/client、hxfl/superbpm 组合，配置分面 TypeScript 配置、Cordis bundles，并精确登记 workspace、构建和依赖。
- [ ] 实现版本化协议解析、HTTPS origin 限制、超时、device/request/verifier 生命周期、浏览器启动、轮询退避、取消和一次性兑换。
- [ ] 通过 Host credentials 持久化版本化凭据；在启动时及每个受保护操作前在线复核，实现 fail-closed 代次、撤销和账号切换。
- [ ] 提供可执行的 profile/overlay 示例及文档，说明凭据范围、同 OS 用户访问限制、共享本地数据和不提供 TokenHub 能力。

**阶段验收证据：** 干净安装、分面类型检查及构建、针对性协议／生命周期测试和 profile 解析检查。不得用模拟云服务替代验收。

### 阶段 7：Client 登录体验（任务 8.1–8.3）

- [ ] 使用现有 Client UI 原语实现本地化登录、匹配码确认、浏览器启动、轮询／取消、资料、失联／过期和本地／远端退出状态。
- [ ] 将 UI 接入 Desktop 通用启动入口和账号入口；Host 仅向 Client 暴露安全状态，不暴露 verifier 或令牌。
- [ ] 增加组件测试，覆盖键盘操作、重试和错误、locale 更新，以及仓库策略要求的 UI 快照。

**阶段验收证据：** 针对性 Client 测试／快照和 Client 构建；不需要云端 CAS。

### 阶段 8：企业构建组合与升级兼容（任务 9.1–9.4）

- [ ] 增加 hxfl、superbpm 的显式构建选择和经过校验的非秘密配置。
- [ ] 将所选插件和 Client 资源纳入 Desktop 打包、profile 持久化、升级重建和修复恢复路径；缺少企业构建输入时必须失败。
- [ ] 仅暂存通用代码及选定企业配置；检查普通构建不含企业认证且不调用 CAS。
- [ ] 增加兼容失败检查并更新升级／构建说明。

**阶段验收证据：** 可在本地检查企业版和普通版构建产物。若本地条件无法满足，则将已安装包 smoke 和回滚演练留待以后执行。

### 阶段 9：云端 CAS 与跨项目验收（任务 10.1–10.5）

- [ ] 部署后使用真实 CAS 2.0 执行浏览器登录、复用已有 SSO 会话时的确认、兑换、`/me`、撤销、重启及 service ticket／日志脱敏检查。
- [ ] 使用隔离 fixture 测试多客户端、多标签页、多实例、取消／过期／兑换竞争及响应丢失。
- [ ] 检查实际企业版与普通版 Desktop 包的准入和恢复行为，并审查秘密泄漏。
- [ ] 记录确切版本、命令和脱敏证据；运行严格 OpenSpec 校验。只有在证据齐备后才勾选相应任务或归档。

**阶段验收证据：** 真实云端 CAS 和 Desktop 包证据。证据取得前，任务 10.1–10.5 保持未勾选。

## 决策与约定

- 按提案任务顺序实施，但分别记录代码完成和验收完成，避免用本地 mock 冒充云端 CAS 验收。
- 用户要求延后集成测试，优先于默认本地 CAS 集成测试要求。实施每阶段时仍可执行安全的编译、配置检查及非 CAS 针对性测试。
- 本请求不包含 Git 提交或推送。

## 自查

- 规格覆盖：阶段 1–9 对应任务 2.1–10.5；任务 1.1–1.3 已勾选，不重复安排。保留既有任务 2.5 证据；只有实现变化使其失效时才重新打开。
- 步骤扫描：按可独立评审的子系统划分工作；开始每项任务时，根据源码和 OpenAPI 确定具体接口。
- 审查重点：上述五项高风险行为均已分配给对应阶段；云端专属验收继续保持待办。
- 工作量：本计划是大型跨仓库提案的阶段图，不代替 OpenSpec 任务清单或云端验收记录。
