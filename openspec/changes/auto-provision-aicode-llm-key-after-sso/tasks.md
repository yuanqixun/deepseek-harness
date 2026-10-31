# Tasks

## DSH 主仓

- [ ] 1.1 定义按环境显式启用的 aicode 接入配置；校验 aicode-app-dsh origin、请求超时、有限重试次数和退避策略，普通 profile 不装配该集成。
- [ ] 1.2 通过既有 `/dsh-auth` 提交 CAS Ticket 和回调 service 取得 Aicode OAuth2 Token，再调用本人 ensure API；不新增换票服务、身份断言或 DSH 登录服务。
- [ ] 1.3 接入模型凭据解析；手工 Key 优先，自动 Key 使用按当前 Aicode 用户和环境隔离的凭据记录；仅在手工 Key 缺失时写入该环境配置的模型 Key 引用，并在用户切换时清理插件仍拥有的值。
- [ ] 1.4 在私有 `dsh-pro-auth` 集成登录后准备、状态显示和手动重试；登录不等待 API 响应，模型请求复用同一在途 ensure。
- [ ] 1.5 为明确的自动 Key 凭据拒绝增加一次 ensure 刷新；原模型请求不重放，后续请求使用更新值。
- [ ] 1.6 覆盖未启用、手工 Key、有/无 Key、无效 Aicode Token、账号切换、环境切换、有限重试、不可恢复旧密文和敏感信息脱敏。
- [ ] 1.7 分别构建普通版及选定企业 Desktop 包，确认只携带选定环境的非敏感配置。

## aicode-cloud OpenSpec

- [ ] 2.1 新增 `dsh-sso-llm-key-provisioning` 规格，记录现有 CAS SSO Token 与 DSH Key 管理之间的 ensure API 契约。
- [ ] 2.2 运行 `openspec validate auto-provision-dsh-llm-key-after-sso --strict --no-interactive`。

## `aicode-app-dsh`

- [ ] 3.1 新增 OAuth2 认证的 `POST /admin-api/dsh/llm-key/client/ensure`，从当前认证上下文解析用户；不接受 userId/username 覆盖，不要求用户 apply 权限。CAS SSO 签发管理员类型 Token，必须使用 `/admin-api` 路由。
- [ ] 3.2 实现本人 Key ensure：已有可恢复 Key 时只返回当前 Key；Key 缺失且 TokenHub 不存在旧 Key 时创建；存在旧 Key 但本地密文缺失时返回明确状态，不轮转或重复创建。
- [ ] 3.3 以用户为粒度串行化操作并支持稳定 `requestId`；覆盖首次并发、重放和 TokenHub 结果不确定场景。
- [ ] 3.4 复用现有密文保存和脱敏逻辑，只在已认证本人响应中返回明文；检查响应、异常、日志和审计脱敏。
- [ ] 3.5 验证 Gateway 现有 client 路由覆盖新接口且强制 Aicode OAuth2 认证；执行后端定向测试与独立构建。
