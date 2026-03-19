# 开发记录

## 2026-03-19

### 已完成

- 初始化 `pnpm workspace` 根配置
- 建立 `apps/web`、`apps/server`、`packages/shared`、`packages/core` 基础目录
- 创建 Vue 3 + TypeScript + Vite 前端工程
- 创建 Fastify + TypeScript 服务端工程
- 增加共享类型包与核心管理包
- 拆分文档目录，建立架构、API、开发记录文档
- 完成第一阶段 MVP
- 将托管目标切换到真实 `openclaw` 进程与真实配置文件
- 增加 OpenClaw 接入设置、快速模型配置和技能管理页面
- 补齐技能安装、查询、禁用、启用、删除、更新能力
- 补齐主题切换、滚动条、复选框、表单和错误提示等 UI 优化

### MVP 已实现能力

- 服务状态查看
- 服务启动、停止、重启
- 配置读取、校验、保存、版本回滚
- 运行日志与审计日志查看
- 受控 Shell 命令执行
- Vue Web 控制台接入上述所有能力
- 快速写入模型配置到真实 `openclaw.json`
- 技能管理页支持按 ID 查询、直接安装、默认技能安装、启用/禁用/删除/更新

### 当前实现方式

- 运行数据目录：`.manclaw/`
- 配置文件：当前启动目录下的 `.manclaw/config.json`
- 配置版本：`.manclaw/revisions/*.json`
- 运行日志：`.manclaw/runtime.log.jsonl`
- 审计日志：`.manclaw/audit.log.jsonl`
- 默认托管服务：真实 `openclaw` 命令模型
- 状态探测：托管子进程 + 系统进程扫描
- 可选健康检查：HTTP endpoint
- `openclaw` 配置编辑直接作用于 `service.configPath` 指向的真实配置文件
- 技能安装与更新通过 `pnpm dlx clawhub` 执行
- 技能禁用当前通过目录迁移实现：`workspace/skills` -> `workspace/.manclaw-disabled-skills`
- 技能详情查询增加了服务端缓存与 `429` 限流提示

### 本轮新增细节

- 增加“接入设置”表单，允许在页面填写 `openclaw` 可执行文件路径、工作目录、配置文件路径和启动参数
- 修正 `openclaw` 配置传递方式，默认通过 `OPENCLAW_CONFIG_PATH` 环境变量而不是错误的 `--config`
- 增加 `autoStart` / `autoRestart` 能力，`manclaw` 启动时默认自动拉起 `openclaw`
- 增加快速模型配置弹窗，支持常见 provider 和自定义 OpenAI-compatible 接口
- 修复页面轮询覆盖编辑态的问题，避免配置区、接入设置和模型配置在编辑中被刷新重置
- 技能页使用 `vue-router` 独立路由，支持：
  - 查看已安装技能
  - 单输入框进行“查询说明”或“直接安装”
  - 安装默认必装技能包：`self-improving-agent`、`find-skills`、`summarize`、`openclaw-cli`、`openclaw-policy-check`
  - 更新、禁用、启用、删除已安装技能
- 重复安装时返回友好提示，不再直接暴露 `Already installed ...`
- 对技能页错误信息增加醒目告警样式
- 主题保留 `Forge` / `Harbor` 两套，并修正侧栏背景随主题切换
- 调整侧边栏布局顺序，将页面导航放到主题切换上方
- 技能变更后增加重启提醒弹窗，可直接从技能页触发 `openclaw` 重启
- 技能重启提示弹窗优化为：稍后重启和重启成功后都自动关闭弹窗
- 修复技能重启弹窗在重启成功后未关闭的问题
- 排查技能删除问题，确认后端删除接口可用；当前工作区曾同时存在 `Summarize` 与 `summarize` 两个大小写不同的技能目录，容易造成“删除后仍然看到类似技能”的误判
- 技能页增加大小写冲突提示；当存在如 `Summarize` / `summarize` 的重复项时，会在列表顶部和条目内明确警告
- 修复运行日志接口 `GET /api/logs/runtime` 因单条损坏 JSONL 记录导致整体 `500` 的问题；现在会跳过坏行并返回一条系统告警
- 在真实 `openclaw.json` 的 `env` 中补充 `NO_PROXY` / `no_proxy`，加入 `open.feishu.cn`，避免飞书域名继续走代理
- 增加 `openclaw doctor --fix` 受控命令，并在概览页服务控制区提供一键执行按钮
- 修正技能删除逻辑：删除时会一并清理启用/禁用目录中同名但大小写不同的技能变体，并按不区分大小写方式清理 `.clawhub/lock.json`
- 再次验证技能删除链路：手动删除 `summarize` 后，目录、`/api/skills/installed` 和 `.clawhub/lock.json` 已保持一致；若页面仍显示旧项，优先检查前端是否仍在使用旧构建或未刷新状态
- 修复技能删除接口的跨域预检问题：Fastify CORS 现在显式允许 `DELETE` / `OPTIONS`，局域网访问前端时可正常删除技能
- 优化 `server` 控制台日志：关闭 Fastify 默认请求刷屏，改为保留启动日志、错误日志，以及非轮询接口和写操作的摘要日志
- 调整技能页默认技能 badge 的主题色；`Forge` 现在使用更贴合铜色系的已安装/未安装配色，不再复用通用中性色
- 优化技能安装成功提示文案，去掉“已直接安装”这类实现细节，统一改为更自然的产品表达
- 修复技能页默认技能状态不同步的问题；安装、启用、禁用、删除、更新后会同时刷新“已安装技能”和“默认必装技能”两块数据
- 将“需要重启”从技能弹窗改为右上角悬浮操作条；同时把接入设置、模型配置、配置保存与回滚也接入同一套重启提醒
- 将“待重启提醒”持久化到当前启动目录下 `.manclaw/config.json` 的 `ui.restartNotice`；技能页与概览页现在读取同一份提醒，切页后不会丢失
- 精简“需要重启”悬浮条样式：缩小宽度、内边距和按钮文案，并把位置下移，避免遮挡概览页右上角状态区域
- 概览页的重启提示改为内联放在页头操作区，位于“刷新全部”左侧；技能页仍保留悬浮条
- 将重启提示抽成共享组件 `RestartNoticeBar`，概览页与技能页统一复用，只通过 `inline` / `floating` 变体控制位置
- 为共享重启提示组件补充鼠标悬停提示，压缩展示时可通过 hover 查看完整说明内容
- 将技能页的重启提示位置也统一到页头操作区，与概览页保持一致，不再使用单独的悬浮位置
- 前端 API 接入改为默认走同源 `/api` + Vite proxy；开发时不再要求浏览器直接访问 `3000`，仅在显式配置 `VITE_API_BASE_URL` 时才走直连
- 修复 `openclaw` 进程扫描误判：之前 `process-scan` 用字符串包含匹配，可能把 `curl /api/openclaw/status` 之类请求进程误识别成服务本体；现已改为按命令名和参数精确匹配，概览页状态不再乱跳
- 为 1.0 发布补齐单进程启动链路：`Fastify` 现在直接托管 `apps/web/dist`，不再要求额外配 `Nginx`；新增根脚本 `pnpm start`，构建后可直接以一个 Node 进程同时提供 UI 和 API
- 将 `apps/server` 的生产构建改成 `esbuild` bundle，`@manclaw/core` / `@manclaw/shared` 会被打进 `apps/server/dist/index.js`，避免生产运行时再解析 workspace 的 `.ts` 源码
- 实测验证单进程发布：`PORT=3300 pnpm start` 后，`/` 可返回前端页面，`/api/openclaw/status` 可正常返回服务状态
- 将 `manclaw` 默认端口统一调整为 `18300`：服务端默认监听改为 `18300`，Vite proxy 默认目标同步改为 `http://127.0.0.1:18300`，README 与 `.env.example` 的示例地址也已更新
- 明确运行目录隔离规则：`manclaw` 继续按启动目录读写 `.manclaw/`，不强行把开发态和发布态绑定到同一份配置；根目录 `pnpm start` 与 `apps/server` 下的开发启动视为两个独立程序
- 明确 `openclaw` 命令保存策略：默认值保持为 `openclaw`，但接入设置中如果用户改成其他命令名或全路径，会按用户填写原样保存，以支持多版本、多实例和非 PATH 安装方式
- 增加默认启动引导发现：当 `manclaw` 仍处于默认服务配置时，初始化阶段会先执行 `openclaw gateway status`，自动回填 gateway 参数、真实 `openclaw.json` 路径、健康检查地址，并尝试从配置文件中推导 workspace
- 设计并接入 `ManClaw` 品牌图标：新增 SVG 图标资源，已同时用于浏览器 favicon 和左侧品牌区 logo，保持 `Forge` / `Harbor` 两套主题下都可读
- 调整品牌展示：浏览器标题改为 `ManClaw`，左侧品牌区改成图标与 `ManClaw / Claw Console` 横向并排，介绍文案保留在下方
- 继续收品牌排版：左侧品牌区文案改成两行，上方是小号 `ManClaw`，下方单独一行 `Claw Console`
- 继续微调品牌区密度：在保持图标与文字横排的前提下，进一步缩小 `ManClaw` 与 `Claw Console` 字号，避免侧栏顶部显得拥挤
- 增加按页面切换的浏览器标题：首页标题更新为 `ManClaw - Your Claw, Under Control.`，技能页标题更新为 `ManClaw - Skills`
- 增加独立发布目录能力：新增 `pnpm release:prepare`，会自动构建并导出 `release/` 目录，内含 `server/index.js`、`web/dist`、最小 `package.json` 与运行说明，可脱离源码目录独立安装启动
- 调整根级运行入口：源码仓库根目录不再使用 `pnpm start` 直接跑 `apps/server/dist`，改为两步走：先 `pnpm release:prepare` 导出 `release/`，再用 `pnpm preview` 启动 `release/server/index.js`；`start` 保留给 `release/` 目录内的独立运行场景
- 修复根级 `pnpm preview`：为避免 `release/` 目录被上层 pnpm workspace 接管，预览流程改为使用 `npm --prefix release install --omit=dev` 安装独立依赖，再启动 release server
- 调整开发脚本：根级 `pnpm dev:server` 现在会先构建一份 `apps/web/dist`，再启动 `server`；仅做联调时不再要求额外启动 `dev:web`，而前端页面开发仍可单独使用 Vite dev server
- 补充版本规划文档：将独立模型配置页、多 Agents、多 Channels（如多个飞书机器人映射不同能力助手）以及插件安装管理纳入架构文档，当前仅记录方案，不进入本轮开发
- 拆分版本规划文档：将后续版本路线从 `architecture.md` 独立到 `docs/roadmap.md`，README 文档入口与架构文档引用已同步更新
- 发布链路升级：`release/` 输出目录正式改名为 `manclaw-release/`，`release:prepare` 现在会额外产出 `release-artifacts/manclaw-release-v<version>.zip`
- 增加独立安装脚本：新增 `scripts/install-latest-release.py`，支持按 GitHub latest release 自动下载 zip、解压并在目标目录执行 `npm install --omit=dev`
- 增加 shell 安装脚本：新增 `scripts/install-latest-release.sh`，支持按 GitHub latest release 自动下载 zip、解压并在目标目录执行 `npm install --omit=dev`
- 调整根级 `preview`：改为使用 `manclaw-release/` 目录，并已验证 `pnpm preview` 能完成依赖安装并成功启动 release server
- 初始化 Git 仓库并完成首个源码提交；同步补充 `.gitignore`，忽略 `manclaw-release/`、`release-artifacts/` 以及 Python `__pycache__` / `*.pyc` 缓存文件
- 增加 GitHub Actions 发布流水线：推送到 `master` 后自动安装依赖、执行 `typecheck`、构建 `manclaw-release`、生成 zip，并按 `v<version>` 规则重打 tag 与更新 GitHub Release；版本号不变时会直接移动同名 tag
- 增加开源协议：新增根目录 `LICENSE`，项目当前采用 `MIT License`；README 文档入口与根 `package.json` 的 `license` 字段已同步更新
- 调整 README 展示：在首页顶部加入 `ManClaw` logo，并将主标题统一为 `ManClaw`
- 为当前仓库配置本地 Git 代理：按环境变量写入 `.git/config` 的 `http.proxy` / `https.proxy`，便于后续通过代理执行 `fetch` / `push`
- 修复 GitHub Actions 缺少锁文件的问题：取消 `.gitignore` 对 `pnpm-lock.yaml` 的忽略，改为将根锁文件纳入版本控制，便于 CI 正常执行 `pnpm install --frozen-lockfile`

### 当前限制

- 未实现 WebSocket / SSE 实时推送
- 当前进程扫描依赖 `ps`，暂未覆盖 `systemd`、Windows 服务、容器编排环境
- 技能“禁用”尚未写入 `openclaw.json`，而是通过目录迁移实现
- `clawhub` 查询接口存在外部限流，直接安装已绕过详情查询，但“查询说明”仍可能受到 `429` 影响
- 可疑技能的安装策略仍依赖上游 `clawhub` 的安全判定与 `--force` 语义

### 下一步

1. 增强跨平台和服务管理器场景下的 `openclaw` 探测与控制
2. 将当前轮询刷新升级为实时事件推送
3. 将技能禁用状态改造成更贴近 OpenClaw 官方配置的实现，而不是目录迁移
4. 评估是否补充技能搜索、推荐和批量更新能力
