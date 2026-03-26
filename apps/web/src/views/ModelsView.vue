<template>
  <section class="page">
    <header class="hero hero--wide">
      <div>
        <p class="eyebrow">Models</p>
        <h2>模型配置</h2>
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
            <p class="panel__label">模型列表</p>
            <h3>管理模型 ID 与默认模型</h3>
          </div>
          <p class="panel__muted">当前 OpenClaw 配置 schema 只支持模型 ID，不支持额外的 `model` 映射字段。若上游版本号变化，仍需新增新的模型 ID，并重新调整默认模型或 Agent 绑定。</p>
        </div>

        <div class="button-row button-row--between">
          <label class="field field--default-select">
            <span class="field__label">默认模型</span>
            <n-select
              :value="defaultModelKey"
              class="field-control"
              :options="defaultModelOptions"
              placeholder="选择默认模型"
              @update:value="(value) => setDefaultModel(value as string)"
            />
          </label>
        </div>

        <div v-if="providerGroups.length > 0" class="model-list">
          <div class="model-list__head">
            <span>提供商</span>
            <span>模型 ID</span>
            <span>附加配置</span>
            <span>操作</span>
          </div>

          <article
            v-for="(group, index) in providerGroups"
            :key="group.id"
            class="model-row"
            :class="{ 'model-row--new': group.id === recentlyAddedGroupId }"
            :data-group-id="group.id"
          >
            <div class="model-row__main">
              <n-select
                :value="group.provider"
                class="field-control"
                :options="quickProviderOptions"
                @update:value="(value) => updateGroupProvider(group.id, value as QuickModelProvider)"
              />

              <div class="model-id-list">
                <div v-for="(modelEntry, modelIndex) in group.models" :key="modelEntry.id" class="model-id-row">
                  <n-input
                    :value="modelEntry.modelId"
                    class="field-control"
                    placeholder="模型 ID，例如 qwen3.5-plus"
                    @update:value="(value) => updateGroupModelId(group.id, modelIndex, value)"
                  />
                  <n-button tertiary :disabled="busy.quickModel || group.models.length === 1" @click="removeGroupModelId(group.id, modelIndex)">删除</n-button>
                </div>
                <n-button tertiary class="model-id-list__add" @click="addGroupModelId(group.id)">新增模型条目</n-button>
              </div>

              <div class="model-row__meta">
                <span class="model-chip">{{ groupSummary(group) }}</span>
                <n-button tertiary size="small" @click="toggleGroupDetails(group.id)">
                  {{ isGroupExpanded(group.id) ? '收起' : '展开' }}
                </n-button>
              </div>

              <div class="model-row__actions">
                <span class="panel__muted">#{{ index + 1 }}</span>
                <n-button tertiary :disabled="busy.quickModel || providerGroups.length === 1" @click="removeProviderGroup(group.id)">删除</n-button>
              </div>
            </div>

            <div v-if="isGroupExpanded(group.id)" class="model-row__details">
              <div class="form-grid">
                <label v-if="providerMeta(group.provider)?.supportsCustomProviderId" class="field">
                  <span class="field__label">自定义提供商 ID</span>
                  <n-input v-model:value="group.customProviderId" class="field-control" placeholder="例如 moonshot / lmstudio" />
                </label>

                <label v-if="providerMeta(group.provider)?.supportsBaseUrl" class="field">
                  <span class="field__label">Base URL</span>
                  <n-input v-model:value="group.baseUrl" class="field-control" placeholder="https://api.example.com/v1" />
                </label>

                <label v-if="providerMeta(group.provider)?.requiresApiKey" class="field">
                  <span class="field__label">API Key</span>
                  <n-input
                    v-model:value="group.apiKey"
                    class="field-control"
                    type="password"
                    show-password-on="click"
                    :placeholder="group.apiKeyConfigured && !group.apiKey ? '当前已存在受控 secret，留空则保留原配置' : 'sk-...'"
                  />
                  <span v-if="group.apiKeyConfigured && !group.apiKey" class="field__hint">当前 provider 已存在受控 secret 配置；如果这次只改模型 ID，可以留空并保留原有 secret。</span>
                </label>

                <label v-if="providerMeta(group.provider)?.supportsCustomProviderId" class="field">
                  <span class="field__label">环境变量名</span>
                  <n-input v-model:value="group.envVarName" class="field-control" placeholder="LLM_API_KEY" />
                </label>
              </div>
            </div>
          </article>
        </div>

        <div class="button-row model-list__footer">
          <n-button tertiary :disabled="busy.quickModel" @click="addProviderGroup">新增记录</n-button>
          <p class="panel__muted">这里维护的是 OpenClaw 认可的模型 ID。若供应商版本名发生变化，需要新增新的模型 ID，并把默认模型或 Agent 绑定切到新 ID。</p>
        </div>

        <div class="button-row model-actions">
          <n-button type="primary" :disabled="busy.quickModel" @click="applyQuickModelSetup">应用模型配置</n-button>
          <n-button tertiary :disabled="busy.refresh" @click="refreshAll">重置表单</n-button>
        </div>

        <p class="status-text" :class="{ 'status-text--error': quickModelMessageIsError }">{{ quickModelMessage }}</p>
      </article>

      <article class="panel">
        <div class="section-header">
          <div>
            <p class="panel__label">当前摘要</p>
            <h3>{{ quickModelSummaryTitle }}</h3>
          </div>
        </div>
        <p class="panel__muted">默认模型：{{ quickModelSummaryTitle }}</p>
        <p class="panel__muted">记录数：{{ providerGroups.length }}</p>
        <p class="panel__muted">模型 ID 总数：{{ totalModelCount }}</p>
        <p class="panel__muted" v-if="defaultModelEntry?.baseUrl">Base URL：{{ defaultModelEntry.baseUrl }}</p>
        <p class="panel__muted" v-if="defaultModelEntry?.customProviderId">Provider ID：{{ defaultModelEntry.customProviderId }}</p>
        <p class="panel__muted" v-if="defaultModelEntry?.envVarName">API Key Env：{{ defaultModelEntry.envVarName }}</p>
      </article>
    </section>

    <section class="two-column">
      <article class="panel panel--stretch">
        <div class="section-header">
          <div>
            <p class="panel__label">原始配置联动</p>
            <h3>当前 openclaw.json 内容</h3>
          </div>
          <p class="panel__muted">当前阶段先把结构化模型表单和原始配置读取放在同一页，后续再扩展为完整模型管理页。</p>
        </div>

        <n-input v-model:value="configContent" type="textarea" class="field-control editor-host" :autosize="{ minRows: 12, maxRows: 20 }" readonly />
      </article>

      <article class="panel">
        <div class="section-header">
          <div>
            <p class="panel__label">继续编辑</p>
            <h3>配置管理入口</h3>
          </div>
        </div>
        <p class="panel__muted">如果要直接手改完整 JSON、校验或回滚版本，继续使用概览页的配置管理区。</p>
        <div class="button-row">
          <RouterLink class="nav-action" to="/#config">打开原始配置区</RouterLink>
        </div>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { NButton, NInput, NSelect } from 'naive-ui'
import { RouterLink } from 'vue-router'

import { apiRequest } from '../lib/api'
import { onServiceChanged } from '../lib/service-events'

import type {
  ConfigDocument,
  QuickModelConfigPayload,
  QuickModelConfigDocument,
  QuickModelProvider,
} from '@manclaw/shared'

interface ModelProviderGroup {
  id: string
  provider: QuickModelProvider
  models: Array<{
    id: string
    modelId: string
  }>
  apiKey: string
  apiKeyConfigured: boolean
  baseUrl: string
  customProviderId: string
  envVarName: string
}

const quickModelProviders = ref<QuickModelConfigDocument['availableProviders']>([])
const quickModelMessage = ref('可在列表中直接维护 OpenClaw 支持的模型 ID，并指定默认模型。')
const quickModelMessageIsError = computed(() => /失败|错误|required|invalid|unsupported|must|缺少|不能为空|未填写/i.test(quickModelMessage.value))
const configContent = ref('')
const busy = reactive({
  refresh: false,
  quickModel: false,
})

const providerGroups = ref<ModelProviderGroup[]>([])
const defaultModelKey = ref('')
const expandedGroupIds = ref<string[]>([])
const recentlyAddedGroupId = ref('')
let disposeServiceChanged: (() => void) | undefined
const quickProviderOptions = computed(() => quickModelProviders.value.map((provider) => ({
  label: provider.label,
  value: provider.id,
})))
const defaultModelOptions = computed(() =>
  providerGroups.value.flatMap((group) =>
    group.models
      .map((entry) => entry.modelId.trim())
      .filter(Boolean)
      .map((modelId) => ({
        label: `${providerDisplayName(group)}/${modelId}`,
        value: createDefaultModelKey(group.id, modelId),
    })),
  ),
)
const defaultModelEntry = computed(() => {
  const parsed = parseDefaultModelKey(defaultModelKey.value)
  if (!parsed) {
    return undefined
  }

  const group = providerGroups.value.find((item) => item.id === parsed.groupId)
  if (!group) {
    return undefined
  }

  return {
    provider: group.provider,
    modelId: parsed.modelId,
    baseUrl: group.baseUrl,
    customProviderId: group.customProviderId,
    envVarName: group.envVarName,
  }
})
const quickModelSummaryTitle = computed(() => {
  const entry = defaultModelEntry.value
  return entry ? `${entry.provider === 'custom-openai' ? entry.customProviderId || 'custom-openai' : entry.provider}/${entry.modelId}` : '--'
})
const totalModelCount = computed(() => providerGroups.value.reduce((sum, group) => sum + group.models.length, 0))

let localGroupSeed = 0
let localModelSeed = 0

function createGroupModelEntry(): { id: string; modelId: string } {
  localModelSeed += 1
  return {
    id: `provider-model-${localModelSeed}`,
    modelId: '',
  }
}

function createProviderGroup(provider: QuickModelProvider = 'openai'): ModelProviderGroup {
  localGroupSeed += 1
  return {
    id: `provider-group-${localGroupSeed}`,
    provider,
    models: [createGroupModelEntry()],
    apiKey: '',
    apiKeyConfigured: false,
    baseUrl: '',
    customProviderId: '',
    envVarName: provider === 'custom-openai' ? 'LLM_API_KEY' : '',
  }
}

function providerDisplayName(group: ModelProviderGroup): string {
  return group.provider === 'custom-openai' ? group.customProviderId || 'custom-openai' : group.provider
}

function providerMeta(provider: QuickModelProvider) {
  return quickModelProviders.value.find((item) => item.id === provider)
}

function createDefaultModelKey(groupId: string, modelId: string): string {
  return `${groupId}:::${modelId}`
}

function parseDefaultModelKey(value: string): { groupId: string; modelId: string } | null {
  const separatorIndex = value.indexOf(':::')
  if (separatorIndex < 0) {
    return null
  }

  const groupId = value.slice(0, separatorIndex)
  const modelId = value.slice(separatorIndex + 3)
  if (!groupId || !modelId) {
    return null
  }

  return { groupId, modelId }
}

function groupSummary(group: ModelProviderGroup): string {
  const count = group.models.length
  return `${providerDisplayName(group)} · ${count} 个模型 ID`
}

function setDefaultModel(value: string): void {
  defaultModelKey.value = value
}

function isGroupExpanded(groupId: string): boolean {
  return expandedGroupIds.value.includes(groupId)
}

function toggleGroupDetails(groupId: string): void {
  if (isGroupExpanded(groupId)) {
    expandedGroupIds.value = expandedGroupIds.value.filter((id) => id !== groupId)
    return
  }

  expandedGroupIds.value = [...expandedGroupIds.value, groupId]
}

async function addProviderGroup(): Promise<void> {
  const group = createProviderGroup()
  providerGroups.value.push(group)
  expandedGroupIds.value = [...expandedGroupIds.value, group.id]
  recentlyAddedGroupId.value = group.id
  quickModelMessage.value = '已在列表末尾新增一条模型配置，请直接编辑高亮的新记录。'
  if (!defaultModelKey.value) {
    defaultModelKey.value = ''
  }

  await nextTick()
  const row = document.querySelector<HTMLElement>(`[data-group-id="${group.id}"]`)
  row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  row?.querySelector<HTMLInputElement>('input')?.focus()
}

function removeProviderGroup(groupId: string): void {
  providerGroups.value = providerGroups.value.filter((group) => group.id !== groupId)
  expandedGroupIds.value = expandedGroupIds.value.filter((id) => id !== groupId)
  normalizeDefaultModelSelection()
}

function updateGroupProvider(groupId: string, provider: QuickModelProvider): void {
  const group = providerGroups.value.find((item) => item.id === groupId)
  if (!group) {
    return
  }

  group.provider = provider
  if (provider !== 'custom-openai') {
    group.customProviderId = ''
    group.baseUrl = ''
    group.envVarName = ''
  }
  if (provider === 'custom-openai' && !group.envVarName) {
    group.envVarName = 'LLM_API_KEY'
  }
  if (provider === 'ollama') {
    group.apiKey = ''
    group.apiKeyConfigured = false
  }
}

function addGroupModelId(groupId: string): void {
  const group = providerGroups.value.find((item) => item.id === groupId)
  if (!group) {
    return
  }

  group.models = [...group.models, createGroupModelEntry()]
}

function updateGroupModelId(groupId: string, modelIndex: number, value: string): void {
  const group = providerGroups.value.find((item) => item.id === groupId)
  if (!group) {
    return
  }

  const nextModels = [...group.models]
  nextModels[modelIndex] = {
    ...nextModels[modelIndex],
    modelId: value,
  }
  group.models = nextModels
  normalizeDefaultModelSelection()
}

function removeGroupModelId(groupId: string, modelIndex: number): void {
  const group = providerGroups.value.find((item) => item.id === groupId)
  if (!group) {
    return
  }

  group.models = group.models.filter((_, index) => index !== modelIndex)
  normalizeDefaultModelSelection()
}

function normalizeDefaultModelSelection(): void {
  const parsed = parseDefaultModelKey(defaultModelKey.value)
  if (parsed) {
    const group = providerGroups.value.find((item) => item.id === parsed.groupId)
    if (group && group.models.some((item) => item.modelId.trim() === parsed.modelId)) {
      return
    }
  }

  const fallbackGroup = providerGroups.value.find((group) => group.models.some((item) => item.modelId.trim()))
  const fallbackModelId = fallbackGroup?.models.find((item) => item.modelId.trim())?.modelId.trim()
  defaultModelKey.value = fallbackGroup && fallbackModelId ? createDefaultModelKey(fallbackGroup.id, fallbackModelId) : ''
}

async function focusGroup(groupId: string): Promise<void> {
  expandedGroupIds.value = Array.from(new Set([...expandedGroupIds.value, groupId]))
  await nextTick()
  const row = document.querySelector<HTMLElement>(`[data-group-id="${groupId}"]`)
  row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  row?.querySelector<HTMLInputElement>('input')?.focus()
}

async function validateQuickModelSetup(): Promise<boolean> {
  normalizeDefaultModelSelection()

  const selectedDefault = parseDefaultModelKey(defaultModelKey.value)
  if (!selectedDefault) {
    quickModelMessage.value = '请选择默认模型。'
    return false
  }

  for (const [index, group] of providerGroups.value.entries()) {
    const entryLabel = `${providerDisplayName(group)}（第 ${index + 1} 条）`
    const hasModel = group.models.some((entry) => entry.modelId.trim())

    if (!hasModel) {
      quickModelMessage.value = `${entryLabel} 至少需要填写一个模型 ID。`
      await focusGroup(group.id)
      return false
    }

    const missingModelIdIndex = group.models.findIndex((entry) => !entry.modelId.trim())
    if (missingModelIdIndex >= 0) {
      quickModelMessage.value = `${entryLabel} 第 ${missingModelIdIndex + 1} 行缺少模型 ID。`
      await focusGroup(group.id)
      return false
    }

    if (providerMeta(group.provider)?.supportsCustomProviderId && !group.customProviderId.trim()) {
      quickModelMessage.value = `${entryLabel} 缺少自定义提供商 ID。`
      await focusGroup(group.id)
      return false
    }

    if (providerMeta(group.provider)?.supportsBaseUrl && !group.baseUrl.trim()) {
      quickModelMessage.value = `${entryLabel} 缺少 Base URL。`
      await focusGroup(group.id)
      return false
    }

    if (providerMeta(group.provider)?.requiresApiKey && !group.apiKey.trim() && !group.apiKeyConfigured) {
      quickModelMessage.value = `${entryLabel} 缺少 API Key。`
      await focusGroup(group.id)
      return false
    }

    if (providerMeta(group.provider)?.supportsCustomProviderId && !group.envVarName.trim() && group.apiKey.trim()) {
      quickModelMessage.value = `${entryLabel} 缺少环境变量名。`
      await focusGroup(group.id)
      return false
    }
  }

  return true
}

function applyQuickModelSettings(document: QuickModelConfigDocument): void {
  const grouped = new Map<string, ModelProviderGroup>()

  document.entries.forEach((entry) => {
    const provider = entry.provider
    const customProviderId = entry.customProviderId ?? ''
    const baseUrl = entry.baseUrl ?? ''
    const envVarName = entry.envVarName ?? ''
    const apiKey = entry.apiKey ?? ''
    const apiKeyConfigured = Boolean(entry.apiKeyConfigured)
    const groupKey = [provider, customProviderId, baseUrl, envVarName, apiKey, apiKeyConfigured ? 'configured' : 'empty'].join('||')

    if (!grouped.has(groupKey)) {
      const group = createProviderGroup(provider)
      group.customProviderId = customProviderId
      group.baseUrl = baseUrl
      group.envVarName = envVarName
      group.apiKey = apiKey
      group.apiKeyConfigured = apiKeyConfigured
      group.models = []
      grouped.set(groupKey, group)
    }

    grouped.get(groupKey)?.models.push({
      id: createGroupModelEntry().id,
      modelId: entry.modelId,
    })
  })

  providerGroups.value = Array.from(grouped.values()).map((group) => ({
    ...group,
    models: group.models.filter((entry) => entry.modelId.trim()),
  }))

  if (providerGroups.value.length === 0) {
    providerGroups.value = [createProviderGroup()]
  }

  expandedGroupIds.value = providerGroups.value
    .filter((group) => providerMeta(group.provider)?.supportsCustomProviderId)
    .map((group) => group.id)

  const defaultEntry = document.entries.find((entry) => entry.id === document.defaultModelId)
  if (defaultEntry) {
    const matchedGroup = providerGroups.value.find((group) =>
      group.provider === defaultEntry.provider &&
      group.customProviderId === (defaultEntry.customProviderId ?? '') &&
      group.baseUrl === (defaultEntry.baseUrl ?? '') &&
      group.envVarName === (defaultEntry.envVarName ?? '') &&
      group.apiKey === (defaultEntry.apiKey ?? '') &&
      group.apiKeyConfigured === Boolean(defaultEntry.apiKeyConfigured) &&
      group.models.some((entry) => entry.modelId === defaultEntry.modelId),
    )
    defaultModelKey.value = matchedGroup ? createDefaultModelKey(matchedGroup.id, defaultEntry.modelId) : ''
  } else {
    defaultModelKey.value = ''
  }

  normalizeDefaultModelSelection()
}

async function refreshAll(): Promise<void> {
  busy.refresh = true
  try {
    const [quickModel, currentConfig] = await Promise.all([
      apiRequest<QuickModelConfigDocument>('/api/model-setup/current'),
      apiRequest<ConfigDocument>('/api/config/current'),
    ])

    quickModelProviders.value = quickModel.availableProviders
    if (!busy.quickModel) {
      applyQuickModelSettings(quickModel)
    }
    configContent.value = currentConfig.content
  } catch (error) {
    quickModelMessage.value = error instanceof Error ? error.message : '模型信息刷新失败。'
  } finally {
    busy.refresh = false
  }
}

async function applyQuickModelSetup(): Promise<void> {
  busy.quickModel = true
  try {
    if (!(await validateQuickModelSetup())) {
      return
    }

    const selectedDefault = parseDefaultModelKey(defaultModelKey.value)
    let resolvedDefaultModelId = ''
    const entries = providerGroups.value.flatMap((group) =>
      group.models
        .map((entry) => ({
          modelId: entry.modelId.trim(),
        }))
        .filter((entry) => entry.modelId)
        .filter((entry, index, list) => list.findIndex((candidate) => candidate.modelId === entry.modelId) === index)
        .map((entry) => {
          const entryId = `${group.id}:::${entry.modelId}`
          if (selectedDefault && selectedDefault.groupId === group.id && selectedDefault.modelId === entry.modelId) {
            resolvedDefaultModelId = entryId
          }

          return {
            id: entryId,
            provider: group.provider,
            modelId: entry.modelId,
            apiKey: group.apiKey.trim() || undefined,
            apiKeyConfigured: group.apiKeyConfigured,
            baseUrl: group.baseUrl.trim() || undefined,
            customProviderId: group.customProviderId.trim() || undefined,
            envVarName: group.envVarName.trim() || undefined,
          }
        }),
    )
    const payload: QuickModelConfigPayload = {
      defaultModelId: resolvedDefaultModelId,
      entries,
    }
    const config = await apiRequest<ConfigDocument>('/api/model-setup/apply', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    configContent.value = config.content
    quickModelMessage.value = '模型配置已写入 openclaw.json。'
    await refreshAll()
  } catch (error) {
    quickModelMessage.value = error instanceof Error ? `模型配置保存失败：${error.message}` : '模型配置保存失败。'
  } finally {
    busy.quickModel = false
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
.model-list {
  display: grid;
  gap: 18px;
}

.model-list__head {
  display: grid;
  grid-template-columns: 1.1fr 1.5fr 1fr 120px;
  gap: 12px;
  padding: 0 4px;
  color: var(--text-2);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.model-row {
  border: 1px solid color-mix(in srgb, var(--line-strong) 76%, var(--accent) 24%);
  border-radius: 18px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-1) 78%, var(--accent) 22%),
      color-mix(in srgb, var(--bg-1) 84%, var(--accent-strong) 16%)
    );
}

.model-row--new {
  border-color: rgba(87, 181, 231, 0.75);
  box-shadow: 0 0 0 1px rgba(87, 181, 231, 0.2);
}

.model-row__main {
  display: grid;
  grid-template-columns: 1.1fr 1.5fr 1fr 120px;
  gap: 12px;
  align-items: center;
  padding: 16px;
}

.model-row__meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.model-row__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.model-row__details {
  border-top: 1px solid var(--line);
  padding: 0 16px 16px;
}


.model-chip {
  display: inline-flex;
  max-width: 100%;
  min-width: 0;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--line) 84%, var(--accent) 16%);
  border-radius: 999px;
  color: var(--text-1);
  background: color-mix(in srgb, var(--bg-1) 84%, var(--accent) 16%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-row__meta :deep(.n-button) {
  flex: none;
}

.model-id-list {
  display: grid;
  gap: 10px;
}

.model-id-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}


.model-id-list__add {
  justify-self: flex-start;
}

.model-list__footer {
  margin-top: 18px;
}

.model-actions {
  margin-top: 20px;
}

.button-row--between {
  justify-content: space-between;
  align-items: flex-end;
}

.field--default-select {
  min-width: 260px;
}

@media (max-width: 1080px) {
  .model-list__head {
    display: none;
  }

  .model-row__main {
    grid-template-columns: 1fr;
  }

  .model-row__actions {
    justify-content: space-between;
  }

  .model-id-row__fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
