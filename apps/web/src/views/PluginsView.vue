<template>
  <section class="page">
    <header class="hero hero--wide">
      <div>
        <p class="eyebrow">Plugins</p>
        <h2>插件列表</h2>
      </div>
      <div class="hero__actions">
        <n-button tertiary :disabled="busy.refresh" @click="refreshPlugins">
          {{ busy.refresh ? '刷新中...' : '刷新列表' }}
        </n-button>
      </div>
    </header>

    <section class="two-column">
      <article class="panel panel--stretch">
        <div class="section-header">
          <div>
            <p class="panel__label">安装命令</p>
            <h3>自定义插件安装</h3>
          </div>
          <p class="panel__muted">这里直接执行你输入的安装命令，不走受控 shell 白名单。命令会在当前 OpenClaw workspace 中运行。</p>
        </div>

        <n-input
          v-model:value="installCommand"
          type="textarea"
          class="field-control"
          :autosize="{ minRows: 3, maxRows: 6 }"
          placeholder="openclaw plugins install <path-or-spec>"
        />

        <div class="button-row">
          <n-button type="primary" :disabled="busy.installCommand || !installCommand.trim()" @click="runInstallCommand">
            {{ busy.installCommand ? '执行中...' : '执行安装命令' }}
          </n-button>
        </div>

        <p class="status-text" :class="{ 'status-text--error': installCommandIsError }">{{ installCommandMessage }}</p>
        <pre class="terminal">{{ installCommandOutput || '暂无命令输出。' }}</pre>
      </article>

      <article class="panel">
        <div class="section-header">
          <div>
            <p class="panel__label">执行说明</p>
            <h3>命令运行方式</h3>
          </div>
        </div>
        <p class="panel__muted">执行目录：当前 OpenClaw workspace。</p>
        <p class="panel__muted">执行方式：后端通过 `bash -lc` 运行输入命令。</p>
        <p class="panel__muted">建议执行完成后刷新插件列表，再确认插件状态变化。</p>
      </article>
    </section>

    <section class="two-column">
      <article class="panel panel--stretch">
        <div class="section-header">
          <div>
            <p class="panel__label">OpenClaw Plugins</p>
            <h3>{{ filteredLoadedCount }}/{{ filteredPlugins.length }} 已加载</h3>
          </div>
          <p class="panel__muted">这里的 `disabled` 表示已发现但未启用，不等于“未安装待安装”。最佳实践已迁到独立页面。</p>
        </div>

        <div class="button-row">
          <n-button tertiary :type="statusFilter === 'all' ? 'primary' : 'default'" @click="statusFilter = 'all'">全部</n-button>
          <n-button tertiary :type="statusFilter === 'enabled' ? 'primary' : 'default'" @click="statusFilter = 'enabled'">仅启用</n-button>
          <n-button tertiary :type="statusFilter === 'disabled' ? 'primary' : 'default'" @click="statusFilter = 'disabled'">仅禁用</n-button>
          <RouterLink class="nav-action" to="/best-practices">前往最佳实践</RouterLink>
        </div>

        <label class="field">
          <span class="field__label">插件筛选</span>
          <n-input
            v-model:value="pluginFilter"
            class="field-control"
            placeholder="按名称、ID、来源、工具名、渠道或 provider 过滤，例如 feishu / bitable / channel"
          />
        </label>

        <p class="status-text" :class="{ 'status-text--error': isError }">{{ message }}</p>

        <article v-if="busy.refresh && filteredPlugins.length === 0" class="panel panel--nested">
          <p class="panel__muted">正在读取 `openclaw plugins list --json`，请稍候...</p>
        </article>

        <article v-else-if="!busy.refresh && filteredPlugins.length === 0" class="panel panel--nested">
          <p class="panel__muted">{{ plugins.items.length === 0 ? '当前没有读到插件数据。' : '当前筛选条件下没有插件。' }}</p>
        </article>

        <div v-else class="plugin-table-wrap">
          <table class="plugin-table">
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>ID</th>
                <th>Status</th>
                <th>Tools</th>
                <th>Channels</th>
                <th>Providers</th>
                <th>Version</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="plugin in filteredPlugins" :key="plugin.id">
                <tr>
                  <td class="plugin-table__expand">
                    <n-button tertiary size="small" @click="togglePluginRow(plugin.id)">
                      {{ isPluginExpanded(plugin.id) ? '收起' : '展开' }}
                    </n-button>
                  </td>
                  <td>{{ plugin.name }}</td>
                  <td><code>{{ plugin.id }}</code></td>
                  <td>
                    <span class="badge" :class="plugin.status === 'loaded' ? 'badge--running' : 'badge--unknown'">
                      {{ plugin.status === 'loaded' ? 'loaded' : plugin.status }}
                    </span>
                  </td>
                  <td>{{ plugin.toolNames.length }}</td>
                  <td>{{ plugin.channelIds.length }}</td>
                  <td>{{ plugin.providerIds.length }}</td>
                  <td>{{ plugin.version || '--' }}</td>
                  <td class="plugin-table__actions">
                    <n-button tertiary size="small" :disabled="!plugin.enabled" @click="openToolsModal(plugin.id)">
                      Tools管理
                    </n-button>
                    <n-popconfirm
                      v-if="plugin.enabled"
                      v-model:show="pluginConfirmVisible[plugin.id]"
                      positive-text="确认禁用"
                      negative-text="取消"
                      @positive-click="confirmSetPluginEnabled(plugin.id, false)"
                    >
                      <template #trigger>
                        <n-button tertiary size="small" :disabled="busy.pluginActionId === plugin.id">
                          {{ busy.pluginActionId === plugin.id ? '处理中...' : '禁用' }}
                        </n-button>
                      </template>
                      禁用插件 `{{ plugin.id }}`？
                    </n-popconfirm>
                    <n-popconfirm
                      v-else
                      v-model:show="pluginConfirmVisible[plugin.id]"
                      positive-text="确认启用"
                      negative-text="取消"
                      @positive-click="confirmSetPluginEnabled(plugin.id, true)"
                    >
                      <template #trigger>
                        <n-button type="primary" size="small" :disabled="busy.pluginActionId === plugin.id">
                          {{ busy.pluginActionId === plugin.id ? '处理中...' : '启用' }}
                        </n-button>
                      </template>
                      启用插件 `{{ plugin.id }}`？
                    </n-popconfirm>
                  </td>
                </tr>
                <tr v-if="isPluginExpanded(plugin.id)" class="plugin-table__detail-row">
                  <td colspan="9">
                    <div class="plugin-table__detail">
                      <p class="panel__muted">{{ plugin.description || 'No description.' }}</p>
                      <p class="panel__muted">Source：{{ plugin.source || '--' }}</p>
                      <p class="panel__muted">Origin：{{ plugin.origin || '--' }}</p>
                      <p class="panel__muted">Status：{{ plugin.status }}</p>
                      <p class="panel__muted">Enabled：{{ plugin.enabled ? 'true' : 'false' }}</p>
                      <p class="panel__muted">Channels：{{ plugin.channelIds.length > 0 ? plugin.channelIds.join(', ') : '--' }}</p>
                      <p class="panel__muted">Providers：{{ plugin.providerIds.length > 0 ? plugin.providerIds.join(', ') : '--' }}</p>
                      <p class="panel__muted">Commands：{{ plugin.commands.length > 0 ? plugin.commands.join(', ') : '--' }}</p>
                      <p class="panel__muted">CLI Commands：{{ plugin.cliCommands.length > 0 ? plugin.cliCommands.join(', ') : '--' }}</p>
                      <p class="panel__muted">Services：{{ plugin.services.length > 0 ? plugin.services.join(', ') : '--' }}</p>
                      <p class="panel__muted">摘要中的 Tools 数：{{ plugin.toolNames.length }}</p>
                      <div class="plugin-tools-manager">
                        <p class="panel__muted">`Tools管理` 按钮会打开统一弹窗处理 tools。</p>
                      </div>
                      <p v-if="plugin.error" class="status-text status-text--warning">{{ plugin.error }}</p>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </article>
    </section>

    <n-modal
      v-model:show="toolsModalVisible"
      preset="card"
      class="tools-modal"
      :title="toolsModalTitle"
      :style="{ width: 'min(680px, calc(100vw - 32px))' }"
    >
      <div v-if="activeToolsPlugin">
        <p class="panel__muted">Plugin：<code>{{ activeToolsPlugin.id }}</code></p>
        <p class="panel__muted">Status：{{ activeToolsPlugin.status }}</p>

        <div v-if="toolsModalLoading" class="plugin-tools-manager">
          <p class="panel__muted">正在读取 tools...</p>
        </div>

        <template v-else>
          <div class="form-grid">
            <label v-for="toolName in toolsModalAllToolNames" :key="toolName" class="field checkbox-field">
              <span class="field__label">Tool</span>
              <n-checkbox
                :checked="toolsModalCheckedToolNames.includes(toolName)"
                :disabled="activeToolsPlugin.id !== 'feishu'"
                @update:checked="(checked) => updateToolsModalSelection(toolName, checked)"
              >
                {{ toolName }}
              </n-checkbox>
            </label>
          </div>

          <p class="panel__muted">运行时已注册：{{ activeToolsPluginRuntimeNames }}</p>

          <template v-if="activeToolsPlugin.id === 'feishu'">
            <p class="panel__muted">配置中启用：{{ enabledFeishuToolLabels }}</p>
            <p class="panel__muted">配置中禁用：{{ disabledFeishuToolLabels }}</p>
            <p class="status-text" :class="{ 'status-text--error': feishuToolsIsError }">{{ feishuToolsMessage }}</p>

            <div class="button-row">
              <n-button tertiary @click="toolsModalVisible = false">关闭</n-button>
              <n-button type="primary" :disabled="busy.feishuTools" @click="saveFeishuToolsFromModal">
                {{ busy.feishuTools ? '保存中...' : '保存' }}
              </n-button>
            </div>
          </template>

          <template v-else>
            <p class="panel__muted">这个插件当前没有通用的 tools 配置写回能力，所以不能真正取消勾选并保存。</p>
            <div class="button-row">
              <n-button tertiary @click="toolsModalVisible = false">关闭</n-button>
              <n-button :disabled="true">保存</n-button>
            </div>
          </template>
        </template>
      </div>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { NButton, NCheckbox, NInput, NModal, NPopconfirm } from 'naive-ui'

import { apiRequest } from '../lib/api'
import { onServiceChanged } from '../lib/service-events'

import type {
  ConfigDocument,
  FeishuToolsConfigDocument,
  OpenClawPluginsDocument,
  PluginMutationResult,
  ShellExecutionRecord,
} from '@manclaw/shared'

const plugins = ref<OpenClawPluginsDocument>({
  workspaceDir: '',
  loadedCount: 0,
  totalCount: 0,
  items: [],
})
const message = ref('读取当前 openclaw plugins 列表。')
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
const installCommand = ref('')
const installCommandMessage = ref('可在这里输入插件安装命令。')
let disposeServiceChanged: (() => void) | undefined
const installCommandOutput = ref('')
const installCommandIsError = ref(false)
const toolsModalVisible = ref(false)
const toolsModalPluginId = ref('')
const toolsModalLoading = ref(false)
const toolsModalCheckedToolNames = ref<string[]>([])
const statusFilter = ref<'all' | 'enabled' | 'disabled'>('all')
const pluginFilter = ref('')
const busy = reactive({
  refresh: false,
  feishuTools: false,
  installCommand: false,
  pluginActionId: '',
})
const pluginConfirmVisible = reactive<Record<string, boolean>>({})
const isError = ref(false)
const expandedPluginIds = ref<string[]>([])
const pluginDetails = reactive<Record<string, OpenClawPluginsDocument['items'][number] | undefined>>({})
const pluginDetailErrors = reactive<Record<string, string | undefined>>({})
const filteredPlugins = computed(() => {
  const filter = pluginFilter.value.trim().toLowerCase()

  return plugins.value.items.filter((item) => {
    if (statusFilter.value === 'enabled' && !item.enabled) {
      return false
    }

    if (statusFilter.value === 'disabled' && item.enabled) {
      return false
    }

    if (!filter) {
      return true
    }

    const haystack = [
      item.name,
      item.id,
      item.description,
      item.source,
      item.origin,
      item.version,
      item.status,
      ...item.toolNames,
      ...item.channelIds,
      ...item.providerIds,
      ...item.commands,
      ...item.cliCommands,
      ...item.services,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      .join('\n')
      .toLowerCase()

    return haystack.includes(filter)
  })
})
const filteredLoadedCount = computed(() => filteredPlugins.value.filter((item) => item.status === 'loaded').length)

const loadedPluginNames = computed(() => {
  const names = plugins.value.items.filter((item) => item.status === 'loaded').map((item) => item.name)
  return names.length > 0 ? names.join(', ') : '--'
})
const activeToolsPlugin = computed(() => plugins.value.items.find((item) => item.id === toolsModalPluginId.value))
const toolsModalTitle = computed(() => (activeToolsPlugin.value ? `${activeToolsPlugin.value.name} Tools管理` : 'Tools管理'))
const activeToolsPluginRuntimeToolList = computed(() => {
  const plugin = activeToolsPlugin.value
  if (!plugin) {
    return []
  }

  return pluginDetails[plugin.id]?.toolNames ?? plugin.toolNames
})
const activeToolsPluginRuntimeNames = computed(() => {
  const names = activeToolsPluginRuntimeToolList.value
  return names.length > 0 ? names.join(', ') : '--'
})
const toolsModalAllToolNames = computed(() => {
  if (!activeToolsPlugin.value) {
    return []
  }

  if (activeToolsPlugin.value.id === 'feishu') {
    return feishuToolLabels.value.map((item) => item.label)
  }

  return activeToolsPluginRuntimeToolList.value
})
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
const totalToolCount = computed(() => plugins.value.items.reduce((sum, item) => sum + item.toolNames.length, 0))
const totalChannelCount = computed(() => plugins.value.items.reduce((sum, item) => sum + item.channelIds.length, 0))
const totalProviderCount = computed(() => plugins.value.items.reduce((sum, item) => sum + item.providerIds.length, 0))

function isPluginExpanded(pluginId: string): boolean {
  return expandedPluginIds.value.includes(pluginId)
}

async function togglePluginRow(pluginId: string): Promise<void> {
  if (isPluginExpanded(pluginId)) {
    expandedPluginIds.value = expandedPluginIds.value.filter((id) => id !== pluginId)
    return
  }

  expandedPluginIds.value = [...expandedPluginIds.value, pluginId]
  await refreshPluginDetail(pluginId)
}

async function openToolsModal(pluginId: string): Promise<void> {
  const plugin = plugins.value.items.find((item) => item.id === pluginId)
  if (!plugin || !plugin.enabled) {
    return
  }

  toolsModalPluginId.value = pluginId
  toolsModalVisible.value = true

  if (plugin.id === 'feishu') {
    await refreshFeishuTools()
    toolsModalCheckedToolNames.value = feishuToolLabels.value.filter((item) => item.enabled).map((item) => item.label)
  }

  if (plugin.toolNames.length > 0) {
    toolsModalLoading.value = true
    try {
      await refreshPluginDetail(pluginId)
      if (plugin.id !== 'feishu') {
        toolsModalCheckedToolNames.value = [...(pluginDetails[pluginId]?.toolNames ?? plugin.toolNames)]
      }
    } finally {
      toolsModalLoading.value = false
    }
  } else if (plugin.id !== 'feishu') {
    toolsModalCheckedToolNames.value = []
  }
}

function updateToolsModalSelection(toolName: string, checked: boolean): void {
  const current = new Set(toolsModalCheckedToolNames.value)
  if (checked) {
    current.add(toolName)
  } else {
    current.delete(toolName)
  }

  toolsModalCheckedToolNames.value = Array.from(current)

  if (activeToolsPlugin.value?.id === 'feishu') {
    feishuTools.chat = current.has('feishu_chat')
    feishuTools.doc = current.has('feishu_doc')
    feishuTools.wiki = current.has('feishu_wiki')
    feishuTools.drive = current.has('feishu_drive')
    feishuTools.perm = current.has('feishu_perm')
    feishuTools.scopes = current.has('feishu_app_scopes')
    feishuTools.bitable = current.has('feishu_bitable_*')
  }
}

async function refreshPlugins(): Promise<void> {
  busy.refresh = true
  isError.value = false
  message.value = '正在读取插件列表...'
  try {
    plugins.value = await apiRequest<OpenClawPluginsDocument>('/api/openclaw/plugins')
    message.value = '插件列表已刷新。'
  } catch (error) {
    isError.value = true
    message.value = error instanceof Error ? error.message : '插件列表刷新失败。'
  } finally {
    busy.refresh = false
  }
}

async function refreshPluginDetail(pluginId: string): Promise<void> {
  const plugin = plugins.value.items.find((item) => item.id === pluginId)
  if (!plugin || pluginDetails[pluginId]) {
    return
  }

  if (!plugin.enabled || plugin.toolNames.length === 0) {
    return
  }

  pluginDetailErrors[pluginId] = undefined
  try {
    pluginDetails[pluginId] = await apiRequest<OpenClawPluginsDocument['items'][number]>(`/api/openclaw/plugins/${encodeURIComponent(pluginId)}`)
  } catch (error) {
    pluginDetailErrors[pluginId] = error instanceof Error ? error.message : '插件详情读取失败。'
  }
}

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
    await refreshPlugins()
  } catch (error) {
    feishuToolsIsError.value = true
    feishuToolsMessage.value = error instanceof Error ? error.message : '飞书 tools 配置保存失败。'
  } finally {
    busy.feishuTools = false
  }
}

async function saveFeishuToolsFromModal(): Promise<void> {
  await saveFeishuTools()
  toolsModalVisible.value = false
}

async function runInstallCommand(): Promise<void> {
  busy.installCommand = true
  installCommandIsError.value = false
  installCommandMessage.value = '正在执行安装命令...'
  try {
    const result = await apiRequest<ShellExecutionRecord>('/api/openclaw/plugins/install-command', {
      method: 'POST',
      body: JSON.stringify({
        command: installCommand.value,
      }),
    })
    installCommandOutput.value = result.output
    installCommandMessage.value = result.status === 'completed' ? '安装命令执行完成。' : `命令执行状态：${result.status}`
    installCommandIsError.value = result.status !== 'completed'
    await refreshPlugins()
  } catch (error) {
    installCommandIsError.value = true
    installCommandMessage.value = error instanceof Error ? error.message : '安装命令执行失败。'
  } finally {
    busy.installCommand = false
  }
}

async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  busy.pluginActionId = pluginId
  isError.value = false
  message.value = enabled ? `正在启用插件 ${pluginId}...` : `正在禁用插件 ${pluginId}...`
  try {
    const action = enabled ? 'enable' : 'disable'
    const result = await apiRequest<PluginMutationResult>(`/api/openclaw/plugins/${encodeURIComponent(pluginId)}/${action}`, {
      method: 'POST',
    })
    message.value = `${enabled ? '启用' : '禁用'}成功：${result.pluginId}。${result.output === 'No output.' ? '' : ` ${result.output}`}`.trim()
    pluginDetails[pluginId] = undefined
    await refreshPlugins()
  } catch (error) {
    isError.value = true
    message.value = error instanceof Error ? error.message : `插件${enabled ? '启用' : '禁用'}失败。`
  } finally {
    busy.pluginActionId = ''
  }
}

async function confirmSetPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  pluginConfirmVisible[pluginId] = false
  await setPluginEnabled(pluginId, enabled)
}

onMounted(async () => {
  await Promise.all([refreshPlugins(), refreshFeishuTools()])
  disposeServiceChanged = onServiceChanged(() => {
    void Promise.all([refreshPlugins(), refreshFeishuTools()])
  })
})

onUnmounted(() => {
  disposeServiceChanged?.()
})
</script>

<style scoped>
.plugin-table-wrap {
  overflow-x: auto;
}

.plugin-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 860px;
}

.plugin-table th,
.plugin-table td {
  padding: 12px 10px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

.plugin-table th {
  color: var(--text-2);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.plugin-table__expand {
  width: 84px;
}

.plugin-table__actions {
  width: 132px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: stretch;
}

.plugin-table__actions :deep(.n-button) {
  width: 100%;
}

.plugin-table__detail-row td {
  padding-top: 0;
  background: color-mix(in srgb, var(--bg-1) 82%, var(--accent) 18%);
}

.plugin-table__detail {
  padding: 12px 6px 6px;
}

.plugin-tools-manager {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

</style>
