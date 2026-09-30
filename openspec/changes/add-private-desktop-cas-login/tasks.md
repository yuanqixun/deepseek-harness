# Tasks

## 当前实施进度（2026-09-30）

- 任务 1 的协议、规格映射和两仓库交接记录已完成。
- `sso-cas` 的 `main` 已有提交 `c302eba`、`bf10e90` 和 `2d46406`；其工作区另有未提交改动，补齐本地开发 profile、V2 限流与 V3 浏览器终态迁移、限流与过期清理、CAS 浏览器授权安全处理及 API 行为。
- dsh-auth Compose 现同时启动本地 PostgreSQL 与 CAS 8.0.2；本地服务注册已由 CAS 加载。已执行 `docker compose config --quiet`、`mvn -DskipTests package` 和 README 中的 `SPRING_PROFILES_ACTIVE=local mvn spring-boot:run`；数据库处于 Flyway V3，CAS `/cas/login` 返回 200，dsh-auth `/actuator/health` 返回 `UP`。没有执行浏览器登录或 CAS 验票。
- 任务 2.1 已完成：新增 Spring 配置启动校验测试并对齐 OpenAPI 的 enterprise_id 格式和长度、CAS issuer URI、public origin、超时及必需配置行为；app_id 接受 1–255 字符。执行 `mvn -f dsh-auth/pom.xml package`，7 项配置测试通过；本机 dsh-auth health 返回 `UP`。无效配置测试只启动配置属性上下文，不连接数据库或 CAS。
- 任务 2.2 已完成：新增 V4 扩大 `login_request`、`app_session` 的 `app_id` 列到 255 字符；PostgreSQL Testcontainers 验证空库迁移至 V3、保留数据升级至 V4、重复请求键和重复应用会话被拒绝，以及并发 browser_flow 占用恰有一个成功。执行 `mvn -f dsh-auth/pom.xml -Ppostgres-integration -Dit.test=DatabaseMigrationIT verify` 成功，正常 `mvn -f dsh-auth/pom.xml package` 也成功。
- 任务 2.3 已完成：新增 PostgreSQL-backed API 集成覆盖创建/原样重试且不延长 TTL、绑定冲突不覆盖、超长输入与未知 JSON 字段拒绝、状态/取消必须持有 verifier、未知 ID 与错误 verifier 不泄漏详情、创建限流返回 Retry-After。`mvn -f dsh-auth/pom.xml -Ppostgres-integration verify` 完整通过（7 个配置测试、1 个迁移集成测试、5 个 API 集成测试）；未触发 CAS 网络调用。
- 任务 2.4 已完成：过期请求的 status/cancel/exchange 在返回 410 前会提交 `expired` 终态；集成测试验证清理任务未参与请求处理时仍拒绝过期操作，并由清理任务按保留期删除终态记录。单独停止 PostgreSQL 后，请求返回通用 503，不转入内存态。`mvn -f dsh-auth/pom.xml -Ppostgres-integration verify` 通过（7 个配置测试、1 个迁移测试、6 个 API 测试、1 个数据库不可用测试）。
- 任务 3.1 已完成：无 CAS 网络访问的 PostgreSQL/API 测试确认授权页面 GET 不批准请求、无效 CSRF 不能启动 flow、同一浏览器会话的第二个活跃 flow 返回冲突且不覆盖第一条，另一浏览器会话可同时保有活跃 flow。`mvn -f dsh-auth/pom.xml -Ppostgres-integration -Dit.test=LoginRequestApiIT#authorizationGetDoesNotApproveAndStartRequiresTheSessionCsrfToken+allowsOnlyOneActiveFlowPerBrowserSessionButAllowsDifferentBrowsers verify` 通过。
- 任务 3.2 已完成本地范围：CAS 协议实现拆分为独立 `CasTicketValidator`，只接受固定 public origin 下带服务端 flow 的 callback service，将数据库原值发送给固定 CAS 2.0 endpoint；XML 使用安全解析，限制响应 64 KiB 和完整请求超时。受控本地 HTTP endpoint 的 5 项单测通过，覆盖 service/ticket 编码、错误 service、CAS/HTTP 失败、格式/命名空间/重复 user 错误、超限响应与响应体超时；PostgreSQL 回调测试覆盖缺失、未知和已占用 flow，并已通过。真实 CAS 往返另由 10.1 验收。
- 任务 3.3 已完成本地范围：受控慢速验票和 PostgreSQL 测试验证 A 到期、B 在同一浏览器启动后，A 的迟到回调不能修改 A/B 状态；过期请求和 flow 会在回调拒绝事务中按数据库时间落为终态。验票结果不确定时 flow 转为 failed，旧票据不能重用，同一请求可以开始新的 CAS 往返。终态测试先在移除落库逻辑时按预期失败，再恢复实现后通过；本机 PostgreSQL 与 Testcontainers 用例均通过。
- 任务 3.4 的本地确认/拒绝实现及 PostgreSQL 用例已覆盖 subject/device HTML 转义、无效 CSRF 不批准、拒绝后刷新不恢复及过期确认拒绝；真实 CAS 已登录会话行为由 10.1 联调确认。任务 3.5 的 Nginx 模板和安全响应配置已写入，但真实 CAS service 注册与 CAS/代理访问日志仍待云端检查。
- 任务 2.5 已完成；服务端基础任务 2 已完成。`dsh-auth` 全量 PostgreSQL Testcontainers 验证通过：8 项配置测试、1 项迁移测试、15 项 API 测试、1 项数据库不可用测试（共 17 项集成测试）；验证未访问 CAS。
- 任务 3.1–3.5 的本地实现及测试范围已完成。完整 `mvn -f dsh-auth/pom.xml -Ppostgres-integration verify` 通过：13 项单测、28 项集成测试（27 通过，opt-in 本机 PostgreSQL 竞态测试在此命令下跳过）；本机 PostgreSQL 竞态测试另以 `mvn -f dsh-auth/pom.xml -Dtest=BrowserAuthorizationRaceLocalIT -Ddsh.auth.local-db-it=true test` 通过。所有验证均未访问真实 CAS。真实 CAS 注册、浏览器往返及代理/CAS 实际日志检查仍由 10.1、10.4 验收。
- 任务 4.1 已完成：PostgreSQL 并发兑换只一个成功、只存 token SHA-256 摘要、重复兑换不再返回 token；约束故障注入验证事务失败保留 approved 且不创建会话或返回令牌。响应丢失后的客户端重新登录仍由跨项目联调验证。
- 任务 4.2 已完成：`/me` 和 `/logout` 无效应用令牌返回 `401 invalid_token`；API 测试覆盖可信身份与企业/app 绑定、过期及撤销拒绝、重复退出幂等，响应不扩展到未经 CAS 提供的权限/额度。
- 任务 4.3 已完成本地双实例验收：`LoginRequestApiIT` 启动两个独立 Spring WebApplicationContext，共用 PostgreSQL Testcontainers；验证 JDBC 浏览器 session 跨实例可用、应用 session 可跨实例查询和撤销，并用同步屏障竞争确认/取消、取消/兑换、确认/过期。`mvn -f dsh-auth/pom.xml -Ppostgres-integration verify` 通过 8 项配置测试及 22 项集成测试；用例清空共享表，退出时关闭第二实例，Testcontainers 清理数据库。
- 任务 4.4 已完成本地范围：README 增加不访问 CAS 的 create/status/cancel curl 样例，并在正在运行的本地 dsh-auth 上执行成功（`pending_auth` 后 `cancelled`）；清理了本次创建的唯一请求。Testcontainers 的日志与数据库测试验证 verifier、模拟 ST 和明文应用令牌不进入应用日志或持久化字段；真实 CAS/代理日志观察仍按任务 3.5、10.4 留待云端。
- DSH Host、Desktop、`dsh-pro-auth`、Client 和企业构建任务尚未开始；跨项目验收任务 10 尚未开始。

## 1. 协议与实施依赖

- [x] 1.1 按 [design.md](design.md) 固化 `/api/v1` 请求、响应、错误码和状态转换的机器可校验定义及有效/无效样例；验证六类接口、重复创建证明、CAS 用户字段和终态均有样例，且不含 TokenHub 权限、额度或模型密钥字段。
- [x] 1.2 建立 [三项能力规格](specs/enterprise-cas-login/spec.md)及其相邻规格到实施任务和验收用例的映射；验证每个 Requirement 和 Scenario 均有归属，包含设计确定的离线、收尾与账号切换行为。
- [x] 1.3 在实施交接记录中明确 DSH 与 `sso-cas/dsh-auth` 两个仓库的修改范围、服务端交付依赖和联调版本；验证外部交付可追踪，服务端任务未实际验收前不标记完成，本轮提案编写不修改该仓库。

## 2. dsh-auth 基础与请求存储（sso-cas 配套工作）

- [x] 2.1 创建独立 Spring Boot dsh-auth 模块及 PostgreSQL、Spring Session JDBC 配置，校验服务 origin、企业/应用标识、超时和有效期；验证模块构建、健康检查及缺失或无效必需配置时明确失败，App1 保持演示用途。
- [x] 2.2 建立 login_request、browser_flow、app_session 及浏览器会话的版本化数据库迁移和约束；用真实 PostgreSQL 验证空库初始化、升级、重复请求键、每请求最多一个应用会话及浏览器往返原子占用。
- [x] 2.3 实现请求创建、状态查询和取消接口，限制输入长度、校验证明并执行配置化限流；测试合法重试不延长 TTL、冲突不覆盖、仅有 ID/challenge 无权查询或取消，以及未知 ID 不泄漏详情。
- [x] 2.4 实现按数据库时间判断的过期、终态不可逆和保留期清理；测试未运行清理任务仍拒绝过期操作，数据库不可用时不降级为内存登录态。
- [x] 2.5 编写模块 README、配置和数据库迁移说明；实际执行其中的启动与迁移步骤，记录数据库依赖、秘密注入及不含 TokenHub 的首期范围。

## 3. CAS 2.0 浏览器授权（sso-cas 配套工作）

- [x] 3.1 实现授权入口、受 CSRF 保护的开始操作及逐次 browser_flow 绑定；测试页面 GET 不批准登录，同一浏览器的第二条往返不能覆盖第一条，不同浏览器可并发。
- [x] 3.2 实现固定 origin/path 加 flow 的 service 构造、原始 service 存储和 CAS 2.0 `/serviceValidate` 验票；受控协议测试覆盖错误 service、CAS 失败/无效 XML、错误响应、响应大小与超时；PostgreSQL 回调测试覆盖缺失、未知和已占用 flow，可信 subject 仅来自 CAS 响应。真实 CAS 注册/往返由 10.1 验收。
- [x] 3.3 实现验票处理权原子占用及验票后的条件更新；以可控慢速验票测试验证 A 过期、B 开始后，A 的迟到回跳不能批准 B 或恢复 A，且过期终态正确持久化；验票结果不确定时要求重新登录。
- [x] 3.4 实现可信账号、短确认码、设备描述展示及确认/拒绝页面；本地 PostgreSQL 测试覆盖确认页展示、CSRF 失败不能批准、账号和设备描述安全转义、拒绝及刷新不恢复、过期确认拒绝。真实 CAS 已有 SSO 会话仍显示确认页由 10.1 验收。
- [x] 3.5 配置精确 CAS service 注册模板、代理 callback/validation access log 关闭、安全 cookie、no-store、no-referrer 及票据清理跳转；本地配置和集成测试验证安全响应头、票据清理回跳及应用日志/数据库无 ST。真实 CAS service 注册及代理/CAS 日志实测由 10.1、10.4 验收；README 记录回调协议例外和真实联调步骤。

## 4. 应用会话与云端并发（sso-cas 配套工作）

- [x] 4.1 实现 approved 请求的一次性事务兑换和 opaque token 摘要存储；真实数据库测试验证并发兑换最多一次成功、提交失败不发令牌、已消费请求重试不重复返回令牌。
- [x] 4.2 实现 `/me`、应用退出与固定有效期，无 refresh token；测试过期和撤销令牌被拒绝、身份及企业/app 绑定正确、重复退出不激活会话，不返回虚构的姓名、权限或额度。
- [x] 4.3 验证两个服务实例共享请求、浏览器会话和撤销状态；通过同步屏障控制确认、取消、兑换与过期的竞争，验证胜出结果符合状态机，测试资源按用例隔离且可完整清理。
- [x] 4.4 更新接口与部署说明，加入兑换响应丢失、数据库不可用、应用退出和 CAS 退出的区别；运行文档中的 HTTP 样例并确认本地应用请求/异常日志和数据库中没有 verifier、模拟 ST 或明文应用令牌。真实 CAS 与反向代理日志仍由 3.5、10.4 云端验收覆盖。

## 5. 通用 Host 准入

- [ ] 5.1 清点 HTTP RPC、直接文件路由、终端、WebSocket 消息/订阅及后台启动入口，设计通用准入 Service Definition、Provider、Consumer；交付入口覆盖清单和测试 provider，确认未分类入口默认属于受限业务。
- [ ] 5.2 实现独立于可卸载企业 bundle 的必需 provider 声明、准入状态及撤销通知；测试普通部署保持原行为，企业部署在 provider 缺失、加载失败或 dispose 时默认拒绝，运行时注销 provider 不能解除限制。
- [ ] 5.3 将准入检查接入 HTTP 分发及直接文件/终端 handler，保留既有 Host、Origin 和 cookie 校验；用直接请求测试未登录、伪造本地传输凭据及退出后访问均失败，最小认证/诊断方法可用。
- [ ] 5.4 接入 WebSocket upgrade、既有连接的每条业务消息及订阅撤销；测试登录前连接、连接后退出、远程校验失败和静默订阅复核，确认未授权时不继续传送业务数据。
- [ ] 5.5 接入模型 pre-step、工具 pre-execute、最终 ToolGuard、排队输入、计划触发及子任务启动；测试异步校验后退出的代次竞态、新操作被拒绝而已执行调用可落盘收尾，必需拒绝逻辑不随企业插件卸载消失。
- [ ] 5.6 提供仅用于停止任务、结束终端和应用退出的收尾入口；测试它们保留本地传输认证，不开放新终端输入、任意文件读取或业务日志下载，长期运行进程可由用户停止。
- [ ] 5.7 更新通用服务 JSDoc、所属 README、架构和子系统说明，并加入执行中的入口覆盖检查；用缺漏入口反例验证检查会失败，新增或更新 keyless 会话快照验证拒绝文案、收尾及正常放行，补齐所需快照支持而不修改 agent-loop。

## 6. Desktop 启动与恢复

- [ ] 6.1 将发行版必需认证声明从 Desktop 启动器传入 Host，独立于用户可禁用的 bundle 配置；测试冷启动、已有 profile、重建 profile 和禁用全部第三方插件后仍拒绝未认证业务。
- [ ] 6.2 实现通用启动认证页面入口和最小 bootstrap 方法集；用测试 provider 验证认证页面能在业务受限时加载，provider 缺失时显示通用修复页，bootstrap 无法调用任意业务 RPC。
- [ ] 6.3 将原生 welcome 与 enterWorkspace 接入准入结果；测试已有 API Key、DeepSeek 账号、Skip 及直接触发进入工作区都不能绕过，企业登录后仍能独立配置模型凭据，普通版维持原流程。
- [ ] 6.4 接入恢复修复和认证代次检查，阻止旧登录结果重新打开工作区；测试加载失败、恢复禁用、重新启用后的在线校验和退出竞态，更新 Desktop README 与启动/恢复 UI 的本地快照。

## 7. dsh-pro-auth Host 插件

- [ ] 7.1 创建 `pro/dsh-pro-auth/{share,hxfl,superbpm}` 及 private 包，配置 Host/Client 导出、独立 leaf tsconfig、solution 根和 Cordis bundle；精确加入 workspace、检查范围及依赖，验证干净安装、分面类型检查、独立构建和打包成功，不创建独立仓库或用量插件。
- [ ] 7.2 在 share 实现版本化协议解析、配置校验、HTTPS origin 限制和请求超时；用协议样例测试畸形响应、不兼容版本、跨 origin 重定向及错误配置均不能泄漏凭据或静默放行。
- [ ] 7.3 实现安装 device_id、逐次 request_id/verifier、创建重试、系统浏览器启动、限流轮询、取消与兑换；测试请求相互隔离、Retry-After/截止停止、取消及替换后的迟到结果不覆盖当前身份，已收到的废弃令牌尝试撤销。
- [ ] 7.4 使用 Host credentials 持久保存按企业、origin、app_id 隔离的版本化记录；测试重启必须在线 `/me`、未知版本和失效凭据被拒绝、网络错误保留凭据但暂停业务、有效期届满无静默续期，并登记适用的持久化类型变更。
- [ ] 7.5 将 Host 认证状态接入通用准入 provider，实现仅合并同时在途的在线验证及代次检查；测试新的业务/模型步骤/工具执行不能复用离线成功缓存，退出立即本地拒绝，远程撤销失败不恢复会话。
- [ ] 7.6 实现账号切换等待旧活动工作收尾后再开放工作区；测试 A/B 共用原有会话、工作区与模型配置，退出不删除数据，旧身份异步结果不授权 B，凭据不进入 Client 状态、模型输入或 Session 事件。
- [ ] 7.7 编写插件 README、配置表和真实可执行的 profile/overlay 装配示例；验证省略插件时不发 CAS 请求、启用时解析正确，文档明确同 UID 凭据访问限制、共用本地数据及不提供 TokenHub 授权。

## 8. 企业登录 Client 界面

- [ ] 8.1 复用现有 Client UI 组件实现登录、确认码、浏览器打开和等待/取消界面，所有文案走 locale 字典；组件测试和 UI 快照覆盖键盘操作、重复点击、打开浏览器失败及请求超时，不展示 verifier 或令牌。
- [ ] 8.2 实现用户资料、验证中、失联暂停、到期及本地退出/远程撤销未确认状态；测试无姓名时显示 subject、账号切换等待收尾、登录不等于模型凭据就绪，且不展示 TokenHub 权限或额度。
- [ ] 8.3 将页面接入 Desktop 通用启动入口及登录后账号入口；验证 Client 重载从 Host 恢复安全状态、不依赖前端遮罩保证准入，更新插件用户说明及适用的 UI 演示记录。

## 9. 企业构建与升级兼容

- [ ] 9.1 实现 hxfl、superbpm 的独立配置入口和显式构建选择，按设计初值配置可调超时/有效期；配置测试验证缺失企业、非法 origin 或参数时报错，源码配置不含服务端秘密且不自动启用所有企业。
- [ ] 9.2 接通 Desktop 预装 bundle 的依赖解析、Client 静态资源、profile 持久化、升级重建和修复恢复；打包测试验证缺失插件、配置、导出或兼容依赖时构建失败，安装包无需源码目录或 Git 即可加载插件。
- [ ] 9.3 实现只收集公共实现和所选企业配置的 staging，串行构建 hxfl、superbpm、普通版；检查最终产物无其他企业配置残留，普通版不包含必需认证声明且不访问 CAS。
- [ ] 9.4 为通用接入点和插件建立升级兼容检查，更新企业构建、依赖版本与回退说明；在测试中注入不兼容接口或缺失 provider，验证阻止企业发行而非关闭认证，实际演练回到上一企业包。

## 10. 跨项目联调与交付验收

- [ ] 10.1 在无 TokenHub 的测试环境用真实 CAS 2.0 完成浏览器登录、已有 SSO 会话确认、Host 兑换、`/me`、退出和重启；保存脱敏证据，确认 service 的 flow 参数被保留且原值验票成功，DSH 不监听认证回调端口。
- [ ] 10.2 联调同一出口 IP 多客户端、同账号多安装、同浏览器多标签页、跨实例回跳/查询、取消竞态及兑换响应丢失；验证每条结果只交付对应 verifier，旧回跳不能批准新请求，响应丢失要求重新登录。
- [ ] 10.3 在实际企业 Desktop 包验证直连 HTTP/WS 绕过失败、断网暂停、已有任务收尾、账号切换共用数据、插件缺失及恢复模式；同时验证普通发行版原登录和模型配置流程，不产生企业认证请求。
- [ ] 10.4 对完整闭环检查 Client 状态、代理及应用日志、模型请求和 Session 记录中的秘密泄漏，验证未调用 TokenHub、未复用 ST 获取下游令牌，应用凭据未进入模型 provider 配置。
- [ ] 10.5 汇总两仓库版本、规格场景覆盖、实际执行的相关测试/类型/构建/文档检查、真实 CAS 与安装包证据及已知限制；运行 OpenSpec 严格校验并完成实现对照验证，仅在实现与跨项目验收均完成后归档，未完成项保持未勾选。
