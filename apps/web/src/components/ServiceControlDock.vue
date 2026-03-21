<template>
  <section class="service-dock">
    <div class="service-dock__head">
      <div>
        <p class="panel__label">服务控制</p>
        <strong>openclaw</strong>
      </div>
      <span class="badge" :class="statusClass">{{ statusLabel }}</span>
    </div>

    <p class="service-dock__meta">命令：{{ service.command || '--' }}</p>
    <p class="service-dock__message">{{ service.message || '准备管理 openclaw 服务。' }}</p>

    <div class="service-dock__actions">
      <n-button type="primary" size="small" :disabled="busy.service" @click="controlService('start')">启动</n-button>
      <n-button tertiary size="small" :disabled="busy.service" @click="controlService('stop')">停止</n-button>
      <n-button tertiary size="small" :disabled="busy.service" @click="controlService('restart')">重启</n-button>
      <n-button tertiary size="small" :disabled="busy.fix" @click="runDoctorFix">
        {{ busy.fix ? 'FIX中...' : 'FIX' }}
      </n-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { NButton } from 'naive-ui'

import type { ServiceDetail, ShellExecutionRecord } from '@manclaw/shared'

import { apiRequest } from '../lib/api'

const service = ref<ServiceDetail>({
  id: 'openclaw',
  name: 'openclaw',
  status: 'unknown',
  message: '正在加载服务状态...',
})
const busy = reactive({
  service: false,
  fix: false,
})

let refreshTimer: number | undefined

const statusLabel = computed(() => {
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

async function refreshStatus(): Promise<void> {
  try {
    service.value = await apiRequest<ServiceDetail>('/api/openclaw/status')
  } catch (error) {
    service.value = {
      id: 'openclaw',
      name: 'openclaw',
      status: 'unknown',
      message: error instanceof Error ? error.message : '读取服务状态失败。',
    }
  }
}

async function controlService(action: 'start' | 'stop' | 'restart'): Promise<void> {
  busy.service = true
  try {
    service.value = await apiRequest<ServiceDetail>(`/api/openclaw/${action}`, {
      method: 'POST',
    })
  } catch (error) {
    service.value = {
      ...service.value,
      message: error instanceof Error ? error.message : '服务操作失败。',
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
    service.value = {
      ...service.value,
      message: result.output || 'doctor --fix 已执行完成。',
    }
    await refreshStatus()
  } catch (error) {
    service.value = {
      ...service.value,
      message: error instanceof Error ? error.message : 'doctor --fix 执行失败。',
    }
  } finally {
    busy.fix = false
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
