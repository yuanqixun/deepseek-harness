---
kind: upgrade-guide
description: "macOS 打包命令默认生成未签名产物；签名发布使用显式签名命令。"
---

# macOS 打包命令现在默认不签名

[English](guide.md) | 中文

## 变更

macOS 打包命令此前默认要求签名凭据并生成签名发布产物。现在它们默认生成未签名本地产物，不执行签名或公证。固定目标命令和通用 Desktop 打包命令（包括 `build-macos.sh`）均受影响；未签名产物不能用于发布上传。

## 迁移

1. 本地构建继续使用原命令，例如 `./build-macos.sh` 或 `pnpm run package:desktop:mac:arm64`。
2. 发布构建使用 `./build-macos.sh --signed` 或显式签名命令，例如 `pnpm run package:desktop:mac:arm64:signed`。签名命令仍要求配置 Apple 签名与公证凭据。
3. 运行对应的上传命令前，确认发布打包生成了签名产物和完成记录。
