---
kind: upgrade-guide
description: CLI and Desktop now default to a different Harness home directory.
---

# CLI and Desktop Harness home

English | [中文](guide.zh.md)

## Change

CLI and Desktop launchers now default to `~/.dshhxfl` instead of `~/.dsh`. A nonempty inherited `DSH_HOME` still selects its configured directory. Existing data is not moved automatically.

## Migration

1. Quit Desktop and all dsh processes, then back up `~/.dsh`.
2. To retain the existing location, set `DSH_HOME` to the absolute path of `~/.dsh` in the environment that starts each application. Otherwise, if `~/.dshhxfl` does not already exist, copy `~/.dsh` to `~/.dshhxfl`, preserving permissions and links. If it already exists, inspect both directories and reconcile them manually instead of overwriting data.
3. Start CLI and Desktop with the same `DSH_HOME` and check that the expected profiles and sessions appear. Check custom configuration for absolute paths to the old directory.
