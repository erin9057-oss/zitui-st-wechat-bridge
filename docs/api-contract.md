# 接口约定（骨架版）

本文件描述酒馆前端扩展与酒馆服务器插件之间的初始接口契约。当前阶段只实现最小骨架，后续会逐步补齐真实文件访问、远端桥接和备份恢复能力。

## 总体原则

前端扩展不直接访问 bot 工作目录，也不直接假设本地路径存在。所有敏感文件访问都通过服务器插件完成。这样可以在同机路径模式与远端 HTTP 模式之间保持一致的前端调用方式。

## 已预留接口

| 方法 | 路径 | 作用 |
|---|---|---|
| `GET` | `/api/plugins/zitui-st-wechat-bridge/health` | 返回插件存活状态 |
| `POST` | `/api/plugins/zitui-st-wechat-bridge/health` | 根据当前模式返回连接检测结果 |
| `GET` | `/api/plugins/zitui-st-wechat-bridge/overview` | 返回总览信息 |
| `POST` | `/api/plugins/zitui-st-wechat-bridge/backup/create` | 创建备份 |
| `GET` | `/api/plugins/zitui-st-wechat-bridge/backup/list` | 列出已有备份 |

## 下一阶段计划补充的接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/config/main` | 读取主配置文件 |
| `POST` | `/config/main` | 保存主配置文件 |
| `GET` | `/config/runtime` | 读取运行策略配置 |
| `POST` | `/config/runtime` | 保存运行策略配置 |
| `GET` | `/workspace/file` | 读取指定白名单文件 |
| `POST` | `/workspace/file` | 写入指定白名单文件 |
| `GET` | `/memory/list` | 列出 full log 与 summary 文件 |
| `GET` | `/memory/read` | 读取某个记忆文件 |
| `POST` | `/memory/save` | 保存某个记忆文件 |
| `POST` | `/memory/activate` | 设置当前启用的 full log |
| `GET` | `/summary/list` | 列出全部 Summary 文件 |
| `GET` | `/sensor/map` | 读取 sensor 映射表 |
| `POST` | `/sensor/map` | 保存 sensor 映射表 |
| `GET` | `/backup/detail` | 读取备份 manifest |
| `POST` | `/backup/restore` | 从备份恢复 |

## 安全边界

所有文件操作都必须遵守白名单，后续只允许访问以下对象。

| 类型 | 白名单范围 |
|---|---|
| 目录 | `accounts/`、`workspace/`、`Memory/` |
| 文件 | `config.json`、`sensor_map.json` |
| 状态文件 | `workspace/plugin_runtime.json`、`workspace/active_memory.json` |

其中 `accounts/` 尽管不会被插件主动写入业务内容，但会被视为最高优先级保护对象，默认纳入备份与恢复机制，并且在所有危险操作前进行强提醒。
