<template>
  <section class="page">
    <header class="hero hero--wide">
      <div>
        <p class="eyebrow">Practices</p>
        <h2>最佳实践</h2>
      </div>
      <div class="hero__actions">
        <n-button tertiary :disabled="busy.feishuTools" @click="refreshFeishuTools">
          {{ busy.feishuTools ? '刷新中...' : '刷新' }}
        </n-button>
      </div>
    </header>

    <section class="practices-grid">
      <div class="practices-column">
        <article class="panel practices-panel practices-note-card">
          <div class="section-header">
            <div>
              <p class="panel__label">说明</p>
              <h3>当前策略边界</h3>
            </div>
          </div>
          <p class="practices-note-card__lead">这里沉淀的是已经验证过的推荐操作，用来帮你快速收敛风险和减少无关暴露，但不替代各功能页本身。</p>

          <div class="practices-note-card__blocks">
            <article class="practices-note-block">
              <p class="panel__label">插件边界</p>
              <p class="panel__muted">如果要处理具体插件的 tools 勾选、运行时注册结果或插件启停，仍然回到插件页的 `Tools管理` 弹窗。</p>
            </article>

            <article class="practices-note-block">
              <p class="panel__label">Session 时机</p>
              <p class="panel__muted">当你调整 Agent 的模型、workspace、skills、tools 权限，或切换渠道绑定策略之后，优先考虑清理 Session。</p>
              <p class="panel__muted">也包括这些场景：刚禁用一批 tools、刚切换默认模型、刚替换 workspace 内容、刚新增或删除关键技能之后。</p>
            </article>

            <article class="practices-note-block">
              <p class="panel__label">判断原则</p>
              <p class="panel__muted">如果你发现回复还在受旧上下文影响、行为没有跟上新配置，先去 Agents 页面执行 `清空 Session`，再继续验证结果。</p>
              <p class="panel__muted">典型信号包括：模型仍按旧风格回复、已经移除的工具还在被调用、权限已经收紧但输出行为没变、渠道切换后仍沿用旧会话记忆。</p>
            </article>
          </div>
        </article>

        <article class="panel panel--stretch practices-panel">
          <div class="section-header">
            <div>
              <p class="panel__label">Feishu Surface</p>
              <h3>收紧飞书相关能力暴露</h3>
            </div>
            <p class="panel__muted">这里提供安全快捷的推荐操作，用于同时收紧飞书渠道 tools 和对应系统技能的暴露面。</p>
          </div>

          <p class="panel__muted">建议场景：只保留飞书消息通道，不让飞书文档、飞书云盘、飞书 Wiki、飞书权限等 tools 和 `feishu-*` 系统技能继续注入模型上下文。</p>

          <div class="button-row practices-actions">
            <n-button type="primary" :disabled="busy.feishuTools" @click="disableAllFeishuTools">
              {{ busy.feishuTools ? '处理中...' : '一键收紧飞书能力暴露' }}
            </n-button>
            <RouterLink class="nav-action" to="/plugins">前往插件页</RouterLink>
          </div>

          <p class="panel__muted">这样可以避免无关飞书 tools 和系统技能注入上下文，减少 token 浪费，同时不影响飞书消息通道本身。</p>
          <p class="panel__muted">如果后续需要重新开启飞书 tools，请到插件列表中的 `Feishu -> Tools管理` 弹窗操作。</p>
          <p class="panel__muted">飞书 tools 配置中启用：{{ enabledFeishuToolLabels }}</p>
          <p class="panel__muted">飞书 tools 配置中禁用：{{ disabledFeishuToolLabels }}</p>
          <p class="status-text" :class="{ 'status-text--error': feishuToolsIsError }">{{ feishuToolsMessage }}</p>
        </article>

        <article class="panel panel--stretch practices-panel">
          <div class="section-header">
            <div>
              <p class="panel__label">Model Switch</p>
              <h3>一键更换 Model ID</h3>
            </div>
            <p class="panel__muted">适合把 `qwen3.5-plus` 这类旧 ID 直接迁移成 `qwen3.5-plus-2026.2.26`，并同步重写默认模型与 Agent 引用。</p>
          </div>

          <div class="form-grid">
            <label class="field">
              <span class="field__label">旧模型</span>
              <n-select
                :value="modelSwitchForm.fromModelPrimary || null"
                class="field-control"
                clearable
                filterable
                :options="modelSwitchOptions"
                placeholder="选择要被替换的 Model ID"
                @update:value="(value) => { setModelSwitchSource(String(value ?? '')) }"
              />
            </label>

            <label class="field">
              <span class="field__label">新 Model ID</span>
              <n-input
                v-model:value="modelSwitchForm.toModelId"
                class="field-control"
                placeholder="例如 qwen3.5-plus-2026.2.26"
              />
            </label>
          </div>

          <p class="panel__muted">会同时修改三处：模型列表里的旧 ID、默认模型引用、以及所有显式绑定到旧值的 Agent `modelPrimary`。</p>
          <p class="panel__muted">影响范围：默认模型 {{ modelSwitchDefaultAffected ? '会' : '不会' }} 被替换；显式绑定到旧模型的 Agent 共 {{ modelSwitchAffectedAgentCount }} 个。</p>
          <p class="panel__muted" v-if="modelSwitchTargetPrimary">迁移预览：{{ modelSwitchForm.fromModelPrimary || '--' }} -> {{ modelSwitchTargetPrimary }}</p>

          <div class="button-row practices-actions">
            <n-button type="primary" :disabled="busy.modelSwitch || !canApplyModelSwitch" @click="migrateModelId">
              {{ busy.modelSwitch ? '迁移中...' : '一键更换 Model ID' }}
            </n-button>
            <RouterLink class="nav-action" to="/models">前往 Models</RouterLink>
          </div>

          <p class="status-text" :class="{ 'status-text--error': modelSwitchActionIsError }">{{ modelSwitchActionMessage }}</p>
        </article>

        <article class="panel panel--stretch practices-panel">
          <div class="section-header">
            <div>
              <p class="panel__label">Agent Presets</p>
              <h3>一键新增预设 Agent</h3>
            </div>
            <p class="panel__muted">用于快速落地“仅聊天”“最小权限”这类常见角色模板。</p>
          </div>

          <p class="panel__muted">创建后的 Agent 默认继承当前默认模型；workspace 会按默认命名规则自动生成：`默认 workspace / Agent ID`。</p>

          <div class="practices-preset-grid">
            <article class="panel panel--nested">
              <p class="panel__label">Messaging</p>
              <h3>仅聊天 Agent</h3>
              <p class="panel__muted">适合消息问答场景。使用 `messaging` tools profile，并额外禁止 `exec`。</p>
              <div class="button-row practices-actions">
                <n-button type="primary" :disabled="busy.agents" @click="createAgentPreset('chat-only')">
                  {{ busy.agents ? '创建中...' : '一键新增仅聊天 Agent' }}
                </n-button>
              </div>
            </article>

            <article class="panel panel--nested">
              <p class="panel__label">Minimal</p>
              <h3>最小权限 Agent</h3>
              <p class="panel__muted">适合高收敛场景。使用 `minimal` tools profile，不额外开放其它工具。</p>
              <div class="button-row practices-actions">
                <n-button type="primary" :disabled="busy.agents" @click="createAgentPreset('minimal-permission')">
                  {{ busy.agents ? '创建中...' : '一键新增最小权限 Agent' }}
                </n-button>
              </div>
            </article>
          </div>

          <div class="button-row practices-actions">
            <RouterLink class="nav-action" to="/agents">前往 Agents</RouterLink>
          </div>
          <p class="status-text" :class="{ 'status-text--error': agentActionIsError }">{{ agentActionMessage }}</p>
        </article>
      </div>

      <div class="practices-column">
        <article class="panel panel--stretch practices-panel">
          <div class="section-header">
            <div>
              <p class="panel__label">Session Cleanup</p>
              <h3>列出所有 Agent Session 并清理</h3>
            </div>
            <p class="panel__muted">当你调整模型、workspace、skills、tools 权限或绑定策略后，可在这里逐个清空旧会话，强制从干净上下文重新开始。</p>
          </div>

          <article class="panel panel--nested session-cleanup-callout">
            <p class="panel__label">推荐时机</p>
            <h3>改完配置但旧上下文还在影响回复时，先清 Session</h3>
            <p class="panel__muted">尤其是在调整模型、workspace、skills、tools 权限，或切换渠道绑定策略之后。</p>
            <p class="panel__muted">如果你刚做了这些变更：替换默认模型、收紧插件 tools、重装技能、修改 Agent 绑定、恢复历史配置，也建议立即清一次。</p>
            <p class="status-text status-text--warning">清理后会删除该 Agent 的会话存储和 transcript 文件，下一轮对话会从干净上下文重新开始。</p>
          </article>

          <div class="button-row practices-actions">
            <n-button tertiary :disabled="busy.sessions" @click="refreshAgentSessions">
              {{ busy.sessions ? '刷新中...' : '刷新 Session 列表' }}
            </n-button>
            <RouterLink class="nav-action" to="/agents">前往 Agents</RouterLink>
          </div>

          <div v-if="agentSessions.length" class="session-cleanup-list">
            <article v-for="agent in agentSessions" :key="agent.id" class="panel panel--nested session-cleanup-card">
              <div class="section-header session-cleanup-card__head">
                <div class="session-cleanup-card__title">
                  <p class="panel__label">Agent</p>
                  <h3>{{ agent.id }}</h3>
                </div>
                <p class="panel__muted session-cleanup-card__meta">{{ agent.sessionCount }} 个会话 / {{ agent.transcriptFileCount }} 个 transcript 文件</p>
              </div>

              <p class="panel__muted session-cleanup-card__store">Store：{{ agent.sessionStorePath || '--' }}</p>

              <div class="button-row practices-actions session-cleanup-card__actions">
                <n-button
                  class="danger-action"
                  type="warning"
                  :disabled="busy.sessionAction || !(agent.sessionCount || agent.transcriptFileCount)"
                  @click="clearAgentSessions(agent)"
                >
                  {{ busy.sessionAction && busy.sessionAgentId === agent.id ? '清空中...' : '清空 Session' }}
                </n-button>
              </div>

              <p v-if="agent.sessionMessage" class="status-text" :class="{ 'status-text--error': agent.sessionMessageIsError }">
                {{ agent.sessionMessage }}
              </p>
            </article>
          </div>

          <p v-else class="panel__muted">当前还没有可显示的 Agent Session 数据。</p>
          <p class="status-text" :class="{ 'status-text--error': sessionActionIsError }">{{ sessionActionMessage }}</p>
        </article>

        <article class="panel practices-panel">
          <div class="section-header">
            <div>
              <p class="panel__label">Feishu Channel</p>
              <h3>新增飞书渠道</h3>
            </div>
            <p class="panel__muted">填写飞书机器人的 `App ID` 和 `App Secret`，直接生成可编辑的 Feishu 渠道配置。</p>
          </div>

          <div class="form-grid">
            <label class="field">
              <span class="field__label">App ID</span>
              <n-input v-model:value="feishuChannelForm.appId" class="field-control" placeholder="cli_xxx" />
            </label>

            <label class="field">
              <span class="field__label">App Secret</span>
              <n-input v-model:value="feishuChannelForm.appSecret" class="field-control" placeholder="填写飞书机器人 Secret" />
            </label>

            <label class="field">
              <span class="field__label">Bot Name</span>
              <n-input v-model:value="feishuChannelForm.botName" class="field-control" placeholder="OpenClaw 助手" />
            </label>
          </div>

          <p class="panel__muted">会自动使用 `feishu`、`feishu-2`、`feishu-3` 这类可用 ID，并生成 `enabled/defaultAccount/accounts/tools` 完整结构；保存后会自动跳到 Channels 页面继续编辑。</p>
          <div class="button-row practices-actions">
            <n-button type="primary" :disabled="busy.channels || !canCreateFeishuChannel" @click="createFeishuChannel">
              {{ busy.channels ? '创建中...' : '新增飞书渠道' }}
            </n-button>
            <RouterLink class="nav-action" to="/channels">前往 Channels</RouterLink>
          </div>
          <p class="status-text" :class="{ 'status-text--error': channelActionIsError }">{{ channelActionMessage }}</p>
        </article>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { NButton, NInput, NSelect } from 'naive-ui'

import type { AgentConfigDocument, ChannelConfigDocument, ConfigDocument, FeishuToolsConfigDocument, InstalledSkillsDocument, QuickModelConfigDocument } from '@manclaw/shared'

import { apiRequest } from '../lib/api'
import { onServiceChanged } from '../lib/service-events'

const router = useRouter()

const feishuTools = reactive({
  doc: true,
  chat: true,
  wiki: true,
  drive: true,
  perm: false,
  scopes: true,
  bitable: true,
})
const feishuToolsMessage = ref('读取当前飞书 tools 配置。')
const feishuToolsIsError = ref(false)
const channelActionMessage = ref('可在这里快速新增一个 Feishu channel，再到 Channels 页面补全细节。')
const agentActionMessage = ref('可在这里一键新增预设 Agent，再到 Agents 页面继续细化。')
const modelSwitchActionMessage = ref('可在这里批量替换默认模型和 Agent 显式绑定的 Model ID。')
const sessionActionMessage = ref('这里会列出所有 Agent 的 session store、会话数量和 transcript 文件数。')
const feishuChannelForm = reactive({
  appId: '',
  appSecret: '',
  botName: 'OpenClaw 助手',
})
const modelSwitchForm = reactive({
  fromModelPrimary: '',
  toModelId: '',
})
const quickModelEntries = ref<QuickModelConfigDocument['entries']>([])
const currentAgentConfig = ref<AgentConfigDocument>()
type SessionAgentItem = {
  id: string
  sessionStorePath?: string
  sessionCount: number
  transcriptFileCount: number
  sessionMessage: string
  sessionMessageIsError: boolean
}

const agentSessions = ref<SessionAgentItem[]>([])
let disposeServiceChanged: (() => void) | undefined
const busy = reactive({
  feishuTools: false,
  channels: false,
  agents: false,
  modelSwitch: false,
  sessions: false,
  sessionAction: false,
  sessionAgentId: '',
})
const channelActionIsError = computed(() => /失败|错误|invalid|duplicate|duplicated/i.test(channelActionMessage.value))
const agentActionIsError = computed(() => /失败|错误|invalid|duplicate|duplicated/i.test(agentActionMessage.value))
const modelSwitchActionIsError = computed(() => /失败|错误|invalid|duplicate|duplicated|缺少|不能为空/i.test(modelSwitchActionMessage.value))
const sessionActionIsError = computed(() => /失败|错误|invalid|duplicate|duplicated/i.test(sessionActionMessage.value))
const canCreateFeishuChannel = computed(() => Boolean(feishuChannelForm.appId.trim() && feishuChannelForm.appSecret.trim()))
const modelSwitchOptions = computed(() =>
  quickModelEntries.value
    .map((entry) => {
      const providerKey = entry.provider === 'custom-openai' ? entry.customProviderId || 'custom-openai' : entry.provider
      const value = `${providerKey}/${entry.modelId}`
      return {
        label: value,
        value,
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label)),
)
const canApplyModelSwitch = computed(() => {
  const from = modelSwitchForm.fromModelPrimary.trim()
  const toId = modelSwitchForm.toModelId.trim()
  const target = buildTargetModelPrimary(from, toId)
  return Boolean(from && toId && target && from !== target)
})
const modelSwitchDefaultAffected = computed(() => currentAgentConfig.value?.defaults.modelPrimary === modelSwitchForm.fromModelPrimary.trim())
const modelSwitchAffectedAgentCount = computed(() => {
  const from = modelSwitchForm.fromModelPrimary.trim()
  if (!from || !currentAgentConfig.value) {
    return 0
  }

  return currentAgentConfig.value.items.filter((item) => item.modelPrimary?.trim() === from).length
})
const modelSwitchTargetPrimary = computed(() => buildTargetModelPrimary(modelSwitchForm.fromModelPrimary, modelSwitchForm.toModelId))

const feishuToolLabels = computed(() => [
  { key: 'chat', label: 'feishu_chat', enabled: feishuTools.chat },
  { key: 'doc', label: 'feishu_doc', enabled: feishuTools.doc },
  { key: 'wiki', label: 'feishu_wiki', enabled: feishuTools.wiki },
  { key: 'drive', label: 'feishu_drive', enabled: feishuTools.drive },
  { key: 'perm', label: 'feishu_perm', enabled: feishuTools.perm },
  { key: 'scopes', label: 'feishu_app_scopes', enabled: feishuTools.scopes },
  { key: 'bitable', label: 'feishu_bitable_*', enabled: feishuTools.bitable },
])

const enabledFeishuToolLabels = computed(() => {
  const labels = feishuToolLabels.value.filter((item) => item.enabled).map((item) => item.label)
  return labels.length > 0 ? labels.join(', ') : '--'
})

const disabledFeishuToolLabels = computed(() => {
  const labels = feishuToolLabels.value.filter((item) => !item.enabled).map((item) => item.label)
  return labels.length > 0 ? labels.join(', ') : '--'
})

async function refreshFeishuTools(): Promise<void> {
  busy.feishuTools = true
  feishuToolsIsError.value = false
  feishuToolsMessage.value = '正在读取飞书 tools 配置...'
  try {
    const document = await apiRequest<FeishuToolsConfigDocument>('/api/openclaw/plugins/feishu-tools')
    feishuTools.doc = document.current.doc
    feishuTools.chat = document.current.chat
    feishuTools.wiki = document.current.wiki
    feishuTools.drive = document.current.drive
    feishuTools.perm = document.current.perm
    feishuTools.scopes = document.current.scopes
    feishuTools.bitable = document.current.bitable
    feishuToolsMessage.value = '飞书 tools 配置已读取。'
  } catch (error) {
    feishuToolsIsError.value = true
    feishuToolsMessage.value = error instanceof Error ? error.message : '飞书 tools 配置读取失败。'
  } finally {
    busy.feishuTools = false
  }
}

async function saveFeishuTools(): Promise<void> {
  busy.feishuTools = true
  feishuToolsIsError.value = false
  try {
    await apiRequest<ConfigDocument>('/api/openclaw/plugins/feishu-tools', {
      method: 'POST',
      body: JSON.stringify({
        doc: feishuTools.doc,
        chat: feishuTools.chat,
        wiki: feishuTools.wiki,
        drive: feishuTools.drive,
        perm: feishuTools.perm,
        scopes: feishuTools.scopes,
        bitable: feishuTools.bitable,
      }),
    })
    feishuToolsMessage.value = '飞书 tools 配置已写入 openclaw.json，建议重启 OpenClaw。'
  } catch (error) {
    feishuToolsIsError.value = true
    feishuToolsMessage.value = error instanceof Error ? error.message : '飞书 tools 配置保存失败。'
  } finally {
    busy.feishuTools = false
  }
}

async function disableAllFeishuTools(): Promise<void> {
  feishuTools.chat = false
  feishuTools.doc = false
  feishuTools.wiki = false
  feishuTools.drive = false
  feishuTools.perm = false
  feishuTools.scopes = false
  feishuTools.bitable = false
  feishuToolsMessage.value = '正在应用“仅飞书通道”预设，并同步禁用系统技能中的 feishu-* ...'
  feishuToolsIsError.value = false
  await saveFeishuTools()

  try {
    const installedSkills = await apiRequest<InstalledSkillsDocument>('/api/skills/installed')
    const feishuSkills = installedSkills.items.filter((item) => item.slug.toLowerCase().startsWith('feishu-'))

    for (const skill of feishuSkills) {
      if (skill.state === 'disabled') {
        continue
      }
      await apiRequest(`/api/skills/${encodeURIComponent(skill.slug)}/disable`, {
        method: 'POST',
      })
    }

    feishuToolsMessage.value =
      feishuSkills.length > 0
        ? `已禁用飞书 tools，并同步禁用 ${feishuSkills.length} 个 feishu-* 系统技能。建议重启 OpenClaw。`
        : '已禁用飞书 tools；当前未发现可额外处理的 feishu-* 系统技能。建议重启 OpenClaw。'
  } catch (error) {
    feishuToolsIsError.value = true
    feishuToolsMessage.value = error instanceof Error ? error.message : '飞书系统技能禁用失败。'
  }
}

function nextAvailableChannelId(existingIds: string[], baseId: string): string {
  const used = new Set(existingIds.map((item) => item.trim()).filter(Boolean))
  if (!used.has(baseId)) {
    return baseId
  }

  let suffix = 2
  while (used.has(`${baseId}-${suffix}`)) {
    suffix += 1
  }

  return `${baseId}-${suffix}`
}

function nextAvailableAgentId(existingIds: string[], baseId: string): string {
  const used = new Set(existingIds.map((item) => item.trim()).filter(Boolean))
  if (!used.has(baseId)) {
    return baseId
  }

  let suffix = 2
  while (used.has(`${baseId}-${suffix}`)) {
    suffix += 1
  }

  return `${baseId}-${suffix}`
}

function resolvePresetWorkspace(defaultWorkspace: string, agentId: string): string | undefined {
  const normalizedDefault = defaultWorkspace.trim().replace(/\/+$/, '')
  const normalizedAgentId = agentId.trim()
  if (!normalizedDefault || !normalizedAgentId) {
    return undefined
  }

  return `${normalizedDefault}/${normalizedAgentId}`
}

async function createFeishuChannel(): Promise<void> {
  if (!canCreateFeishuChannel.value) {
    channelActionMessage.value = '请先填写 App ID 和 App Secret。'
    return
  }

  busy.channels = true
  try {
    const [current, feishuToolsDocument] = await Promise.all([
      apiRequest<ChannelConfigDocument>('/api/channels/current'),
      apiRequest<FeishuToolsConfigDocument>('/api/openclaw/plugins/feishu-tools'),
    ])
    const channelId = nextAvailableChannelId(
      current.items.map((item) => item.id),
      'feishu',
    )
    const toolsConfig = feishuToolsDocument.current

    const document = await apiRequest<ChannelConfigDocument>('/api/channels/save', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          ...current.items,
          {
            sourceId: `practice::${channelId}`,
            id: channelId,
            type: 'feishu',
            configText: JSON.stringify(
              {
                enabled: true,
                defaultAccount: 'main',
                accounts: {
                  main: {
                    appId: feishuChannelForm.appId.trim(),
                    appSecret: feishuChannelForm.appSecret.trim(),
                    botName: feishuChannelForm.botName.trim() || 'OpenClaw 助手',
                  },
                  default: {
                    dmPolicy: 'open',
                    allowFrom: ['*'],
                  },
                },
                tools: {
                  doc: toolsConfig.doc,
                  chat: toolsConfig.chat,
                  wiki: toolsConfig.wiki,
                  drive: toolsConfig.drive,
                  perm: toolsConfig.perm,
                  scopes: toolsConfig.scopes,
                  bitable: toolsConfig.bitable,
                },
              },
              null,
              2,
            ),
            bindings: [],
          },
        ],
      }),
    })

    const createdChannelId = document.items[document.items.length - 1]?.id || channelId
    channelActionMessage.value = `已新增飞书渠道 ${createdChannelId}，正在跳转到 Channels 页面。`
    await router.push('/channels')
  } catch (error) {
    channelActionMessage.value = error instanceof Error ? error.message : '飞书渠道创建失败。'
  } finally {
    busy.channels = false
  }
}

async function createAgentPreset(mode: 'chat-only' | 'minimal-permission'): Promise<void> {
  busy.agents = true
  try {
    const current = await apiRequest<AgentConfigDocument>('/api/agents/current')
    const baseId = mode === 'chat-only' ? 'chat-only' : 'minimal-permission'
    const nextId = nextAvailableAgentId(
      current.items.map((item) => item.id),
      baseId,
    )

    const nextItem = {
      sourceId: `practice::${nextId}`,
      id: nextId,
      bindings: [],
      workspace: resolvePresetWorkspace(current.defaults.workspace, nextId),
      modelPrimary: undefined,
      compactionMode: undefined,
      tools:
        mode === 'chat-only'
          ? {
              profile: 'messaging' as const,
              allow: [],
              deny: ['exec'],
            }
          : {
              profile: 'minimal' as const,
              allow: [],
              deny: [],
            },
    }

    await apiRequest<AgentConfigDocument>('/api/agents/save', {
      method: 'POST',
      body: JSON.stringify({
        defaultAgentId: current.defaultAgentId,
        defaults: current.defaults,
        items: [
          ...current.items.map((item) => ({
            sourceId: item.sourceId,
            id: item.id,
            bindings: item.bindings,
            workspace: item.workspace,
            modelPrimary: item.modelPrimary,
            compactionMode: item.compactionMode,
            tools: {
              profile: item.tools?.profile,
              allow: item.tools?.allow ?? [],
              deny: item.tools?.deny ?? [],
            },
          })),
          nextItem,
        ],
      }),
    })

    agentActionMessage.value =
      mode === 'chat-only'
        ? `已新增仅聊天 Agent：${nextId}。可前往 Agents 页面继续配置绑定和模型。`
        : `已新增最小权限 Agent：${nextId}。可前往 Agents 页面继续配置绑定和模型。`
  } catch (error) {
    agentActionMessage.value = error instanceof Error ? error.message : '预设 Agent 创建失败。'
  } finally {
    busy.agents = false
  }
}

async function refreshModelSwitchData(): Promise<void> {
  try {
    const [quickModelDocument, agentDocument] = await Promise.all([
      apiRequest<QuickModelConfigDocument>('/api/model-setup/current'),
      apiRequest<AgentConfigDocument>('/api/agents/current'),
    ])
    quickModelEntries.value = quickModelDocument.entries
    currentAgentConfig.value = agentDocument
  } catch (error) {
    modelSwitchActionMessage.value = error instanceof Error ? error.message : 'Model ID 列表读取失败。'
  }
}

function parseModelPrimary(value: string): { providerKey: string; modelId: string } | null {
  const normalized = value.trim()
  const separatorIndex = normalized.indexOf('/')
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    return null
  }

  return {
    providerKey: normalized.slice(0, separatorIndex),
    modelId: normalized.slice(separatorIndex + 1),
  }
}

function buildTargetModelPrimary(fromModelPrimary: string, toModelId: string): string {
  const parsed = parseModelPrimary(fromModelPrimary)
  const normalizedTarget = toModelId.trim()
  if (!parsed || !normalizedTarget) {
    return ''
  }

  return `${parsed.providerKey}/${normalizedTarget}`
}

function setModelSwitchSource(value: string): void {
  modelSwitchForm.fromModelPrimary = value
  const parsed = parseModelPrimary(value)
  if (!parsed) {
    modelSwitchForm.toModelId = ''
    return
  }

  if (!modelSwitchForm.toModelId.trim()) {
    modelSwitchForm.toModelId = parsed.modelId
  }
}

async function migrateModelId(): Promise<void> {
  const from = modelSwitchForm.fromModelPrimary.trim()
  const toModelId = modelSwitchForm.toModelId.trim()
  const parsedFrom = parseModelPrimary(from)
  const targetPrimary = buildTargetModelPrimary(from, toModelId)
  if (!from || !toModelId || !parsedFrom || !targetPrimary) {
    modelSwitchActionMessage.value = '请先选择旧模型，并填写新的 Model ID。'
    return
  }
  if (from === targetPrimary) {
    modelSwitchActionMessage.value = '旧模型和新 Model ID 不能相同。'
    return
  }

  busy.modelSwitch = true
  try {
    const [currentAgents, currentModels] = await Promise.all([
      apiRequest<AgentConfigDocument>('/api/agents/current'),
      apiRequest<QuickModelConfigDocument>('/api/model-setup/current'),
    ])
    const duplicateEntry = currentModels.entries.find((entry) => {
      const providerKey = entry.provider === 'custom-openai' ? entry.customProviderId || 'custom-openai' : entry.provider
      return providerKey === parsedFrom.providerKey && entry.modelId === toModelId
    })
    if (duplicateEntry) {
      throw new Error(`目标 Model ID ${targetPrimary} 已存在，请直接切换绑定，不要重复迁移。`)
    }

    const nextModelEntries = currentModels.entries.map((entry) => {
      const providerKey = entry.provider === 'custom-openai' ? entry.customProviderId || 'custom-openai' : entry.provider
      if (providerKey === parsedFrom.providerKey && entry.modelId === parsedFrom.modelId) {
        return {
          ...entry,
          modelId: toModelId,
        }
      }

      return entry
    })
    const migratedModelCount = nextModelEntries.filter((entry) => {
      const providerKey = entry.provider === 'custom-openai' ? entry.customProviderId || 'custom-openai' : entry.provider
      return providerKey === parsedFrom.providerKey && entry.modelId === toModelId
    }).length
    if (migratedModelCount === 0) {
      throw new Error(`模型列表中未找到 ${from}，无法执行 Model ID 迁移。`)
    }

    const nextDefaults = {
      ...currentAgents.defaults,
      modelPrimary: currentAgents.defaults.modelPrimary === from ? targetPrimary : currentAgents.defaults.modelPrimary,
    }
    const nextItems = currentAgents.items.map((item) => ({
      sourceId: item.sourceId,
      id: item.id,
      bindings: item.bindings,
      workspace: item.workspace,
      modelPrimary: item.modelPrimary?.trim() === from ? targetPrimary : item.modelPrimary,
      compactionMode: item.compactionMode,
      tools: {
        profile: item.tools?.profile,
        allow: item.tools?.allow ?? [],
        deny: item.tools?.deny ?? [],
      },
    }))
    const affectedAgents = currentAgents.items.filter((item) => item.modelPrimary?.trim() === from).map((item) => item.id)

    await apiRequest<AgentConfigDocument>('/api/agents/save', {
      method: 'POST',
      body: JSON.stringify({
        defaultAgentId: currentAgents.defaultAgentId,
        defaults: nextDefaults,
        items: nextItems,
      }),
    })

    await apiRequest<ConfigDocument>('/api/model-setup/apply', {
      method: 'POST',
      body: JSON.stringify({
        defaultModelId: currentModels.defaultModelId,
        entries: nextModelEntries,
      }),
    })

    quickModelEntries.value = nextModelEntries
    currentAgentConfig.value = {
      ...currentAgents,
      defaults: nextDefaults,
      items: currentAgents.items.map((item) => ({
        ...item,
        modelPrimary: item.modelPrimary?.trim() === from ? targetPrimary : item.modelPrimary,
      })),
    }
    modelSwitchForm.fromModelPrimary = targetPrimary
    modelSwitchForm.toModelId = toModelId
    modelSwitchActionMessage.value =
      affectedAgents.length > 0 || currentAgents.defaults.modelPrimary === from
        ? `已将 ${from} 迁移为 ${targetPrimary}。模型列表已更新，默认模型${currentAgents.defaults.modelPrimary === from ? '已' : '未'}更新，显式绑定已替换 ${affectedAgents.length} 个 Agent。`
        : `当前没有默认模型或 Agent 显式绑定到 ${from}，未发生变更。`
  } catch (error) {
    modelSwitchActionMessage.value = error instanceof Error ? error.message : 'Model ID 迁移失败。'
  } finally {
    busy.modelSwitch = false
  }
}

function mergeSessionMessages(nextItems: AgentConfigDocument['items']): SessionAgentItem[] {
  const previousById = new Map(agentSessions.value.map((item) => [item.id, item]))
  return nextItems.map((item) => {
    const previous = previousById.get(item.id)
    return {
      id: item.id,
      sessionStorePath: item.sessionStorePath,
      sessionCount: item.sessionCount ?? 0,
      transcriptFileCount: item.transcriptFileCount ?? 0,
      sessionMessage: previous?.sessionMessage ?? '',
      sessionMessageIsError: previous?.sessionMessageIsError ?? false,
    }
  })
}

async function refreshAgentSessions(): Promise<void> {
  busy.sessions = true
  sessionActionMessage.value = '正在读取 Agent Session 列表...'
  try {
    const current = await apiRequest<AgentConfigDocument>('/api/agents/current')
    agentSessions.value = mergeSessionMessages(current.items)
    sessionActionMessage.value = 'Agent Session 列表已刷新。'
  } catch (error) {
    sessionActionMessage.value = error instanceof Error ? error.message : 'Agent Session 列表读取失败。'
  } finally {
    busy.sessions = false
  }
}

async function clearAgentSessions(agent: SessionAgentItem): Promise<void> {
  const agentId = agent.id.trim()
  if (!agentId) {
    return
  }

  busy.sessionAction = true
  busy.sessionAgentId = agentId
  try {
    const result = await apiRequest<{ agentId: string; storePath: string; clearedFiles: number }>(
      `/api/agents/${encodeURIComponent(agentId)}/sessions`,
      {
        method: 'DELETE',
      },
    )
    agent.sessionMessage = `已清空 ${result.agentId} 的 session，删除文件数：${result.clearedFiles}`
    agent.sessionMessageIsError = false
    sessionActionMessage.value = `已完成 ${result.agentId} 的 Session 清理。`
    await refreshAgentSessions()
  } catch (error) {
    agent.sessionMessage = error instanceof Error ? error.message : 'Agent Session 清空失败。'
    agent.sessionMessageIsError = true
    sessionActionMessage.value = `清理 ${agentId} 的 Session 失败。`
  } finally {
    busy.sessionAction = false
    busy.sessionAgentId = ''
  }
}

onMounted(async () => {
  await Promise.all([refreshFeishuTools(), refreshAgentSessions(), refreshModelSwitchData()])
  disposeServiceChanged = onServiceChanged(() => {
    void Promise.all([refreshFeishuTools(), refreshAgentSessions(), refreshModelSwitchData()])
  })
})

onUnmounted(() => {
  disposeServiceChanged?.()
})
</script>

<style scoped>
.practices-actions {
  align-items: stretch;
  width: 100%;
}

.practices-actions > * {
  display: inline-flex;
  align-items: center;
}

.practices-actions :deep(.n-button) {
  min-height: 42px;
}

.practices-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.practices-column {
  display: grid;
  align-content: start;
  gap: 16px;
}

.practices-preset-grid {
  display: grid;
  gap: 14px;
}

.practices-preset-grid > .panel {
  border-color: color-mix(in srgb, var(--line-strong) 82%, var(--accent) 18%);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-1) 84%, var(--accent) 16%),
      color-mix(in srgb, var(--bg-1) 89%, var(--accent-strong) 11%)
    );
}

.practices-panel {
  display: grid;
  align-content: start;
  align-self: start;
  gap: 16px;
}

.practices-note-card {
  border-color: color-mix(in srgb, var(--accent-strong) 34%, var(--line-strong) 66%);
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--bg-1) 72%, var(--accent-strong) 28%),
      color-mix(in srgb, var(--bg-1) 88%, var(--accent) 12%)
    );
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.practices-note-card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--accent-strong) 52%, var(--line-strong) 48%);
  box-shadow: 0 18px 32px rgba(6, 17, 34, 0.22);
}

.practices-note-card__lead {
  margin: 0;
  font-size: 1rem;
  line-height: 1.7;
  color: var(--text-1);
}

.practices-note-card__blocks {
  display: grid;
  gap: 10px;
}

.practices-note-block {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--line-strong) 78%, var(--accent) 22%);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-1) 86%, var(--accent-strong) 14%);
}

.practices-note-block .panel__label,
.practices-note-block .panel__muted {
  margin-top: 0;
}

.practices-panel > .panel__muted,
.practices-panel > .status-text,
.practices-panel > .button-row,
.practices-panel > .form-grid,
.practices-panel > .practices-preset-grid,
.practices-panel > .session-cleanup-list {
  margin-top: 0;
}

.session-cleanup-callout {
  gap: 8px;
  border-color: color-mix(in srgb, var(--warning) 52%, var(--line-strong) 48%);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-1) 74%, var(--warning) 26%),
      color-mix(in srgb, var(--bg-1) 86%, var(--accent) 14%)
    );
}

.session-cleanup-callout h3,
.session-cleanup-callout .panel__label,
.session-cleanup-callout .panel__muted,
.session-cleanup-callout .status-text {
  margin-top: 0;
}

.session-cleanup-list {
  display: grid;
  gap: 10px;
  max-height: 520px;
  overflow: auto;
  padding-right: 6px;
}

.session-cleanup-card {
  display: grid;
  gap: 8px;
  padding: 16px 18px;
  border-color: color-mix(in srgb, var(--line-strong) 82%, var(--accent) 18%);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-1) 84%, var(--accent) 16%),
      color-mix(in srgb, var(--bg-1) 89%, var(--accent-strong) 11%)
    );
}

.session-cleanup-card__head {
  margin-bottom: 0;
}

.session-cleanup-card__title .panel__label {
  margin: 0;
}

.session-cleanup-card__title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.session-cleanup-card__title h3 {
  margin: 0;
  font-size: 1rem;
}

.session-cleanup-card__meta,
.session-cleanup-card__store {
  margin-top: 0;
  font-size: 0.92rem;
}

.session-cleanup-card__actions {
  justify-content: flex-start;
}

.session-cleanup-card__actions :deep(.n-button) {
  min-height: 36px;
}

@media (max-width: 960px) {
  .practices-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .session-cleanup-card__head {
    flex-direction: column;
  }
}
</style>
