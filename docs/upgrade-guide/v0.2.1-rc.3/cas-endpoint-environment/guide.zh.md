---
kind: upgrade-guide
description: "dsh-pro-auth bundle 不再提供默认 CAS 服务，必须由部署配置提供端点 URL。"
---

# CAS 端点改由部署配置提供

[English](guide.md) | 中文

## 变更

以前 `dsh-pro-auth` bundle 默认使用 Superbpm CAS 登录和验票端点。现在每个部署都必须提供 `casLoginUrl` 和 `casValidateUrl`；缺少或无效端点会阻止 Host 启动。依赖 bundle 默认值的现有 Web profile 和 Desktop 构建会受影响。

## 迁移

1. 在所选 `envs/<环境名>/config.json` 的 `plugins.dsh-pro-auth` 下添加 `casLoginUrl` 和 `casValidateUrl`。
2. 打包 Desktop 时选择该环境。本地 Web 开发时设置 `DSH_CONFIG_ENV_DIR`，并运行 `pnpm run dev:web -- --config-env <环境名>`。
3. 使用其他 Web 启动方式时，将所选端点作为 `DSH_CAS_LOGIN_URL` 和 `DSH_CAS_VALIDATE_URL` 传入，或直接在 `dsh-pro-auth` Cordis 配置中设置这两个字段。
4. 重新构建并安装更新后的 `dsh-pro-auth` bundle，然后确认 Host 能启动且 CAS 登录会访问所选服务。
