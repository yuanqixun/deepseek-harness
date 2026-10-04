# Private Desktop CAS Login Remaining Work Implementation Plan

English | [中文](2026-09-30-private-desktop-cas-login-remaining.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the unchecked implementation items for `add-private-desktop-cas-login` across `sso-cas/dsh-auth` and `deepseek-harness`, while reserving real CAS, cloud deployment, and release-package integration evidence for the later cloud phase.

**Architecture:** Follow the OpenSpec task order and preserve the split between the remote dsh-auth service, generic DSH admission, Desktop bootstrap, and the private enterprise plugin. Finish each code-bearing phase with its locally available static/build/database evidence, but leave any checklist item unchecked when its required CAS, multi-instance, Desktop package, or cloud evidence has not been collected.

**Tech Stack:** Spring Boot, PostgreSQL, Spring Session JDBC, CAS 2.0, TypeScript, Cordis, DSH Host/Desktop build tooling, OpenSpec.

**Spec:** `openspec/changes/add-private-desktop-cas-login/{proposal.md,design.md,api-v1.openapi.yaml,specs/**,tasks.md}` and `implementation-traceability.md`.

## Global Constraints

- No TokenHub integration, permissions, quotas, or model-key behavior is added.
- Do not use in-memory state for production login, browser-flow, or app-session state.
- Do not mark a task complete until every acceptance condition in `tasks.md` has evidence.
- Cloud CAS browser validation, multi-instance races, real Desktop release-package checks, and cross-project acceptance are deferred until cloud deployment; record these as pending rather than simulated.
- Preserve existing dirty changes in both repositories; do not reset, clean, overwrite unrelated files, commit, push, or remove Docker volumes.
- Keep App1 as a demo application and keep ordinary DSH distributions unchanged.
- After each phase, update the OpenSpec task ledger and progress summary, then report the next recommended phase.

## Review Focus

- Invalid enterprise configuration must fail closed at startup; cover the invalid/missing configuration cases in the dsh-auth configuration work.
- A delayed CAS callback must not restore a cancelled or expired request; cover locally testable state transitions and defer real CAS callback evidence.
- An exchanged token must never be returned twice, including after a lost response; implement the atomic transaction now and defer PostgreSQL concurrency/lost-response evidence if not locally executable.
- Missing or disposed required admission providers must not open business routes; cover with generic Host tests before adding the enterprise provider.
- Ordinary builds must not include enterprise auth or contact CAS; verify this in the build-composition phase.

---

## Source Map and Phase Boundaries

- `sso-cas/dsh-auth/src/main/java/**`, `src/main/resources/**`, `README.md`, and `docker-compose.yml` own server configuration, persistence, API, browser flow, and deployment instructions. Existing dirty edits are the starting point and must be preserved.
- `openspec/changes/add-private-desktop-cas-login/tasks.md`, `implementation-handoff.md`, and `implementation-traceability.md` own cross-repository status and evidence links.
- DSH generic admission belongs in the existing Host services and direct HTTP/file/terminal/WebSocket/background execution owners identified by repository architecture and task 5. Do not put CAS-specific policy in generic Host packages.
- Desktop bootstrap and recovery changes belong in existing Desktop launch, welcome, recovery, and packaging owners from tasks 6 and 9.
- `pro/dsh-pro-auth/{share,hxfl,superbpm}` owns the versioned protocol, Host/Client plugin, and enterprise-specific composition from tasks 7–8.

## Execution Phases

### Phase 1 — dsh-auth persistence and request lifecycle (tasks 2.1–2.5)

- [ ] Reconcile the current module against task 2.1 and OpenAPI configuration limits; fix the `app_id` 128-vs-255 mismatch, explicit invalid-configuration failures, and health behavior. Update server configuration/docs with the code.
- [ ] Complete versioned schema constraints and transactional request/browser-flow/session operations. Keep CAS HTTP interaction behind a narrow service seam so transaction behavior can be checked without a cloud CAS instance.
- [ ] Complete create/status/cancel validation, retry binding, proof checks, rate limits, database-time expiry, terminal-state retention, and cleanup.
- [ ] Update dsh-auth module/deployment docs alongside the persistence and request lifecycle implementation.

**Phase exit evidence:** dsh-auth compiles; migrations and Compose configuration are valid; local PostgreSQL startup/health is recorded. No cloud CAS test is required in this phase. Do not mark concurrency acceptance complete without its required controlled database test.

### Phase 2 — CAS browser authorization implementation (tasks 3.1–3.5)

- [ ] Finish CSRF-protected authorization start, per-flow browser binding, no-GET-approval behavior, and same-browser serialization.
- [ ] Finish fixed HTTPS callback construction, exact CAS service registration, raw service preservation, CAS 2.0 validation-result mapping, and finite network/XML failures.
- [ ] Finish atomic flow processing, conditional request transitions, account/match-code/device confirmation, refusal, and safe HTML rendering.
- [ ] Finish cookie/cache/referrer settings, reverse-proxy log redaction guidance, ticket cleanup redirects, and operator-facing cloud CAS setup instructions.

**Phase exit evidence:** static/build checks and locally available page/config checks. Real CAS ticket round trips, proxy-log observation, and cross-instance delayed-callback races remain unchecked for cloud deployment.

### Phase 3 — Application sessions and deployment semantics (tasks 4.1–4.4)

- [ ] Implement single-use approved-request exchange, opaque token digest storage, `/me`, revoke, fixed expiry, and error responses consistent with OpenAPI (`invalid_token`, HTTP 401).
- [ ] Verify transactions, identity/app binding, expiry, and revoked-token rejection with the available database evidence; leave lost-response and concurrency acceptance open if not proven.
- [ ] Document response loss, database outage, and the difference between application logout and CAS logout; inspect logs and stored values for verifier, service ticket, or plaintext app token leakage.

**Phase exit evidence:** build and locally available database checks. Controlled race/lost-response acceptance remains open if not run; no cloud CAS test is needed.

### Phase 4 — Generic Host admission and safe drain (tasks 5.1–5.7)

- [ ] Inventory direct HTTP, file, terminal, WebSocket, subscription, queued-input, scheduler, model-step, tool-execution, and subagent entry points before editing them.
- [ ] Define the generic required-provider service and revocation lifecycle; missing/disposed providers fail closed only for builds declaring required admission.
- [ ] Connect admission to each business entry point while retaining local transport authentication and minimal diagnostic/stop/drain operations.
- [ ] Add entry-coverage enforcement, focused tests/snapshots required by the proposal, and update owning README/JSDoc/architecture docs.

**Phase exit evidence:** focused Host tests and static gates for all enumerated entry points; no CAS dependency.

### Phase 5 — Desktop launch, recovery, and bootstrap (tasks 6.1–6.4)

- [ ] Pass immutable required-auth policy from the Desktop launcher to Host, independent of user-editable bundle configuration.
- [ ] Add a restricted bootstrap surface and generic repair state when the provider is unavailable.
- [ ] Connect native welcome, workspace entry, startup recovery, and authentication-generation checks without changing ordinary Desktop flow.
- [ ] Update Desktop docs and focused launch/recovery snapshots.

**Phase exit evidence:** focused Desktop/Host tests and applicable local build. Real enterprise package validation stays in Phase 7/8.

### Phase 6 — dsh-pro-auth Host plugin (tasks 7.1–7.7)

- [ ] Establish the private workspace package with share/host/client and hxfl/superbpm composition, face-specific TypeScript configs, Cordis bundles, and precise workspace/build registration.
- [ ] Implement versioned protocol parsing, HTTPS origin restrictions, timeout behavior, device/request/verifier lifecycle, browser launch, polling/backoff, cancel, and one-time exchange.
- [ ] Persist versioned credentials through Host credentials; revalidate online at startup and every protected operation; implement fail-closed generations, revoke, and account switching.
- [ ] Provide executable profile/overlay examples and documentation for credential scope, same-OS-user limitations, shared local data, and no TokenHub behavior.

**Phase exit evidence:** clean install, face typechecks/build, focused protocol/lifecycle tests, and profile-resolution checks. Cloud service availability is not simulated as an acceptance substitute.

### Phase 7 — Client auth experience (tasks 8.1–8.3)

- [ ] Implement localized login, matching-code confirmation, browser launch, polling/cancel, profile, unavailable/expired, and local/remote logout states using existing Client UI primitives.
- [ ] Connect the UI to the generic Desktop bootstrap and account entry; expose only safe Host state and never verifier/token values.
- [ ] Add component tests, keyboard/retry/error coverage, locale updates, and UI snapshots required by repository policy.

**Phase exit evidence:** focused Client tests/snapshots and Client build; no cloud CAS needed.

### Phase 8 — Enterprise build composition and upgrade compatibility (tasks 9.1–9.4)

- [ ] Add explicit hxfl/superbpm build selection and validated non-secret configuration.
- [ ] Include selected plugin and Client assets in Desktop packaging, profile persistence, upgrade rebuild, and repair/recovery paths; make missing required inputs fail the enterprise build.
- [ ] Stage only common code plus the selected enterprise config; prove ordinary build excludes enterprise auth and CAS calls.
- [ ] Add compatibility failure checks and update upgrade/build instructions.

**Phase exit evidence:** local enterprise and ordinary build artifacts can be inspected. Installed-package smoke and rollback rehearsal remain pending unless available locally without external services.

### Phase 9 — Cloud CAS and cross-project acceptance (tasks 10.1–10.5)

- [ ] After deployment, run real CAS 2.0 browser login, existing-SSO confirmation, exchange, `/me`, revoke, restart, and service-ticket/log-redaction checks.
- [ ] Run multi-client, multi-tab, multi-instance, cancel/expiry/exchange races, and lost-response acceptance with isolated fixtures.
- [ ] Run actual enterprise and ordinary Desktop package admission/recovery checks and secret-leak review.
- [ ] Record exact versions, commands, and redacted evidence; run strict OpenSpec validation and only then mark eligible tasks complete or archive.

**Phase exit evidence:** real cloud CAS and packaged Desktop evidence. Until collected, tasks 10.1–10.5 remain unchecked.

## Decisions / Rulings

- Implementation proceeds in the proposal's task order, but code completion and acceptance completion remain separate. This avoids falsely claiming cloud-only requirements based on local mocks.
- User's instruction to defer integration testing overrides any default expectation to run CAS integration tests locally. Safe compilation, configuration validation, and non-CAS focused checks remain in scope when each phase is implemented.
- No Git commit or push is part of this request.

## Self-Review

- Spec coverage: phases 1–9 map tasks 2.1–10.5 in order; tasks 1.1–1.3 are already checked and are not repeated. Existing task 2.5 evidence is retained and may be re-opened only if implementation changes invalidate it.
- Step scan: phase actions are grouped by independently reviewable subsystem; exact code-level signatures will be derived from the owning source and OpenAPI when each task starts.
- Review focus: all five high-risk cases above are assigned to the owning phase; cloud-only acceptance stays explicitly pending.
- Proportion: this plan is a phase map for a large multi-repository proposal, not a substitute for the OpenSpec task checklist or cloud acceptance record.
