---
kind: upgrade-guide
description: "内网 Desktop 环境停用内置 DeepSeek 模型提供方。"
---

# 内网 Desktop 模型提供方

[English](guide.md) | 中文

## 变更

`hxfl`、`hxfluat` 和 `superbpm` 的 Desktop 安装包停用内置 DeepSeek API Key 和账号模型提供方。升级后，原先选择这些通道的默认模型或会话无法继续使用这些通道。

## 迁移

1. 使用目标 `--config-env` 环境重新构建并安装 Desktop。
2. 为新会话和已选择 DeepSeek 通道的现有会话选择该环境配置的模型。
3. 确认“设置 → 模型”显示企业提供方，且不再显示官方 DeepSeek 提供方。
