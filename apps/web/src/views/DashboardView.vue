<template>
  <section class="page">
    <header id="overview" class="hero hero--wide">
      <div>
        <p class="eyebrow">Operator Console</p>
        <h2>Command Your Claw.</h2>
      </div>
      <div class="hero__actions">
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
          <p class="panel__muted">这里只编辑左侧当前已选中的 service。实例切换与 profile 切换统一在左侧服务控制面板完成。</p>
        </div>

        <div class="form-grid">
          <label class="field field--span-2">
            <span class="field__label">可执行文件路径</span>
            <n-input v-model:value="managerForm.command" class="field-control" placeholder="/path/to/openclaw" />
          </label>

          <label class="field">
            <span class="field__label">端口</span>
            <n-input v-model:value="managerForm.portText" class="field-control" placeholder="18789" />
          </label>

          <label class="field field--span-2">
            <span class="field__label">命令参数</span>
            <n-input
              v-model:value="managerForm.argsText"
              class="field-control"
              type="textarea"
              :autosize="{ minRows: 5, maxRows: 8 }"
              placeholder="每行一个参数，例如：&#10;gateway&#10;--log-level&#10;debug"
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

        <p class="panel__muted">当前 Profile：{{ currentProfileLabel }}</p>
        <p class="panel__muted">OpenClaw 工作区：{{ openclawWorkspaceLabel }}</p>
        <p class="panel__muted">当前配置文件：{{ managerSettings?.config.service.configPath?.trim() || '--' }}</p>
        <p class="status-text">{{ managerMessage }}</p>
      </article>

      <article class="panel revision-panel">
        <div class="section-header">
          <div>
            <p class="panel__label">内部配置</p>
            <h3>manclaw 管理文件</h3>
          </div>
        </div>
        <p class="panel__muted">路径：{{ managerSettings?.path ?? '--' }}</p>
        <p class="panel__muted">最后更新：{{ formatDateTime(managerSettings?.updatedAt) }}</p>
        <p class="panel__muted">Profile 管理已移动到左侧服务控制面板。</p>
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

        <div v-if="revisions.length" class="list revision-list">
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
            <div class="log-entry__meta">
              <span class="log-entry__time">{{ formatDateTime(entry.timestamp) }}</span>
              <span class="log-entry__level" :class="`log-entry__level--${entry.level}`">{{ entry.level.toUpperCase() }}</span>
            </div>
            <p class="log-entry__message">{{ entry.message }}</p>
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
            <div class="log-entry__meta">
              <span class="log-entry__time">{{ formatDateTime(entry.timestamp) }}</span>
            </div>
            <p class="log-entry__message">{{ entry.message }}</p>
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
import { NButton, NCheckbox, NInput } from 'naive-ui'
import { RouterLink } from 'vue-router'

import { apiRequest } from '../lib/api'
import { onServiceChanged } from '../lib/service-events'

import type {
  ConfigDocument,
  ConfigRevision,
  ConfigValidationResult,
  LogEntry,
  ManagerSettingsDocument,
  QuickModelConfigDocument,
  QuickModelEntry,
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
const managerMessage = ref('这里编辑的是左侧当前已选中的 service。实例与 profile 切换请使用左侧服务控制面板。')
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
  settings: false,
  quickModel: false,
  config: false,
  logs: false,
  shell: false,
})

const managerForm = reactive({
  command: '',
  portText: '',
  argsText: '',
  autoStart: true,
  autoRestart: true,
})
let refreshTimer: number | undefined
let disposeServiceChanged: (() => void) | undefined

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
  return `${providerName}/${entry.modelId || '--'}`
})
const allowedCommandOptions = computed(() => allowedCommands.value.map((command) => ({
  label: `${command.title} (${command.riskLevel})`,
  value: command.id,
})))
const hasPendingManagerChanges = computed(() => {
  if (!managerSettings.value) {
    return false
  }

  const savedTarget = managerSettings.value.config.service
  return (
    managerForm.command !== savedTarget.command ||
    managerForm.portText !== (savedTarget.port ? String(savedTarget.port) : '') ||
    managerForm.argsText !== savedTarget.args.join('\n') ||
    managerForm.autoStart !== savedTarget.autoStart ||
    managerForm.autoRestart !== savedTarget.autoRestart
  )
})
const openclawWorkspaceLabel = computed(() => {
  const raw = managerSettings.value?.config.service.cwd
  if (typeof raw !== 'string' || !raw.trim()) {
    return '--'
  }
  return raw.trim()
})
const currentProfileLabel = computed(() => {
  const service = managerSettings.value?.config.service
  if (!service) {
    return '--'
  }

  if (service.profileMode === 'dev') {
    return 'dev'
  }

  if (service.profileMode === 'profile' && service.profileName?.trim()) {
    return service.profileName.trim()
  }

  return 'default'
})

function formatDateTime(value?: string): string {
  if (!value) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  })
}

async function refreshAll(): Promise<void> {
  busy.refresh = true
  try {
    const shouldPreserveManagerForm = hasPendingManagerChanges.value
    const [summaryResult, serviceStatusResult, settingsResult, runtimeResult, auditResult, commandsResult] = await Promise.allSettled([
      apiRequest<SystemSummary>('/api/system/summary'),
      apiRequest<ServiceDetail>('/api/openclaw/status'),
      apiRequest<ManagerSettingsDocument>('/api/manager/settings'),
      apiRequest<LogEntry[]>('/api/logs/runtime?limit=40'),
      apiRequest<LogEntry[]>('/api/logs/audit?limit=40'),
      apiRequest<{ items: ShellAllowedCommand[] }>('/api/shell/allowed-commands'),
    ])

    if (serviceStatusResult.status === 'fulfilled') {
      service.value = serviceStatusResult.value
    }

    if (settingsResult.status === 'fulfilled') {
      managerSettings.value = settingsResult.value
      if (!busy.settings && !shouldPreserveManagerForm) {
        applyManagerSettings(settingsResult.value)
      }
      const currentConfigPath = settingsResult.value.config.service.configPath?.trim()
      if (currentConfigPath) {
        try {
          const quickModel = await apiRequest<QuickModelConfigDocument>('/api/model-setup/current')
          quickModelProviders.value = quickModel.availableProviders
          applyQuickModelSettings(quickModel)
        } catch (error) {
          quickModelMessage.value = error instanceof Error ? error.message : '无法读取模型配置。'
        }
      } else {
        quickModelEntries.value = []
        quickModelDefaultId.value = ''
        quickModelMessage.value = '当前 profile 尚未发现可用配置文件，模型配置暂不可读取。'
      }
    }

    if (runtimeResult.status === 'fulfilled') {
      runtimeLogs.value = runtimeResult.value
    }

    if (auditResult.status === 'fulfilled') {
      auditLogs.value = auditResult.value
    }

    if (commandsResult.status === 'fulfilled') {
      allowedCommands.value = commandsResult.value.items
    }

    if (managerSettings.value?.config.service.configPath?.trim()) {
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
          path: managerSettings.value?.config.service.configPath ?? '',
          content: '',
          updatedAt: '',
        }
        if (!busy.config) {
          configContent.value = ''
          configMessage.value = configResult.reason instanceof Error ? configResult.reason.message : '无法读取 openclaw 配置。'
        }
      }

      revisions.value = revisionsResult.status === 'fulfilled' ? revisionsResult.value : []
    } else {
      config.value = {
        format: 'json',
        path: '',
        content: '',
        updatedAt: '',
      }
      revisions.value = []
      if (!busy.config) {
        configContent.value = ''
        configMessage.value = '当前 profile 尚未发现可用配置文件，配置编辑暂不可用。'
      }
    }

    if (!selectedCommandId.value && commandsResult.status === 'fulfilled' && commandsResult.value.items.length > 0) {
      selectedCommandId.value = commandsResult.value.items[0].id
    }

    if (summaryResult.status === 'fulfilled') {
      const openclawSummary = summaryResult.value.services.find((item) => item.id === 'openclaw')
      if (openclawSummary?.message) {
        service.value.message = openclawSummary.message
      }
    }
  } catch (error) {
    shellMessage.value = error instanceof Error ? error.message : '刷新失败。'
  } finally {
    busy.refresh = false
  }
}

function applyManagerSettings(settings: ManagerSettingsDocument): void {
  managerForm.command = settings.config.service.command
  managerForm.portText = settings.config.service.port ? String(settings.config.service.port) : ''
  managerForm.argsText = settings.config.service.args.join('\n')
  managerForm.autoStart = settings.config.service.autoStart
  managerForm.autoRestart = settings.config.service.autoRestart
}

function applyQuickModelSettings(document: QuickModelConfigDocument): void {
  quickModelEntries.value = document.entries
  quickModelDefaultId.value = document.defaultModelId
}

async function openRestartNotice(message: string): Promise<void> {
  await apiRequest('/api/restart-notice', {
    method: 'POST',
    body: JSON.stringify({
      message,
      status: '配置已更新，建议重启 OpenClaw 以立即生效。',
      isError: false,
    }),
  })
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

async function saveManagerSettings(): Promise<void> {
  if (!managerSettings.value) {
    return
  }

  busy.settings = true
  try {
    const currentServiceId = managerSettings.value.config.service.id
    if (managerForm.portText.trim() && parsePortText(managerForm.portText) === undefined) {
      throw new Error('端口必须是正整数。')
    }
    const nextPort = parsePortText(managerForm.portText)
    const nextService = {
      ...managerSettings.value.config.service,
      command: managerForm.command.trim(),
      port: nextPort,
      args: managerForm.argsText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      autoStart: managerForm.autoStart,
      autoRestart: managerForm.autoRestart,
      healthcheck: {
        ...managerSettings.value.config.service.healthcheck,
        url: nextPort ? `http://127.0.0.1:${nextPort}/health` : managerSettings.value.config.service.healthcheck.url,
      },
    }
    const nextServiceItems = managerSettings.value.config.services.items.map((item) =>
      item.id === currentServiceId ? nextService : item,
    )

    const nextSettings = await apiRequest<ManagerSettingsDocument>('/api/manager/settings', {
      method: 'POST',
      body: JSON.stringify({
        services: {
          items: nextServiceItems,
        },
        service: nextService,
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

function parsePortText(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = Number(trimmed)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
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

onMounted(async () => {
  await refreshAll()
  disposeServiceChanged = onServiceChanged(() => {
    void refreshAll()
  })
  refreshTimer = window.setInterval(() => {
    void refreshAll()
  }, 5000)
})

onUnmounted(() => {
  disposeServiceChanged?.()
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
  }
})
</script>
