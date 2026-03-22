<template>
  <section class="service-dock">
    <div class="service-dock__head">
      <div>
        <p class="panel__label">服务控制</p>
        <strong>{{ currentService?.name || 'openclaw' }}</strong>
      </div>
      <span class="badge" :class="statusClass">{{ statusLabel }}</span>
    </div>

    <n-select v-model:value="currentServiceId" class="field-control" :options="serviceOptions" @update:value="switchProfile" />

    <n-button tertiary size="small" :disabled="busy.profiles" @click="openProfilesModal">
      Profiles 管理
    </n-button>

    <div class="service-dock__summary">
      <span class="service-dock__summary-chip">运行 {{ serviceSummary.running }}/{{ serviceSummary.total }}</span>
      <span class="service-dock__summary-chip">异常 {{ serviceSummary.degraded }}</span>
    </div>

    <RestartNoticeBar
      v-if="restartNotice.open"
      variant="inline"
      :busy="busy.restartNotice"
      :message="restartNotice.message"
      @restart="restartFromNotice"
      @dismiss="dismissRestartNotice"
    />

    <p class="service-dock__meta">命令：{{ currentService?.command || '--' }}</p>
    <p class="service-dock__message">{{ currentService?.message || '准备管理 openclaw 服务。' }}</p>

    <div class="service-dock__actions">
      <n-button type="primary" size="small" :disabled="busy.service" @click="controlService('start')">启动</n-button>
      <n-button tertiary size="small" :disabled="busy.service" @click="controlService('stop')">停止</n-button>
      <n-button tertiary size="small" :disabled="busy.service" @click="controlService('restart')">重启</n-button>
      <n-button tertiary size="small" :disabled="busy.fix" @click="runDoctorFix">
        {{ busy.fix ? 'FIX中...' : 'FIX' }}
      </n-button>
    </div>

    <n-modal
      v-model:show="profilesModalVisible"
      preset="card"
      class="tools-modal"
      title="Profiles 管理"
      :style="{ width: 'min(880px, calc(100vw - 32px))' }"
    >
      <div class="service-profile-form">
        <n-input
          v-model:value="profileForm.name"
          class="field-control"
          placeholder="输入新 profile 名称，例如 dev-2"
          @keyup.enter="createProfile"
        />
        <n-input
          v-model:value="profileForm.portText"
          class="field-control"
          placeholder="端口，留空时自动分配"
          @keyup.enter="createProfile"
        />
        <n-select
          v-model:value="profileForm.sourceId"
          class="field-control"
          clearable
          :disabled="Boolean(profileForm.workspaceSourceId)"
          :options="profileCopyOptions"
          placeholder="复制自现有 Profile（可选）"
        />
        <n-select
          v-model:value="profileForm.workspaceSourceId"
          class="field-control"
          clearable
          :disabled="Boolean(profileForm.sourceId)"
          :options="profileCopyOptions"
          placeholder="共享某个 Profile 的 workspace（可选）"
        />
        <n-button
          type="primary"
          class="service-profile-form__submit"
          :disabled="busy.profiles || !profileForm.name.trim()"
          @click="createProfile"
        >
          {{
            busy.profiles
              ? '处理中...'
              : profileForm.sourceId
                ? '复制 Profile'
                : profileForm.workspaceSourceId
                  ? '新增共享 Workspace Profile'
                  : '新增 Profile'
          }}
        </n-button>
      </div>

      <div v-if="profiles.length" class="service-profile-list">
        <div v-for="item in profiles" :key="item.id" class="service-profile-item">
          <div>
            <div class="service-profile-item__head">
              <strong>{{ item.label?.trim() || item.id }}</strong>
              <span v-if="currentSettings?.config.service.id === item.id" class="badge badge--running">当前</span>
            </div>
            <p class="panel__muted">ID：{{ item.id }}</p>
            <p class="panel__muted">端口：{{ item.port ?? '--' }}</p>
            <p class="panel__muted">CLI：{{ formatProfileArgs(item) }}</p>
          </div>
          <n-button tertiary size="small" :disabled="busy.profiles" @click="prepareCopyProfile(item)">
            复制
          </n-button>
          <n-popconfirm
            :disabled="busy.profiles || profiles.length <= 1"
            negative-text="取消"
            positive-text="删除"
            @positive-click="removeProfile(item.id)"
          >
            <template #trigger>
              <n-button tertiary size="small" class="danger-action" :disabled="busy.profiles || profiles.length <= 1">
                ×
              </n-button>
            </template>
            <div>确认删除 Profile "{{ item.id }}"？</div>
            <n-checkbox
              :checked="Boolean(deleteWorkspaceById[item.id])"
              @update:checked="(value) => updateDeleteWorkspace(item.id, value)"
            >
              同时删除 workspace
            </n-checkbox>
          </n-popconfirm>
        </div>
      </div>
      <p v-else class="panel__muted">暂无 profile。</p>

      <p class="status-text">{{ profileMessage }}</p>

      <div class="button-row">
        <n-button tertiary @click="closeProfilesModal">关闭</n-button>
      </div>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { NButton, NCheckbox, NInput, NModal, NPopconfirm, NSelect } from 'naive-ui'

import type {
  CreateProfilePayload,
  DeleteProfilePayload,
  ManagerSettingsDocument,
  ManagedServiceConfig,
  RestartNoticeDocument,
  ServiceDetail,
  ShellExecutionRecord,
} from '@manclaw/shared'

import { apiRequest } from '../lib/api'
import { emitServiceChanged } from '../lib/service-events'
import RestartNoticeBar from './RestartNoticeBar.vue'

const services = ref<ServiceDetail[]>([])
const profiles = ref<ManagedServiceConfig[]>([])
const currentServiceId = ref('')
const currentSettings = ref<ManagerSettingsDocument>()
const profilesModalVisible = ref(false)
const profileMessage = ref('新增 profile 时会先执行 OpenClaw onboard；失败不会写入管理配置。')
const busy = reactive({
  service: false,
  fix: false,
  profiles: false,
  restartNotice: false,
  switching: false,
})
const profileForm = reactive({
  name: '',
  portText: '',
  sourceId: null as string | null,
  workspaceSourceId: null as string | null,
})
const deleteWorkspaceById = reactive<Record<string, boolean>>({})
const restartNotice = reactive({
  open: false,
  message: '',
})

let refreshTimer: number | undefined

const currentService = computed(() => services.value.find((item) => item.id === currentServiceId.value) ?? services.value[0])
const statusLabel = computed(() => {
  switch (currentService.value?.status) {
    case 'running':
      return '运行中'
    case 'stopped':
      return '已停止'
    case 'degraded':
      return '异常'
    default:
      return '未知'
  }
})

const statusClass = computed(() => `badge--${currentService.value?.status ?? 'unknown'}`)
const serviceOptions = computed(() => profiles.value.map((item) => ({
  label: item.label?.trim() ? `${item.label} (${item.id})` : item.id,
  value: item.id,
})))
const profileCopyOptions = computed(() => profiles.value.map((item) => ({
  label: item.label?.trim() ? `${item.label} (${item.id})` : item.id,
  value: item.id,
})))
const serviceSummary = computed(() => ({
  total: services.value.length,
  running: services.value.filter((item) => item.status === 'running').length,
  stopped: services.value.filter((item) => item.status === 'stopped').length,
  degraded: services.value.filter((item) => item.status === 'degraded').length,
}))

function formatProfileArgs(service: ManagedServiceConfig): string {
  if (service.profileMode === 'dev') {
    return '--dev'
  }
  if (service.profileMode === 'profile' && service.profileName?.trim()) {
    return `--profile ${service.profileName.trim()}`
  }
  return 'default'
}

function parsePortText(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = Number(trimmed)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function suggestNextPort(): number {
  const usedPorts = profiles.value
    .map((item) => item.port)
    .filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item > 0)

  if (usedPorts.length === 0) {
    return 18789
  }

  return Math.max(...usedPorts) + 1
}

async function refreshStatus(): Promise<void> {
  try {
    const [nextServices, settings, restartNoticeDocument] = await Promise.all([
      apiRequest<ServiceDetail[]>('/api/openclaw/statuses'),
      apiRequest<ManagerSettingsDocument>('/api/manager/settings'),
      apiRequest<RestartNoticeDocument | null>('/api/restart-notice'),
    ])
    services.value = nextServices
    profiles.value = settings.config.services.items.length > 0 ? settings.config.services.items : [settings.config.service]
    currentSettings.value = settings
    currentServiceId.value = settings.config.service.id
    if (!busy.restartNotice) {
      applyRestartNotice(restartNoticeDocument)
    }
  } catch (error) {
    services.value = [
      {
        id: 'openclaw',
        name: 'openclaw',
        status: 'unknown',
        message: error instanceof Error ? error.message : '读取服务状态失败。',
      },
    ]
  }
}

function applyRestartNotice(document: RestartNoticeDocument | null): void {
  restartNotice.open = Boolean(document)
  restartNotice.message = document?.message ?? ''
}

async function dismissRestartNotice(): Promise<void> {
  busy.restartNotice = true
  try {
    await apiRequest<{ cleared: boolean }>('/api/restart-notice', {
      method: 'DELETE',
    })
    applyRestartNotice(null)
  } finally {
    busy.restartNotice = false
  }
}

async function controlService(action: 'start' | 'stop' | 'restart'): Promise<void> {
  busy.service = true
  try {
    await apiRequest<ServiceDetail>(`/api/openclaw/${action}`, {
      method: 'POST',
    })
    if (action === 'restart') {
      await dismissRestartNotice()
    }
    await refreshStatus()
  } catch (error) {
    const active = currentService.value
    if (active) {
      active.message = error instanceof Error ? error.message : '服务操作失败。'
    }
  } finally {
    busy.service = false
  }
}

async function runDoctorFix(): Promise<void> {
  busy.fix = true
  try {
    const result = await apiRequest<ShellExecutionRecord>('/api/shell/execute', {
      method: 'POST',
      body: JSON.stringify({ commandId: 'openclaw.doctor-fix' }),
    })
    if (currentService.value) {
      currentService.value.message = result.output || 'doctor --fix 已执行完成。'
    }
    await refreshStatus()
  } catch (error) {
    if (currentService.value) {
      currentService.value.message = error instanceof Error ? error.message : 'doctor --fix 执行失败。'
    }
  } finally {
    busy.fix = false
  }
}

async function restartFromNotice(): Promise<void> {
  busy.restartNotice = true
  try {
    const result = await apiRequest<ServiceDetail>('/api/openclaw/restart', {
      method: 'POST',
    })
    await apiRequest<{ cleared: boolean }>('/api/restart-notice', {
      method: 'DELETE',
    })
    applyRestartNotice(null)
    const active = services.value.find((item) => item.id === currentServiceId.value)
    if (active) {
      active.message =
        result.status === 'running'
          ? 'OpenClaw 已重启。'
          : `OpenClaw 重启后状态：${result.status === 'stopped' ? '已停止' : result.status === 'degraded' ? '异常' : '未知'}`
    }
    await refreshStatus()
  } catch (error) {
    if (currentService.value) {
      currentService.value.message = error instanceof Error ? error.message : 'OpenClaw 重启失败。'
    }
  } finally {
    busy.restartNotice = false
  }
}

async function switchProfile(nextId: string): Promise<void> {
  if (!currentSettings.value) {
    return
  }

  const target = profiles.value.find((item) => item.id === nextId)
  if (!target) {
    return
  }

  busy.switching = true
  try {
    await apiRequest<ManagerSettingsDocument>('/api/manager/settings', {
      method: 'POST',
      body: JSON.stringify({
        ...currentSettings.value.config,
        service: target,
        services: {
          items: profiles.value,
        },
      }),
    })
    emitServiceChanged({ serviceId: target.id })
    await refreshStatus()
  } finally {
    busy.switching = false
  }
}

function openProfilesModal(): void {
  profilesModalVisible.value = true
  if (!profileForm.portText.trim()) {
    profileForm.portText = String(suggestNextPort())
  }
}

function closeProfilesModal(): void {
  profilesModalVisible.value = false
}

function prepareCopyProfile(service: ManagedServiceConfig): void {
  profilesModalVisible.value = true
  profileForm.sourceId = service.id
  profileForm.workspaceSourceId = null
  profileForm.name = `${service.id}-copy`
  profileForm.portText = String(suggestNextPort())
  profileMessage.value = `将基于 ${service.id} 复制一个新 Profile。`
}

function updateDeleteWorkspace(profileId: string, checked: boolean): void {
  deleteWorkspaceById[profileId] = checked
}

async function createProfile(): Promise<void> {
  const nextId = profileForm.name.trim()
  if (!nextId) {
    return
  }

  if (profiles.value.some((item) => item.id === nextId)) {
    profileMessage.value = `Profile ${nextId} 已存在。`
    return
  }

  busy.profiles = true
  try {
    if (profileForm.portText.trim() && parsePortText(profileForm.portText) === undefined) {
      throw new Error('端口必须是正整数。')
    }
    const payload: CreateProfilePayload = {
      id: nextId,
      port: parsePortText(profileForm.portText),
      sourceId: profileForm.sourceId?.trim() || undefined,
      workspaceSourceId: profileForm.workspaceSourceId?.trim() || undefined,
    }

    await apiRequest<ManagerSettingsDocument>('/api/manager/profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    profileForm.name = ''
    profileForm.portText = String(suggestNextPort())
    profileForm.sourceId = null
    profileForm.workspaceSourceId = null
    profileMessage.value = payload.sourceId
      ? `Profile ${nextId} 已从 ${payload.sourceId} 复制并初始化。`
      : payload.workspaceSourceId
        ? `Profile ${nextId} 已创建，并共享 ${payload.workspaceSourceId} 的 workspace。`
        : `Profile ${nextId} 已初始化，可直接切换并启动。`
    await refreshStatus()
  } catch (error) {
    profileMessage.value = error instanceof Error ? error.message : '新增 Profile 失败。'
  } finally {
    busy.profiles = false
  }
}

async function removeProfile(profileId: string): Promise<void> {
  busy.profiles = true
  try {
    const payload: DeleteProfilePayload = {
      id: profileId,
      removeWorkspace: Boolean(deleteWorkspaceById[profileId]),
    }
    await apiRequest<ManagerSettingsDocument>('/api/manager/profiles/delete', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    delete deleteWorkspaceById[profileId]
    profileMessage.value = payload.removeWorkspace
      ? `Profile ${profileId} 已删除，workspace 也已清理。`
      : `Profile ${profileId} 已删除。`
    await refreshStatus()
  } catch (error) {
    profileMessage.value = error instanceof Error ? error.message : '删除 Profile 失败。'
  } finally {
    busy.profiles = false
  }
}

onMounted(async () => {
  await refreshStatus()
  refreshTimer = window.setInterval(() => {
    void refreshStatus()
  }, 5000)
})

onUnmounted(() => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
  }
})
</script>
