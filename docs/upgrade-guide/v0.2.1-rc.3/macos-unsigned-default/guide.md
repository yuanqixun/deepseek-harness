---
kind: upgrade-guide
description: "macOS package commands default to unsigned artifacts; signed releases use explicit signed commands."
---

# macOS package commands now default to unsigned

English | [中文](guide.zh.md)

## Change

macOS package commands previously required signing credentials and produced signed release artifacts by default. They now produce unsigned local artifacts without signing or notarization. This affects fixed-target and generic Desktop package commands, including `build-macos.sh`; unsigned artifacts cannot be uploaded as releases.

## Migration

1. For local builds, keep the existing command, such as `./build-macos.sh` or `pnpm run package:desktop:mac:arm64`.
2. For release artifacts, use `./build-macos.sh --signed` or an explicit signed command such as `pnpm run package:desktop:mac:arm64:signed`. Signed commands still require the configured Apple signing and notarization credentials.
3. Confirm release packaging writes signed artifacts and a completion record before running the matching upload command.
