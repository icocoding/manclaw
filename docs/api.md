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

### `GET /api/openclaw/plugins`

调用 `openclaw plugins list --json`，返回当前插件清单。

关键字段：

- `workspaceDir`
- `loadedCount`
- `totalCount`
- `items`

### `GET /api/openclaw/plugins/:id`

调用 `openclaw plugins info <id> --json`，返回单个插件的实时详情。

适用场景：

- 插件列表展开时按插件查询 tools
- 查看某个插件当前实际注册出来的 `toolNames`

`items` 中每个插件条目包含：

- `id`
- `name`
- `description`
- `version`
- `source`
- `origin`
- `enabled`
- `status`
- `toolNames`
- `channelIds`
- `providerIds`
- `commands`
- `error`

### `GET /api/skills/installed`

调用 `openclaw skills list --json`，返回真实运行时技能清单，并补充 `manclaw` 本地目录里的可管理信息。

补充说明：

- 本地 workspace 技能会标记为 `managementMode=workspace`
- 运行时只读技能会标记为 `managementMode=config`
- `managementMode=config` 的技能可继续复用下面的启用 / 禁用接口；服务端会改写 `openclaw.json -> skills.entries.<slug>.enabled`

### `GET /api/skills/config`

读取当前技能配置中的 `allowBundled`。

### `POST /api/skills/config`

保存 `openclaw.json -> skills.allowBundled`。

请求：

```json
{
  "allowBundled": ["1password", "blogwatcher"]
}
```

关键字段：

- `workspaceDir`
- `managedSkillsDir`
- `installDir`
- `disabledDir`
- `items`

`items` 中每个技能条目包含：

- `slug`
- `title`
- `summary`
- `state`
- `source`
- `bundled`
- `eligible`
- `blockedByAllowlist`
- `manageable`
- `missing`
- `path`
- `version`
- `registry`
- `installedAt`

### `GET /api/openclaw/plugins/feishu-tools`

读取 `channels.feishu.tools` 当前配置，并按 OpenClaw 默认值补齐缺省字段。

关键字段：

- `path`
- `updatedAt`
- `defaults`
- `current`

### `POST /api/openclaw/plugins/feishu-tools`

写回 `channels.feishu.tools` 配置。

请求：

```json
{
  "doc": false,
  "chat": true,
  "wiki": false,
  "drive": false,
  "perm": false,
  "scopes": false,
  "bitable": false
}
```

### `POST /api/openclaw/plugins/:id/enable`

执行 `openclaw plugins enable <id>`，将指定插件写入启用状态。

### `POST /api/openclaw/plugins/:id/disable`

执行 `openclaw plugins disable <id>`，将指定插件写入禁用状态。

### `POST /api/openclaw/plugins/install-command`

执行用户在插件页输入的自定义安装命令。

请求：

```json
{
  "command": "npm exec --yes openclaw plugins install some-plugin"
}
```

说明：

- 服务端会通过 `bash -lc` 直接执行该命令
- 执行目录为当前 OpenClaw workspace
- 返回值为 `ShellExecutionRecord`，包含 `status`、`exitCode`、`output`、`startedAt`、`completedAt`

## 模型配置

当前模型配置页通过结构化接口管理多个模型条目，并显式设置默认模型。

### `GET /api/model-setup/current`

返回模型配置页当前所需的结构化数据。

关键字段：

- `availableProviders`
- `defaultModelId`
- `entries`

`entries` 中每个条目包含：

- `id`
- `provider`
- `model`
- `apiKey`
- `baseUrl`
- `customProviderId`
- `envVarName`

### `POST /api/model-setup/apply`

按“多个模型条目 + 默认模型”结构写回真实 `openclaw.json`。

请求：

```json
{
  "defaultModelId": "openai-gpt-5-2-1",
  "entries": [
    {
      "id": "openai-gpt-5-2-1",
      "provider": "openai",
      "model": "gpt-5.2",
      "apiKey": "sk-xxx"
    },
    {
      "id": "ollama-llama3-3-2",
      "provider": "ollama",
      "model": "llama3.3"
    }
  ]
}
```

服务端会同步维护：

- `models.providers[*].models`
- `agents.defaults.model.primary`

## Agent 管理

当前 Agent 配置页通过结构化接口管理 `agents` 与 `bindings`，直接读写真实 `openclaw.json`。

### `GET /api/agents/current`

返回 Agent 页面当前所需的结构化数据。

关键字段：

- `defaultAgentId`
- `defaults.workspace`
- `defaults.modelPrimary`
- `defaults.compactionMode`
- `availableChannels`
- `items`

`items` 中每个条目包含：

- `sourceId`
- `id`
- `bindings[]`
- `workspace`
- `modelPrimary`
- `compactionMode`
- `tools.profile`
- `tools.allow`
- `tools.deny`

说明：

- 当前阶段默认 Agent 采用 `agents.list` 第一项表示
- 保存时会按默认 Agent 重排 `agents.list`
- `items[*].bindings[]` 会按页面填写重建到 `bindings[*].match`
- 当前结构化绑定规则支持 `channel` 和可选 `accountId`

### `POST /api/agents/save`

按结构化表单写回真实 `openclaw.json` 中的 `agents` 和 `bindings`。

请求：

```json
{
  "defaultAgentId": "main",
  "defaults": {
    "workspace": "~/.openclaw/workspace",
    "modelPrimary": "bailian/qwen3.5-plus",
    "compactionMode": "safeguard"
  },
  "items": [
    {
      "sourceId": "main::1",
      "id": "main",
      "bindings": [
        {
          "id": "main::binding::1",
          "channel": "feishu"
        }
      ],
      "workspace": "",
      "modelPrimary": "",
      "compactionMode": "",
      "tools": {
        "profile": "messaging",
        "allow": ["feishu", "group:plugins"],
        "deny": ["exec"]
      }
    }
  ]
}
```

## Channels 管理

当前 Channels 配置页通过结构化接口管理 `channels` 与对应的 `bindings`，直接读写真实 `openclaw.json`。

### `GET /api/channels/current`

返回 Channels 页面当前所需的结构化数据。

关键字段：

- `availableAgents`
- `items`

`items` 中每个条目包含：

- `sourceId`
- `id`
- `type`
- `configText`
- `bindings[]`

`bindings[]` 中每个条目包含：

- `id`
- `agentId`
- `accountId`

说明：

- `id` 对应 `channels.<id>`
- `configText` 为该 channel 节点对应的 JSON 对象文本
- 保存时会重建页面管理范围内的 `bindings[*].match.channel`
- 当前支持在 Channels 页按 `agentId + accountId` 维护映射关系

### `POST /api/channels/save`

按结构化表单写回真实 `openclaw.json` 中的 `channels` 和对应 `bindings`。

请求：

```json
{
  "items": [
    {
      "sourceId": "feishu::1",
      "id": "feishu",
      "configText": "{\n  \"type\": \"feishu\",\n  \"appId\": \"cli_xxx\"\n}",
      "bindings": [
        {
          "id": "feishu::channel-binding::1",
          "agentId": "support-bot",
          "accountId": "ou_xxx"
        }
      ]
    }
  ]
}
```

### `POST /api/agents/:id/skills/install-one`

把指定 skill 安装到该 agent 的 workspace `skills/` 目录。

说明：

- 这里不是写 `agents.list[].skills` 之类字段
- 按 OpenClaw 官方模型，per-agent skills 来自该 agent 自己的 workspace

请求：

```json
{
  "slug": "summarize"
}
```

### `DELETE /api/agents/:id/skills/:slug`

从指定 agent 的 workspace 中删除该 skill。

### `DELETE /api/agents/:id/sessions`

清空指定 agent 的 session store 与 transcript 文件。

返回：

- `agentId`
- `storePath`
- `clearedFiles`

## 配置管理

MVP 当前使用 `JSON` 配置文件，路径默认位于当前启动目录下的 `.manclaw/config.json`。

`service` 相关关键字段：

- `command`: 启动命令，默认 `openclaw`
- `args`: 启动参数
- `processName`: 进程扫描时用于匹配的进程名；默认 gateway 场景为 `openclaw-gateway`
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

### `POST /api/config/undo-last`

撤回最近一次配置修改，等价于回滚到最新一条 revision。

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
