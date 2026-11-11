---
kind: upgrade-guide
description: "The dsh-pro-auth bundle no longer supplies a default CAS service and requires deployment-provided endpoint URLs."
---

# CAS endpoints move to deployment configuration

English | [中文](guide.zh.md)

## Change

The `dsh-pro-auth` bundle previously defaulted to the Superbpm CAS login and validation endpoints. The bundle now requires each deployment to provide `casLoginUrl` and `casValidateUrl`; a missing or invalid endpoint prevents the Host from starting. Existing Web profiles and Desktop builds that relied on the bundle defaults are affected.

## Migration

1. Add `casLoginUrl` and `casValidateUrl` under `plugins.dsh-pro-auth` in the selected `envs/<environment>/config.json`.
2. Select that environment when packaging Desktop. For local Web development, set `DSH_CONFIG_ENV_DIR` and run `pnpm run dev:web -- --config-env <environment>`.
3. For another Web launcher, pass the selected endpoint values as `DSH_CAS_LOGIN_URL` and `DSH_CAS_VALIDATE_URL` or set both fields directly in the `dsh-pro-auth` Cordis configuration.
4. Rebuild and install the updated `dsh-pro-auth` bundle, then confirm the Host starts and CAS sign-in reaches the selected service.
