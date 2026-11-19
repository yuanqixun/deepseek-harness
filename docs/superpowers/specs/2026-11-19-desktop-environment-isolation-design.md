# Desktop environment isolation design

English | [中文](2026-11-19-desktop-environment-isolation-design.zh.md)

## Intent

Allow the Windows `hxfl`, `hxfluat`, and `superbpm` Desktop builds to install side by side and keep their Harness and Electron data separate. Each build reads its identity and Windows paths from its selected `envs/<name>/config.json`.

## Goals and limits

- Set a first-install directory, a distinct Windows application ID, a `DSH_HOME`, and an Electron `userData` directory for each environment.
- Preserve the existing `hxfl` application identity so its current installation upgrades in place; configure isolated data locations for all three environments.
- Keep the custom install-directory editor; a valid configured directory is a default, while updates continue using the registered location.
- Scope this change to Windows. macOS packaging and its current app identity and data paths remain unchanged.
- Do not copy the formerly shared Harness home into UAT or Superbpm homes; its contents cannot be separated reliably by environment.

## Approaches

1. **Read Windows identity and paths from each environment config (chosen).** `package-target.ts` validates and embeds the selected values; the Windows installer and Desktop startup use those embedded values. This keeps one environment file authoritative and preserves the current installer's path validation and update behavior.
2. **Keep release dotenv files authoritative.** Put per-environment values in packaging presets and pass them separately to the installer. This duplicates deployment identity outside `envs/<name>/config.json` and makes environment selection easier to mismatch.
3. **Derive directories from the product name at runtime.** This avoids config fields but cannot select the requested `D:\...` install paths and makes identity changes silently relocate user data.

## Selected configuration and behavior

Add validated Windows Desktop settings to each environment config: application ID, default install directory, Harness home directory, and Electron user-data directory. Keep the existing `hxfl` Windows application ID `com.deepseek.dsh`; use the configured Harness home `%USERPROFILE%\\.dsh-hxfl` and Electron user-data directory `%APPDATA%\\dsh-hxfl`. Give `hxfluat` the application ID `com.deepseek.dsh.hxfluat` and `superbpm` the application ID `com.deepseek.dsh.superbpm`. Set their Harness homes to `%USERPROFILE%\\.dsh-hxfl-uat` and `%USERPROFILE%\\.dsh-superbpm`, and Electron user-data directories to `%APPDATA%\\dsh-hxfl-uat` and `%APPDATA%\\dsh-superbpm`. Use the configured install defaults `D:\\dsh-hxfl`, `D:\\dsh-hxfl-uat`, and `D:\\dsh-superbpm`. All three configured HXFL data paths replace their previous defaults; existing data remains in the legacy locations and is not moved automatically.

The packager validates the chosen config before building and embeds the normalized Windows settings. The NSIS welcome page uses the configured install directory only for a new installation; its existing checks still require an empty, writable directory on a fixed local drive. Updates keep the registered install directory. Desktop resolves `%USERPROFILE%` and `%APPDATA%` from the current Windows account before setting `DSH_HOME` and Electron `userData`, before Electron becomes ready. Runtime data paths stay outside the program install directory so uninstalling the app does not remove user data.

The installer preserves an explicit `/D=` destination and rejects any selected install path that overlaps the effective Harness home or Electron user-data directory. The uninstaller protects the effective Harness home, including the configured default when no `DSH_HOME` process variable is set. The packaged Python full installer supports one registered per-user runtime, so the three Desktop registrations share one runtime under `%LOCALAPPDATA%\DeepSeek Harness\Python\3.14.10`; application-ID ownership records keep it installed until the last registered Desktop app is removed. Each environment uses an application-ID-scoped updater cache so one uninstall cannot remove another app's pending update.

The install path, effective Harness home, Electron user-data directory, and shared Python runtime must remain separate after Windows environment variables are expanded. Startup and installer preflight reject overlapping paths; uninstall protects both the Harness home and Python runtime while removing Electron data.

Existing data may have been written into the shared legacy Harness home or Electron user-data directory; this design leaves it in those legacy locations and starts all three environments with their configured data paths. It does not guess which historical records belong to which environment. Windows treats the new UAT and Superbpm application IDs as new registrations. Keep the old shared-ID installation because it is the `hxfl` installation; remove only an older UAT or Superbpm registration that has a separate, environment-specific application ID, and only after confirming the isolated installation works.

## Implementation

The implementation validates and embeds the selected configuration, applies the NSIS default while preserving explicit and registered destinations, resolves data paths before Electron readiness, and documents data retention in both languages. The upgrade guide covers the fresh UAT and Superbpm homes and the retained legacy data location.
