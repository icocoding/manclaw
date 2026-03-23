<p align="center">
  <img src="./apps/web/public/manclaw-mark.svg" alt="ManClaw logo" width="120" />
</p>

# ManClaw

`manclaw` 是一款面向 `openclaw` 的管理控制面，用来把真实运行环境里的观测、配置、治理和受控操作收拢到一个统一入口。

当前系统功能主要围绕六个维度展开：

1. 多 Profile、多 Agent 管理
2. 模型与通讯渠道管理
3. Agent、Channel、Model 绑定关系
4. 插件与技能管理
5. OpenClaw 服务运行与诊断
6. 最佳实践与治理动作

## 项目结构

```txt
apps/
  web/        # Vue 3 + TypeScript + Vite
  server/     # Fastify + TypeScript
packages/
  shared/     # 共享类型与常量
  core/       # 核心管理逻辑
docs/
  api.md               # API 设计
  roadmap.md           # 版本规划
```

## 文档

- 对外文档：`manclaw-dev/docs/`
- [API 设计](./docs/api.md)
- [版本规划](./docs/roadmap.md)
- [开发记录总览](../manclaw-dev/docs/development-log.md)
- [开源协议](./LICENSE)

当前控制台页面已覆盖：

- `Overview`：当前 Profile、OpenClaw 工作区、配置文件、默认模型、日志与受控命令入口
- `Models`：provider、Model ID、默认模型
- `Agents`：默认 Agent、workspace、bindings、tools、session
- `Channels`：渠道实例与到 Agent 的绑定关系
- `Plugins`：插件列表、启用/禁用、Tools 管理与筛选
- `Skills`：系统技能、工作区技能、安装、更新、启用、禁用、删除与筛选
- `Best Practices`：收紧 Feishu 能力暴露、快速新增 Feishu Channel、一键新增预设 Agent、Session Cleanup、一键更换 Model ID

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
- 触发条件：
  - 推送到 `master` 且提交信息包含 `[release]`
  - 手动触发 `workflow_dispatch`
- 执行动作：
  - `pnpm install --frozen-lockfile`
  - `pnpm typecheck`
  - `pnpm release:prepare`
  - 生成 `release-artifacts/manclaw-release-v<version>.zip`
  - 发布或更新 GitHub Release
  - 版本 release 只上传 `manclaw-release-v<version>.zip`

另外还有一条独立的脚本预发布规则：

- 当 `scripts/install-latest-release.sh` 发生变更时
- 流水线会更新 `scripts` tag
- 并发布一个名为 `scripts` 的 pre-release
- 该 pre-release 只附带 `install-latest-release.sh`
- 不会作为最新正式发布显示

版本 tag 规则：

- tag 名称固定为 `v<package.json version>`
- 只有提交信息包含 `[release]` 时，才会把当前版本 tag 移动到最新提交
- 如果版本号没有变化，现有 tag 和 GitHub Release 会被更新，而不是新建一个版本号

也就是说，`0.1.0` 连续多次提交时，流水线会持续重打 `v0.1.0`

如果要直接用 git 触发正式发布：

```bash
bash scripts/trigger-git-release.sh
```

然后进入 `manclaw-release/` 即可独立安装运行：

```bash
cd manclaw-release
npm install --omit=dev
npm start
```

如果希望安装到全局命令：

```bash
cd manclaw-release
npm install -g .
manclaw start
manclaw status
manclaw check-update
manclaw update
manclaw uninstall
manclaw restart
manclaw stop
```

全局 CLI 默认会把运行数据放到 `~/.manclaw-home`。如果需要自定义目录：

```bash
MANCLAW_HOME=/path/to/manclaw-home manclaw start
```

## 开源协议

本项目采用 [MIT License](./LICENSE)。

如果要自动下载 GitHub 最新 release zip、解压并自动全局安装：

```bash
python3 scripts/install-latest-release.py
```

也可以使用 shell 版本：

```bash
curl -fsSL https://github.com/icocoding/manclaw/releases/download/scripts/install-latest-release.sh | bash
```

不带动作时，shell 脚本会提示你选择“安装”或“卸载”；也可以显式传：

```bash
curl -fsSL https://github.com/icocoding/manclaw/releases/download/scripts/install-latest-release.sh | bash -s -- install
curl -fsSL https://github.com/icocoding/manclaw/releases/download/scripts/install-latest-release.sh | bash -s -- uninstall
```

如果要卸载全局 `manclaw` 并清理运行目录：

```bash
curl -fsSL https://github.com/icocoding/manclaw/releases/download/scripts/install-latest-release.sh | bash -s -- uninstall
```

如果已经装好全局 CLI，也可以直接使用：

```bash
manclaw check-update
manclaw update
manclaw uninstall
```

`manclaw uninstall` 会停止后台服务、卸载全局 CLI，并删除当前 `MANCLAW_HOME`（默认是 `~/.manclaw-home`）。

如果连解压出来的发布目录也一起删除：

```bash
curl -fsSL https://github.com/icocoding/manclaw/releases/download/scripts/install-latest-release.sh | bash -s -- uninstall --target-dir . --remove-files
```

执行完成后可直接使用：

```bash
manclaw start
manclaw status
```

也可以通过环境变量指定仓库：

```bash
MANCLAW_RELEASE_REPO=owner/name python3 scripts/install-latest-release.py
```

```bash
MANCLAW_RELEASE_REPO=owner/name curl -fsSL https://github.com/icocoding/manclaw/releases/download/scripts/install-latest-release.sh | bash
```

如果你是从 fork 仓库发布，请把命令里的仓库改成你自己的，或设置：

```bash
MANCLAW_RELEASE_REPO=your-name/your-fork
```

如果要直接一行安装脚本预发布通道：

```bash
curl -fsSL https://github.com/icocoding/manclaw/releases/download/scripts/install-latest-release.sh | bash
```

## MVP 说明

- 服务端会在当前启动目录生成 `.manclaw/` 运行目录
- 默认配置文件为当前启动目录下的 `.manclaw/config.json`
- 默认按真实 `openclaw` 进程模型工作，使用当前 `service` 实例以及 `services.items[]` 多实例注册表管理和探测服务
- `service.configPath` 会通过环境变量 `OPENCLAW_CONFIG_PATH` 传给 `openclaw`，不再自动追加到启动参数
- 服务在线状态不再只依赖内存中的托管子进程，也会扫描系统进程；可选开启 `service.healthcheck` 做 HTTP 健康检查

默认配置示例：

```json
{
  "service": {
    "id": "default",
    "label": "Default",
    "command": "openclaw",
    "args": [],
    "cwd": ".",
    "env": {},
    "autoStart": true,
    "processName": "openclaw-gateway",
    "configPath": "./openclaw.config.json",
    "healthcheck": {
      "enabled": false,
      "url": "http://127.0.0.1:8080/health",
      "timeoutMs": 3000,
      "expectedStatus": 200
    }
  },
  "services": {
    "items": [
      {
        "id": "default",
        "label": "Default",
        "command": "openclaw",
        "args": [],
        "cwd": ".",
        "env": {},
        "autoStart": true,
        "processName": "openclaw-gateway",
        "configPath": "./openclaw.config.json",
        "healthcheck": {
          "enabled": false,
          "url": "http://127.0.0.1:8080/health",
          "timeoutMs": 3000,
          "expectedStatus": 200
        }
      }
    ]
  }
}
```
