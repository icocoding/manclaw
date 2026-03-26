<template>
  <section class="page">
    <header class="hero hero--wide">
      <div>
        <p class="eyebrow">Agents</p>
        <h2>Agent 管理</h2>
      </div>
      <div class="hero__actions">
        <n-button tertiary :disabled="busy.refresh" @click="refreshAll">
          {{ busy.refresh ? '刷新中...' : '刷新全部' }}
        </n-button>
      </div>
    </header>

    <section class="two-column">
      <article class="panel panel--stretch">
        <div class="section-header">
          <div>
            <p class="panel__label">默认设置</p>
            <h3>共享默认 Agent 参数</h3>
          </div>
          <p class="panel__muted">当前阶段默认 Agent 采用 `agents.list` 第一项表示；页面保存时会按这里的选择重排顺序。</p>
        </div>

        <div class="form-grid">
          <label class="field">
            <span class="field__label">默认 Agent</span>
            <n-select
              :value="defaultAgentId"
              class="field-control"
              :options="defaultAgentOptions"
              placeholder="选择默认 Agent"
              @update:value="(value) => { defaultAgentId = String(value ?? '') }"
            />
          </label>

          <label class="field">
            <span class="field__label">默认 Workspace</span>
            <n-input v-model:value="defaults.workspace" class="field-control" placeholder="~/.openclaw/workspace" />
          </label>

          <label class="field">
            <span class="field__label">默认模型</span>
            <n-select
              :value="defaults.modelPrimary || null"
              class="field-control"
              clearable
              filterable
              :options="modelOptions"
              placeholder="选择默认模型"
              @update:value="(value) => { defaults.modelPrimary = String(value ?? '') }"
            />
          </label>

          <label class="field">
            <span class="field__label">默认 Compaction</span>
            <n-select
              :value="defaults.compactionMode || null"
              class="field-control"
              clearable
              :options="compactionModeOptions"
              placeholder="选择默认 Compaction"
              @update:value="(value) => { defaults.compactionMode = String(value ?? '') }"
            />
          </label>
        </div>

        <div class="agent-tools">
          <div class="section-header">
            <div>
              <p class="panel__label">Subagents 默认值</p>
              <h3>共享子智能体参数</h3>
            </div>
            <p class="panel__muted">写入 `agents.defaults.subagents`。留空时表示继承 OpenClaw 默认行为。</p>
          </div>

          <div class="form-grid">
            <label class="field">
              <span class="field__label">Subagent 默认模型</span>
              <n-select
                :value="defaults.subagents.modelPrimary || null"
                class="field-control"
                clearable
                filterable
                :options="modelOptions"
                placeholder="留空则继承调用者"
                @update:value="(value) => { defaults.subagents.modelPrimary = String(value ?? '') }"
              />
            </label>

          <label class="field">
            <span class="field__label">Thinking</span>
            <n-input v-model:value="defaults.subagents.thinking" class="field-control" placeholder="例如 low / medium / high" />
          </label>

          <label class="field">
            <span class="field__label">Allow Agents</span>
            <n-select
              :value="defaults.subagents.allowAgents"
              class="field-control"
              multiple
              filterable
              clearable
              :options="defaultSubagentAllowAgentOptions"
              placeholder="留空则不限制"
              @update:value="(value) => { defaults.subagents.allowAgents = Array.isArray(value) ? (value as string[]) : [] }"
            />
          </label>

          <label class="field">
            <span class="field__label">Max Concurrent</span>
            <n-input v-model:value="defaults.subagents.maxConcurrentText" class="field-control" placeholder="例如 8" />
            </label>

            <label class="field">
              <span class="field__label">Max Spawn Depth</span>
              <n-input v-model:value="defaults.subagents.maxSpawnDepthText" class="field-control" placeholder="1-5，默认 1" />
            </label>

            <label class="field">
              <span class="field__label">Max Children Per Agent</span>
              <n-input v-model:value="defaults.subagents.maxChildrenPerAgentText" class="field-control" placeholder="例如 5" />
            </label>

            <label class="field">
              <span class="field__label">Archive After Minutes</span>
              <n-input v-model:value="defaults.subagents.archiveAfterMinutesText" class="field-control" placeholder="0 表示禁用自动归档" />
            </label>

            <label class="field">
              <span class="field__label">Run Timeout Seconds</span>
              <n-input v-model:value="defaults.subagents.runTimeoutSecondsText" class="field-control" placeholder="0 表示不超时" />
            </label>

            <label class="field">
              <span class="field__label">Announce Timeout Ms</span>
              <n-input v-model:value="defaults.subagents.announceTimeoutMsText" class="field-control" placeholder="例如 90000" />
            </label>
          </div>
        </div>

        <div class="button-row">
          <n-button type="primary" :disabled="busy.save || !hasPendingChanges" @click="saveAgents">
            {{ busy.save ? '保存中...' : hasPendingChanges ? '保存 Agent 变更' : '保存 Agent 配置' }}
          </n-button>
        </div>

        <p v-if="hasPendingChanges" class="status-text status-text--warning">当前有未保存的 Agent 变更，请点击“保存 Agent 变更”。</p>
        <p class="status-text" :class="{ 'status-text--error': messageIsError }">{{ message }}</p>
        <p v-if="messageUpdatedAt" class="panel__muted">最后提示时间：{{ formatDateTime(messageUpdatedAt) }}</p>
      </article>

      <article class="panel">
        <div class="section-header">
          <div>
            <p class="panel__label">当前摘要</p>
            <h3>{{ agents.length }} 个 Agent</h3>
          </div>
        </div>
        <p class="panel__muted">默认 Agent：{{ defaultAgentId || '--' }}</p>
        <p class="panel__muted">渠道绑定总数：{{ totalBindingCount }}</p>
        <p class="panel__muted">已发现渠道：{{ availableChannelSummary }}</p>
      </article>
    </section>

    <section class="panel">
      <div class="section-header">
        <div>
          <p class="panel__label">Agent 列表</p>
          <h3>逐个配置角色、模型与渠道绑定</h3>
        </div>
        <p class="panel__muted">每个 Agent 可配置多条绑定规则；当前支持 `channel` 和可选 `accountId`。</p>
      </div>

      <div class="agent-detail-section">
        <article v-if="busy.refresh && agents.length === 0" class="panel panel--nested">
          <p class="panel__muted">正在读取 `openclaw.json` 中的 `agents` 与 `bindings`，请稍候...</p>
        </article>

        <template v-else-if="agents.length">
          <div class="agent-list">
            <article v-for="(agent, index) in agents" :key="agent.sourceId || `${agent.id}-${index}`" class="agent-card">
              <div class="agent-card__head">
                <div>
                  <div class="agent-card__title">
                    <h3>{{ agent.id || `agent-${index + 1}` }}</h3>
                    <span v-if="agent.id === defaultAgentId" class="badge badge--running">默认</span>
                  </div>
                  <p class="panel__muted">#{{ index + 1 }} · sourceId={{ agent.sourceId || 'new' }}</p>
                </div>

                <div class="button-row">
                  <n-button tertiary size="small" :disabled="!openClawAgentsUrl" @click="openAgentSkillsEditor">
                    转到 OpenClaw Agents 管理
                  </n-button>
                  <n-button tertiary size="small" :disabled="busy.save" @click="copyAgent(agent)">复制</n-button>
                  <n-button tertiary size="small" :disabled="busy.save || agents.length === 1" @click="removeAgent(index)">删除</n-button>
                </div>
              </div>

              <div class="form-grid">
                <label class="field">
                  <span class="field__label">Agent ID</span>
                  <n-input v-model:value="agent.id" class="field-control" placeholder="main" />
                </label>

                <label class="field">
                  <span class="field__label">Workspace</span>
                  <n-input v-model:value="agent.workspace" class="field-control" placeholder="留空则继承默认值" />
                </label>

                <label class="field">
                  <span class="field__label">模型</span>
                  <n-select
                    :value="agent.modelPrimary || null"
                    class="field-control"
                    clearable
                    filterable
                    :options="modelOptions"
                    placeholder="留空则继承默认值"
                    @update:value="(value) => { agent.modelPrimary = String(value ?? '') }"
                  />
                </label>

                <label class="field field--span-2">
                  <span class="field__label">Compaction</span>
                  <n-select
                    :value="agent.compactionMode || null"
                    class="field-control"
                    clearable
                    :options="compactionModeOptions"
                    placeholder="留空则继承默认值"
                    @update:value="(value) => { agent.compactionMode = String(value ?? '') }"
                  />
                </label>
              </div>

              <div class="agent-bindings">
                <div class="section-header">
                  <div>
                    <p class="panel__label">绑定规则</p>
                    <h3>按 Agent 维护 channel 绑定</h3>
                  </div>
                  <p class="panel__muted">保存时会更新受管 binding 的 `agentId`、`match.channel` 和可选 `accountId`，其余未暴露字段尽量保留。可用 `accountId` 做更细的 Feishu 路由。</p>
                </div>

                <div v-if="agent.bindings.length" class="agent-binding-list">
                  <div v-for="(binding, bindingIndex) in agent.bindings" :key="binding.id" class="agent-binding-row">
                    <n-input v-model:value="binding.channel" class="field-control" placeholder="channel，例如 feishu" />
                    <n-input v-model:value="binding.accountId" class="field-control" placeholder="accountId，可留空" />
                    <n-button tertiary size="small" :disabled="busy.save" @click="removeBinding(agent, bindingIndex)">删除</n-button>
                  </div>
                </div>
                <p v-else class="panel__muted">当前没有绑定规则。</p>

                <div class="agent-bindings__actions">
                  <n-button tertiary size="small" :disabled="busy.save" @click="addBinding(agent)">新增绑定</n-button>
                </div>
              </div>

              <div class="agent-tools">
                <div class="section-header">
                  <div>
                    <p class="panel__label">Tools策略</p>
                    <h3>按 Agent 限制工具</h3>
                  </div>
                  <p class="panel__muted">直接写入 `agents.list[].tools.profile / allow / deny`。留空时表示不覆盖该 Agent 的 tools 限制。</p>
                </div>

                <div class="form-grid">
                  <label class="field">
                    <span class="field__label">Tools Profile</span>
                    <n-select
                      :value="agent.toolsProfile || null"
                      class="field-control"
                      clearable
                      :options="toolsProfileOptions"
                      placeholder="选择 tools profile"
                      @update:value="(value) => { agent.toolsProfile = String(value ?? '') }"
                    />
                  </label>

                  <label class="field field--span-2">
                    <span class="field__label">Allow</span>
                    <n-input v-model:value="agent.toolsAllowText" class="field-control" placeholder="exec, web, group:plugins" />
                  </label>

                  <label class="field field--span-2">
                    <span class="field__label">Deny</span>
                    <n-input v-model:value="agent.toolsDenyText" class="field-control" placeholder="browser, exec" />
                  </label>
                </div>
              </div>

              <div class="agent-tools">
                <div class="section-header">
                  <div>
                    <p class="panel__label">Subagents</p>
                    <h3>按 Agent 覆盖子智能体参数</h3>
                  </div>
                  <p class="panel__muted">写入 `agents.list[].subagents`。当前支持 `model / thinking / allowAgents` 以及常用并发、深度、超时参数。</p>
                </div>

                <div class="form-grid">
                  <label class="field">
                    <span class="field__label">Subagent 模型</span>
                    <n-select
                      :value="agent.subagentsModelPrimary || null"
                      class="field-control"
                      clearable
                      filterable
                      :options="modelOptions"
                      placeholder="留空则继承默认值"
                      @update:value="(value) => { agent.subagentsModelPrimary = String(value ?? '') }"
                    />
                  </label>

                  <label class="field">
                    <span class="field__label">Thinking</span>
                    <n-input v-model:value="agent.subagentsThinking" class="field-control" placeholder="留空则继承默认值" />
                  </label>

                  <label class="field field--span-2">
                    <span class="field__label">Allow Agents</span>
                    <n-select
                      :value="agent.subagentsAllowAgents"
                      class="field-control"
                      multiple
                      filterable
                      clearable
                      :options="subagentAllowAgentOptions(agent)"
                      placeholder="选择允许调用的 Agent"
                      @update:value="(value) => { agent.subagentsAllowAgents = Array.isArray(value) ? (value as string[]) : [] }"
                    />
                  </label>

                  <label class="field">
                    <span class="field__label">Max Concurrent</span>
                    <n-input v-model:value="agent.subagentsMaxConcurrentText" class="field-control" placeholder="留空则继承默认值" />
                  </label>

                  <label class="field">
                    <span class="field__label">Max Spawn Depth</span>
                    <n-input v-model:value="agent.subagentsMaxSpawnDepthText" class="field-control" placeholder="1-5" />
                  </label>

                  <label class="field">
                    <span class="field__label">Max Children Per Agent</span>
                    <n-input v-model:value="agent.subagentsMaxChildrenPerAgentText" class="field-control" placeholder="留空则继承默认值" />
                  </label>

                  <label class="field">
                    <span class="field__label">Archive After Minutes</span>
                    <n-input v-model:value="agent.subagentsArchiveAfterMinutesText" class="field-control" placeholder="0 表示禁用自动归档" />
                  </label>

                  <label class="field">
                    <span class="field__label">Run Timeout Seconds</span>
                    <n-input v-model:value="agent.subagentsRunTimeoutSecondsText" class="field-control" placeholder="0 表示不超时" />
                  </label>

                  <label class="field">
                    <span class="field__label">Announce Timeout Ms</span>
                    <n-input v-model:value="agent.subagentsAnnounceTimeoutMsText" class="field-control" placeholder="例如 90000" />
                  </label>
                </div>
              </div>

              <div class="agent-sessions">
                <div class="section-header">
                  <div>
                    <p class="panel__label">Session</p>
                    <h3>{{ agent.sessionCount ?? 0 }} 个会话</h3>
                  </div>
                  <p class="panel__muted">清空后会删除该 agent 的 `sessions.json` 与会话 transcript 文件，用于强制从干净上下文重新开始。</p>
                </div>

                <p class="panel__muted">Store：{{ agent.sessionStorePath || '--' }}</p>
                <p class="panel__muted">Transcript 文件数：{{ agent.transcriptFileCount ?? 0 }}</p>

                <div class="agent-sessions__actions">
                  <n-popconfirm
                    v-model:show="sessionConfirmVisible[agent.id]"
                    positive-text="确认清空"
                    negative-text="取消"
                    @positive-click="confirmClearAgentSessions(agent)"
                  >
                    <template #trigger>
                      <n-button
                        class="danger-action"
                        type="warning"
                        size="small"
                        :disabled="busy.sessionAction || !agent.id.trim() || !(agent.sessionCount || agent.transcriptFileCount)"
                      >
                        {{ busy.sessionAction && busy.sessionAgentId === agent.id ? '清空中...' : '清空 Session' }}
                      </n-button>
                    </template>
                    清空 Agent `{{ agent.id }}` 的所有会话和 transcript？
                  </n-popconfirm>
                </div>

                <p v-if="agent.sessionMessage" class="status-text" :class="{ 'status-text--error': agent.sessionMessageIsError }">
                  {{ agent.sessionMessage }}
                </p>
              </div>

              <div class="agent-card__footer">
                <n-button type="primary" size="small" :disabled="busy.save || !hasPendingChanges" @click="saveAgents">
                  {{ busy.save ? '保存中...' : hasPendingChanges ? '保存 Agent 变更' : '保存 Agent 配置' }}
                </n-button>
              </div>
            </article>
          </div>
          <div class="agent-list__footer">
            <n-button tertiary :disabled="busy.save" @click="addAgent">新增 Agent</n-button>
            <n-button type="primary" :disabled="busy.save || !hasPendingChanges" @click="saveAgents">
              {{ busy.save ? '保存中...' : '保存设置' }}
            </n-button>
          </div>
        </template>
        <p v-else class="panel__muted">当前没有 Agent 条目。</p>
      </div>
    </section>

    <section class="two-column">
      <article class="panel panel--stretch">
        <div class="section-header">
          <div>
            <p class="panel__label">原始配置联动</p>
            <h3>当前 openclaw.json</h3>
          </div>
          <p class="panel__muted">结构化编辑保存后，这里的只读内容会同步更新。</p>
        </div>

        <n-input
          v-model:value="configContent"
          type="textarea"
          class="field-control editor-host"
          :autosize="{ minRows: 12, maxRows: 20 }"
          readonly
        />
      </article>

      <article class="panel">
        <div class="section-header">
          <div>
            <p class="panel__label">已发现渠道</p>
            <h3>Channel IDs</h3>
          </div>
        </div>
        <div class="agent-channel-list">
          <span v-for="channel in availableChannels" :key="channel.id" class="badge badge--neutral">{{ channel.label }}</span>
          <p v-if="availableChannels.length === 0" class="panel__muted">当前配置里还没有可识别的渠道 ID。</p>
        </div>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { NButton, NInput, NPopconfirm, NSelect } from 'naive-ui'

import type {
  AgentBindingEntry,
  AgentConfigDocument,
  AgentConfigEntry,
  AgentToolsProfile,
  ConfigDocument,
  QuickModelConfigDocument,
} from '@manclaw/shared'

import { apiRequest } from '../lib/api'
import { onServiceChanged } from '../lib/service-events'

interface EditableAgent extends AgentConfigEntry {
  toolsProfile: string
  toolsAllowText: string
  toolsDenyText: string
  subagentsModelPrimary: string
  subagentsThinking: string
  subagentsAllowAgents: string[]
  subagentsMaxConcurrentText: string
  subagentsMaxSpawnDepthText: string
  subagentsMaxChildrenPerAgentText: string
  subagentsArchiveAfterMinutesText: string
  subagentsRunTimeoutSecondsText: string
  subagentsAnnounceTimeoutMsText: string
  sessionMessage: string
  sessionMessageIsError: boolean
}

const agents = ref<EditableAgent[]>([])
const configContent = ref('')
const availableChannels = ref<AgentConfigDocument['availableChannels']>([])
const openClawAgentsUrl = ref('')
const modelOptions = ref<Array<{ label: string; value: string }>>([])
const defaultAgentId = ref('')
const lastSavedSnapshot = ref('')
const defaults = reactive({
  workspace: '',
  modelPrimary: '',
  compactionMode: '',
  subagents: {
    modelPrimary: '',
    thinking: '',
    allowAgents: [] as string[],
    maxConcurrentText: '',
    maxSpawnDepthText: '',
    maxChildrenPerAgentText: '',
    archiveAfterMinutesText: '',
    runTimeoutSecondsText: '',
    announceTimeoutMsText: '',
  },
})
const message = ref('在这里维护多个 Agent、默认角色和渠道绑定。')
const busy = reactive({
  refresh: false,
  save: false,
  sessionAction: false,
  sessionAgentId: '',
})
const sessionConfirmVisible = reactive<Record<string, boolean>>({})

let localAgentSeed = 0
let localBindingSeed = 0
let disposeServiceChanged: (() => void) | undefined
const toolsProfileOptions: Array<{ label: string; value: AgentToolsProfile }> = [
  { label: 'minimal', value: 'minimal' },
  { label: 'coding', value: 'coding' },
  { label: 'messaging', value: 'messaging' },
  { label: 'full', value: 'full' },
]
const compactionModeOptions = [
  { label: 'default', value: 'default' },
  { label: 'safeguard', value: 'safeguard' },
]

const defaultAgentOptions = computed(() =>
  agents.value
    .map((agent, index) => {
      const agentId = agent.id.trim()
      if (!agentId) {
        return null
      }

      return {
        label: agentId || `未命名 Agent #${index + 1}`,
        value: agentId,
      }
    })
    .filter((item): item is { label: string; value: string } => item !== null),
)
const defaultSubagentAllowAgentOptions = computed(() =>
  agents.value
    .map((agent, index) => {
      const agentId = agent.id.trim()
      if (!agentId) {
        return null
      }

      return {
        label: agentId || `Agent #${index + 1}`,
        value: agentId,
      }
    })
    .filter((item): item is { label: string; value: string } => item !== null),
)

const totalBindingCount = computed(() => agents.value.reduce((sum, agent) => sum + normalizeBindings(agent.bindings).length, 0))
const availableChannelSummary = computed(() => (availableChannels.value.length > 0 ? availableChannels.value.map((item) => item.label).join(', ') : '--'))
const messageIsError = computed(() => /失败|错误|required|duplicate|duplicated|invalid/i.test(message.value))
const currentPayloadSnapshot = computed(() => JSON.stringify(buildAgentPayload()))
const hasPendingChanges = computed(() => currentPayloadSnapshot.value !== lastSavedSnapshot.value)
const messageUpdatedAt = ref('')

function formatDateTime(value?: string): string {
  if (!value) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  })
}

function updateMessage(text: string): void {
  message.value = text
  messageUpdatedAt.value = new Date().toISOString()
}

function parseChannels(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function parseOptionalIntegerText(value: string): number | undefined {
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }

  const parsed = Number(normalized)
  return Number.isInteger(parsed) ? parsed : undefined
}

function createEditableBinding(partial?: Partial<AgentBindingEntry>): AgentBindingEntry {
  localBindingSeed += 1
  return {
    id: partial?.id?.trim() || `binding::local::${localBindingSeed}`,
    channel: partial?.channel ?? '',
    accountId: partial?.accountId ?? '',
  }
}

function normalizeBindings(bindings: AgentBindingEntry[]): AgentBindingEntry[] {
  const seen = new Set<string>()

  return bindings
    .map((binding) => ({
      id: binding.id,
      channel: binding.channel.trim(),
      accountId: binding.accountId?.trim() || '',
    }))
    .filter((binding) => {
      if (!binding.channel) {
        return false
      }

      const key = `${binding.channel}::${binding.accountId}`
      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
}

function createEditableAgent(partial?: Partial<EditableAgent>): EditableAgent {
  localAgentSeed += 1
  const sourceId = partial?.sourceId?.trim() || `local::${localAgentSeed}`
  return {
    sourceId,
    id: partial?.id ?? `agent-${localAgentSeed}`,
    bindings: (partial?.bindings ?? []).map((binding) => createEditableBinding(binding)),
    workspace: partial?.workspace ?? '',
    modelPrimary: partial?.modelPrimary ?? '',
    compactionMode: partial?.compactionMode ?? '',
    tools: partial?.tools ?? { allow: [], deny: [] },
    toolsProfile: partial?.toolsProfile ?? partial?.tools?.profile ?? '',
    toolsAllowText: partial?.toolsAllowText ?? partial?.tools?.allow?.join(', ') ?? '',
    toolsDenyText: partial?.toolsDenyText ?? partial?.tools?.deny?.join(', ') ?? '',
    subagents: partial?.subagents ?? { allowAgents: [] },
    subagentsModelPrimary: partial?.subagentsModelPrimary ?? partial?.subagents?.modelPrimary ?? '',
    subagentsThinking: partial?.subagentsThinking ?? partial?.subagents?.thinking ?? '',
    subagentsAllowAgents: partial?.subagentsAllowAgents ?? partial?.subagents?.allowAgents ?? [],
    subagentsMaxConcurrentText: partial?.subagentsMaxConcurrentText ?? String(partial?.subagents?.maxConcurrent ?? ''),
    subagentsMaxSpawnDepthText: partial?.subagentsMaxSpawnDepthText ?? String(partial?.subagents?.maxSpawnDepth ?? ''),
    subagentsMaxChildrenPerAgentText: partial?.subagentsMaxChildrenPerAgentText ?? String(partial?.subagents?.maxChildrenPerAgent ?? ''),
    subagentsArchiveAfterMinutesText: partial?.subagentsArchiveAfterMinutesText ?? String(partial?.subagents?.archiveAfterMinutes ?? ''),
    subagentsRunTimeoutSecondsText: partial?.subagentsRunTimeoutSecondsText ?? String(partial?.subagents?.runTimeoutSeconds ?? ''),
    subagentsAnnounceTimeoutMsText: partial?.subagentsAnnounceTimeoutMsText ?? String(partial?.subagents?.announceTimeoutMs ?? ''),
    resolvedWorkspace: partial?.resolvedWorkspace,
    skillsDir: partial?.skillsDir,
    disabledSkillsDir: partial?.disabledSkillsDir,
    workspaceSkills: partial?.workspaceSkills ?? [],
    sessionStorePath: partial?.sessionStorePath,
    sessionCount: partial?.sessionCount,
    transcriptFileCount: partial?.transcriptFileCount,
    sessionMessage: '',
    sessionMessageIsError: false,
  }
}

function nextAvailableAgentId(baseId: string): string {
  const normalizedBase = baseId.trim() || 'agent'
  const existingIds = new Set(agents.value.map((agent) => agent.id.trim()).filter(Boolean))

  if (!existingIds.has(normalizedBase)) {
    return normalizedBase
  }

  let suffix = 2
  while (existingIds.has(`${normalizedBase}-${suffix}`)) {
    suffix += 1
  }

  return `${normalizedBase}-${suffix}`
}

function subagentAllowAgentOptions(currentAgent: EditableAgent): Array<{ label: string; value: string }> {
  return agents.value
    .map((agent, index) => {
      const agentId = agent.id.trim()
      if (!agentId || agentId === currentAgent.id.trim()) {
        return null
      }

      return {
        label: agentId || `Agent #${index + 1}`,
        value: agentId,
      }
    })
    .filter((item): item is { label: string; value: string } => item !== null)
}

function buildAgentPayload(): {
  defaultAgentId: string
  defaults: {
    workspace: string
      modelPrimary: string
      compactionMode: string
      subagents: {
        modelPrimary?: string
        thinking?: string
        maxConcurrent?: number
        maxSpawnDepth?: number
        maxChildrenPerAgent?: number
        archiveAfterMinutes?: number
        runTimeoutSeconds?: number
        announceTimeoutMs?: number
        allowAgents: string[]
      }
    }
  items: Array<{
    sourceId: string
    id: string
    bindings: Array<{
      id: string
      channel: string
      accountId?: string
    }>
    workspace?: string
    modelPrimary?: string
      compactionMode?: string
      tools: {
        profile?: string
        allow: string[]
        deny: string[]
      }
      subagents: {
        modelPrimary?: string
        thinking?: string
        maxConcurrent?: number
        maxSpawnDepth?: number
        maxChildrenPerAgent?: number
        archiveAfterMinutes?: number
        runTimeoutSeconds?: number
        announceTimeoutMs?: number
        allowAgents: string[]
      }
    }>
} {
  return {
    defaultAgentId: defaultAgentId.value.trim(),
    defaults: {
      workspace: defaults.workspace.trim(),
      modelPrimary: defaults.modelPrimary.trim(),
      compactionMode: defaults.compactionMode.trim(),
      subagents: {
        modelPrimary: defaults.subagents.modelPrimary.trim() || undefined,
        thinking: defaults.subagents.thinking.trim() || undefined,
        maxConcurrent: parseOptionalIntegerText(defaults.subagents.maxConcurrentText),
        maxSpawnDepth: parseOptionalIntegerText(defaults.subagents.maxSpawnDepthText),
        maxChildrenPerAgent: parseOptionalIntegerText(defaults.subagents.maxChildrenPerAgentText),
        archiveAfterMinutes: parseOptionalIntegerText(defaults.subagents.archiveAfterMinutesText),
        runTimeoutSeconds: parseOptionalIntegerText(defaults.subagents.runTimeoutSecondsText),
        announceTimeoutMs: parseOptionalIntegerText(defaults.subagents.announceTimeoutMsText),
        allowAgents: Array.from(new Set(defaults.subagents.allowAgents.map((item) => item.trim()).filter(Boolean))),
      },
    },
    items: agents.value.map((agent) => ({
      sourceId: agent.sourceId,
      id: agent.id.trim(),
      bindings: normalizeBindings(agent.bindings).map((binding) => ({
        id: binding.id,
        channel: binding.channel,
        accountId: binding.accountId || undefined,
      })),
      workspace: agent.workspace?.trim() || undefined,
      modelPrimary: agent.modelPrimary?.trim() || undefined,
      compactionMode: agent.compactionMode?.trim() || undefined,
      tools: {
        profile: agent.toolsProfile.trim() || undefined,
        allow: parseChannels(agent.toolsAllowText),
        deny: parseChannels(agent.toolsDenyText),
      },
      subagents: {
        modelPrimary: agent.subagentsModelPrimary.trim() || undefined,
        thinking: agent.subagentsThinking.trim() || undefined,
        maxConcurrent: parseOptionalIntegerText(agent.subagentsMaxConcurrentText),
        maxSpawnDepth: parseOptionalIntegerText(agent.subagentsMaxSpawnDepthText),
        maxChildrenPerAgent: parseOptionalIntegerText(agent.subagentsMaxChildrenPerAgentText),
        archiveAfterMinutes: parseOptionalIntegerText(agent.subagentsArchiveAfterMinutesText),
        runTimeoutSeconds: parseOptionalIntegerText(agent.subagentsRunTimeoutSecondsText),
        announceTimeoutMs: parseOptionalIntegerText(agent.subagentsAnnounceTimeoutMsText),
        allowAgents: Array.from(new Set(agent.subagentsAllowAgents.map((item) => item.trim()).filter(Boolean))),
      },
    })),
  }
}

function applyDocument(document: AgentConfigDocument): void {
  availableChannels.value = document.availableChannels
  openClawAgentsUrl.value = document.openClawAgentsUrl?.trim() ?? ''
  defaults.workspace = document.defaults.workspace
  defaults.modelPrimary = document.defaults.modelPrimary
  defaults.compactionMode = document.defaults.compactionMode
  defaults.subagents.modelPrimary = document.defaults.subagents.modelPrimary ?? ''
  defaults.subagents.thinking = document.defaults.subagents.thinking ?? ''
  defaults.subagents.allowAgents = document.defaults.subagents.allowAgents ?? []
  defaults.subagents.maxConcurrentText = String(document.defaults.subagents.maxConcurrent ?? '')
  defaults.subagents.maxSpawnDepthText = String(document.defaults.subagents.maxSpawnDepth ?? '')
  defaults.subagents.maxChildrenPerAgentText = String(document.defaults.subagents.maxChildrenPerAgent ?? '')
  defaults.subagents.archiveAfterMinutesText = String(document.defaults.subagents.archiveAfterMinutes ?? '')
  defaults.subagents.runTimeoutSecondsText = String(document.defaults.subagents.runTimeoutSeconds ?? '')
  defaults.subagents.announceTimeoutMsText = String(document.defaults.subagents.announceTimeoutMs ?? '')
  agents.value = document.items.map((item) =>
    createEditableAgent({
      ...item,
      workspace: item.workspace ?? '',
      modelPrimary: item.modelPrimary ?? '',
      compactionMode: item.compactionMode ?? '',
      tools: item.tools ?? { allow: [], deny: [] },
      toolsProfile: item.tools?.profile ?? '',
      toolsAllowText: item.tools?.allow?.join(', ') ?? '',
      toolsDenyText: item.tools?.deny?.join(', ') ?? '',
      subagents: item.subagents ?? { allowAgents: [] },
      subagentsModelPrimary: item.subagents?.modelPrimary ?? '',
      subagentsThinking: item.subagents?.thinking ?? '',
      subagentsAllowAgents: item.subagents?.allowAgents ?? [],
      subagentsMaxConcurrentText: String(item.subagents?.maxConcurrent ?? ''),
      subagentsMaxSpawnDepthText: String(item.subagents?.maxSpawnDepth ?? ''),
      subagentsMaxChildrenPerAgentText: String(item.subagents?.maxChildrenPerAgent ?? ''),
      subagentsArchiveAfterMinutesText: String(item.subagents?.archiveAfterMinutes ?? ''),
      subagentsRunTimeoutSecondsText: String(item.subagents?.runTimeoutSeconds ?? ''),
      subagentsAnnounceTimeoutMsText: String(item.subagents?.announceTimeoutMs ?? ''),
      bindings: item.bindings.map((binding) => createEditableBinding(binding)),
      resolvedWorkspace: item.resolvedWorkspace,
      skillsDir: item.skillsDir,
      disabledSkillsDir: item.disabledSkillsDir,
      workspaceSkills: item.workspaceSkills ?? [],
      sessionStorePath: item.sessionStorePath,
      sessionCount: item.sessionCount,
      transcriptFileCount: item.transcriptFileCount,
    }),
  )
  defaultAgentId.value = document.defaultAgentId || document.items[0]?.id || ''
  lastSavedSnapshot.value = JSON.stringify(buildAgentPayload())
}

function openAgentSkillsEditor(): void {
  const targetUrl = openClawAgentsUrl.value.trim()
  if (!targetUrl) {
    updateMessage('当前没有可用的 OpenClaw Agents 页面地址。')
    return
  }

  window.open(targetUrl, '_blank', 'noopener,noreferrer')
  updateMessage('已打开 OpenClaw Agents 页面，可继续维护 Agent 技能。')
}

async function refreshAll(): Promise<void> {
  busy.refresh = true
  try {
    const [agentsDocument, configDocument, quickModelDocument] = await Promise.all([
      apiRequest<AgentConfigDocument>('/api/agents/current'),
      apiRequest<ConfigDocument>('/api/config/current'),
      apiRequest<QuickModelConfigDocument>('/api/model-setup/current'),
    ])

    if (!busy.save) {
      applyDocument(agentsDocument)
      updateMessage('已读取当前 Agent 配置。')
    }
    modelOptions.value = quickModelDocument.entries
      .map((entry) => {
        const providerKey = entry.provider === 'custom-openai' ? entry.customProviderId || 'custom-openai' : entry.provider
        const value = `${providerKey}/${entry.modelId}`
        return {
          label: value,
          value,
        }
      })
      .sort((left, right) => left.label.localeCompare(right.label))
    configContent.value = configDocument.content
  } catch (error) {
    updateMessage(error instanceof Error ? error.message : '读取 Agent 配置失败。')
  } finally {
    busy.refresh = false
  }
}

function addAgent(): void {
  const agentId = nextAvailableAgentId('agent')
  agents.value.push(createEditableAgent({ id: agentId, bindings: [] }))
  if (!defaultAgentId.value) {
    defaultAgentId.value = agentId
  }
  updateMessage(`已新增 Agent ${agentId}，变更尚未保存。`)
}

function copyAgent(agent: EditableAgent): void {
  const copiedId = nextAvailableAgentId(agent.id || 'agent')
  agents.value.push(
    createEditableAgent({
      ...agent,
      sourceId: undefined,
      id: copiedId,
    }),
  )
  updateMessage(`已复制 Agent 为 ${copiedId}，变更尚未保存。`)
}

function removeAgent(index: number): void {
  const [removed] = agents.value.splice(index, 1)
  if (removed && removed.id === defaultAgentId.value) {
    defaultAgentId.value = agents.value[0]?.id ?? ''
  }
  updateMessage(`已删除 Agent ${removed?.id || `#${index + 1}`}，变更尚未保存。`)
}

function addBinding(agent: EditableAgent): void {
  agent.bindings.push(createEditableBinding())
  updateMessage(`已为 Agent ${agent.id || '未命名 Agent'} 新增绑定，变更尚未保存。`)
}

function removeBinding(agent: EditableAgent, index: number): void {
  agent.bindings.splice(index, 1)
  updateMessage(`已从 Agent ${agent.id || '未命名 Agent'} 删除绑定，变更尚未保存。`)
}

async function saveAgents(): Promise<void> {
  busy.save = true
  try {
    const payload = buildAgentPayload()

    const document = await apiRequest<AgentConfigDocument>('/api/agents/save', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    applyDocument(document)
    updateMessage('Agent 配置已保存。')
    const configDocument = await apiRequest<ConfigDocument>('/api/config/current')
    configContent.value = configDocument.content
  } catch (error) {
    updateMessage(error instanceof Error ? error.message : '保存 Agent 配置失败。')
  } finally {
    busy.save = false
  }
}

async function clearAgentSessions(agent: EditableAgent): Promise<void> {
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
    await refreshAll()
  } catch (error) {
    agent.sessionMessage = error instanceof Error ? error.message : 'Agent session 清空失败。'
    agent.sessionMessageIsError = true
  } finally {
    busy.sessionAction = false
    busy.sessionAgentId = ''
  }
}

async function confirmClearAgentSessions(agent: EditableAgent): Promise<void> {
  const agentId = agent.id.trim()
  if (agentId) {
    sessionConfirmVisible[agentId] = false
  }
  await clearAgentSessions(agent)
}

onMounted(async () => {
  await refreshAll()
  disposeServiceChanged = onServiceChanged(() => {
    void refreshAll()
  })
})

onUnmounted(() => {
  disposeServiceChanged?.()
})
</script>

<style scoped>
.agent-list {
  display: grid;
  gap: 18px;
}

.agent-detail-section {
  display: grid;
  gap: 18px;
  margin-top: 18px;
}

.agent-list__footer {
  margin-top: 4px;
}

.agent-card {
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--line-strong) 78%, var(--accent) 22%);
  border-radius: 18px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-1) 72%, var(--accent) 28%),
      color-mix(in srgb, var(--bg-1) 76%, var(--accent-strong) 24%)
    ),
    color-mix(in srgb, var(--bg-1) 88%, var(--accent) 12%);
  box-shadow:
    0 18px 32px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.agent-card__footer {
  width: 100%;
  margin-top: 6px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--line) 78%, var(--text-2) 22%);
  justify-self: start;
}

.agent-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.agent-card__title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.agent-card__title h3 {
  margin: 0;
}

.agent-channel-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.agent-tools {
  display: grid;
  gap: 12px;
  padding-top: 4px;
  border-top: 1px solid var(--line);
}

.agent-bindings {
  display: grid;
  gap: 12px;
  padding-top: 4px;
  border-top: 1px solid var(--line);
}

.agent-binding-list {
  display: grid;
  gap: 10px;
}

.agent-binding-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.agent-bindings__actions {
  justify-self: start;
}

.agent-sessions {
  display: grid;
  gap: 10px;
  padding-top: 4px;
  border-top: 1px solid var(--line);
}

.agent-sessions__actions {
  margin-top: 10px;
  justify-self: start;
}

@media (max-width: 900px) {
  .agent-card__head {
    flex-direction: column;
  }

  .agent-binding-row {
    grid-template-columns: 1fr;
  }
}
</style>
