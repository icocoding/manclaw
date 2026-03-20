<template>
  <section class="page">
    <header id="overview" class="hero hero--wide">
      <div>
        <p class="eyebrow">MVP Console</p>
        <h2>Your Claw, Under Control.</h2>
      </div>
      <div class="hero__actions">
        <RestartNoticeBar
          v-if="restartNotice.open"
          variant="inline"
          :busy="busy.restartNotice"
          :message="restartNotice.message"
          @restart="restartFromNotice"
          @dismiss="closeRestartNotice"
        />
        <n-button tertiary :disabled="busy.refresh" @click="refreshAll">
          {{ busy.refresh ? '刷新中...' : '刷新全部' }}
        </n-button>
        <span class="badge" :class="statusClass">{{ serviceStatusLabel }}</span>
      </div>
    </header>

    <section class="two-column">
      <article class="panel panel--stretch">
        <div class="section-header">
          <div>
            <p class="panel__label">接入设置</p>
            <h3>openclaw 路径与启动参数</h3>
          </div>
          <p class="panel__muted">当 `openclaw` 不在默认位置时，在这里填写。配置文件路径会通过环境变量传给 `openclaw`。</p>
        </div>

        <div class="form-grid">
          <label class="field field--span-2">
            <span class="field__label">可执行文件路径</span>
            <n-input v-model:value="managerForm.command" class="field-control" placeholder="/path/to/openclaw" />
          </label>

          <label class="field">
            <span class="field__label">进程名</span>
            <n-input v-model:value="managerForm.processName" class="field-control" placeholder="openclaw-gateway" />
          </label>

          <label class="field">
            <span class="field__label">工作目录</span>
            <n-input v-model:value="managerForm.cwd" class="field-control" placeholder="/path/to/workspace" />
          </label>

          <label class="field">
            <span class="field__label">配置文件路径</span>
            <n-input v-model:value="managerForm.configPath" class="field-control" placeholder="/path/to/openclaw.json" />
          </label>

          <label class="field field--span-2">
            <span class="field__label">启动参数</span>
            <n-input
              v-model:value="managerForm.argsText"
              class="field-control"
              type="textarea"
              :autosize="{ minRows: 5, maxRows: 8 }"
              placeholder="每行一个参数，例如：&#10;gateway&#10;--port&#10;18789"
            />
          </label>

          <div class="field field--checkbox field--full">
            <n-checkbox v-model:checked="managerForm.autoStart">启动 manclaw 时自动拉起 openclaw</n-checkbox>
          </div>

          <div class="field field--checkbox field--full">
            <n-checkbox v-model:checked="managerForm.autoRestart">openclaw 异常退出后自动重启</n-checkbox>
          </div>
        </div>

        <div class="button-row">
          <n-button type="primary" :disabled="busy.settings" @click="saveManagerSettings">保存接入设置</n-button>
        </div>

        <p class="status-text">{{ managerMessage }}</p>
      </article>

      <article class="panel">
        <div class="section-header">
          <div>
            <p class="panel__label">内部配置</p>
            <h3>manclaw 管理文件</h3>
          </div>
        </div>
        <p class="panel__muted">路径：{{ managerSettings?.path ?? '--' }}</p>
        <p class="panel__muted">最后更新：{{ formatDateTime(managerSettings?.updatedAt) }}</p>
      </article>
    </section>

    <section class="stats-grid">
      <article class="panel stat-panel">
        <p class="panel__label">服务状态</p>
        <h3>{{ service.name }}</h3>
        <p class="panel__value">{{ serviceStatusLabel }}</p>
        <p class="panel__muted">{{ service.message || '暂无状态说明' }}</p>
      </article>

      <article class="panel stat-panel">
        <p class="panel__label">进程 PID</p>
        <p class="panel__value">{{ service.pid ?? '--' }}</p>
        <p class="panel__muted">启动时间：{{ formatDateTime(service.startedAt) }}</p>
      </article>

      <article class="panel stat-panel">
        <p class="panel__label">运行时长</p>
        <p class="panel__value">{{ formatUptime(service.uptimeSeconds) }}</p>
        <p class="panel__muted">工作目录：{{ service.cwd ?? '--' }}</p>
      </article>

      <article class="panel stat-panel">
        <p class="panel__label">配置文件</p>
        <p class="panel__value panel__value--small">{{ config.path || '--' }}</p>
        <p class="panel__muted">最后更新：{{ formatDateTime(config.updatedAt) }}</p>
      </article>
    </section>

    <section class="two-column">
      <article class="panel panel--stretch">
        <div class="section-header">
          <div>
            <p class="panel__label">模型配置页</p>
            <h3>独立模型页已开始接管配置</h3>
          </div>
          <p class="panel__muted">模型配置正在从概览页弹窗迁移到独立页面，后续会继续扩展多模型能力。</p>
        </div>

        <div class="button-row">
          <RouterLink class="nav-action" to="/models">进入模型页</RouterLink>
        </div>

        <p class="status-text">{{ quickModelMessage }}</p>
      </article>

      <article class="panel">
        <div class="section-header">
          <div>
            <p class="panel__label">当前模型</p>
            <h3>{{ quickModelSummaryTitle }}</h3>
          </div>
        </div>
        <p class="panel__muted">默认模型：{{ quickModelSummaryTitle }}</p>
        <p class="panel__muted">条目总数：{{ quickModelEntries.length }}</p>
        <p class="panel__muted" v-if="defaultQuickModelEntry?.baseUrl">Base URL：{{ defaultQuickModelEntry.baseUrl }}</p>
      </article>
    </section>

    <section class="panel">
      <div class="section-header">
        <div>
          <p class="panel__label">服务控制</p>
          <h3>openclaw 管理</h3>
        </div>
        <p class="panel__muted">当前命令：{{ service.command ?? '--' }}</p>
      </div>
      <div class="button-row">
        <n-button type="primary" :disabled="busy.service" @click="controlService('start')">启动</n-button>
        <n-button tertiary :disabled="busy.service" @click="controlService('stop')">停止</n-button>
        <n-button tertiary :disabled="busy.service" @click="controlService('restart')">重启</n-button>
        <n-button tertiary :disabled="busy.shell" @click="runDoctorFix">
          {{ busy.shell ? '执行中...' : 'doctor --fix' }}
        </n-button>
      </div>
    </section>

    <section id="config" class="two-column">
      <article class="panel panel--stretch">
        <div class="section-header">
          <div>
            <p class="panel__label">配置管理</p>
            <h3>openclaw 当前配置</h3>
          </div>
          <p class="panel__muted">MVP 当前使用 JSON 配置。</p>
        </div>

        <n-input v-model:value="configContent" type="textarea" class="field-control editor-host" :autosize="{ minRows: 14, maxRows: 24 }" />

        <div class="button-row">
          <n-button tertiary :disabled="busy.config || revisions.length === 0" @click="undoLastConfig">撤回上次修改</n-button>
          <n-button tertiary :disabled="busy.config" @click="validateConfig">校验配置</n-button>
          <n-button type="primary" :disabled="busy.config" @click="saveConfig">保存配置</n-button>
        </div>

        <p class="status-text">{{ configMessage }}</p>
      </article>

      <article class="panel">
        <div class="section-header">
          <div>
            <p class="panel__label">版本记录</p>
            <h3>配置历史</h3>
          </div>
        </div>

        <div v-if="revisions.length" class="list">
          <div v-for="revision in revisions" :key="revision.id" class="list-item">
            <div>
              <strong>{{ revision.id }}</strong>
              <p class="panel__muted">{{ formatDateTime(revision.createdAt) }}</p>
              <p class="panel__muted">{{ revision.comment || '无备注' }}</p>
            </div>
            <n-button tertiary size="small" :disabled="busy.config" @click="rollbackConfig(revision.id)">
              回滚
            </n-button>
          </div>
        </div>
        <p v-else class="panel__muted">暂无配置版本。</p>
      </article>
    </section>

    <section id="logs" class="two-column">
      <article class="panel panel--stretch">
        <div class="section-header">
          <div>
            <p class="panel__label">运行日志</p>
            <h3>服务输出</h3>
          </div>
          <n-button tertiary size="small" :disabled="busy.logs" @click="refreshLogs">刷新</n-button>
        </div>

        <div class="log-view">
          <div v-for="entry in runtimeLogs" :key="entry.id" class="log-entry">
            <span class="log-entry__time">{{ formatDateTime(entry.timestamp) }}</span>
            <span class="log-entry__level">{{ entry.level.toUpperCase() }}</span>
            <span>{{ entry.message }}</span>
          </div>
        </div>
      </article>

      <article class="panel">
        <div class="section-header">
          <div>
            <p class="panel__label">审计日志</p>
            <h3>关键操作</h3>
          </div>
        </div>

        <div class="log-view log-view--compact">
          <div v-for="entry in auditLogs" :key="entry.id" class="log-entry">
            <span class="log-entry__time">{{ formatDateTime(entry.timestamp) }}</span>
            <span>{{ entry.message }}</span>
          </div>
        </div>
      </article>
    </section>

    <section id="shell" class="panel">
      <div class="section-header">
        <div>
          <p class="panel__label">受控 Shell</p>
          <h3>命令执行</h3>
        </div>
        <p class="panel__muted">仅允许预定义命令。</p>
      </div>

      <div class="shell-controls">
        <n-select v-model:value="selectedCommandId" class="field-control shell-select" :options="allowedCommandOptions" />
        <n-button type="primary" :disabled="busy.shell || !selectedCommandId" @click="executeCommand">
          {{ busy.shell ? '执行中...' : '执行命令' }}
        </n-button>
      </div>

      <p class="status-text">{{ shellMessage }}</p>
      <pre class="terminal">{{ shellOutput || '暂无命令输出。' }}</pre>
    </section>

  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { NButton, NCheckbox, NInput, NSelect } from 'naive-ui'
import { RouterLink } from 'vue-router'

import { apiRequest } from '../lib/api'
import RestartNoticeBar from '../components/RestartNoticeBar.vue'

import type {
  ConfigDocument,
  ConfigRevision,
  ConfigValidationResult,
  LogEntry,
  ManagerSettingsDocument,
  QuickModelConfigDocument,
  QuickModelEntry,
  RestartNoticeDocument,
  ServiceDetail,
  ShellAllowedCommand,
  ShellExecutionRecord,
  SystemSummary,
} from '@manclaw/shared'

const service = ref<ServiceDetail>({
  id: 'openclaw',
  name: 'openclaw',
  status: 'unknown',
  message: '正在加载服务状态...',
})
const config = ref<ConfigDocument>({
  format: 'json',
  path: '',
  content: '',
  updatedAt: '',
})
const configContent = ref('')
const managerSettings = ref<ManagerSettingsDocument>()
const managerMessage = ref('可在这里填写非默认的 openclaw 路径和配置路径。配置文件路径会通过环境变量传递。')
const quickModelProviders = ref<QuickModelConfigDocument['availableProviders']>([])
const quickModelMessage = ref('模型配置已迁移到独立页面，后续会继续补齐多模型能力。')
const quickModelEntries = ref<QuickModelEntry[]>([])
const quickModelDefaultId = ref('')
const revisions = ref<ConfigRevision[]>([])
const runtimeLogs = ref<LogEntry[]>([])
const auditLogs = ref<LogEntry[]>([])
const allowedCommands = ref<ShellAllowedCommand[]>([])
const selectedCommandId = ref('')
const shellOutput = ref('')
const shellMessage = ref('准备执行受控命令。')
const configMessage = ref('可直接编辑配置并保存。')
const busy = reactive({
  refresh: false,
  service: false,
  settings: false,
  quickModel: false,
  config: false,
  logs: false,
  shell: false,
  restartNotice: false,
})
const restartNotice = reactive({
  open: false,
  message: '',
  status: '配置已更新，建议重启 OpenClaw 以立即生效。',
  isError: false,
})

const managerForm = reactive({
  command: '',
  processName: '',
  cwd: '',
  configPath: '',
  argsText: '',
  autoStart: true,
  autoRestart: true,
})

let refreshTimer: number | undefined

const serviceStatusLabel = computed(() => {
  switch (service.value.status) {
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

const statusClass = computed(() => `badge--${service.value.status}`)
const defaultQuickModelEntry = computed(() => quickModelEntries.value.find((entry) => entry.id === quickModelDefaultId.value))
const quickModelSummaryTitle = computed(() => {
  const entry = defaultQuickModelEntry.value
  if (!entry) {
    return '--'
  }

  const providerName = entry.provider === 'custom-openai' ? entry.customProviderId || 'custom-openai' : entry.provider
  return `${providerName}/${entry.model || '--'}`
})
const allowedCommandOptions = computed(() => allowedCommands.value.map((command) => ({
  label: `${command.title} (${command.riskLevel})`,
  value: command.id,
})))

function formatDateTime(value?: string): string {
  if (!value) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  })
}

function formatUptime(seconds?: number): string {
  if (!seconds && seconds !== 0) {
    return '--'
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return `${hours}h ${minutes}m ${remainingSeconds}s`
}

async function refreshAll(): Promise<void> {
  busy.refresh = true
  try {
    const [summary, serviceStatus, settings, restartNoticeDocument, quickModel, runtime, audit, commands] = await Promise.all([
      apiRequest<SystemSummary>('/api/system/summary'),
      apiRequest<ServiceDetail>('/api/openclaw/status'),
      apiRequest<ManagerSettingsDocument>('/api/manager/settings'),
      apiRequest<RestartNoticeDocument | null>('/api/restart-notice'),
      apiRequest<QuickModelConfigDocument>('/api/model-setup/current'),
      apiRequest<LogEntry[]>('/api/logs/runtime?limit=40'),
      apiRequest<LogEntry[]>('/api/logs/audit?limit=40'),
      apiRequest<{ items: ShellAllowedCommand[] }>('/api/shell/allowed-commands'),
    ])

    service.value = serviceStatus
    managerSettings.value = settings
    if (!busy.settings) {
      applyManagerSettings(settings)
    }
    if (!busy.restartNotice) {
      applyRestartNotice(restartNoticeDocument)
    }
    quickModelProviders.value = quickModel.availableProviders
    applyQuickModelSettings(quickModel)
    runtimeLogs.value = runtime
    auditLogs.value = audit
    allowedCommands.value = commands.items

    const [configResult, revisionsResult] = await Promise.allSettled([
      apiRequest<ConfigDocument>('/api/config/current'),
      apiRequest<ConfigRevision[]>('/api/config/revisions'),
    ])

    if (configResult.status === 'fulfilled') {
      config.value = configResult.value
      if (!busy.config) {
        configContent.value = configResult.value.content
        configMessage.value = '可直接编辑 openclaw 配置并保存。'
      }
    } else {
      config.value = {
        format: 'json',
        path: managerForm.configPath,
        content: '',
        updatedAt: '',
      }
      if (!busy.config) {
        configContent.value = ''
        configMessage.value = configResult.reason instanceof Error ? configResult.reason.message : '无法读取 openclaw 配置。'
      }
    }

    revisions.value = revisionsResult.status === 'fulfilled' ? revisionsResult.value : []

    if (!selectedCommandId.value && commands.items.length > 0) {
      selectedCommandId.value = commands.items[0].id
    }

    const openclawSummary = summary.services.find((item) => item.id === 'openclaw')
    if (openclawSummary?.message) {
      service.value.message = openclawSummary.message
    }
  } catch (error) {
    shellMessage.value = error instanceof Error ? error.message : '刷新失败。'
  } finally {
    busy.refresh = false
  }
}

function applyManagerSettings(settings: ManagerSettingsDocument): void {
  managerForm.command = settings.config.service.command
  managerForm.processName = settings.config.service.processName
  managerForm.cwd = settings.config.service.cwd
  managerForm.configPath = settings.config.service.configPath
  managerForm.argsText = settings.config.service.args.join('\n')
  managerForm.autoStart = settings.config.service.autoStart
  managerForm.autoRestart = settings.config.service.autoRestart
}

function applyQuickModelSettings(document: QuickModelConfigDocument): void {
  quickModelEntries.value = document.entries
  quickModelDefaultId.value = document.defaultModelId
}

function applyRestartNotice(document: RestartNoticeDocument | null): void {
  restartNotice.open = Boolean(document)
  restartNotice.message = document?.message ?? ''
  restartNotice.status = document?.status ?? '配置已更新，建议重启 OpenClaw 以立即生效。'
  restartNotice.isError = document?.isError ?? false
}

async function openRestartNotice(message: string): Promise<void> {
  const document = await apiRequest<RestartNoticeDocument>('/api/restart-notice', {
    method: 'POST',
    body: JSON.stringify({
      message,
      status: '配置已更新，建议重启 OpenClaw 以立即生效。',
      isError: false,
    }),
  })
  applyRestartNotice(document)
}

async function closeRestartNotice(): Promise<void> {
  await apiRequest<{ cleared: boolean }>('/api/restart-notice', {
    method: 'DELETE',
  })
  applyRestartNotice(null)
}

async function refreshLogs(): Promise<void> {
  busy.logs = true
  try {
    const [runtime, audit] = await Promise.all([
      apiRequest<LogEntry[]>('/api/logs/runtime?limit=40'),
      apiRequest<LogEntry[]>('/api/logs/audit?limit=40'),
    ])
    runtimeLogs.value = runtime
    auditLogs.value = audit
  } finally {
    busy.logs = false
  }
}

async function controlService(action: 'start' | 'stop' | 'restart'): Promise<void> {
  busy.service = true
  try {
    service.value = await apiRequest<ServiceDetail>(`/api/openclaw/${action}`, {
      method: 'POST',
    })
    await refreshLogs()
  } catch (error) {
    shellMessage.value = error instanceof Error ? error.message : '服务操作失败。'
  } finally {
    busy.service = false
  }
}

async function saveManagerSettings(): Promise<void> {
  if (!managerSettings.value) {
    return
  }

  busy.settings = true
  try {
    const nextSettings = await apiRequest<ManagerSettingsDocument>('/api/manager/settings', {
      method: 'POST',
      body: JSON.stringify({
        service: {
          ...managerSettings.value.config.service,
          command: managerForm.command.trim(),
          processName: managerForm.processName.trim(),
          cwd: managerForm.cwd.trim(),
          configPath: managerForm.configPath.trim(),
          configFlag: '',
          args: managerForm.argsText
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
          autoStart: managerForm.autoStart,
          autoRestart: managerForm.autoRestart,
        },
        shell: managerSettings.value.config.shell,
      }),
    })

    managerSettings.value = nextSettings
    applyManagerSettings(nextSettings)
    managerMessage.value = '接入设置已保存。'
    await refreshAll()
    await openRestartNotice('接入设置已更新。若影响启动参数或配置路径，建议现在重启 OpenClaw。')
  } catch (error) {
    managerMessage.value = error instanceof Error ? error.message : '接入设置保存失败。'
  } finally {
    busy.settings = false
  }
}

async function validateConfig(): Promise<void> {
  busy.config = true
  try {
    const result = await apiRequest<ConfigValidationResult>('/api/config/validate', {
      method: 'POST',
      body: JSON.stringify({ content: configContent.value }),
    })
    configMessage.value = result.valid ? '配置校验通过。' : result.errors.join('；')
  } catch (error) {
    configMessage.value = error instanceof Error ? error.message : '配置校验失败。'
  } finally {
    busy.config = false
  }
}

async function saveConfig(): Promise<void> {
  busy.config = true
  try {
    config.value = await apiRequest<ConfigDocument>('/api/config/save', {
      method: 'POST',
      body: JSON.stringify({
        content: configContent.value,
        comment: 'Saved from Web UI',
      }),
    })
    configContent.value = config.value.content
    configMessage.value = '配置已保存。'
    revisions.value = await apiRequest<ConfigRevision[]>('/api/config/revisions')
    await refreshLogs()
    await openRestartNotice('openclaw 配置已保存。建议现在重启 OpenClaw。')
  } catch (error) {
    configMessage.value = error instanceof Error ? error.message : '配置保存失败。'
  } finally {
    busy.config = false
  }
}

async function rollbackConfig(revisionId: string): Promise<void> {
  busy.config = true
  try {
    config.value = await apiRequest<ConfigDocument>('/api/config/rollback', {
      method: 'POST',
      body: JSON.stringify({ revisionId }),
    })
    configContent.value = config.value.content
    configMessage.value = `已回滚到 ${revisionId}。`
    revisions.value = await apiRequest<ConfigRevision[]>('/api/config/revisions')
    await refreshLogs()
    await openRestartNotice(`配置已回滚到 ${revisionId}。建议现在重启 OpenClaw。`)
  } catch (error) {
    configMessage.value = error instanceof Error ? error.message : '配置回滚失败。'
  } finally {
    busy.config = false
  }
}

async function undoLastConfig(): Promise<void> {
  busy.config = true
  try {
    config.value = await apiRequest<ConfigDocument>('/api/config/undo-last', {
      method: 'POST',
    })
    configContent.value = config.value.content
    configMessage.value = '已撤回上一次配置修改。'
    revisions.value = await apiRequest<ConfigRevision[]>('/api/config/revisions')
    await refreshLogs()
    await openRestartNotice('配置已撤回到上一个版本。建议现在重启 OpenClaw。')
  } catch (error) {
    configMessage.value = error instanceof Error ? error.message : '撤回配置失败。'
  } finally {
    busy.config = false
  }
}

async function executeCommand(): Promise<void> {
  if (!selectedCommandId.value) {
    return
  }

  await executeCommandById(selectedCommandId.value)
}

async function executeCommandById(commandId: string): Promise<void> {
  busy.shell = true
  try {
    const result = await apiRequest<ShellExecutionRecord>('/api/shell/execute', {
      method: 'POST',
      body: JSON.stringify({ commandId }),
    })
    shellOutput.value = result.output
    shellMessage.value = `命令 ${result.commandId} 执行完成，状态：${result.status}`
    await refreshAll()
  } catch (error) {
    shellMessage.value = error instanceof Error ? error.message : '命令执行失败。'
  } finally {
    busy.shell = false
  }
}

async function runDoctorFix(): Promise<void> {
  await executeCommandById('openclaw.doctor-fix')
}

async function restartFromNotice(): Promise<void> {
  busy.restartNotice = true
  try {
    const result = await apiRequest<ServiceDetail>('/api/openclaw/restart', {
      method: 'POST',
    })
    restartNotice.status = `OpenClaw 已重启，当前状态：${result.status === 'running' ? '运行中' : result.status}`
    restartNotice.isError = result.status !== 'running'
    if (result.status === 'running') {
      await closeRestartNotice()
    }
    await refreshLogs()
  } catch (error) {
    restartNotice.status = error instanceof Error ? error.message : 'OpenClaw 重启失败。'
    restartNotice.isError = true
  } finally {
    busy.restartNotice = false
  }
}

onMounted(async () => {
  await refreshAll()
  refreshTimer = window.setInterval(() => {
    void refreshAll()
  }, 5000)
})

onUnmounted(() => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
  }
})
</script>
