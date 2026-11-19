---
kind: upgrade-guide
description: CLI 和 Desktop 现在默认使用不同的 Harness 主目录。
---

# CLI 和 Desktop 的 Harness 主目录

[English](guide.md) | 中文

## 变更

CLI 和 Desktop 启动器现在默认使用 `~/.dshhxfl`，原先使用 `~/.dsh`。非空的继承环境变量 `DSH_HOME` 仍会选择其指定目录。已有数据不会自动迁移。

## 迁移

1. 退出 Desktop 和所有 dsh 进程，然后备份 `~/.dsh`。
2. 如需保留原位置，在启动各应用的环境中将 `DSH_HOME` 设置为 `~/.dsh` 的绝对路径。否则，如果 `~/.dshhxfl` 尚不存在，将 `~/.dsh` 复制到 `~/.dshhxfl`，并保留权限和链接。如果目标已存在，检查两个目录并手动处理，不要覆盖数据。
3. 用相同的 `DSH_HOME` 启动 CLI 和 Desktop，确认所需 profile 和 Session 均可见。检查自定义配置中是否存在指向旧目录的绝对路径。
