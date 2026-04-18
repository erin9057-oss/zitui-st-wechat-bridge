# zitui-st-wechat-bridge

这是一个面向 **SillyTavern（酒馆）** 的中文桥接项目，用于把酒馆里的角色卡、世界书、用户描述与聊天记录，同 `zitui-Wechat-bot` 的工作区、安全配置层和 Memory 体系连接起来。

本仓库包含两部分核心内容。第一部分是酒馆前端扩展，负责显示中文界面、读取酒馆上下文、让用户预览和二次编辑内容。第二部分是酒馆服务器插件，负责受控访问 bot 的工作目录或远端 bridge 接口，执行文件读取、写入、备份、恢复和活跃 Memory 切换。

## 目录结构

| 路径 | 作用 |
|---|---|
| `manifest.json` / `index.js` / `style.css` / `templates/` | 酒馆前端扩展核心文件，已放在仓库根目录，便于直接通过“从 URL 安装扩展”加载 |
| `server-plugin/` | 酒馆服务器插件，负责本地路径模式与 HTTP 模式的桥接访问 |
| `docs/` | 接口约定、数据结构与后续开发文档 |

## 安装方式

本项目需要分成 **前端扩展** 和 **server-plugin** 两步安装。

### 第一步：安装前端扩展

现在可以直接把仓库地址填入 SillyTavern 的 **“从 URL 安装扩展”** 输入框：

```text
https://github.com/erin9057-oss/zitui-st-wechat-bridge
```

之所以这样调整，是因为酒馆的 URL 安装机制要求 `manifest.json`、`index.js` 等核心文件位于仓库根目录；当前仓库已经按该要求重构完成。

### 第二步：安装 server-plugin

请在终端执行：

```bash
bash <(curl -sSL https://raw.githubusercontent.com/erin9057-oss/zitui-st-wechat-bridge/main/install-server-plugin.sh)
```

安装脚本会优先检查以下目录：

| 检查顺序 | 路径 |
|---|---|
| 1 | `~/SillyTavern/plugins` |
| 2 | `~/ST/plugins` |

如果两处都没找到，脚本会提示你输入 **SillyTavern 根目录**。你只需要输入酒馆根目录，**不需要手动输入 `/plugins`**，脚本会自动补上，并且全程使用绝对路径，不依赖你当前在哪个目录执行 `curl`。

如果你想手动指定酒馆根目录，也可以这样运行：

```bash
ST_ROOT=/绝对路径/到/SillyTavern bash <(curl -sSL https://raw.githubusercontent.com/erin9057-oss/zitui-st-wechat-bridge/main/install-server-plugin.sh)
```

## 当前开发目标

当前版本优先完成以下基础能力。

| 模块 | 目标 |
|---|---|
| 前端界面 | 中文抽屉入口、中文多标签模态框、统一状态栏 |
| 配置编辑 | 编辑 `config.json` 与运行策略配置 |
| 角色导入 | 从酒馆角色卡导入到 `IDENTITY.md` 或 `SOUL.md`，写入前强制预览 |
| User 导入 | 从酒馆 Persona / User 描述导入到 `USER.md`，未勾选则不改 |
| Memory 管理 | 浏览、编辑、切换当前启用的 `Memory/*.jsonl` |
| Summary 浏览 | 以人类友好的日记界面浏览 `*-summary.jsonl` |
| Sensor 管理 | 编辑 `sensor_map.json`，查看最近事件和紧急应用规则 |
| 备份恢复 | 强制纳入 `accounts/`、并备份 `config.json`、`sensor_map.json`、`workspace/`、`Memory/` |

## 设计原则

第一，所有面向用户的界面、说明文案和交互提示都使用中文。第二，任何会覆盖用户文件的操作都必须先展示预览或差异对比，再进行确认写入。第三，`accounts/` 虽然不会被插件主动改动，但由于其中包含不可再生的微信鉴权文件，因此会被视为最高优先级备份对象，并且会在恢复与风险提示流程中被重点标记。

## 后续说明

本仓库默认与 `zitui-Wechat-bot-enhanced` 配套使用。前者负责酒馆侧桥接与界面，后者负责把 bot 侧的硬编码参数迁移到配置层，并提供更稳定的 Memory 与 Sensor 运行机制。
