# DSH 与 dsh-auth 实施交接

## 仓库职责

`deepseek-harness` 负责通用 Host 准入、Desktop 启动与恢复、`pro/dsh-pro-auth` 插件、企业配置、Client 界面和企业包装配。`sso-cas/dsh-auth` 负责 CAS 2.0 浏览器往返、PostgreSQL 请求与会话状态、原子兑换、`/me`、应用退出和服务端日志脱敏。`sso-cas/app1` 保持 CAS 演示用途，不承担此接口。

## 交付依赖

DSH 端仅依赖 [api-v1.openapi.yaml](api-v1.openapi.yaml) 所定义的 `1.0.0` API。服务端在接口与真实 CAS 2.0 联调完成前，必须提供可重复的本地 HTTPS 测试部署、API 契约结果和脱敏的 CAS service 注册证据。企业发行前，双方记录同一个 API 版本、dsh-auth 部署 origin、企业标识与 app_id；服务端密钥、数据库凭据和 CAS 管理凭据不进入本仓库。

服务端任务 2–4 当前仍未交付。本仓库不能将轮询、兑换、`/me` 或退出声明为已验证，也不能以 mock 成功代替真实 CAS 2.0 联调。DSH 可先用固定协议 fixture 验证 Host 状态机、准入和凭据隔离；跨仓库验收仍由任务 10.1–10.5 负责。

## 联调准入条件

1. dsh-auth 的 `/api/v1` 实现通过其独立的数据库、并发和 CAS 验票测试，并与本文件的 OpenAPI 定义一致。
2. 测试部署只允许配置的 HTTPS origin、固定 `/login/cas` 路径和服务端生成的 `flow` 查询参数；CAS 使用原始 service 验票。
3. DSH Host 以配置的 HTTPS origin 调用服务，不跟随携带 verifier 或应用凭据的跨 origin 重定向，并在每次启动通过 `/me` 在线验证。
4. 任一方报告 API 版本或企业、origin、app_id 绑定不匹配时，企业发行版保持拒绝业务访问并提示修复；普通发行版不加载企业认证。
