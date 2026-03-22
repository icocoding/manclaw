<template>
  <section class="page">
    <header class="hero hero--wide">
      <div>
        <p class="eyebrow">Channels</p>
        <h2>渠道配置</h2>
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
            <p class="panel__label">当前摘要</p>
            <h3>{{ channels.length }} 个 Channel</h3>
          </div>
          <p class="panel__muted">这里按 `openclaw.json -> channels` 管理渠道实例，并联动 `bindings[*]` 的 Agent 绑定。</p>
        </div>

        <p class="panel__muted">已绑定 Agent 数：{{ totalBindings }}</p>
        <p class="panel__muted">可选 Agent：{{ availableAgentSummary }}</p>

        <div class="button-row">
          <n-button type="primary" :disabled="busy.save || !hasPendingChanges" @click="saveChannels">
            {{ busy.save ? '保存中...' : '保存 Channels 配置' }}
          </n-button>
        </div>

        <p class="status-text" :class="{ 'status-text--error': messageIsError }">{{ message }}</p>
      </article>

      <article class="panel">
        <div class="section-header">
          <div>
            <p class="panel__label">可选 Agent</p>
            <h3>绑定目标</h3>
          </div>
        </div>
        <div class="channel-agent-list">
          <span v-for="agent in availableAgents" :key="agent.id" class="badge badge--neutral">{{ agent.label }}</span>
          <p v-if="availableAgents.length === 0" class="panel__muted">当前配置里还没有可绑定的 Agent。</p>
        </div>
      </article>
    </section>

    <section class="panel">
      <div class="section-header">
        <div>
          <p class="panel__label">Channel 列表</p>
          <h3>逐个维护实例配置与 Agent 映射</h3>
        </div>
        <p class="panel__muted">`Channel ID` 对应 `channels.&lt;id&gt;`；右侧绑定会重建 `bindings[*].match.channel` 与可选 `accountId`。</p>
      </div>

      <template v-if="channels.length">
        <div class="channel-list">
          <article v-for="(channel, index) in channels" :key="channel.sourceId || `${channel.id}-${index}`" class="channel-card">
            <div class="channel-card__head">
              <div>
                <div class="channel-card__title">
                  <h3>{{ channel.id || `channel-${index + 1}` }}</h3>
                  <span v-if="parsedType(channel)" class="badge badge--neutral">{{ parsedType(channel) }}</span>
                </div>
                <p class="panel__muted">#{{ index + 1 }} · sourceId={{ channel.sourceId || 'new' }}</p>
              </div>

              <div class="button-row">
                <n-button tertiary size="small" :disabled="busy.save" @click="copyChannel(channel)">复制</n-button>
                <n-button tertiary size="small" :disabled="busy.save" @click="removeChannel(index)">删除</n-button>
              </div>
            </div>

            <div class="form-grid">
              <label class="field">
                <span class="field__label">Channel ID</span>
                <n-input v-model:value="channel.id" class="field-control" placeholder="feishu" />
              </label>

              <label class="field">
                <span class="field__label">类型摘要</span>
                <n-input :value="parsedType(channel) || '未声明 type'" class="field-control" readonly />
              </label>
            </div>

            <div class="channel-bindings">
              <div class="section-header">
                <div>
                  <p class="panel__label">绑定规则</p>
                  <h3>按 Channel 维护 Agent 映射</h3>
                </div>
                <p class="panel__muted">适合把不同渠道实例路由到不同 Agent；可选 `accountId` 用于更细粒度匹配。</p>
              </div>

              <div v-if="channel.bindings.length" class="channel-binding-list">
                <div v-for="(binding, bindingIndex) in channel.bindings" :key="binding.id" class="channel-binding-row">
                  <n-select
                    :value="binding.agentId || null"
                    class="field-control"
                    :options="agentOptions"
                    placeholder="选择 Agent"
                    @update:value="(value) => { binding.agentId = String(value ?? '') }"
                  />
                  <n-input v-model:value="binding.accountId" class="field-control" placeholder="accountId，可留空" />
                  <n-button tertiary size="small" :disabled="busy.save" @click="removeBinding(channel, bindingIndex)">删除</n-button>
                </div>
              </div>
              <p v-else class="panel__muted">当前没有绑定规则。</p>

              <div class="channel-bindings__actions">
                <n-button tertiary size="small" :disabled="busy.save" @click="addBinding(channel)">新增绑定</n-button>
              </div>
            </div>

            <div class="channel-editor">
              <div class="section-header">
                <div>
                  <p class="panel__label">Channel 配置</p>
                  <h3>编辑 `channels.{{ channel.id || '...' }}`</h3>
                </div>
                <p class="panel__muted">这里填写该 channel 节点对应的 JSON 对象，保存时会直接写回真实 `openclaw.json`。</p>
              </div>

              <n-input
                v-model:value="channel.configText"
                type="textarea"
                class="field-control editor-host"
                :autosize="{ minRows: 8, maxRows: 16 }"
                placeholder="{\n  &quot;type&quot;: &quot;feishu&quot;\n}"
              />
            </div>

            <div class="channel-card__footer">
              <n-button type="primary" size="small" :disabled="busy.save || !hasPendingChanges" @click="saveChannels">
                {{ busy.save ? '保存中...' : '保存 Channels 配置' }}
              </n-button>
            </div>
          </article>
        </div>
        <div class="channel-list__footer">
          <n-button tertiary :disabled="busy.save" @click="addChannel">新增 Channel</n-button>
        </div>
      </template>
      <div v-else class="channel-empty-state">
        <p class="panel__muted">当前没有 Channel 条目。</p>
        <div class="channel-list__footer">
          <n-button tertiary :disabled="busy.save" @click="addChannel">新增 Channel</n-button>
        </div>
      </div>
    </section>

    <section class="two-column">
      <article class="panel">
        <div class="section-header">
          <div>
            <p class="panel__label">使用建议</p>
            <h3>当前阶段边界</h3>
          </div>
        </div>
        <p class="panel__muted">页面已能维护多个 channel 实例以及到 Agent 的绑定关系。</p>
        <p class="panel__muted">更细的渠道 schema 仍按原始 JSON 对象处理，暂不对不同 channel 类型做专用表单。</p>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { NButton, NInput, NSelect } from 'naive-ui'

import type {
  ChannelBindingEntry,
  ChannelConfigDocument,
  ChannelConfigEntry,
} from '@manclaw/shared'

import { apiRequest } from '../lib/api'
import { onServiceChanged } from '../lib/service-events'

const channels = ref<ChannelConfigEntry[]>([])
const availableAgents = ref<ChannelConfigDocument['availableAgents']>([])
const lastSavedSnapshot = ref('')
const message = ref('在这里维护多个 Channels，并配置它们与 Agent 的映射关系。')
const busy = reactive({
  refresh: false,
  save: false,
})

let localChannelSeed = 0
let localBindingSeed = 0
let disposeServiceChanged: (() => void) | undefined

const agentOptions = computed(() => availableAgents.value.map((item) => ({ label: item.label, value: item.id })))
const totalBindings = computed(() => channels.value.reduce((sum, item) => sum + normalizeBindings(item.id, item.bindings).length, 0))
const availableAgentSummary = computed(() => (availableAgents.value.length > 0 ? availableAgents.value.map((item) => item.label).join(', ') : '--'))
const currentPayloadSnapshot = computed(() => JSON.stringify(buildPayload()))
const hasPendingChanges = computed(() => currentPayloadSnapshot.value !== lastSavedSnapshot.value)
const messageIsError = computed(() => /失败|错误|required|duplicate|duplicated|invalid|unknown/i.test(message.value))

function createBinding(partial?: Partial<ChannelBindingEntry>): ChannelBindingEntry {
  localBindingSeed += 1
  return {
    id: partial?.id?.trim() || `channel-binding::local::${localBindingSeed}`,
    agentId: partial?.agentId ?? '',
    accountId: partial?.accountId ?? '',
  }
}

function createChannel(partial?: Partial<ChannelConfigEntry>): ChannelConfigEntry {
  localChannelSeed += 1
  return {
    sourceId: partial?.sourceId?.trim() || `channel::local::${localChannelSeed}`,
    id: partial?.id ?? `channel-${localChannelSeed}`,
    type: partial?.type,
    configText: partial?.configText ?? '{\n  "type": ""\n}',
    bindings: (partial?.bindings ?? []).map((binding) => createBinding(binding)),
  }
}

function normalizeBindings(channelId: string, bindings: ChannelBindingEntry[]): ChannelBindingEntry[] {
  const seen = new Set<string>()

  return bindings
    .map((binding, index) => ({
      id: binding.id?.trim() || `${channelId || 'channel'}::binding::${index + 1}`,
      agentId: binding.agentId.trim(),
      accountId: binding.accountId?.trim() || '',
    }))
    .filter((binding) => {
      if (!binding.agentId) {
        return false
      }

      const key = `${binding.agentId}::${binding.accountId}`
      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
}

function parsedType(channel: ChannelConfigEntry): string {
  try {
    const parsed = JSON.parse(channel.configText) as { type?: unknown }
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string' && parsed.type.trim()) {
      return parsed.type.trim()
    }
  } catch {
    return ''
  }

  return channel.type?.trim() || ''
}

function nextAvailableChannelId(baseId: string): string {
  const normalizedBase = baseId.trim() || 'channel'
  const existingIds = new Set(channels.value.map((item) => item.id.trim()).filter(Boolean))

  if (!existingIds.has(normalizedBase)) {
    return normalizedBase
  }

  let suffix = 2
  while (existingIds.has(`${normalizedBase}-${suffix}`)) {
    suffix += 1
  }

  return `${normalizedBase}-${suffix}`
}

function buildPayload(): ChannelConfigDocument {
  return {
    availableAgents: availableAgents.value,
    items: channels.value.map((channel) => ({
      sourceId: channel.sourceId,
      id: channel.id.trim(),
      type: parsedType(channel) || undefined,
      configText: channel.configText.trim(),
      bindings: normalizeBindings(channel.id, channel.bindings).map((binding) => ({
        id: binding.id,
        agentId: binding.agentId,
        accountId: binding.accountId || undefined,
      })),
    })),
  }
}

function applyDocument(document: ChannelConfigDocument): void {
  availableAgents.value = document.availableAgents
  channels.value = document.items.map((item) =>
    createChannel({
      ...item,
      bindings: item.bindings.map((binding) => createBinding(binding)),
    }),
  )
  lastSavedSnapshot.value = JSON.stringify(buildPayload())
}

async function refreshAll(): Promise<void> {
  busy.refresh = true
  try {
    const channelsDocument = await apiRequest<ChannelConfigDocument>('/api/channels/current')

    if (!busy.save) {
      applyDocument(channelsDocument)
      message.value = '已读取当前 Channels 配置。'
    }
  } catch (error) {
    message.value = error instanceof Error ? error.message : '读取 Channels 配置失败。'
  } finally {
    busy.refresh = false
  }
}

function addChannel(): void {
  channels.value.push(
    createChannel({
      id: nextAvailableChannelId('channel'),
    }),
  )
}

function copyChannel(channel: ChannelConfigEntry): void {
  channels.value.push(
    createChannel({
      ...channel,
      sourceId: undefined,
      id: nextAvailableChannelId(channel.id || 'channel'),
    }),
  )
}

function removeChannel(index: number): void {
  channels.value.splice(index, 1)
}

function addBinding(channel: ChannelConfigEntry): void {
  channel.bindings.push(createBinding())
}

function removeBinding(channel: ChannelConfigEntry, index: number): void {
  channel.bindings.splice(index, 1)
}

async function saveChannels(): Promise<void> {
  busy.save = true
  try {
    const payload = buildPayload()
    const document = await apiRequest<ChannelConfigDocument>('/api/channels/save', {
      method: 'POST',
      body: JSON.stringify({
        items: payload.items,
      }),
    })

    applyDocument(document)
    message.value = 'Channels 配置已保存。'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存 Channels 配置失败。'
  } finally {
    busy.save = false
  }
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
.channel-agent-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.channel-list {
  display: grid;
  gap: 18px;
}

.channel-list__footer {
  margin-top: 18px;
}

.channel-empty-state {
  display: grid;
  gap: 12px;
}

.channel-card {
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--line-strong) 76%, var(--accent) 24%);
  border-radius: 18px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-1) 74%, var(--accent) 26%),
      color-mix(in srgb, var(--bg-1) 80%, var(--accent-strong) 20%)
    );
}

.channel-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.channel-card__title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.channel-card__title h3 {
  margin: 0;
}

.channel-bindings,
.channel-editor {
  display: grid;
  gap: 12px;
  padding-top: 4px;
  border-top: 1px solid var(--line);
}

.channel-binding-list {
  display: grid;
  gap: 10px;
}

.channel-binding-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.channel-bindings__actions,
.channel-card__footer {
  justify-self: start;
}

.channel-card__footer {
  margin-top: 6px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--line) 78%, var(--text-2) 22%);
}

@media (max-width: 900px) {
  .channel-card__head {
    flex-direction: column;
  }

  .channel-binding-row {
    grid-template-columns: 1fr;
  }
}
</style>
