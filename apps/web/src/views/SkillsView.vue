<template>
  <section class="page">
    <header class="hero hero--wide">
      <div>
        <p class="eyebrow">Skills</p>
        <h2>技能管理</h2>
      </div>
      <div class="hero__actions">
        <n-button tertiary :disabled="busy.refresh" @click="refreshAll">
          {{ busy.refresh ? '刷新中...' : '刷新' }}
        </n-button>
      </div>
    </header>

    <section class="two-column">
      <article class="panel">
        <div class="section-header">
          <div>
            <p class="panel__label">运行时技能</p>
            <h3>{{ installedSkills.workspaceDir || '--' }}</h3>
          </div>
        </div>
        <p class="panel__muted">OpenClaw 托管技能目录：{{ installedSkills.managedSkillsDir || '--' }}</p>
        <p class="panel__muted">启用目录：{{ installedSkills.installDir || '--' }}</p>
        <p class="panel__muted">禁用目录：{{ installedSkills.disabledDir || '--' }}</p>
        <p class="panel__muted">总数：{{ installedSkills.items.length }}</p>
        <p class="panel__muted">可本地管理：{{ manageableSkillsCount }}</p>
      </article>
    </section>

    <section class="panel">
      <div class="section-header">
        <div>
          <p class="panel__label">技能列表</p>
          <h3>按类型拆分管理</h3>
        </div>
      </div>

      <p class="panel__muted">把本地工作区技能和系统运行时技能拆开管理，避免把目录操作和配置开关混在一张表里。</p>

      <p v-if="caseConflictWarnings.length" class="status-text status-text--error">
        检测到大小写冲突的技能：{{ caseConflictWarnings.join('；') }}。删除其中一个后，另一个仍会继续显示。
      </p>

      <div v-if="busy.refresh" class="skills-loading">
        <p class="panel__muted">正在读取 `openclaw skills list --json`，请稍候...</p>
      </div>

      <n-tabs v-model:value="activeTab" type="line" animated class="skills-tabs">
        <n-tab-pane name="workspace" tab="工作区技能">
          <p class="panel__muted">这里按所选 Agent 的 workspace 展示本地技能，并在同一处完成查询、安装、删除，以及目录级启用/禁用。</p>

          <label class="field skills-agent-field">
            <span class="field__label">目标 Agent</span>
            <n-select
              v-model:value="selectedInstallAgentId"
              class="field-control"
              :options="agentOptions"
              placeholder="选择要查看和安装到哪个 Agent"
            />
          </label>

          <div v-if="busy.refresh && !selectedAgent && availableAgents.length === 0" class="skills-loading">
            <p class="panel__muted">正在读取 Agent 列表与工作区技能，请稍候...</p>
          </div>

          <div v-else-if="selectedAgent" class="selected-agent-skills">
            <div class="section-header">
              <div>
                <p class="panel__label">技能能力</p>
                <h3>{{ selectedAgent.resolvedWorkspace || '--' }}</h3>
              </div>
              <p class="panel__muted">这里与 Agents 页保持一致：当前 Agent 的 workspace 会决定该 Agent 私有的 `skills/` 目录。</p>
            </div>

            <p class="panel__muted">技能目录：{{ selectedAgent.skillsDir || '--' }}</p>
            <p class="panel__muted">禁用目录：{{ selectedAgent.disabledSkillsDir || '--' }}</p>

            <div class="shell-controls">
              <n-input
                v-model:value="skillSlug"
                class="field-control"
                placeholder="例如 summarize"
                @keydown.enter.prevent="inspectSkill"
              />
              <n-button tertiary :disabled="busy.inspect || !skillSlug.trim()" @click="inspectSkill">
                {{ busy.inspect ? '查询中...' : '查询说明' }}
              </n-button>
              <n-button type="primary" :disabled="busy.directInstall || !canInstallToAgent" @click="installDirectSkill">
                {{ busy.directInstall ? '安装中...' : '安装到所选 Agent' }}
              </n-button>
            </div>

            <p class="status-text" :class="{ 'status-text--error': inspectIsError }">{{ inspectMessage }}</p>

            <div v-if="skillDetail" class="skill-detail">
              <div class="skill-detail__head">
                <div>
                  <h3>{{ skillDetail.title }}</h3>
                  <p class="skill-card__slug">{{ skillDetail.slug }}</p>
                </div>
                <div class="skill-card__badges">
                  <span class="badge badge--neutral">{{ skillDetail.source }}</span>
                  <span v-if="skillDetail.suspicious" class="badge badge--degraded">可疑</span>
                  <span v-if="skillDetail.malwareBlocked" class="badge badge--degraded">拦截</span>
                </div>
              </div>

              <p class="panel__muted">{{ skillDetail.summary }}</p>
              <p class="panel__muted">作者：{{ skillDetail.owner }}</p>
              <p class="panel__muted">版本：{{ skillDetail.latestVersion || '--' }}</p>
              <p class="panel__muted">更新时间：{{ formatDateTime(skillDetail.updatedAt) }}</p>
              <p class="panel__muted">安装目标 Agent：{{ selectedInstallAgentId || '--' }}</p>
              <p v-if="skillDetail.warning" class="status-text status-text--error">{{ skillDetail.warning }}</p>

              <n-checkbox v-if="skillDetail.suspicious && !skillDetail.malwareBlocked" v-model:checked="forceInstall">
                我已确认风险，强制安装这个可疑 skill
              </n-checkbox>

              <div class="button-row">
                <n-button type="primary" :disabled="busy.install || skillDetail.malwareBlocked || !selectedInstallAgentId" @click="installSkill">
                  {{ busy.install ? '安装中...' : '确认安装到所选 Agent' }}
                </n-button>
              </div>
            </div>
          </div>

          <p v-else class="panel__muted">请先选择一个 Agent，再查看该 workspace 的技能并执行安装。</p>

          <div v-if="busy.refresh && selectedAgent && workspaceTabSkills.length === 0" class="skills-loading">
            <p class="panel__muted">正在读取所选 Agent 的 workspace 技能，请稍候...</p>
          </div>

          <template v-else-if="selectedAgent && workspaceTabSkills.length">
            <p class="panel__muted">当前 Agent workspace 技能数：{{ workspaceTabSkills.length }}</p>
            <div class="selected-agent-skills__list">
              <span
                v-for="skill in workspaceTabSkills"
                :key="`workspace:${skill.state}:${skill.slug}`"
                class="badge"
                :class="skill.state === 'installed' ? 'badge--running' : 'badge--stopped'"
              >
                {{ skill.slug }}
                <button
                  type="button"
                  class="selected-agent-skill-remove"
                  :disabled="busy.mutate"
                  @click="deleteSelectedAgentSkill(skill.slug)"
                >
                  ×
                </button>
              </span>
            </div>
            <p
              v-for="skill in workspaceTabSkills"
              v-show="getCaseConflictLabel(skill.slug)"
              :key="`workspace-conflict:${skill.slug}`"
              class="panel__muted"
            >
              {{ skill.slug }}：{{ getCaseConflictLabel(skill.slug) }}
            </p>
          </template>
          <p v-else class="panel__muted">
            {{ selectedAgent ? '该 Agent workspace 里当前还没有本地技能。' : '请先选择一个 Agent。' }}
          </p>
        </n-tab-pane>

        <n-tab-pane name="runtime" tab="系统技能">
          <p class="panel__muted">这里展示 bundled / 运行时只读技能，主要通过 `openclaw.json -> skills.entries` 做启用/禁用配置。</p>
          <div class="skills-runtime-controls">
            <label class="field field--span-2">
              <span class="field__label">系统技能筛选</span>
              <n-input v-model:value="runtimeSkillFilter" class="field-control" placeholder="按技能名或来源过滤，例如 feishu / bundled / apple" />
            </label>

            <label class="field field--span-2">
              <span class="field__label">Allowlist</span>
              <n-select
                v-model:value="allowBundledDraft"
                class="field-control"
                multiple
                filterable
                clearable
                :options="allowBundledOptions"
                placeholder="选择允许的 bundled/system skills"
              />
            </label>
          </div>

          <div class="button-row">
            <n-button type="primary" :disabled="busy.skillsConfig" @click="saveAllowBundled">
              {{ busy.skillsConfig ? '保存中...' : '保存 Allowlist' }}
            </n-button>
          </div>

          <p class="panel__muted">当前 allowlist：{{ allowBundledDraft.length > 0 ? allowBundledDraft.join(', ') : '未配置，表示不额外限制 bundled skills。' }}</p>
          <div v-if="busy.refresh && runtimeTabSkills.length === 0" class="skills-loading">
            <p class="panel__muted">正在读取系统运行时技能，请稍候...</p>
          </div>

          <div v-else-if="runtimeTabSkills.length" class="table-wrap">
            <table class="skills-table">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>来源</th>
                  <th>状态</th>
                  <th>缺失条件</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="skill in runtimeTabSkills" :key="`runtime:${skill.state}:${skill.slug}`">
                  <td class="skills-table__name">
                    <strong>{{ skill.title }}</strong>
                    <p class="skill-card__slug">{{ skill.slug }}</p>
                    <p class="panel__muted">{{ skill.summary }}</p>
                    <p class="panel__muted">位置：{{ skill.path || '--' }}</p>
                  </td>
                  <td class="skills-table__source">
                    <div class="skills-table__badges">
                      <span class="badge badge--neutral">{{ skill.source || '--' }}</span>
                      <span class="badge badge--neutral">{{ skill.managementMode || 'config' }}</span>
                      <span v-if="typeof skill.bundled === 'boolean'" class="badge badge--neutral">bundled={{ String(skill.bundled) }}</span>
                      <span class="badge" :class="skill.eligible ? 'badge--running' : 'badge--stopped'">
                        eligible={{ String(Boolean(skill.eligible)) }}
                      </span>
                      <span v-if="skill.blockedByAllowlist" class="badge badge--degraded">blockedByAllowlist=true</span>
                    </div>
                  </td>
                  <td>
                    <div class="skills-table__badges">
                      <span class="badge" :class="skill.state === 'installed' ? 'badge--running' : 'badge--stopped'">
                        {{ skill.state === 'installed' ? '已启用' : '已禁用' }}
                      </span>
                    </div>
                  </td>
                  <td>
                    <p class="panel__muted">{{ formatMissingSummary(skill) || '--' }}</p>
                  </td>
                  <td>
                    <div class="skills-table__actions">
                      <span class="panel__muted">{{ skill.toggleManageable ? '配置开关' : '只读' }}</span>
                      <n-button
                        v-if="skill.toggleManageable && skill.state === 'installed'"
                        type="warning"
                        size="small"
                        :disabled="busy.mutate"
                        @click="disableSkill(skill.slug)"
                      >
                        禁用
                      </n-button>
                      <n-button
                        v-else-if="skill.toggleManageable"
                        type="success"
                        size="small"
                        :disabled="busy.mutate"
                        @click="enableSkill(skill.slug)"
                      >
                        启用
                      </n-button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="panel__muted">当前没有系统运行时技能。</p>
        </n-tab-pane>
      </n-tabs>

      <p class="status-text" :class="{ 'status-text--error': mutationIsError }">{{ mutationMessage }}</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { NButton, NCheckbox, NInput, NSelect, NTabPane, NTabs } from 'naive-ui'

import { apiRequest } from '../lib/api'
import { onServiceChanged } from '../lib/service-events'

import type {
  AgentConfigDocument,
  InstalledSkillsDocument,
  RegistrySkillDetail,
  SkillsConfigDocument,
  SkillMutationResult,
} from '@manclaw/shared'

const installedSkills = ref<InstalledSkillsDocument>({
  workspaceDir: '',
  installDir: '',
  disabledDir: '',
  managedSkillsDir: '',
  items: [],
})
const availableAgents = ref<AgentConfigDocument['items']>([])
const selectedInstallAgentId = ref('')
const skillSlug = ref('')
const skillDetail = ref<RegistrySkillDetail>()
const forceInstall = ref(false)
const activeTab = ref<'workspace' | 'runtime'>('workspace')
const runtimeSkillFilter = ref('')
const allowBundledDraft = ref<string[]>([])
const inspectMessage = ref('选择 Agent 后，可先查询 skill 说明，再决定是否安装。')
const mutationMessage = ref('技能管理页支持按 Agent 安装技能，同时保留查看、启用/禁用和 allowlist 管理。')
const busy = reactive({
  refresh: false,
  directInstall: false,
  inspect: false,
  install: false,
  mutate: false,
  skillsConfig: false,
})
let disposeServiceChanged: (() => void) | undefined

const inspectIsError = computed(() => /失败|错误|限流|blocked|拦截|可疑|not found|not be installed/i.test(inspectMessage.value))
const mutationIsError = computed(() => /失败|错误|限流|blocked|拦截|可疑|not found|not be installed/i.test(mutationMessage.value))
const manageableSkillsCount = computed(() => installedSkills.value.items.filter((item) => item.manageable).length)
const selectedAgent = computed(() => availableAgents.value.find((item) => item.id === selectedInstallAgentId.value))
const agentOptions = computed(() =>
  availableAgents.value.map((item) => ({
    label: item.id,
    value: item.id,
  })),
)
const canInstallToAgent = computed(() => Boolean(selectedInstallAgentId.value.trim() && skillSlug.value.trim()))
const workspaceTabSkills = computed(() => selectedAgent.value?.workspaceSkills ?? [])
const allowBundledOptions = computed(() =>
  installedSkills.value.items
    .filter((item) => item.bundled)
    .map((item) => item.slug)
    .sort((left, right) => left.localeCompare(right))
    .map((slug) => ({
      label: slug,
      value: slug,
    })),
)
const runtimeTabSkills = computed(() =>
  installedSkills.value.items.filter(
    (item) =>
      (item.managementMode === 'config' || (!item.managementMode && !item.manageable)) &&
      (!runtimeSkillFilter.value.trim() ||
        item.slug.toLowerCase().includes(runtimeSkillFilter.value.trim().toLowerCase()) ||
        (item.source ?? '').toLowerCase().includes(runtimeSkillFilter.value.trim().toLowerCase())),
  ),
)
const caseConflictWarnings = computed(() => {
  const groups = new Map<string, string[]>()

  for (const item of selectedAgent.value?.workspaceSkills ?? []) {
    const key = item.slug.toLowerCase()
    const existing = groups.get(key) ?? []
    existing.push(item.slug)
    groups.set(key, existing)
  }

  return Array.from(groups.values())
    .filter((group) => new Set(group).size > 1)
    .map((group) => Array.from(new Set(group)).join(' / '))
})

function formatMissingSummary(skill: InstalledSkillsDocument['items'][number]): string {
  if (!skill.missing) {
    return ''
  }

  const parts = [
    ...(skill.missing.bins ?? []).map((item) => `bin:${item}`),
    ...((skill.missing.anyBins ?? []).length ? [`any-bin:${skill.missing.anyBins.join(' | ')}`] : []),
    ...(skill.missing.env ?? []).map((item) => `env:${item}`),
    ...(skill.missing.config ?? []).map((item) => `config:${item}`),
    ...(skill.missing.os ?? []).map((item) => `os:${item}`),
  ]

  return parts.join(', ')
}

function formatDateTime(value?: string): string {
  if (!value) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  })
}

function getCaseConflictLabel(slug: string): string {
  const lower = slug.toLowerCase()
  const conflicts = (selectedAgent.value?.workspaceSkills ?? [])
    .map((item) => item.slug)
    .filter((name) => name.toLowerCase() === lower)
  const uniqueConflicts = Array.from(new Set(conflicts))

  if (uniqueConflicts.length <= 1) {
    return ''
  }

  return `存在大小写冲突：${uniqueConflicts.join(' / ')}`
}

async function refreshInstalled(): Promise<void> {
  installedSkills.value = await apiRequest<InstalledSkillsDocument>('/api/skills/installed')
}

async function refreshAgents(): Promise<void> {
  const document = await apiRequest<AgentConfigDocument>('/api/agents/current')
  availableAgents.value = document.items
  if (!selectedInstallAgentId.value || !document.items.some((item) => item.id === selectedInstallAgentId.value)) {
    selectedInstallAgentId.value = document.defaultAgentId || document.items[0]?.id || ''
  }
}

async function refreshSkillsConfig(): Promise<void> {
  const document = await apiRequest<SkillsConfigDocument>('/api/skills/config')
  allowBundledDraft.value = document.allowBundled
}

async function refreshAll(): Promise<void> {
  busy.refresh = true
  try {
    await Promise.all([
      refreshInstalled(),
      refreshAgents(),
      refreshSkillsConfig(),
    ])
  } catch (error) {
    mutationMessage.value = error instanceof Error ? error.message : '技能列表刷新失败。'
  } finally {
    busy.refresh = false
  }
}

async function refreshSkillPanels(): Promise<void> {
  await Promise.all([refreshInstalled(), refreshAgents(), refreshSkillsConfig()])
}

async function inspectSkill(): Promise<void> {
  if (!skillSlug.value.trim()) {
    return
  }

  busy.inspect = true
  try {
    skillDetail.value = await apiRequest<RegistrySkillDetail>(`/api/skills/inspect/${encodeURIComponent(skillSlug.value.trim())}`)
    forceInstall.value = false
    inspectMessage.value = '技能说明已加载，可安装到所选 Agent。'
  } catch (error) {
    skillDetail.value = undefined
    inspectMessage.value =
      error instanceof Error && error.message.includes('429')
        ? 'ClawHub 当前限流，请稍后再试。'
        : error instanceof Error
          ? error.message
          : '技能查询失败。'
  } finally {
    busy.inspect = false
  }
}

async function installSkill(): Promise<void> {
  const agentId = selectedInstallAgentId.value.trim()
  if (!skillDetail.value || !agentId) {
    return
  }

  busy.install = true
  try {
    const result = await apiRequest<SkillMutationResult>(`/api/agents/${encodeURIComponent(agentId)}/skills/install-one`, {
      method: 'POST',
      body: JSON.stringify({
        slug: skillDetail.value.slug,
        force: forceInstall.value,
      }),
    })
    mutationMessage.value = result.message
    inspectMessage.value = `已安装到 Agent ${agentId}：${result.slug}。`
    await refreshSkillPanels()
  } catch (error) {
    mutationMessage.value = error instanceof Error ? error.message : '技能安装失败。'
  } finally {
    busy.install = false
  }
}

async function installDirectSkill(): Promise<void> {
  const slug = skillSlug.value.trim()
  const agentId = selectedInstallAgentId.value.trim()
  if (!slug || !agentId) {
    return
  }

  busy.directInstall = true
  try {
    const result = await apiRequest<SkillMutationResult>(`/api/agents/${encodeURIComponent(agentId)}/skills/install-one`, {
      method: 'POST',
      body: JSON.stringify({
        slug,
        force: false,
        skipInspect: true,
      }),
    })
    mutationMessage.value = result.message
    inspectMessage.value = `技能 ${result.slug} 已安装到 Agent ${agentId}。`
    skillSlug.value = ''
    skillDetail.value = undefined
    forceInstall.value = false
    await refreshSkillPanels()
  } catch (error) {
    const message = error instanceof Error ? error.message : '技能安装失败。'
    mutationMessage.value = message
    inspectMessage.value = message
  } finally {
    busy.directInstall = false
  }
}

async function deleteSelectedAgentSkill(slug: string): Promise<void> {
  const agentId = selectedInstallAgentId.value.trim()
  if (!agentId || !slug.trim()) {
    return
  }

  const targetAgent = availableAgents.value.find((item) => item.id === agentId)
  const previousWorkspaceSkills = targetAgent?.workspaceSkills ? [...targetAgent.workspaceSkills] : undefined

  busy.mutate = true
  try {
    const result = await apiRequest<SkillMutationResult>(`/api/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    })

    if (targetAgent?.workspaceSkills) {
      targetAgent.workspaceSkills = targetAgent.workspaceSkills.filter((item) => item.slug !== slug)
    }

    mutationMessage.value = result.message
    void refreshSkillPanels()
  } catch (error) {
    if (targetAgent && previousWorkspaceSkills) {
      targetAgent.workspaceSkills = previousWorkspaceSkills
    }
    mutationMessage.value = error instanceof Error ? error.message : 'Agent 技能删除失败。'
  } finally {
    busy.mutate = false
  }
}

async function disableSkill(slug: string): Promise<void> {
  busy.mutate = true
  try {
    const result = await apiRequest<SkillMutationResult>(`/api/skills/${encodeURIComponent(slug)}/disable`, {
      method: 'POST',
    })
    mutationMessage.value = result.message
    await refreshSkillPanels()
  } catch (error) {
    mutationMessage.value = error instanceof Error ? error.message : '技能禁用失败。'
  } finally {
    busy.mutate = false
  }
}

async function updateSkill(slug: string): Promise<void> {
  busy.mutate = true
  try {
    const result = await apiRequest<SkillMutationResult>(`/api/skills/${encodeURIComponent(slug)}/update`, {
      method: 'POST',
    })
    mutationMessage.value = result.message
    await refreshSkillPanels()
  } catch (error) {
    mutationMessage.value = error instanceof Error ? error.message : '技能更新失败。'
  } finally {
    busy.mutate = false
  }
}

async function enableSkill(slug: string): Promise<void> {
  busy.mutate = true
  try {
    const result = await apiRequest<SkillMutationResult>(`/api/skills/${encodeURIComponent(slug)}/enable`, {
      method: 'POST',
    })
    mutationMessage.value = result.message
    await refreshSkillPanels()
  } catch (error) {
    mutationMessage.value = error instanceof Error ? error.message : '技能启用失败。'
  } finally {
    busy.mutate = false
  }
}

async function deleteSkill(slug: string): Promise<void> {
  busy.mutate = true
  try {
    const result = await apiRequest<SkillMutationResult>(`/api/skills/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    })
    mutationMessage.value = result.message
    await refreshSkillPanels()
  } catch (error) {
    mutationMessage.value = error instanceof Error ? error.message : '技能删除失败。'
  } finally {
    busy.mutate = false
  }
}

async function saveAllowBundled(): Promise<void> {
  busy.skillsConfig = true
  try {
    const document = await apiRequest<SkillsConfigDocument>('/api/skills/config', {
      method: 'POST',
      body: JSON.stringify({
        allowBundled: allowBundledDraft.value,
      }),
    })
    allowBundledDraft.value = document.allowBundled
    mutationMessage.value = '系统技能 allowlist 已保存。'
    await refreshInstalled()
  } catch (error) {
    mutationMessage.value = error instanceof Error ? error.message : '系统技能 allowlist 保存失败。'
  } finally {
    busy.skillsConfig = false
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
.skills-table__toolbar {
  margin: 12px 0 10px;
}

.skills-loading {
  margin: 12px 0 14px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--line) 84%, var(--accent) 16%);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-1) 84%, var(--accent) 16%);
}

.skills-runtime-controls {
  display: grid;
  gap: 12px;
  margin: 12px 0 14px;
}

.skills-agent-field {
  max-width: 360px;
}

.selected-agent-skills {
  display: grid;
  gap: 10px;
  padding-top: 4px;
  border-top: 1px solid var(--line);
}

.selected-agent-skills__list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.selected-agent-skill-remove {
  margin-left: 8px;
  border: 0;
  padding: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font: inherit;
  line-height: 1;
}

.table-wrap {
  overflow-x: auto;
}

.skills-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 980px;
}

.skills-table th,
.skills-table td {
  padding: 14px 12px;
  border-top: 1px solid var(--line);
  vertical-align: top;
  text-align: left;
}

.skills-table th {
  color: var(--text-2);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.skills-table__name {
  min-width: 300px;
}

.skills-table__source {
  min-width: 260px;
}

.skills-table__badges,
.skills-table__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
}
</style>
