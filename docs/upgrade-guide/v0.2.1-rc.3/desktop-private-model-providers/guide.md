---
kind: upgrade-guide
description: "Private Desktop environments disable the built-in DeepSeek model providers."
---

# Private Desktop model providers

English | [中文](guide.zh.md)

## Change

Desktop packages for `hxfl`, `hxfluat`, and `superbpm` disable the built-in DeepSeek API-key and account model providers. Existing defaults or Sessions that select those routes cannot use them after the upgrade.

## Migration

1. Rebuild and install the Desktop package with the intended `--config-env` environment.
2. Select the environment's configured model for new conversations and any existing Session that selected a DeepSeek route.
3. Confirm Settings → Models shows the enterprise provider and the official DeepSeek provider is absent.
