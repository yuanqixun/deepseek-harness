# DSH 与 dsh-auth 实施交接

## 仓库职责

`deepseek-harness` 负责通用 Host 准入、Desktop 启动与恢复、`pro/dsh-pro-auth` 插件、企业配置、Client 界面和企业包装配。`sso-cas/dsh-auth` 负责 CAS 2.0 浏览器往返、PostgreSQL 请求与会话状态、原子兑换、`/me`、应用退出和服务端日志脱敏。`sso-cas/app1` 保持 CAS 演示用途，不承担此接口。

## 交付依赖

DSH 端仅依赖 [api-v1.openapi.yaml](api-v1.openapi.yaml) 所定义的 `1.0.0` API。服务端在接口与真实 CAS 2.0 联调完成前，必须提供可重复的本地 HTTPS 测试部署、API 契约结果和脱敏的 CAS service 注册证据。企业发行前，双方记录同一个 API 版本、dsh-auth 部署 origin、企业标识与 app_id；服务端密钥、数据库凭据和 CAS 管理凭据不进入本仓库。

服务端基础代码已在 `sso-cas` 本地 `main` 分支提交 `c302eba`、`bf10e90` 和 `2d46406`；dsh-auth 的后续实现仍有未提交工作区改动。dsh-auth 本地 Compose 同时启动 PostgreSQL 与 CAS 8.0.2，CAS 已加载 localhost 服务注册。PostgreSQL Testcontainers 的配置、迁移、API、过期和数据库不可用验证均通过；最近一次 `mvn -f dsh-auth/pom.xml -Ppostgres-integration verify` 通过 8 项配置测试及 17 项集成测试。测试没有调用 CAS。浏览器 CAS 回跳、真实 ST 验票、代理/CAS 日志观察及阿里云部署尚未验收。

dsh-auth 的 2.1–2.5、3.1–3.5 与 4.1–4.4 已有本地实现及相应测试证据。任务 4.3 使用两个独立 Spring 应用上下文验证共享浏览器 session、应用会话与撤销，并覆盖确认/取消、取消/兑换、确认/过期竞态；任务 4.4 的 README HTTP 示例已在本机执行，应用日志和数据库的秘密排除测试通过。任务 3.2 的受控 CAS 协议单测及 PostgreSQL 缺失/未知/重复 flow 回调测试通过；任务 3.3 的慢速验票竞态测试验证 A 过期、B 开始后 A 的迟到回调不改变任一请求，并验证验票失败后旧 flow 终结且可重新开始。任务 3.5 的 service 注册模板、Nginx 日志配置和响应安全已在代码及应用测试中覆盖。真实 CAS 往返、云端精确注册及 CAS/代理实际日志观察须部署后验收（10.1、10.4）。DSH 准入与桌面侧任务由本仓库后续实施。

## 联调准入条件

1. dsh-auth 的 `/api/v1` 实现通过其独立的数据库、并发和 CAS 验票测试，并与本文件的 OpenAPI 定义一致。
2. 测试部署只允许配置的 HTTPS origin、固定 `/login/cas` 路径和服务端生成的 `flow` 查询参数；CAS 使用原始 service 验票。
3. DSH Host 以配置的 HTTPS origin 调用服务，不跟随携带 verifier 或应用凭据的跨 origin 重定向，并在每次启动通过 `/me` 在线验证。
4. 任一方报告 API 版本或企业、origin、app_id 绑定不匹配时，企业发行版保持拒绝业务访问并提示修复；普通发行版不加载企业认证。
