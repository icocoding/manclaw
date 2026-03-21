# 开发记录

## 2026-03-22

### 已完成

- 继续收口 `清空 Session` 的危险按钮样式：在全局变量覆盖之外，再直接对最终渲染的 `.n-button.danger-action` 背景色与交互态做强制覆盖，绕过 `Naive UI` 内部 token 合成，确保 `Harbor` 下也能看到明确变化
- 将 `清空 Session` 改为项目内显式危险样式类 `danger-action`：不再仅依赖 `Naive UI` 的 `warning` 主题 token，而是通过全局 CSS 变量覆盖按钮自身的 `--n-color / --n-border / --n-text-color`，确保 `Forge / Harbor` 两套风格都稳定显示不同的不可撤回操作颜色
- 补齐 `Harbor` 主题下的危险按钮覆盖：除了通用 `warningColor` 之外，再显式覆盖 `Button.colorWarning / borderWarning / textColorWarning` 等组件级 token，确保 `清空 Session` 在 `Harbor` 下也显示预期的琥珀警示色
- 调整主题化危险操作配色：将 `Naive UI` 的 `warning` 按钮色纳入 `Forge / Harbor` 两套主题覆盖，`清空 Session` 这类不可撤回操作现在会随风格切换显示更明确的警示色，同时继续与主操作按钮区分
- 调整“最佳实践 -> Session Cleanup”标题排版：将卡片内的 `AGENT` 标签与 agent 名称改为同一行展示，进一步减少列表纵向占用并增强列表化观感
- 收紧“最佳实践 -> Session Cleanup”列表密度：压缩单条 session 卡片的内边距、行距和按钮高度，并把列表改成固定高度滚动区，避免 session 条目过多时把整块页面持续撑长
- 继续收紧“最佳实践”页内部模块排版：主卡片统一改用相同的纵向节奏与间距，`Session Cleanup` 的条目卡片也改成完整铺满宽度的布局，避免操作条、标题区和内容块宽度观感不一致
- 调整“最佳实践”页面模块布局：为该页单独改成等宽双列网格，不再沿用全局左宽右窄的 `two-column` 比例；桌面端各模块宽度保持一致，窄屏下仍自动回落为单列
- 在“最佳实践”页面新增 `Session Cleanup` 区块：直接列出所有 Agent 的 session store、会话数和 transcript 文件数，并提供逐项 `清空 Session` 操作；清理后会立即刷新列表，便于在调整模型、workspace、skills 或 bindings 后快速重置上下文
- 在“最佳实践”页面补充“清理 Session 时机”提醒：明确当 Agent 的模型、workspace、skills、tools 权限或渠道绑定策略发生变化后，若旧上下文仍干扰新配置，应优先到 Agents 页面执行 `清空 Session`
- 调整“最佳实践 -> Agent Presets”的 workspace 策略：移除手工输入，改成按默认命名规则自动生成，即基于当前默认 workspace 拼接新 Agent ID，减少重复输入
- 在“最佳实践”页面新增 `Agent Presets`：支持一键创建“仅聊天 Agent”和“最小权限 Agent”，会直接写入现有 `agents` 配置，并默认继承当前默认 workspace / 模型，便于后续到 Agents 页面继续补充 bindings 和细节
- 调整“最佳实践 -> 一键新增飞书渠道”的 tools 来源：创建渠道时会优先复用当前飞书 tools 配置；如果尚未配置飞书，服务端接口会自动回退到默认值，因此新增渠道不依赖现有 `channels.feishu`
- 精简 Channels 页面：移除右下角“原始配置联动 / 当前 openclaw.json”只读区，页面聚焦渠道实例、绑定规则与使用建议，不再重复展示原始 JSON
- 调整“最佳实践 -> 一键新增飞书渠道”为带表单版本：需先填写 `App ID` 与 `App Secret`，保存时会生成包含 `enabled/defaultAccount/accounts/tools` 的完整 Feishu 配置结构，随后自动跳转到 Channels 页面
- 在“最佳实践”页面新增“一键新增飞书渠道”操作：会读取当前 `channels`，自动创建一个最小的 `type=feishu` 渠道节点；若 `feishu` 已存在，则自动顺延为 `feishu-2`、`feishu-3`
- 新增飞书渠道后会直接写回真实 `openclaw.json`，并提示用户前往 Channels 页面继续补全 appId、secret 与绑定规则
- 左侧导航改为英文，并将 `Best Practices` 调整到菜单最后
- 去掉插件 `Tools管理` 弹窗中的冗余说明文案，保留必要的“当前无法写回保存”提示

## 2026-03-21

### 已完成

- 新增独立“最佳实践”页面与 `/best-practices` 路由，将插件管理中的 `Feishu Tools` 最佳实践区迁出；插件页现在只保留跳转入口，职责收敛为插件列表、安装与 Tools 管理
- 调整 `Forge` 主题下的 `running` badge 配色：不再沿用偏绿色的通用成功色，改为更贴合铜色系主视觉的运行态颜色；`Harbor` 继续保留青绿色运行态
- Agent 详情编辑中的模型字段改为可选下拉：默认模型和每个 Agent 的 `modelPrimary` 现在直接读取模型配置页的现有条目，按 `provider/model` 形式选择，不再只能手工输入
- 优化工作区技能删除反馈：从 Agent workspace 删除技能后，前端会先立即从当前列表中移除，再异步刷新校准，减少“后端已删除但列表消失较慢”的滞后感
- 调整技能管理页工作区 tab：将“目标 Agent”选择框改为非全宽显示；同时补回工作区技能的实际列表渲染，切换 `工作区技能 / 系统技能` tab 后再次返回时，所选 Agent 的技能项会继续显示并支持删除
- 为技能管理页补充列表就地加载提示：工作区技能和系统技能两个 tab 在尚未读到数据时，会分别显示明确的“正在读取”提示，避免列表区域空白
- 为 Agents 页面补充首次加载提示：在尚未读到任何 Agent 且请求进行中时，列表区会明确显示“正在读取 `agents` 与 `bindings`”，避免空白状态被误解为没有数据
- 补齐非 `managed` 场景下的进程时间展示：服务状态接口现在会按 PID 反查系统进程的启动时间与已运行秒数，因此即使 `openclaw` 不是由当前 `manclaw` 进程直接拉起，概览页也会尽量显示“启动时间”和“运行时长”
- 将概览页中的“服务控制”抽成全局共享组件 `ServiceControlDock`，统一放到左侧导航下方，所有页面都可直接执行 `启动 / 停止 / 重启 / FIX`
- 概览页移除重复的 `openclaw 管理` 区块，避免服务控制入口在导航和页面正文中重复出现

- 开始推进 roadmap 第 3 项“多 Channels 配置”，并将其状态从“未开始”更新为“进行中”
- 新增独立 `Channels` 页面与 `/channels` 路由，支持查看当前渠道实例、可选 Agent 与原始 `openclaw.json` 联动内容
- 新增 `GET /api/channels/current` 与 `POST /api/channels/save`，结构化读取和保存真实 `openclaw.json` 中的 `channels`
- Channels 页面支持新增、复制、删除渠道实例，并直接编辑每个 `channels.<id>` 节点对应的 JSON 对象
- Channels 页面支持按 channel 维护 `agentId + accountId` 绑定规则，保存时会联动重建页面管理范围内的 `bindings[*].match`
- 更新 `README.md`、`docs/architecture.md`、`docs/api.md` 与 `docs/roadmap.md`，同步记录 Channels 配置进入实际实现阶段

- 修复 `openclaw gateway` 运行时的在线状态探测：进程扫描与 service manager 匹配现在会同时识别 `openclaw-gateway` 这类由子命令派生出的真实进程名，避免实际在线却被误判为 `stopped`
- 将托管服务默认进程名调整为 `openclaw-gateway`，并让默认推导跟随启动子命令生成 `<command>-<subcommand>` 形式的进程名
- 新增“撤回上次修改”能力：配置区可直接撤回最近一次 `openclaw.json` 变更；同时回滚前也会先备份当前配置，避免回滚操作本身不可逆
- Agent 详情新增结构化绑定规则编辑：每个 Agent 现在可维护多条 `bindings`，支持 `channel` 与可选 `accountId`，保存时不再把精细绑定信息压平成纯 channel 列表
- 记录 Agent tools `allow/deny` 语义：`allow` 用于收窄首次暴露给模型的能力集合，`deny` 为更高优先级的最终禁止项；后续做 token 缩减时应按“候选集 -> allow 收窄 -> deny 剔除 -> 仅注入剩余能力摘要”的顺序实现，而不是让模型先自行读取完整 Skill 文档
- 在 `manclaw/index.html` 新增独立静态介绍页，以单文件 HTML 形式概述 `ManClaw` 的产品定位、控制面角色与核心能力，便于直接打开预览或单独分发
- 修复静态介绍页中的长路径与内联配置项换行问题：为 `code` 元素补充断词与换行样式，避免窄宽度下路径溢出卡片
- 修复 `apps/web` 概览页“内部配置”等卡片中的长路径换行问题：为通用 `panel__muted` 文案补充断词与换行样式，避免路径在窄宽度下溢出
- 将独立介绍页复制到 `manclaw/index.html`，用于在外部 Web 目录直接复用该静态页面

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
- 调整发布流水线触发规则：只有提交信息包含 `[release]` 时才会继续打包、重打版本 tag 并更新 GitHub Release；同时将 `scripts/install-latest-release.sh` 作为 release 附件一并发布，并在 README 中补充一行安装命令
- 调整安装脚本默认仓库：`scripts/install-latest-release.py` 与 `scripts/install-latest-release.sh` 现在默认指向 `icocoding/manclaw`，远程一行安装不再需要额外传 `--repo`
- 补充 fork 提示：两个安装脚本在回退到默认仓库 `icocoding/manclaw` 时，会明确提示 fork 用户改用 `--repo owner/name` 或 `MANCLAW_RELEASE_REPO`
- 增加脚本专用预发布通道：当 `scripts/install-latest-release.sh` 变更时，GitHub Actions 会单独更新 `scripts` tag，并发布同名 pre-release，仅附带 `install-latest-release.sh`，且不作为最新正式发布展示
- 将 shell 安装脚本改成纯 shell：去掉对 `python3` 和 `readarray` 的依赖，改用 `curl + grep/sed + unzip` 实现，兼容 macOS 默认 Bash 3.2 环境
- 增强 shell 安装脚本交互：安装过程中增加阶段提示，结束时明确打印安装目录、启动命令、换端口启动命令、后续更新命令和默认访问地址
- 为发布包增加全局 CLI：新增 `scripts/release-cli.mjs`，`manclaw-release` 现可通过 `npm install -g .` 提供 `manclaw start|stop|restart|status|logs|info` 命令；安装脚本与 README 已同步补充全局安装和控制方式
- 调整全局 CLI 的运行目录：为避免全局安装目录不可写，`manclaw` 命令默认把运行数据写到 `~/.manclaw-home`，并支持通过 `MANCLAW_HOME` 覆盖
- 调整 skills 命令执行器：把后端所有 `pnpm dlx clawhub` 调用统一改成 `npm exec --yes clawhub -- ...`，并补充“缺少 npm / 无法执行 clawhub” 的中文错误提示，避免前端只看到模糊失败信息
- 调整 `scripts/install-latest-release.sh` 默认安装行为：解压 latest release 后不再只执行目录内依赖安装，而是直接运行 `npm install -g <release-dir>` 完成全局 CLI 安装；README 文案同步更新
- 新增品牌宣传图素材：添加 `docs/assets/manclaw-promo.svg`，基于现有 `ManClaw` 标记产出横版宣传图，可用于 README、发布页或分享封面
- 清理前端未使用依赖：移除 `apps/web` 中未实际接入的 `naive-ui`；同时在 `AGENTS.md` 增加前端约定，明确优先复用现成组件库或项目内已有组件，避免重复手写基础控件
- 继续完成前端组件化：重新接入 `naive-ui`，并将概览页、技能页和重启提示中的主要输入框、文本域、复选框、下拉框和按钮切换为现成组件；同时为 `Forge` / `Harbor` 两套主题补上 `naive-ui` 深色主题覆盖
- 微调 `ManClaw` 品牌图标：将 `apps/web/public/manclaw-mark.svg` 中间 `M` 和两侧钳子提亮，增强在深色背景下的识别度
- 继续微调 `ManClaw` 图标主色：将中间 `M` 和两侧钳子从亮铜色进一步推向金色，提高品牌高光感和封面场景下的视觉穿透力
- 调整 `ManClaw` 图标明暗对比：由于金色主体与背景渐变过近，进一步把中间 `M` 和两侧钳子提到浅金高光区间，增强图标主体与底色的分离度
- 继续优化 `ManClaw` 图标可读性：为中间 `M` 和两侧钳子增加深棕描边，在保留浅金主体的同时拉开与背景的边界，提升 favicon 和品牌位的小尺寸识别度
- 调整接入设置表单布局：将 `autoStart` 和 `autoRestart` 两个复选框改为各占一整行，避免并排时视觉过挤
- 修正接入设置复选框在宽屏下仍会与其他字段同排的问题：新增整行占位类 `field--full`，让 `autoStart` 和 `autoRestart` 始终独占一行
- 重绘 `ManClaw` logo 两侧轮廓：收紧原本偏“翅膀感”的外形，改成更厚、更短、夹口更明确的钳子形态，提升图标语义识别
- 继续重构 `ManClaw` logo 造型：将两侧改为更硬朗的机械钳折线轮廓，并把中间 `M` 的两只脚替换成钳口结构，弱化纯字母感，强化“机械爪”识别
- 继续精简 `ManClaw` logo：移除两侧独立钳子，仅保留中心主体，并放大 `M` 底部两只钳口，让标识更集中、更像单体机械爪
- 重新设计 `ManClaw` logo 主体：放弃分离式外侧结构，改成以大写 `M` 为中心骨架，并让 `M` 两只脚向外长出放大的钳口，统一图形语义为“字母 + 机械爪”
- 继续收紧 `ManClaw` logo 一体感：将 `M` 主体与底部钳口改成连续衔接关系，去掉“后贴部件”观感，统一为一个主轮廓加内层高光的结构

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

## 2026-03-20

### 已完成

- 修正文档记录节奏：后续开发记录按实际日期分段，避免持续堆叠到旧日期下
- 开始按 `docs/roadmap.md` 推进第 1 项“模型配置页独立”
- 新增前端独立模型页面与 `/models` 路由
- 将概览页中的快速模型配置从弹窗改为跳转独立页面入口
- 在独立模型页接入结构化模型表单，并增加当前 `openclaw.json` 内容联动展示
- 将模型配置从“单模型表单”扩展为“多个模型条目 + 默认模型”结构
- 模型页支持新增、删除多个模型条目，并显式选择默认模型
- `/api/model-setup/current` 与 `/api/model-setup/apply` 同步升级为返回/接收 `entries[] + defaultModelId`
- 模型配置写入逻辑改为同时维护 `models.providers[*].models` 与 `agents.defaults.model.primary`
- 概览页模型摘要已兼容新结构，显示默认模型与条目数量
- 将模型页结构改成“模型列表”视图：列表中可直接维护模型 ID、切换默认模型，并按需展开附加配置
- 模型列表新增“新增同类 ID”操作：可复用当前 provider 与附加配置，连续维护多个模型 ID
- 修正模型列表中“展开 / 收起”按钮的布局挤压问题，按钮不再被摘要标签顶乱
- 将模型页进一步调整为“记录 + 可编辑多选模型 ID”结构：同一条记录内通过可编辑 `select` 维护多个模型 ID，默认模型改为单独选择
- 调整模型 ID 多选交互：已选 ID 在下拉列表中不可再次点击取消，只能通过 tag 的 `x` 移除
- 修正模型 ID 新增后在下拉菜单中重复显示的问题：不再把已选 ID 重新作为下拉选项回灌
- 去掉模型 ID 下拉框，改成每个 ID 独立输入行的列表式编辑，支持逐行新增、修改和删除
- 修正模型配置保存会重复累加旧 `models` 数组的问题；现在每次保存都会按当前表单重建并去重 provider 下的模型列表
- 进一步收紧模型保存链路：前端提交前先去重模型 ID，后端按 provider 分组后一次性重建 `models` 数组，避免任何追加式写入残留
- 为模型删除补充后端关联校验：保存前会检查被删除模型是否仍被 `openclaw.json` 其他路径引用，若存在引用则阻止保存并返回引用位置
- 将服务端默认监听地址从 `0.0.0.0` 改为 `127.0.0.1`，默认只接受本机访问；如需对外暴露仍可通过 `HOST` 环境变量覆盖
- 新增 `openclaw plugins list --json` 读取能力，并提供 `GET /api/openclaw/plugins` 只读接口
- 新增前端插件列表页与 `/plugins` 路由，支持查看插件加载状态、tools、channels、providers 和命令摘要
- 优化插件页加载反馈：首次进入时增加明确的“正在读取”提示、空状态提示和错误提示，并修正插件告警文案样式类
- 新增 Feishu tools 配置读写：支持读取和保存 `channels.feishu.tools`，并在插件页提供“仅聊天”预设，便于关闭文档、云盘、Wiki 等无关 tools
- 将插件列表改成 table 视图并支持行展开；同时明确 `disabled` 表示“已发现但未启用”，不是“待安装”状态
- 为插件页增加自定义安装命令输入框：允许用户直接填写安装命令并由后端通过 `bash -lc` 在当前 OpenClaw workspace 执行，同时返回命令输出结果并支持执行后刷新插件列表
- 调整插件页安装命令输入提示为 `openclaw plugins install <path-or-spec>`，并为插件列表增加“全部 / 仅启用 / 仅禁用”筛选及行内启用、禁用操作
- 将插件页 Feishu 预设拆成“仅飞书通道”和“通道 + chat 工具”两种模式，明确区分飞书消息通道与 `feishu_chat` 工具注册
- 为 Feishu tools 配置补充 `bitable` 开关，并同步扩展本机 OpenClaw Feishu 插件支持按 `channels.feishu.tools.bitable` 关闭 `feishu_bitable_*`
- 调整 `manclaw` 托管服务启动环境：默认从子进程环境中剔除 `HTTP_PROXY` / `HTTPS_PROXY` 等代理变量，仅当用户在 `service.env` 中显式设置时才传递，避免 OpenClaw 误走旧代理
- 将插件页的 Feishu tools 管理并入插件列表展开行，在列表内即可直接查看并修改插件 tools 配置
- 为插件列表补充单插件详情查询：展开行时调用 `openclaw plugins info <id> --json` 查询当前插件 tools；同时将 Feishu 的可编辑 tools 操作移到“最佳实践”区
- 收紧插件展开查询策略：禁用插件以及简介中没有 tools 的插件不再触发单插件详情查询，展开区直接说明“无需查询”原因，避免对 `bundled (disabled by default)` 等插件做无意义请求
- 新增独立 `Agents` 页面与 `/agents` 路由，并接入默认 Agent、Agent 列表和原始配置联动展示
- 新增 `GET /api/agents/current` 与 `POST /api/agents/save`，结构化读写真实 `openclaw.json` 中的 `agents` / `bindings`
- Agent 页面支持维护默认 Agent、每个 Agent 的 `channel` 绑定、`model`、`workspace` 与 `compaction`
- Agent 页面支持新增、复制、删除、启用/停用 Agent 条目，并在保存后接入统一“待重启”提醒
- Agent 页面补充“技能能力”区：按每个 agent 的 workspace 展示本地 skills，并支持直接安装/删除该 agent 私有 skills
- 新增 `POST /api/agents/:id/skills/install-one` 与 `DELETE /api/agents/:id/skills/:slug`
- 技能管理页补充只读运行时技能的启用/禁用：对本地目录外的技能，不再只显示“只读”，而是通过 `openclaw.json -> skills.entries.<slug>.enabled` 做开关
- `GET /api/skills/installed` 现在会区分 `managementMode=workspace|config`；前者走目录迁移，后者走配置开关
- 技能管理页进一步拆成 tab 页签：`工作区技能` 与 `系统技能` 分开管理，避免把目录操作和配置开关混在一张表里
- 调整技能页工作区 tab：不再混入任何只读技能，只保留工作区本地技能
- 系统技能 tab 新增输入筛选和 `allowBundled` 多选配置，支持直接保存 `skills.allowBundled`
- 技能页启用/禁用按钮改成差异化颜色：启用用成功色，禁用用警告色
- Agents 页面新增 session 信息展示与“清空 Session”操作，可按 agent 删除 `sessions.json` 与 transcript 文件
- 新增 `DELETE /api/agents/:id/sessions`
- 补充更新 `docs/api.md`、`docs/architecture.md` 与 `docs/roadmap.md`，同步记录多 Agents 配置进入进行中阶段
- 为 Feishu tools 展示补充“配置中启用 / 配置中禁用”两组摘要，避免被关闭的 tools 因运行时未注册而在界面里完全消失
- 修正 Feishu 插件在 `Tools = 0` 时的展开提示：不再显示通用的“简介里没有 tools”，改为明确说明“当前未注册运行时 tools”，并继续展示配置中的启用 / 禁用摘要
- 为所有插件的操作列统一增加 `Tools管理` 按钮，用于直接展开 / 收起当前插件的 tools 区块；启用、禁用按钮保留不变
- 将 `Tools管理` 改成统一弹窗：禁用插件按钮灰掉不可用；启用插件点击后弹窗展示所有 tools。Feishu 支持勾选并保存，其他插件当前先提供只读 tools 列表
- 继续统一插件 tools 交互：`展开` 仅展示插件基本信息，`Tools管理` 统一进入弹窗；操作列改成纵向按钮避免溢出，并收紧弹窗宽度。Feishu 可勾选保存，其他插件先保持同一套勾选布局但暂不开放保存
- 修正统一 tools 弹窗的两个细节：宽度改为直接传给 `n-modal`，避免 `preset=card` 下仍然铺满；非 Feishu 插件补充“当前不能取消勾选并保存”的明确说明
- 调整插件操作列细节：拉开 `Tools管理` 与启用/禁用按钮的间距，并为启用、禁用操作补充二次确认，减少误触
- 将 Feishu 的 `Tools管理` 弹窗收敛为与其他插件一致的结构：去掉弹窗内专属预设按钮，只保留统一的勾选列表与保存区；预设按钮继续保留在右侧最佳实践区
- 进一步精简右侧“最佳实践 / Feishu Tools”区：改成仅保留“一键禁用所有 Tools”按钮；重新开启时引导用户回到插件列表中的 `Tools管理` 弹窗处理
- 补充 Feishu 最佳实践提示文案：明确“一键禁用所有 Tools”仍保留飞书聊天频道，并说明这样做是为避免无关 tools 注入上下文、减少 token 浪费
- 调整模型页“新增记录”交互：按钮文案明确为“追加到列表末尾”，新增后自动滚动并高亮新记录，同时聚焦首个输入框，避免误把旧配置当成新建项覆盖
- 进一步调整模型页新增入口位置：将“新增记录”从列表顶部移到列表底部，保持“先看现有记录，再追加新记录”的顺序，减少把顶部旧配置误认为新建项的概率
- 调整模型页列表纵向留白：拉开模型记录之间的间距，并增加列表底部“新增记录 / 应用模型配置”区域与上方内容的分隔，降低误触和视觉粘连
- 调整技能管理页数据源：`/api/skills/installed` 改为优先读取 `openclaw skills list --json` 的真实运行时技能清单，并合并本地目录元数据；现在可显示 `feishu-doc` 等 OpenClaw 运行时 skills，且仅对本地目录中的技能开放启用/禁用/更新/删除操作
- 调整技能管理页列表布局：将长卡片列表改成 table 视图，把描述、来源、状态、缺失条件与操作收拢到固定列中，减少技能较多时的页面纵向长度
- 继续压缩技能表格的信息密度：将来源列中的原始长文本（如 `openclaw-bundled`）改成更短的中文标签，并把“资格 / 内置 / 拦截”收敛为 badge 展示，减少重复说明
- 调整技能表格来源列宽度：为来源列设置更大的最小宽度，优先容纳“来源 / 资格 / 内置”三枚 badge，减少过早换行
- 修正技能表格 badge 排列方式：将来源列和状态列的 badge 容器从纵向堆叠改为横向自动换行，并继续放宽来源列，避免 badge 一枚一行导致单元格过高
- 调整技能表格来源列文案：按用户要求取消中文翻译，`source`、`eligible`、`bundled`、`blockedByAllowlist` 改为直接显示原字段值，避免界面对 OpenClaw 原始状态做二次解释
- 调整技能表格状态与加载反馈：状态列只保留单一运行状态 badge，将“仅展示”移到操作列，同时补充技能列表首次加载中的明确提示，避免空白时误判为没有数据
- 为技能表格增加“显示只读”筛选 checkbox，默认只展示可管理技能；同时把加载提示改成独立提示块，即使列表为空也能明确看到正在读取运行时技能清单
- 修正所有二次确认按钮点击后不自动关闭的问题：Agents 与 Plugins 页的 `n-popconfirm` 改为受控 `show` 状态，确认后先收起弹层，再执行异步操作
- Agents 页面补充 per-agent `tools` 配置，支持直接编辑 `agents.list[].tools.profile / allow / deny`，按 Agent 粒度限制工具集合
- 移除技能管理页中的技能安装入口，页面职责收敛为查看、启用/禁用和系统技能 allowlist；技能安装统一放到 Agents 页按 agent 处理
- 恢复技能管理页中的安装入口，但改成“先选择 Agent，再安装 skill”，统一复用 per-agent 安装接口，避免再出现全局 workspace 安装语义不清的问题
- 继续对齐技能管理页与 Agents 页：选择 Agent 后，技能页现在会展示与 Agents 页一致的“技能能力”区，包括 resolved workspace、skills 目录、禁用目录和该 Agent 的本地 skills 列表，并支持直接删除
- 将技能安装入口进一步移动到“工作区技能”tab 内，并把工作区技能查询语义收敛为“当前所选 Agent 的 workspace”，让选择 Agent、查看本地 skills、查询说明和安装动作落在同一处
- 调整 Agents 页面新增入口位置：将“新增 Agent”从顶部默认设置区移动到 Agent 详情列表后方，保持“先看现有 Agent，再追加新 Agent”的顺序
- 移除 Agents 页面中的“技能能力”区，避免和技能管理页的 Agent 维度技能入口重复；Agent 页面现仅保留配置项与 session 管理
- 为 Agents 页面补充底部保存入口：在 Agent 详情列表后方与“新增 Agent”并排放置“保存 Agent 配置”，避免编辑详情后还要回到顶部保存
- 为每个 Agent 详情卡片补充就近保存按钮，复用整页保存逻辑，避免编辑单个 Agent 后缺少明显的提交入口
- 调整 Agents 页面底部操作与 session 按钮间距：移除“新增 Agent”旁边的保存按钮，仅保留每张 Agent 卡片内的保存入口；同时拉开 `清空Session` 与上方说明区的间距
- 为每个 Agent 卡片底部保存区补充顶部分割线，和上方的配置分区保持同一视觉节奏
- 继续增强 Agent 卡片底部保存区的独立感：增加与 Session 区的垂直间距，并提升分割线对比度，避免视觉上仍像 Session 区的一部分
- 为 Agents 页面保存按钮补充“脏状态”判断：未编辑时禁用，只有默认设置或 Agent 详情发生变更后才可点击保存
- 修复新建 / 复制 Agent 时输入即失焦的问题：为未保存 Agent 生成稳定的本地 `sourceId`，避免 `v-for key` 随 `Agent ID` 输入变化而触发整卡重建
- 将 Agent 的 `Tools Profile` 从自由输入改成固定下拉，并在后端保存链路补充合法值校验，只允许 `minimal / coding / messaging / full`
- 修正 Agents 配置与 OpenClaw 当前 schema 的兼容性：前后端不再读写 `agents.list[*].enabled`，并移除页面里的“启用/停用”开关与摘要，避免再次生成非法配置

### 当前状态

- roadmap 第 1 项已从“仅记录方案”进入实际实现阶段
- 当前已完成“多个模型条目 + 默认模型”这一步，尚未扩展到主模型 / 备用模型 / 其他用途分组
- 保留服务探测增强方案：在原有 `managed + process-scan` 之外，补充 `systemd` / `launchctl` 探测，并将 `detectedBy` / `managerName` 回传到服务状态接口
