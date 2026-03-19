<template>
  <section class="page">
    <header class="hero hero--wide">
      <div>
        <p class="eyebrow">Skills</p>
        <h2>技能管理</h2>
      </div>
      <div class="hero__actions">
        <RestartNoticeBar
          v-if="restartPrompt.open"
          variant="inline"
          :busy="busy.restart"
          :message="restartPrompt.message"
          @restart="restartOpenClaw"
          @dismiss="closeRestartPrompt"
        />
        <button class="button button--ghost" :disabled="busy.refresh" @click="refreshAll">
          {{ busy.refresh ? '刷新中...' : '刷新' }}
        </button>
      </div>
    </header>

    <section class="two-column">
      <article class="panel panel--stretch">
        <div class="section-header">
          <div>
            <p class="panel__label">安装技能</p>
            <h3>一个输入框，两种安装方式</h3>
          </div>
        </div>

        <p class="panel__muted">输入 Skill ID 后，可以先查说明，也可以直接安装。</p>

        <div class="skill-detail">
          <div class="skill-detail__head">
            <div>
              <h3>默认必装技能</h3>
              <p class="panel__muted">self-improving-agent、find-skills、summarize、openclaw-cli、openclaw-policy-check</p>
            </div>
            <button class="button" :disabled="busy.defaultInstall" @click="installDefaultSkills">
              {{ busy.defaultInstall ? '安装中...' : '安装默认技能' }}
            </button>
          </div>
          <div class="skill-card__badges">
            <span
              v-for="skill in defaultSkills.items"
              :key="skill.slug"
              class="badge"
              :class="skill.installed ? 'badge--recommended-installed' : 'badge--recommended-available'"
            >
              {{ skill.slug }}
            </span>
          </div>
        </div>

        <div class="shell-controls">
          <input
            v-model="skillSlug"
            class="input"
            type="text"
            placeholder="例如 self-improving-agent"
            @keydown.enter.prevent="inspectSkill"
          />
          <button class="button button--ghost" :disabled="busy.inspect || !skillSlug.trim()" @click="inspectSkill">
            {{ busy.inspect ? '查询中...' : '查询说明' }}
          </button>
          <button class="button" :disabled="busy.directInstall || !skillSlug.trim()" @click="installDirectSkill">
            {{ busy.directInstall ? '安装中...' : '直接安装' }}
          </button>
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
          <p v-if="skillDetail.warning" class="status-text status-text--error">{{ skillDetail.warning }}</p>

          <label v-if="skillDetail.suspicious && !skillDetail.malwareBlocked" class="field field--checkbox">
            <input v-model="forceInstall" type="checkbox" />
            <span class="field__label">我已确认风险，强制安装这个可疑 skill</span>
          </label>

          <div class="button-row">
            <button class="button" :disabled="busy.install || skillDetail.malwareBlocked" @click="installSkill">
              {{ busy.install ? '安装中...' : '确认安装' }}
            </button>
          </div>
        </div>
      </article>

      <article class="panel">
        <div class="section-header">
          <div>
            <p class="panel__label">目录</p>
            <h3>{{ installedSkills.workspaceDir || '--' }}</h3>
          </div>
        </div>
        <p class="panel__muted">启用目录：{{ installedSkills.installDir || '--' }}</p>
        <p class="panel__muted">禁用目录：{{ installedSkills.disabledDir || '--' }}</p>
        <p class="panel__muted">总数：{{ installedSkills.items.length }}</p>
      </article>
    </section>

    <section class="panel">
      <div class="section-header">
        <div>
          <p class="panel__label">已安装技能</p>
          <h3>查看、禁用、删除</h3>
        </div>
      </div>

      <p v-if="caseConflictWarnings.length" class="status-text status-text--error">
        检测到大小写冲突的技能：{{ caseConflictWarnings.join('；') }}。删除其中一个后，另一个仍会继续显示。
      </p>

      <div v-if="installedSkills.items.length" class="list">
        <div v-for="skill in installedSkills.items" :key="`${skill.state}:${skill.slug}`" class="list-item">
          <div>
            <strong>{{ skill.title }}</strong>
            <p class="skill-card__slug">{{ skill.slug }}</p>
            <p v-if="getCaseConflictLabel(skill.slug)" class="status-text status-text--warning">
              {{ getCaseConflictLabel(skill.slug) }}
            </p>
            <p class="panel__muted">{{ skill.summary }}</p>
            <p class="panel__muted">版本：{{ skill.version || '--' }}</p>
            <p class="panel__muted">位置：{{ skill.path }}</p>
          </div>
          <div class="skill-actions">
            <span class="badge" :class="skill.state === 'installed' ? 'badge--running' : 'badge--stopped'">
              {{ skill.state === 'installed' ? '已启用' : '已禁用' }}
            </span>
            <button
              v-if="skill.state === 'installed'"
              class="button button--ghost button--small"
              :disabled="busy.mutate"
              @click="updateSkill(skill.slug)"
            >
              更新
            </button>
            <button
              v-if="skill.state === 'installed'"
              class="button button--ghost button--small"
              :disabled="busy.mutate"
              @click="disableSkill(skill.slug)"
            >
              禁用
            </button>
            <button
              v-else
              class="button button--ghost button--small"
              :disabled="busy.mutate"
              @click="enableSkill(skill.slug)"
            >
              启用
            </button>
            <button class="button button--ghost button--small" :disabled="busy.mutate" @click="deleteSkill(skill.slug)">
              删除
            </button>
          </div>
        </div>
      </div>
      <p v-else class="panel__muted">当前工作区还没有可管理的技能。</p>

      <p class="status-text" :class="{ 'status-text--error': mutationIsError }">{{ mutationMessage }}</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { computed } from 'vue'

import { apiRequest } from '../lib/api'
import RestartNoticeBar from '../components/RestartNoticeBar.vue'

import type {
  InstalledSkillsDocument,
  RegistrySkillDetail,
  RestartNoticeDocument,
  ServiceDetail,
  SkillsCatalogDocument,
  SkillInstallResult,
  SkillMutationResult,
} from '@manclaw/shared'

const installedSkills = ref<InstalledSkillsDocument>({
  workspaceDir: '',
  installDir: '',
  disabledDir: '',
  items: [],
})
const defaultSkills = ref<SkillsCatalogDocument>({
  workspaceDir: '',
  installDir: '',
  registry: '',
  items: [],
})
const skillSlug = ref('')
const skillDetail = ref<RegistrySkillDetail>()
const forceInstall = ref(false)
const inspectMessage = ref('输入 skill ID 后查询说明，再决定是否安装。')
const mutationMessage = ref('已安装技能可以在这里禁用、启用或删除。')
const restartPrompt = reactive({
  open: false,
  message: '',
  status: '技能变更后建议重启 OpenClaw，使技能加载状态立即生效。',
  isError: false,
})
const busy = reactive({
  refresh: false,
  defaultInstall: false,
  directInstall: false,
  inspect: false,
  install: false,
  mutate: false,
  restart: false,
})

const inspectIsError = computed(() => /失败|错误|限流|blocked|拦截|可疑|not found|not be installed/i.test(inspectMessage.value))
const mutationIsError = computed(() => /失败|错误|限流|blocked|拦截|可疑|not found|not be installed/i.test(mutationMessage.value))
const caseConflictWarnings = computed(() => {
  const groups = new Map<string, string[]>()

  for (const item of installedSkills.value.items) {
    const key = item.slug.toLowerCase()
    const existing = groups.get(key) ?? []
    existing.push(item.slug)
    groups.set(key, existing)
  }

  return Array.from(groups.values())
    .filter((group) => new Set(group).size > 1)
    .map((group) => Array.from(new Set(group)).join(' / '))
})

function formatDateTime(value?: string): string {
  if (!value) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  })
}

function applyRestartPrompt(document: RestartNoticeDocument | null): void {
  restartPrompt.open = Boolean(document)
  restartPrompt.message = document?.message ?? ''
  restartPrompt.status = document?.status ?? '技能变更后建议重启 OpenClaw，使技能加载状态立即生效。'
  restartPrompt.isError = document?.isError ?? false
}

function getCaseConflictLabel(slug: string): string {
  const lower = slug.toLowerCase()
  const conflicts = installedSkills.value.items
    .map((item) => item.slug)
    .filter((name) => name.toLowerCase() === lower)
  const uniqueConflicts = Array.from(new Set(conflicts))

  if (uniqueConflicts.length <= 1) {
    return ''
  }

  return `存在大小写冲突：${uniqueConflicts.join(' / ')}`
}

async function closeRestartPrompt(): Promise<void> {
  await apiRequest<{ cleared: boolean }>('/api/restart-notice', {
    method: 'DELETE',
  })
  applyRestartPrompt(null)
}

async function openRestartPrompt(message: string): Promise<void> {
  const document = await apiRequest<RestartNoticeDocument>('/api/restart-notice', {
    method: 'POST',
    body: JSON.stringify({
      message,
      status: '技能变更后建议重启 OpenClaw，使技能加载状态立即生效。',
      isError: false,
    }),
  })
  applyRestartPrompt(document)
}

async function refreshInstalled(): Promise<void> {
  installedSkills.value = await apiRequest<InstalledSkillsDocument>('/api/skills/installed')
}

async function refreshDefaultSkills(): Promise<void> {
  defaultSkills.value = await apiRequest<SkillsCatalogDocument>('/api/skills/recommended')
}

async function refreshAll(): Promise<void> {
  busy.refresh = true
  try {
    const [, , restartNoticeDocument] = await Promise.all([
      refreshInstalled(),
      refreshDefaultSkills(),
      apiRequest<RestartNoticeDocument | null>('/api/restart-notice'),
    ])
    if (!busy.restart) {
      applyRestartPrompt(restartNoticeDocument)
    }
  } catch (error) {
    mutationMessage.value = error instanceof Error ? error.message : '技能列表刷新失败。'
  } finally {
    busy.refresh = false
  }
}

async function refreshSkillPanels(): Promise<void> {
  await Promise.all([refreshInstalled(), refreshDefaultSkills()])
}

async function installDefaultSkills(): Promise<void> {
  const slugs = defaultSkills.value.items.filter((item) => !item.installed).map((item) => item.slug)
  if (slugs.length === 0) {
    mutationMessage.value = '默认技能已经全部安装。'
    return
  }

  busy.defaultInstall = true
  try {
    const result = await apiRequest<SkillInstallResult>('/api/skills/install', {
      method: 'POST',
      body: JSON.stringify({ slugs }),
    })
    mutationMessage.value = result.results.every((item) => item.ok) ? '默认技能安装完成。' : '默认技能部分安装失败，请查看日志。'
    await refreshSkillPanels()
    if (result.results.some((item) => item.ok)) {
      await openRestartPrompt('默认技能安装已完成。建议现在重启 OpenClaw。')
    }
  } catch (error) {
    mutationMessage.value = error instanceof Error ? error.message : '默认技能安装失败。'
  } finally {
    busy.defaultInstall = false
  }
}

async function inspectSkill(): Promise<void> {
  if (!skillSlug.value.trim()) {
    return
  }

  busy.inspect = true
  try {
    skillDetail.value = await apiRequest<RegistrySkillDetail>(`/api/skills/inspect/${encodeURIComponent(skillSlug.value.trim())}`)
    forceInstall.value = false
    inspectMessage.value = '技能说明已加载，可确认安装。'
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
  if (!skillDetail.value) {
    return
  }

  busy.install = true
  try {
    const result = await apiRequest<SkillMutationResult>('/api/skills/install-one', {
      method: 'POST',
      body: JSON.stringify({
        slug: skillDetail.value.slug,
        force: forceInstall.value,
      }),
    })
    mutationMessage.value = result.message
    inspectMessage.value = `已安装 ${result.slug}。`
    await refreshSkillPanels()
    await openRestartPrompt(`技能 ${result.slug} 已安装。建议现在重启 OpenClaw。`)
  } catch (error) {
    mutationMessage.value = error instanceof Error ? error.message : '技能安装失败。'
  } finally {
    busy.install = false
  }
}

async function installDirectSkill(): Promise<void> {
  const slug = skillSlug.value.trim()
  if (!slug) {
    return
  }

  busy.directInstall = true
  try {
    const result = await apiRequest<SkillMutationResult>('/api/skills/install-one', {
      method: 'POST',
      body: JSON.stringify({
        slug,
        force: false,
        skipInspect: true,
      }),
    })
    mutationMessage.value = result.message
    inspectMessage.value = `技能 ${result.slug} 已安装。`
    skillSlug.value = ''
    await refreshSkillPanels()
    await openRestartPrompt(`技能 ${result.slug} 已安装。建议现在重启 OpenClaw。`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '技能安装失败。'
    mutationMessage.value = message
    inspectMessage.value = message
  } finally {
    busy.directInstall = false
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
    await openRestartPrompt(`技能 ${slug} 已禁用。建议现在重启 OpenClaw。`)
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
    await openRestartPrompt(`技能 ${slug} 已更新。建议现在重启 OpenClaw。`)
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
    await openRestartPrompt(`技能 ${slug} 已启用。建议现在重启 OpenClaw。`)
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
    await openRestartPrompt(`技能 ${slug} 已删除。建议现在重启 OpenClaw。`)
  } catch (error) {
    mutationMessage.value = error instanceof Error ? error.message : '技能删除失败。'
  } finally {
    busy.mutate = false
  }
}

async function restartOpenClaw(): Promise<void> {
  busy.restart = true
  try {
    const result = await apiRequest<ServiceDetail>('/api/openclaw/restart', {
      method: 'POST',
    })
    restartPrompt.status = `OpenClaw 已重启，当前状态：${result.status === 'running' ? '运行中' : result.status}`
    restartPrompt.isError = result.status !== 'running'
    mutationMessage.value = '已重启 OpenClaw。'
    if (result.status === 'running') {
      await closeRestartPrompt()
    }
  } catch (error) {
    restartPrompt.status = error instanceof Error ? error.message : 'OpenClaw 重启失败。'
    restartPrompt.isError = true
  } finally {
    busy.restart = false
  }
}

onMounted(async () => {
  await refreshAll()
})
</script>
