<template>
  <div :class="variant === 'inline' ? 'inline-restart' : 'floating-restart'" :title="message">
    <div :class="variant === 'inline' ? 'inline-restart__head' : 'floating-restart__head'">
      <div>
        <p class="panel__label">需要重启</p>
        <strong>OpenClaw</strong>
      </div>
      <n-button tertiary size="small" :disabled="busy" @click="$emit('dismiss')">关闭</n-button>
    </div>
    <p :class="variant === 'inline' ? 'inline-restart__message' : 'floating-restart__message'">{{ message }}</p>
    <div class="button-row">
      <n-button type="primary" :disabled="busy" @click="$emit('restart')">
        {{ busy ? '重启中...' : '立即重启' }}
      </n-button>
      <n-button tertiary :disabled="busy" @click="$emit('dismiss')">{{ variant === 'inline' ? '稍后' : '稍后' }}</n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NButton } from 'naive-ui'

defineProps<{
  message: string
  busy: boolean
  variant: 'inline' | 'floating'
}>()

defineEmits<{
  restart: []
  dismiss: []
}>()
</script>
