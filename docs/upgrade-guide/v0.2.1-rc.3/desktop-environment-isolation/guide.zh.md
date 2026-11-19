---
kind: upgrade-guide
description: "Windows 部署构建现在为每个环境使用独立的应用标识和数据目录。"
---
# Windows Desktop 环境隔离

[English](guide.md) | 中文

## 变更

通过 `--config-env hxfl`、`hxfluat` 或 `superbpm` 选择的 Windows Desktop 构建，现在从对应 `envs/<环境名>/config.json` 的 `desktop.windows` 读取应用标识、首次安装目录、Harness 主目录和 Electron 用户数据目录。HXFL 保留现有应用标识，但配置的数据路径改为 `%USERPROFILE%\.dsh-hxfl` 和 `%APPDATA%\dsh-hxfl`，取代之前的 `%USERPROFILE%\.dshhxfl` 和 `%APPDATA%\DeepSeek Harness` 默认值。已有数据仍留在旧目录，不会自动迁移。UAT 与 Superbpm 使用新的应用标识和独立数据路径，Harness 主目录初始为空。

## 迁移

1. 正常安装 HXFL 构建。其 `com.deepseek.dsh` 注册仍属于 HXFL；该构建现在使用 `%USERPROFILE%\.dsh-hxfl` 和 `%APPDATA%\dsh-hxfl`。确认是否需要迁移旧数据之前，请保留原目录。
2. 安装使用 `--config-env hxfluat` 或 `--config-env superbpm` 打包的构建。首次安装默认目录为 `D:\dsh-hxfl-uat` 和 `D:\dsh-superbpm`；安装程序仍允许选择其他有效目录。更新沿用已登记位置。
3. 确认每个应用都连接到预期环境，并将新会话写入配置的 Harness 主目录。UAT 与 Superbpm 不继承或复制旧共享会话、设置或凭据。HXFL 的旧 Harness 和 Electron 数据也留在原目录，不会自动迁移。
4. 如果旧版 UAT 或 Superbpm 使用独立应用标识单独注册，请先确认新安装正常，再移除旧安装。不要移除旧的共享标识安装，它属于 HXFL。卸载会删除配置的 Electron 用户数据，但保留 Harness 主目录。
