# 版本规划

以下内容为后续版本规划，当前仅记录方案，不在本阶段实现。

当前已落地但不再列入 roadmap 的基础能力：

- 非 `127.0.0.1` / `localhost` 地址访问 `manclaw` 时，服务端已要求 token 验证

## 1. 模型配置页独立

状态：进行中

当前已开始：

- 已新增独立模型页面路由入口
- 已将概览页里的快速配置入口改为跳转独立页面
- 已在独立页面中接入结构化模型表单和原始配置联动读取
- 已完成“多个模型条目 + 默认模型”结构改造

目标是把当前概览页里的“快速配置模型”升级成独立页面，而不是继续停留在弹窗层面。

- 独立模型页面
- 支持配置多个模型提供商与多个模型条目
- 支持设置默认模型
- 为不同用途区分主模型、备用模型及其他扩展模型
- 将结构化表单与原始 `openclaw.json` 编辑结合，而不是仅依赖 JSON 文本框

## 2. 多 Agents 配置

状态：进行中

目标是把 `openclaw` 的不同助手角色显式管理起来，而不是只围绕单一默认实例工作。

当前已开始：

- 已新增独立 Agents 页面路由入口
- 已支持读取和保存真实 `openclaw.json` 中的 `agents` / `bindings`
- 已支持维护默认 Agent、每个 Agent 的模型、workspace、compaction、subagents 和 channel 绑定
- 已补充默认层 `subagents.allowAgents` 的结构化编辑，并收紧保存覆盖范围，尽量保留 `subagents` 与 `bindings` 上未暴露字段
- 已支持新增、复制、删除和启用/停用 Agent 条目

- 独立 Agents 页面
- 支持新增、复制、删除、启用/停用 agent
- 为每个 agent 单独配置：
  - `channel`
  - `model`
  - `workspace`
  - 其他角色级参数
- 支持设置默认 agent
- 支持为不同业务能力创建不同 agent 模板

## 3. 多 Channels 配置

状态：进行中

目标是支持“多个渠道实例对应多个助手”的实际运营场景，例如不同飞书机器人绑定不同能力的 agent。

当前已开始：

- 已新增独立 Channels 页面路由入口
- 已支持结构化读取和保存真实 `openclaw.json` 中的 `channels`
- 已支持按 channel 维护到 Agent 的绑定规则，并联动写回 `bindings[*].match`
- 已收紧 Channels 保存覆盖范围，受管 binding 仅更新 `agentId` / `match.channel` / `accountId`，尽量保留其他字段
- 渠道实例的详细 schema 当前仍按原始 JSON 对象编辑，尚未细分不同类型的专用表单

- 独立 Channels 页面或并入 Agents/Integrations 体系
- 支持配置多个 channel 实例
- 支持为每个 channel 指定：
  - 渠道类型
  - 渠道实例标识
  - 对应 agent
  - 对应默认模型或策略
- 支持“不同飞书机器人 -> 不同能力助手”的映射关系
- 支持多 channel 与多 agent 的绑定和切换

## 4. 插件安装与管理

目标是把插件能力从当前的技能体系中拆开，形成独立的系统扩展管理入口。

当前已开始：

- 已新增只读插件列表页
- 已接入 `openclaw plugins list --json` 查询接口

- 独立插件页面
- 插件安装、卸载、启用、禁用
- 插件配置项管理
- 插件状态、日志与故障排查
- 区分插件与 skills 的职责边界

## 建议实现顺序

- `v1.1` 独立模型配置页
- `v1.2` 多 Agents 配置
- `v1.3` 多 Channels 配置
- `v1.4` 插件安装与管理
