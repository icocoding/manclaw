# 架构设计

## 技术选型

`manclaw` 采用以 `TypeScript` 为核心的前后端分层架构，兼顾本地运维能力、Web 管理能力和后续扩展能力。

### 推荐组合

- 前端：`Vue 3` + `TypeScript` + `Vite`
- 路由：`Vue Router`
- 状态管理：`Pinia`
- UI 组件：`Naive UI`
- 图表监控：`ECharts`
- 后端：`Node.js` + `TypeScript` + `Fastify`
- 实时通信：当前 MVP 使用轮询，后续可升级到 `WebSocket`
- Shell 执行：`child_process`
- 数据存储：当前 MVP 使用 `JSON` 文件，后续可扩展 `SQLite` / `YAML`
- 日志：文件日志 + 审计日志
- 包管理：`pnpm`
- 工程组织：`pnpm workspace`

### 选择原因

- `TS + Vue` 与项目偏好一致，前后端语言统一，维护成本低
- `Fastify` 适合提供配置管理、日志查询、进程控制等后端能力
- Shell、插件、技能管理更适合放在 Node 服务层，而不是直接放在前端
- 后续如果需要桌面化，可以在保留前端代码的基础上再接入 `Tauri`

## 架构设计

项目采用 `Monorepo` 结构，将 UI、服务端、共享类型、核心能力拆分。

```txt
manclaw/
  apps/
    web/                # Vue Web UI
    server/             # Fastify API 服务
  packages/
    shared/             # 共享类型、协议、常量
    core/               # openclaw 管理核心逻辑
```

### 分层职责

- `apps/web`
  - 提供管理后台界面
  - 展示服务状态、日志、配置和 Shell 能力
- `apps/server`
  - 提供 REST API
  - 管理 `openclaw` 进程与运行状态
  - 负责配置读写、命令执行、日志采集
- `packages/shared`
  - 维护前后端共享的数据结构、错误码、接口类型
- `packages/core`
  - 封装服务管理、配置管理、日志管理和受控命令执行逻辑

## 当前 MVP 落地

第一阶段 MVP 已实现以下闭环：

- 服务状态查看
- 服务启动、停止、重启
- 配置读取、校验、保存、版本回滚
- 运行日志与审计日志查看
- 受控 Shell 命令执行
- Vue Web 控制台

### 当前实现方式

- 运行数据目录：`.manclaw/`
- 配置文件：当前启动目录下的 `.manclaw/config.json`
- 配置版本：`.manclaw/revisions/*.json`
- 运行日志：`.manclaw/runtime.log.jsonl`
- 审计日志：`.manclaw/audit.log.jsonl`
- 默认托管服务：真实 `openclaw` 命令模型
- 状态探测：优先识别当前托管子进程，其次扫描系统进程名
- 健康检查：可选通过 HTTP endpoint 判定 `running` / `degraded`

## 功能模块

### 服务监控

- `openclaw` 服务状态检测
- 进程扫描与 PID 探测
- 可选 HTTP 健康检查
- 进程 PID、启动时间、运行时长展示
- 启动、停止、重启操作
- 运行日志查看

### 配置管理

- 配置文件读取与写入
- 原始配置编辑
- 配置校验
- 历史版本与回滚

### Shell 执行

- 受控命令执行
- 命令输出展示
- 命令审计日志

## Shell 执行安全设计

Shell 能力是核心功能，同时也是主要风险点，当前采用受控执行模型。

- 不直接执行任意用户输入
- 只允许预定义命令
- 记录审计日志
- 支持命令结果查询

如果后续需要完整 Web Terminal，建议：

- 前端：`xterm.js`
- 后端：`node-pty`

## 后端 API 规划

当前已实现：

- `/health`
- `/api/system/summary`
- `/api/openclaw/status`
- `/api/openclaw/start`
- `/api/openclaw/stop`
- `/api/openclaw/restart`
- `/api/config/current`
- `/api/config/validate`
- `/api/config/save`
- `/api/config/revisions`
- `/api/config/rollback`
- `/api/logs/runtime`
- `/api/logs/audit`
- `/api/shell/allowed-commands`
- `/api/shell/execute`
- `/api/shell/executions/:executionId`

## 后续扩展方向

- 将进程探测扩展到 `systemd` / `launchd` / 容器场景
- 引入实时事件推送
- 增加插件系统
- 增加技能系统
- 将配置能力扩展到 `YAML` 和更严格的 schema 校验

## 版本规划

后续版本规划已拆分到独立文档：

- [版本规划](./roadmap.md)
