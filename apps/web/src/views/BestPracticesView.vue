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

    <section class="two-column practices-grid">
      <article class="panel panel--stretch practices-panel">
        <div class="section-header">
          <div>
            <p class="panel__label">Feishu Tools</p>
            <h3>减少无关飞书 tools 注入</h3>
          </div>
          <p class="panel__muted">这里提供安全快捷的推荐操作，用于快速收紧飞书相关 tools 的暴露面。</p>
        </div>

        <p class="panel__muted">建议场景：只保留飞书消息通道，不让飞书文档、飞书云盘、飞书 Wiki、飞书权限等 tools 注入模型上下文。</p>

        <div class="button-row practices-actions">
          <n-button type="primary" :disabled="busy.feishuTools" @click="disableAllFeishuTools">
            {{ busy.feishuTools ? '处理中...' : '一键禁用所有飞书 Tools' }}
          </n-button>
          <RouterLink class="nav-action" to="/plugins">前往插件页</RouterLink>
        </div>

        <p class="panel__muted">这样可以避免无关飞书 tools 注入上下文，减少 token 浪费，同时不影响飞书消息通道本身。</p>
        <p class="panel__muted">如果后续需要重新开启飞书 tools，请到插件列表中的 `Feishu -> Tools管理` 弹窗操作。</p>
        <p class="panel__muted">飞书 tools 配置中启用：{{ enabledFeishuToolLabels }}</p>
        <p class="panel__muted">飞书 tools 配置中禁用：{{ disabledFeishuToolLabels }}</p>
        <p class="status-text" :class="{ 'status-text--error': feishuToolsIsError }">{{ feishuToolsMessage }}</p>
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

      <article class="panel panel--stretch practices-panel">
        <div class="section-header">
          <div>
            <p class="panel__label">Session Cleanup</p>
            <h3>列出所有 Agent Session 并清理</h3>
          </div>
          <p class="panel__muted">当你调整模型、workspace、skills、tools 权限或绑定策略后，可在这里逐个清空旧会话，强制从干净上下文重新开始。</p>
        </div>

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
            <p class="panel__label">说明</p>
            <h3>当前策略边界</h3>
          </div>
        </div>
        <p class="panel__muted">这里当前只沉淀已经验证过的操作建议，不直接替代插件管理页本身。</p>
        <p class="panel__muted">涉及具体插件 tools 勾选和查看实时注册结果，仍然回到插件页的 `Tools管理` 弹窗处理。</p>
        <p class="panel__muted">清理 Session 的推荐时机：调整 Agent 的模型、workspace、skills、tools 权限，或切换渠道绑定策略之后。如果你发现旧上下文仍在影响新配置，优先到 Agents 页面执行 `清空 Session`。</p>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { NButton, NInput } from 'naive-ui'

import type { AgentConfigDocument, ChannelConfigDocument, ConfigDocument, FeishuToolsConfigDocument } from '@manclaw/shared'

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
const sessionActionMessage = ref('这里会列出所有 Agent 的 session store、会话数量和 transcript 文件数。')
const feishuChannelForm = reactive({
  appId: '',
  appSecret: '',
  botName: 'OpenClaw 助手',
})
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
  sessions: false,
  sessionAction: false,
  sessionAgentId: '',
})
const channelActionIsError = computed(() => /失败|错误|invalid|duplicate|duplicated/i.test(channelActionMessage.value))
const agentActionIsError = computed(() => /失败|错误|invalid|duplicate|duplicated/i.test(agentActionMessage.value))
const sessionActionIsError = computed(() => /失败|错误|invalid|duplicate|duplicated/i.test(sessionActionMessage.value))
const canCreateFeishuChannel = computed(() => Boolean(feishuChannelForm.appId.trim() && feishuChannelForm.appSecret.trim()))

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
  feishuToolsMessage.value = '已应用“仅飞书通道”预设，保存后不再向模型暴露飞书 tools。'
  feishuToolsIsError.value = false
  await saveFeishuTools()
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
  await Promise.all([refreshFeishuTools(), refreshAgentSessions()])
  disposeServiceChanged = onServiceChanged(() => {
    void Promise.all([refreshFeishuTools(), refreshAgentSessions()])
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
  gap: 16px;
}

.practices-panel > .panel__muted,
.practices-panel > .status-text,
.practices-panel > .button-row,
.practices-panel > .form-grid,
.practices-panel > .practices-preset-grid,
.practices-panel > .session-cleanup-list {
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

.practices-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
