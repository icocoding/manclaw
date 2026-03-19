<p align="center">
  <img src="./apps/web/public/manclaw-mark.svg" alt="ManClaw logo" width="120" />
</p>

# ManClaw

`manclaw` 是一款 `openclaw` 的服务管理工具，当前已落成第一阶段 MVP，覆盖：

- 服务监控与启停控制
- 配置管理与版本回滚
- 运行日志与审计日志查看
- 受控 Shell 命令执行
- Web UI 控制台

## 项目结构

```txt
apps/
  web/        # Vue 3 + TypeScript + Vite
  server/     # Fastify + TypeScript
packages/
  shared/     # 共享类型与常量
  core/       # 核心管理逻辑
docs/
  architecture.md      # 架构设计
  api.md               # API 设计
  roadmap.md           # 版本规划
  development-log.md   # 开发记录
```

## 文档

- [架构设计](./docs/architecture.md)
- [API 设计](./docs/api.md)
- [版本规划](./docs/roadmap.md)
- [开发记录](./docs/development-log.md)
- [开源协议](./LICENSE)

当前已在 [版本规划](./docs/roadmap.md) 中补充后续版本规划，重点包括：

- 独立模型配置页与多模型默认值管理
- 多 Agents 配置
- 多 Channels 配置
- 插件安装与管理

## 启动

当前项目使用 `pnpm workspace`。

如果本机启用了 `corepack`，先执行：

```bash
corepack enable
corepack prepare pnpm@10.0.0 --activate
pnpm install
```

启动开发环境：

```bash
pnpm dev:server
pnpm dev:web
```

其中：

- `pnpm dev:web` 只启动前端 Vite 开发服务器
- `pnpm dev:server` 只启动后端服务

如果需要指定前端请求的 API 地址，可在 [apps/web/.env.example](./apps/web/.env.example) 的基础上创建 `apps/web/.env`：

```bash
VITE_API_BASE_URL=http://127.0.0.1:18300
```

开发模式下，前端默认通过 Vite proxy 把 `/api` 和 `/health` 转发到 `http://127.0.0.1:18300`，所以通常不需要再把 API 地址暴露给浏览器。  
如果后端不在默认地址，可额外配置：

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:18300
```

默认地址：

- Web UI: `http://localhost:5173`
- Server API: `http://localhost:18300`

## 开源协议

本项目采用 [MIT License](./LICENSE)。

## 1.0 发布方式

`manclaw` 现在支持单进程发布，不需要额外的 `Nginx`。生产模式下由 `Fastify` 直接托管前端构建产物。

构建：

```bash
pnpm build
```

启动：

```bash
pnpm release:prepare
pnpm preview
```

`pnpm preview` 会自动：

- 在 `manclaw-release/` 内通过 `npm` 安装生产依赖
- 启动 `manclaw-release/server/index.js`

默认访问地址：

- App: `http://localhost:18300`

发布时只需要：

- `apps/server/dist/index.js`
- `apps/web/dist`
- `node_modules`

如果要换端口：

```bash
PORT=18301 pnpm preview
```

如果你希望把构建产物独立导出到单独目录：

```bash
pnpm release:prepare
```

产物会输出到：

- `manclaw-release/server/index.js`
- `manclaw-release/web/dist`
- `manclaw-release/package.json`
- `release-artifacts/manclaw-release-v<version>.zip`

## Git Pipeline

仓库已增加 GitHub Actions 发布流水线：

- 工作流文件：`.github/workflows/release.yml`
- 触发条件：推送到 `master`
- 执行动作：
  - `pnpm install --frozen-lockfile`
  - `pnpm typecheck`
  - `pnpm release:prepare`
  - 生成 `release-artifacts/manclaw-release-v<version>.zip`
  - 发布或更新 GitHub Release

版本 tag 规则：

- tag 名称固定为 `v<package.json version>`
- 每次推送到 `master` 都会把当前版本 tag 移动到最新提交
- 如果版本号没有变化，现有 tag 和 GitHub Release 会被更新，而不是新建一个版本号

也就是说，`0.1.0` 连续多次提交时，流水线会持续重打 `v0.1.0`

然后进入 `manclaw-release/` 即可独立安装运行：

```bash
cd manclaw-release
npm install --omit=dev
npm start
```

如果要自动下载 GitHub 最新 release zip、解压并安装依赖：

```bash
python3 scripts/install-latest-release.py --repo owner/name
```

也可以使用 shell 版本：

```bash
bash scripts/install-latest-release.sh --repo owner/name
```

也可以通过环境变量指定仓库：

```bash
MANCLAW_RELEASE_REPO=owner/name python3 scripts/install-latest-release.py
```

```bash
MANCLAW_RELEASE_REPO=owner/name bash scripts/install-latest-release.sh
```

## MVP 说明

- 服务端会在当前启动目录生成 `.manclaw/` 运行目录
- 默认配置文件为当前启动目录下的 `.manclaw/config.json`
- 默认按真实 `openclaw` 进程模型工作，使用 `service.command`、`service.args`、`service.processName` 管理和探测服务
- 默认会把 `service.configPath` 通过 `service.configFlag` 追加到启动参数中，便于直接托管真实配置文件
- 服务在线状态不再只依赖内存中的托管子进程，也会扫描系统进程；可选开启 `service.healthcheck` 做 HTTP 健康检查

默认配置示例：

```json
{
  "service": {
    "command": "openclaw",
    "args": [],
    "cwd": ".",
    "env": {},
    "autoStart": true,
    "processName": "openclaw",
    "configPath": "./openclaw.config.json",
    "configFlag": "--config",
    "healthcheck": {
      "enabled": false,
      "url": "http://127.0.0.1:8080/health",
      "timeoutMs": 3000,
      "expectedStatus": 200
    }
  }
}
```
