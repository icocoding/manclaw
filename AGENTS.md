# AGENTS

## 项目定位

`manclaw` 是一款面向 `openclaw` 的服务管理工具，目标能力包括：

- 服务监控
- 配置管理
- 插件管理
- 技能管理
- Shell 执行
- Web UI

项目当前处于骨架阶段，重点是先把基础架构、后端能力和前端管理台打稳。

## 技术栈约定

- 前端：`Vue 3` + `TypeScript` + `Vite`
- 状态管理：`Pinia`
- 路由：`Vue Router`
- 后端：`Node.js` + `TypeScript` + `Fastify`
- 包管理：`pnpm workspace`
- 共享代码：`packages/shared`
- 核心逻辑：`packages/core`

除非有明确理由，不要偏离这套技术路线。

## 目录约定

```txt
apps/
  web/        # 前端管理台
  server/     # 后端服务
packages/
  shared/     # 共享类型、常量、协议
  core/       # openclaw 核心管理逻辑
docs/
  architecture.md
  api.md
  development-log.md
```

新增模块时，优先保持以下原则：

- UI 放在 `apps/web`
- API 与系统能力放在 `apps/server`
- 可复用类型放在 `packages/shared`
- 领域能力放在 `packages/core`
- 设计说明和过程记录放在 `docs/`

## 开发原则

### 1. 先服务端，后界面细化

`manclaw` 的核心价值不在静态页面，而在真实的服务管理能力。开发顺序优先：

1. `openclaw` 进程探测与状态采集
2. 配置文件读写与校验
3. Shell 安全执行
4. 插件与技能生命周期管理
5. 前端接入与交互完善

### 2. 安全优先

Shell 执行、高权限操作、配置写入都必须按受控模型设计：

- 不直接拼接用户命令
- 优先使用预定义命令或白名单
- 记录审计日志
- 支持超时、中断、错误回传

### 3. 保持类型共享

前后端交互的数据结构优先定义在 `packages/shared`，避免前后端各写一套。

### 4. 小步推进

每次改动优先完成一个可闭环的小目标，例如：

- 加一个真实的健康检查接口
- 加一个配置读取接口
- 接通一个 Dashboard 状态卡片

不要一口气铺开整套插件系统但没有任何可运行结果。

## 代码风格约定

### 命名

- 文件和目录优先使用 `kebab-case`
- TypeScript 类型、接口、类使用 `PascalCase`
- 变量、函数、组合式函数使用 `camelCase`
- 常量使用 `UPPER_SNAKE_CASE`
- 接口命名不要加无意义前缀，不使用 `IUser` 这类形式

### 前端

- Vue 组件优先使用 `script setup`
- 页面组件放在 `views/`
- 可复用 UI 组件后续放在 `components/`
- 前端开发优先复用现成组件库或项目内已有组件；只有在现成组件明显不满足需求时，再补自定义基础控件
- 页面状态优先放在 `Pinia` 或组合式函数中，不要把业务逻辑堆在模板里
- 样式优先保证结构清晰和可维护，避免内联样式泛滥

### 后端

- 路由层只做参数处理和响应组织
- 业务逻辑尽量下沉到 `packages/core` 或独立 service 模块
- 与系统、进程、文件、Shell 交互的代码要有明确边界
- 所有外部输入都要校验，所有关键操作都要有错误处理

### 共享代码

- API 请求和响应类型统一定义在 `packages/shared`
- 不要在前端和后端重复声明相同结构
- 能抽成纯函数的逻辑，不要直接耦合到框架对象上

## 提交与变更约定

- 每次修改尽量围绕一个明确目标，不做无关重构
- 先保证最小可运行，再补充扩展能力
- 修改功能代码时，如果影响架构、流程或使用方式，同时更新文档
- 没有实现完成的能力可以先提供占位结构，但要明确标注状态
- 不要把“计划中的能力”描述成“已经可用”

### 文档更新时间点

出现以下情况时需要同步更新 `docs/`：

- 新增核心模块或目录
- 调整 API 边界或核心数据结构
- 修改开发启动方式
- 改变插件、技能、Shell 的实现策略
- 完成一个重要阶段性里程碑

## 文档维护约定

- 根 `README.md` 只保留项目简介、目录入口和启动方式
- 架构设计写入 `docs/architecture.md`
- API 设计写入 `docs/api.md`
- 开发过程、阶段结果、后续计划写入 `docs/development-log.md`
- 每完成一个明确任务，都要同步更新一次 `docs/development-log.md`
- 每开始一个新任务前，先查看 `docs/development-log.md`，再继续开发

如果后续出现更细的专题，新增到 `docs/`，例如：

- `docs/plugin-system.md`
- `docs/shell-security.md`

## 当前实现状态

当前仓库已经具备：

- `pnpm workspace` 根结构
- `apps/web` 最小 Vue 页面骨架
- `apps/server` 最小 Fastify 服务骨架
- `packages/shared` 基础共享类型
- `packages/core` 基础健康快照占位逻辑

当前尚未完成：

- `openclaw` 进程探测
- 配置文件管理
- 插件与技能动态加载
- Shell 执行能力
- 实时事件推送

## 后续协作建议

后续进行代码修改时，优先按以下顺序推进：

1. 完善 `apps/server` 的系统能力
2. 抽取共享类型到 `packages/shared`
3. 将核心逻辑沉淀到 `packages/core`
4. 最后在 `apps/web` 接入和展示

如果新增重要能力，同时更新：

- `docs/architecture.md`
- `docs/api.md`
- `docs/development-log.md`

保持代码与文档同步。

补充执行要求：

- 新任务开始前先阅读最新开发记录，避免上下文断裂
- 每次任务完成后立即补一条开发记录，不要集中到最后一次性回填
- 当用户说“release”时，默认理解为执行 git 触发发布：优先使用 `scripts/trigger-git-release.sh`，或执行等价的“创建包含 `[release]` 的空提交并推送到 `master`”流程；不要擅自改成手工打包、仅本地构建或其他发布含义
