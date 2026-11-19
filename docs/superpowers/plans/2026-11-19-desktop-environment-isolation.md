# Desktop Environment Isolation Implementation Plan

English | [中文](2026-11-19-desktop-environment-isolation.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Windows `hxfl`, `hxfluat`, and `superbpm` Desktop builds install side by side with separate Harness and Electron data.

**Architecture:** Read Windows identity and directory settings from the selected `envs/<name>/config.json`, validate them in a dedicated resolver, and embed normalized settings in packaged metadata and a generated NSIS include. Resolve `%USERPROFILE%` and `%APPDATA%` at Desktop startup before setting `DSH_HOME`, `userData`, `sessionData`, and logs.

**Tech Stack:** TypeScript, Node ESM packaging scripts, Electron, electron-builder, NSIS, JSON environment configuration, Markdown upgrade guides.

**Spec:** `docs/superpowers/specs/2026-11-19-desktop-environment-isolation-design.md`

## Global Constraints

- Scope configured install and runtime data directories to Windows; macOS packaging and existing paths remain unchanged.
- Preserve `hxfl` Windows application ID `com.deepseek.dsh`; use its selected Harness home `%USERPROFILE%\\.dsh-hxfl` and Electron user-data directory `%APPDATA%\\dsh-hxfl`.
- Configure `hxfluat` as `com.deepseek.dsh.hxfluat`, `%USERPROFILE%\\.dsh-hxfl-uat`, and `%APPDATA%\\dsh-hxfl-uat`.
- Configure `superbpm` as `com.deepseek.dsh.superbpm`, `%USERPROFILE%\\.dsh-superbpm`, and `%APPDATA%\\dsh-superbpm`.
- Use first-install defaults `D:\\dsh-hxfl`, `D:\\dsh-hxfl-uat`, and `D:\\dsh-superbpm`; keep directory selection editable and keep upgrades at the registered location.
- The selected HXFL data paths replace the prior defaults; existing files stay in the legacy paths and are not migrated automatically.
- Do not copy or split records from the existing shared Harness home into new UAT or Superbpm homes.
- Preserve the existing Windows installer checks for local fixed drives, writability, free space, and empty or registered directories.

## Review Focus

- Missing or malformed Windows isolation config must stop packaging with a field-specific error; Task 1 owns config validation.
- An unsafe path or unsupported environment-variable token must fail before packaging; Task 1 owns path validation.
- NSIS quoting must preserve spaces and backslashes in a validated install path; Task 2 owns generated settings.
- Updates must retain a registered install path even when the package carries a new default; Task 2 keeps the install default conditional on first install.
- A caller-supplied `/D=` destination must remain effective; Task 2 applies the configured default only when `/D=` and a registered location are absent.
- The configured Python full installer has one per-user product registration; Task 2 shares its runtime with app-ID ownership so one uninstall cannot remove another app's runtime.
- Updater cache writes and cleanup must use the same environment-specific name; Task 2 rewrites the packaged Windows updater metadata and NSIS cache setting together.
- The selected install path, effective data paths, and shared Python runtime must not overlap after environment expansion; Task 2 checks on the target account and protects the Harness home and runtime during uninstall.
- Startup must set both Electron storage paths before readiness while leaving macOS defaults unchanged; Task 3 owns startup ordering.

---

## File Map

- `apps/desktop/scripts/desktop-windows-environment.mjs`: read, validate, and normalize the selected Windows app identity and paths.
- `apps/desktop/scripts/package-target.ts`: load the selected Windows settings and pass the normalized values to the packager.
- `apps/desktop/scripts/electron-builder-config.mjs`: embed runtime settings and emit the generated NSIS configuration.
- `apps/desktop/scripts/installer.nsh`: select the configured target for a new installation while preserving the registered path for updates.
- `apps/desktop/installer/path.nsh`: reject installation paths that overlap effective user-data paths.
- `apps/desktop/installer/uninstall.nsh`: preserve the configured Harness home and shared Python runtime while removing only environment-specific Electron data and updater cache.
- `apps/desktop/scripts/python-runtime-installer.ps1`: coordinate shared Python runtime ownership across installed Desktop identities.
- `apps/desktop/scripts/windows-directory-installer.mjs`: use the selected environment's updater cache name in generated NSIS.
- `apps/desktop/src/main.ts`: resolve packaged Windows storage settings before Electron readiness.
- `apps/desktop/src/desktop-windows-environment.ts`: expand the two supported Windows directory tokens and resolve runtime paths.
- `envs/hxfl/config.json`, `envs/hxfluat/config.json`, `envs/superbpm/config.json`: declare each environment's Windows identity and directories.
- `apps/desktop/README.md`, `apps/desktop/README.zh.md`, `apps/desktop/packaging/README.md`, `apps/desktop/packaging/README.zh.md`: document configuration, data ownership, and installation behavior.
- `docs/upgrade-guide/v0.2.1-rc.3/desktop-environment-isolation/guide.md`, `.zh.md`, `.i18n.yaml`: explain data-directory behavior and legacy registration cleanup.

## Tasks

### Task 1: Define and validate Windows environment settings

**Files:**
- Create: `apps/desktop/scripts/desktop-windows-environment.mjs`
- Modify: `apps/desktop/scripts/package-target.ts`
- Modify: `envs/hxfl/config.json`
- Modify: `envs/hxfluat/config.json`
- Modify: `envs/superbpm/config.json`

- [x] Define `desktop.windows` with `appId`, `installDirectory`, `dshHome`, and `userDataDirectory` fields and reject unknown or missing fields for selected Windows builds.
- [x] Validate reverse-DNS app IDs; require absolute local Windows directory paths; permit only `%USERPROFILE%` and `%APPDATA%` tokens in data paths; reject paths that overlap the application install directory or each other.
- [x] Preserve the current `hxfl` values and set the approved `hxfluat`/`superbpm` IDs and isolated data directories from the spec.
- [x] Load these settings only for a Windows target, overriding `DSH_DESKTOP_APP_ID` from the environment config while leaving macOS configuration unchanged.
- [x] Keep `envs/local/config.json` compatible as a Windows local-build environment without deployment isolation fields; the three deployment environments require the complete `desktop.windows` object.

### Task 2: Embed Windows settings and select the initial install directory

**Files:**
- Modify: `apps/desktop/scripts/electron-builder-config.mjs`
- Modify: `apps/desktop/scripts/installer.nsh`

- [x] Add normalized Windows settings to `extraMetadata` so the installed application can read its `DSH_HOME` and `userDataDirectory` values.
- [x] Generate an NSIS include containing the validated install directory; include it in the custom installer and set `$INSTDIR` to that value only when the installer is not updating a registered installation.
- [x] Include the configured Electron user-data path for the uninstaller so it removes that environment's directory without deleting another environment's data.
- [x] Use an app-ID-scoped updater cache for both updater writes and installer logs, and remove only that cache on uninstall.
- [x] Share the registered Python 3.14.10 runtime and track app-ID ownership so one app's uninstall leaves the runtime installed while another registered app remains.
- [x] Preserve explicit `/D=` paths and reject a selected installation path overlapping resolved Harness or Electron data.
- [x] Leave the existing custom path editor and validation flow intact; updated installs continue using the registered `$INSTDIR`.

### Task 3: Isolate runtime storage before Electron readiness

**Files:**
- Create: `apps/desktop/src/desktop-windows-environment.ts`
- Modify: `apps/desktop/src/main.ts`

- [x] Resolve `%USERPROFILE%` and `%APPDATA%` from the current Windows process environment; reject unresolved tokens or non-absolute results.
- [x] Read `dshDesktopWindowsEnvironment` from packaged `package.json` metadata and set `process.env.DSH_HOME` before Desktop paths or Host startup resolve the Harness home.
- [x] Set Electron `userData` and `sessionData` from `userDataDirectory` before `app.whenReady()`; continue using the current paths on macOS and development builds without packaged Windows settings.
- [x] Keep Windows logs under the configured Electron user-data directory and retain the existing macOS logs path.

### Task 4: Document the environment settings and upgrade impact

**Files:**
- Modify: `apps/desktop/README.md`
- Modify: `apps/desktop/README.zh.md`
- Modify: `apps/desktop/packaging/README.md`
- Modify: `apps/desktop/packaging/README.zh.md`
- Create: `docs/upgrade-guide/v0.2.1-rc.3/desktop-environment-isolation/guide.md`
- Create: `docs/upgrade-guide/v0.2.1-rc.3/desktop-environment-isolation/guide.zh.md`
- Create: `docs/upgrade-guide/v0.2.1-rc.3/desktop-environment-isolation/guide.i18n.yaml`

- [x] Document the `desktop.windows` fields, first-install defaults, runtime data locations, and the distinction between program files and user data.
- [x] State that `hxfl` retains current data, while UAT and Superbpm start with fresh isolated homes and leave historical shared data under the legacy `hxfl` location.
- [x] Explain that the old shared-ID installation remains the HXFL application and must be kept; remove only an older UAT or Superbpm registration with a separate environment-specific ID, after confirming the isolated installation works.
- [x] Write the upgrade guide in both languages and record the translation pairing.

## Verification Note

No product test suite or Windows installer smoke test was added or run under the current session instruction. `pnpm run build` passed; `pnpm run verify-md-wrap` checked 2,266 files; scoped translation-pairing and `git diff --check` passed. `pnpm run doc-sync` was attempted and 42 of 43 gates passed; its translation-pairing gate initially failed because this plan and spec did not yet have Chinese counterparts. Those pairs are now recorded and pass scoped checks. The command also ran the repository's documentation-standard test gate; do not rerun it as part of this implementation.
