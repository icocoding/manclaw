# AGENTS

## 项目定位

`manclaw` 是面向 `openclaw` 的管理控制面，重点在于把运行态观测、配置治理、插件与技能管理、受控操作和 Web UI 收拢到统一入口。

协作时优先遵循两个原则：

- 核心价值先落在服务端能力和受控系统交互上，不把重心放在静态页面堆砌
- 代码、文档和对外表达保持一致，不把计划中的能力描述成已经可用

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
  api.md
  roadmap.md

../manclaw-dev/docs/
  architecture.md
  development-log.md
  development-log/
  promo-kit.md
```

新增模块时优先遵循以下边界：

- UI 放在 `apps/web`
- API 与系统能力放在 `apps/server`
- 可复用类型放在 `packages/shared`
- 领域能力放在 `packages/core`
- 内部 API 和 roadmap 放在 `docs/`
- 对外架构、宣传材料和开发记录放在 `../manclaw-dev/docs/`

## 开发原则

- 先服务端，后界面细化
- 安全优先：Shell、高权限操作、配置写入必须走受控模型
- 保持类型共享：前后端交互结构优先定义在 `packages/shared`
- 小步推进：每次改动优先完成一个可闭环的小目标

## 代码约定

### 命名

- 文件和目录优先使用 `kebab-case`
- TypeScript 类型、接口、类使用 `PascalCase`
- 变量、函数、组合式函数使用 `camelCase`
- 常量使用 `UPPER_SNAKE_CASE`
- 接口命名不要加无意义前缀，不使用 `IUser` 这类形式

### 前端

- Vue 组件优先使用 `script setup`
- 页面组件放在 `views/`
- 可复用 UI 组件优先放在 `components/`
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
- commit message 必须准确对应当前提交内容
- commit title 优先使用简洁英文短句，直接说明本次改动目标
- 当一个提交同时包含规则、文档、脚本或实现联动调整时，优先补充 commit body，写清主要变更点和边界

## 文档维护约定

- 根 `README.md` 只保留项目简介、目录入口和启动方式
- API 设计写入 `docs/api.md`
- 版本规划写入 `docs/roadmap.md`
- 架构设计写入 `../manclaw-dev/docs/architecture.md`
- 开发记录总览写入 `../manclaw-dev/docs/development-log.md`
- 每日开发记录按日期写入 `../manclaw-dev/docs/development-log/YYYY-MM-DD.md`
- 每开始一个新任务前，先查看最新开发记录
- 每完成一个明确任务后，立即补一条开发记录

如果新增重要能力，同时更新：

- `docs/api.md`
- `docs/roadmap.md`
- `../manclaw-dev/docs/architecture.md`
- `../manclaw-dev/docs/development-log.md`

## 补充要求

- 更新 README、`docs/`、发布说明或开发记录时，不要保留宿主机绝对路径、用户名目录、私有部署目录等环境敏感信息；如需举例，统一改为相对路径、通用占位路径或用户主目录形式，例如 `~/.openclaw/...`
- 当用户说“release”时，默认理解为执行 git 触发发布：优先使用 `scripts/trigger-git-release.sh`，或执行等价的“创建包含 `[release]` 的空提交并推送到 `master`”流程
