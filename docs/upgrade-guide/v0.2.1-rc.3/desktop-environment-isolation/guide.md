---
kind: upgrade-guide
description: "Windows deployment builds now use separate application identities and data directories for each environment."
---
# Windows Desktop environment isolation

English | [中文](guide.zh.md)

## Change

Windows Desktop builds selected with `--config-env hxfl`, `hxfluat`, or `superbpm` now read their application ID, first-install directory, Harness home, and Electron user-data directory from `desktop.windows` in the matching `envs/<environment>/config.json`. HXFL keeps its existing application ID, while its configured data paths are now `%USERPROFILE%\.dsh-hxfl` and `%APPDATA%\dsh-hxfl`; these replace the previous `%USERPROFILE%\.dshhxfl` and `%APPDATA%\DeepSeek Harness` defaults. Existing data stays in those legacy locations and is not moved automatically. UAT and Superbpm use new application IDs and isolated data paths, with fresh Harness homes.

## Migration

1. Install the HXFL build normally. Its `com.deepseek.dsh` registration remains the HXFL installation. The build now uses `%USERPROFILE%\.dsh-hxfl` and `%APPDATA%\dsh-hxfl`; keep the old data directories until you decide whether to migrate their contents.
2. Install the build made with `--config-env hxfluat` or `--config-env superbpm`. The first-install defaults are `D:\dsh-hxfl-uat` and `D:\dsh-superbpm`; the installer still permits another valid destination. Updates keep the registered location.
3. Confirm each application opens with its intended environment and stores new sessions in its configured Harness home. UAT and Superbpm do not inherit or copy the old shared sessions, settings, or credentials. HXFL's previous Harness and Electron data also remain in their legacy locations; no data migration runs automatically.
4. If a previous UAT or Superbpm build was separately registered with its own application ID, remove that old installation only after confirming the new one works. Do not remove the old shared-ID installation; it is HXFL. Uninstall removes the configured Electron user data but leaves the Harness home.
