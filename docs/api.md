# API 设计

本文档描述 `manclaw` 当前已实现的 MVP API。

## 基础约定

- API 前缀：`/api`
- 健康检查：`/health`
- 返回格式：除 `/health` 外，其余接口统一返回 `ApiResponse<T>`

## 访问鉴权

当浏览器或客户端通过 `127.0.0.1` / `localhost` 之外的地址访问 `manclaw` 时，服务端会启用 token 校验。

- token 由 `manclaw` 在启动时自动生成，并写入 `./.manclaw/config.json -> ui.accessToken`
- 启动日志会打印当前 token 和浏览器 / API 的使用方式
- 放行方式：
  - `Authorization: Bearer <token>`
  - `x-manclaw-token: <token>`
  - `?token=<token>`
  - 已建立的会话 cookie
- 对于远程访问，如果服务端没有可用 token，则 `/health`、`/api/*` 和 Web UI 都会拒绝访问

### `POST /auth/session`

为远程 Web UI 建立访问会话。

请求：

```json
{
  "token": "change-me"
}
```

成功响应：

```json
{
  "ok": true,
  "data": {
    "authenticated": true,
    "tokenSource": "config"
  }
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

补充说明：

- 本机通过 `127.0.0.1` / `localhost` 访问时，无需 token
- 远程地址访问时，需要先通过上面的 token 校验

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

### `GET /api/manager/settings`

返回 `manclaw` 当前管理配置，用于接入设置、服务控制和 Profiles 管理。

### `POST /api/manager/settings`

保存完整的 `manclaw` 管理配置。

### `POST /api/manager/profiles`

新增一个命名 profile，并在写入 `manclaw` 配置前先执行 OpenClaw profile 初始化。

请求：

```json
{
  "id": "test01",
  "port": 18790,
  "sourceId": "default"
}
```

或共享另一个 profile 的 workspace：

```json
{
  "id": "test01-lite",
  "port": 18791,
  "workspaceSourceId": "default"
}
```

行为说明：

- 服务端会先执行 `openclaw --profile <id> onboard --mode local --non-interactive --accept-risk ...`
- onboard 成功后，才会把新 profile 写入 `.manclaw/config.json`
- `sourceId` 存在时，会在初始化后复制源 profile 的 `openclaw.json` 和 workspace，并重写目标 profile 的默认 workspace 与 gateway 端口
- `workspaceSourceId` 存在时，新 profile 会直接复用该 profile 的默认 workspace，但不会复制对方的 `openclaw.json`
- `sourceId` 与 `workspaceSourceId` 不能同时设置
- onboard 失败时不会落库，接口直接返回错误信息

### `POST /api/manager/profiles/delete`

删除一个 profile。

请求：

```json
{
  "id": "test01",
  "removeWorkspace": true
}
```

行为说明：

- 至少保留一个 profile
- `removeWorkspace=true` 时，会尝试删除该 profile 对应的默认 workspace
- 若该 workspace 仍被其他 profile 引用，接口会直接报错并阻止删除

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
- `modelId`
- `apiKey`
- `apiKeyConfigured`
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
      "modelId": "gpt-5.2",
      "apiKey": "sk-xxx"
    },
    {
      "id": "ollama-llama3-3-2",
      "provider": "ollama",
      "modelId": "llama3.3"
    }
  ]
}
```

服务端会同步维护：

- `models.providers[*].models`
- `agents.defaults.model.primary`

补充说明：

- 当现有 provider 已配置受控 `apiKey`（例如文件引用或其他非明文结构）时，`GET /api/model-setup/current` 会返回 `apiKeyConfigured=true`
- 这类 provider 在 `POST /api/model-setup/apply` 时，如果请求里没有新的 `apiKey`，服务端会保留原有 secret 配置，不要求重填
- 对于保留下来的已有模型条目，服务端会尽量复用 `models.providers[*].models[*]` 原始对象，避免把额外元数据缩减成只有 `id` / `name`

## Agent 管理

当前 Agent 配置页通过结构化接口管理 `agents` 与 `bindings`，直接读写真实 `openclaw.json`。

### `GET /api/agents/current`

返回 Agent 页面当前所需的结构化数据。

关键字段：

- `defaultAgentId`
- `defaults.workspace`
- `defaults.modelPrimary`
- `defaults.compactionMode`
- `defaults.subagents.*`
- `availableChannels`
- `openClawAgentsUrl`
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
- `subagents.modelPrimary`
- `subagents.thinking`
- `subagents.allowAgents`
- `subagents.maxConcurrent / maxSpawnDepth / maxChildrenPerAgent`
- `subagents.archiveAfterMinutes / runTimeoutSeconds / announceTimeoutMs`

说明：

- 当前阶段默认 Agent 采用 `agents.list` 第一项表示
- 保存时会按默认 Agent 重排 `agents.list`
- `items[*].bindings[]` 保存时会更新受管 binding 的 `agentId`、`match.channel` 和可选 `match.accountId`
- 当前结构化绑定规则支持 `channel` 和可选 `accountId`
- 对于受管 Agent / binding 上未在页面暴露的其他字段，服务端会尽量保留，不因为结构化保存整块抹掉
- `openClawAgentsUrl` 指向 OpenClaw 控制台的 `/agents` 页面；当 `gateway.auth.mode = token` 且配置中存在 token 时，会自动附带 `#token=...`

### `POST /api/agents/save`

按结构化表单写回真实 `openclaw.json` 中的 `agents` 和 `bindings`。

请求：

```json
{
  "defaultAgentId": "main",
  "defaults": {
    "workspace": "~/.openclaw/workspace",
    "modelPrimary": "bailian/qwen3.5-plus",
    "compactionMode": "safeguard",
    "subagents": {
      "modelPrimary": "bailian/qwen3.5-flash-2026-02-23",
      "thinking": "low",
      "maxConcurrent": 8,
      "maxSpawnDepth": 2,
      "maxChildrenPerAgent": 5,
      "archiveAfterMinutes": 60,
      "runTimeoutSeconds": 900,
      "announceTimeoutMs": 90000,
      "allowAgents": []
    }
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
      "subagents": {
        "modelPrimary": "",
        "thinking": "",
        "allowAgents": ["main", "lite"],
        "maxConcurrent": 4,
        "maxSpawnDepth": 2,
        "maxChildrenPerAgent": 5,
        "archiveAfterMinutes": 30,
        "runTimeoutSeconds": 600,
        "announceTimeoutMs": 90000
      },
      "tools": {
        "profile": "messaging",
        "allow": ["feishu", "group:plugins"],
        "deny": ["exec"]
      }
    }
  ]
}
```

说明：

- 当前 `subagents.modelPrimary` 统一按对象形式写回真实配置：`subagents.model.primary`
- 当前已支持默认 `agents.defaults.subagents` 和每个 `agents.list[].subagents` 的结构化编辑，包括默认层与单 Agent 层的 `allowAgents`
- 对于 `subagents` / `subagents.model` 中未在页面暴露的其他字段，服务端会尽量保留
- 当前未在页面暴露 `subagents.model.fallbacks` 或 `tools.subagents.tools` 这类更细分的高级字段

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
- 保存时会更新页面管理范围内 binding 的 `agentId`、`match.channel` 和可选 `match.accountId`
- 对于这些 binding 上未在页面暴露的其他字段，服务端会尽量保留
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

`service / services` 相关关键字段：

- `service`: 当前实例，供服务控制与状态接口直接读取；当前切换由 `service.id` 决定
- `services.items[]`: 多实例服务注册表
- `services.items[].id`: 服务实例 ID
- `services.items[].label`: 服务实例显示名，可选
- `services.items[].command`: 启动命令，默认 `openclaw`
- `services.items[].profileMode / profileName`: 运行 profile；`--dev` 与 `--profile <name>` 不再直接混在参数列表里
- `services.items[].port`: gateway 监听端口；独立于普通参数单独存储
- `services.items[].args`: 业务启动参数，例如 `gateway`、`--log-level debug`，不再直接混入 `--dev`、`--profile`、`--port`
- `services.items[].processName`: 进程扫描时用于匹配的进程名；默认 gateway 场景为 `openclaw-gateway`
- `services.items[].configPath`: 当前实例绑定的 `openclaw.json`
- `services.items[].cwd`: 当前实例的 workspace / 工作目录
- `healthcheck.enabled`: 是否启用 HTTP 健康检查
- `healthcheck.url`: 健康检查地址
- `healthcheck.timeoutMs`: 健康检查超时
- `healthcheck.expectedStatus`: 期望 HTTP 状态码

补充说明：

- `configPath` 不再通过额外参数自动拼到启动命令后，而是统一通过环境变量 `OPENCLAW_CONFIG_PATH` 传递给 `openclaw`
- 依赖 `openclaw` CLI 的辅助接口会继承当前实例的 profile 前缀，例如 `--dev`、`--profile <name>`
- 启动服务时会自动把 `profileMode / profileName / port` 拼回最终 CLI 参数，因此前端参数编辑框只管理普通参数

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
