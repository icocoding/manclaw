# API 设计

本文档描述 `manclaw` 当前已实现的 MVP API。

## 基础约定

- API 前缀：`/api`
- 健康检查：`/health`
- 返回格式：除 `/health` 外，其余接口统一返回 `ApiResponse<T>`

成功示例：

```json
{
  "ok": true,
  "data": {}
}
```

失败示例：

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "Body.content must be a string."
  }
}
```

## 已实现接口

### `GET /health`

返回服务存活状态和健康快照。

### `GET /api/system/summary`

返回系统摘要。

响应：

```json
{
  "ok": true,
  "data": {
    "services": [
      {
        "id": "openclaw",
        "name": "openclaw",
        "status": "running",
        "message": "Service started successfully."
      }
    ]
  }
}
```

### `GET /api/openclaw/status`

返回当前托管服务详细状态。

关键字段：

- `status`
- `pid`
- `uptimeSeconds`
- `startedAt`
- `command`
- `args`
- `cwd`
- `processName`
- `configPath`
- `healthUrl`
- `healthStatus`
- `detectedBy`

### `POST /api/openclaw/start`

启动托管服务。

### `POST /api/openclaw/stop`

停止托管服务。

### `POST /api/openclaw/restart`

重启托管服务。

这三个接口都直接返回最新的 `ServiceDetail`。

## 配置管理

MVP 当前使用 `JSON` 配置文件，路径默认位于当前启动目录下的 `.manclaw/config.json`。

`service` 相关关键字段：

- `command`: 启动命令，默认 `openclaw`
- `args`: 启动参数
- `processName`: 进程扫描时用于匹配的进程名
- `configPath`: `openclaw` 配置文件路径
- `configFlag`: 启动时附加配置文件的参数名，默认 `--config`
- `healthcheck.enabled`: 是否启用 HTTP 健康检查
- `healthcheck.url`: 健康检查地址
- `healthcheck.timeoutMs`: 健康检查超时
- `healthcheck.expectedStatus`: 期望 HTTP 状态码

### `GET /api/config/current`

读取当前配置。

### `POST /api/config/validate`

校验配置内容但不保存。

请求：

```json
{
  "content": "{\n  \"service\": { ... }\n}"
}
```

### `POST /api/config/save`

保存配置并生成版本记录。

请求：

```json
{
  "content": "{\n  \"service\": { ... }\n}",
  "comment": "Saved from Web UI"
}
```

### `GET /api/config/revisions`

读取配置历史版本。

### `POST /api/config/rollback`

回滚到指定版本。

请求：

```json
{
  "revisionId": "20260319123000"
}
```

## 日志

### `GET /api/logs/runtime?limit=40`

返回运行日志列表。

### `GET /api/logs/audit?limit=40`

返回审计日志列表。

日志项结构：

```json
{
  "id": "uuid",
  "timestamp": "2026-03-19T12:00:00.000Z",
  "level": "info",
  "source": "service",
  "message": "openclaw service started"
}
```

## 受控 Shell

MVP 不提供任意命令执行，只允许预定义命令。

### `GET /api/shell/allowed-commands`

返回允许执行的命令清单。

当前内置命令：

- `service.status`
- `service.start`
- `service.stop`
- `service.restart`
- `system.pwd`
- `system.node-version`
- `logs.tail-runtime`

### `POST /api/shell/execute`

执行受控命令。

请求：

```json
{
  "commandId": "service.restart"
}
```

响应：

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "commandId": "service.restart",
    "status": "completed",
    "startedAt": "2026-03-19T12:00:00.000Z",
    "completedAt": "2026-03-19T12:00:00.500Z",
    "exitCode": 0,
    "output": "..."
  }
}
```

### `GET /api/shell/executions/:executionId`

查询某次执行记录。

## 当前限制

- 配置格式当前为 `JSON`，后续如需 `YAML` 可再扩展
- WebSocket / SSE 实时推送尚未实现，前端目前使用轮询刷新
- 当前进程扫描依赖 `ps`，暂未覆盖 `systemd`、Windows 服务、容器编排环境
