<template>
  <div :class="variant === 'inline' ? 'inline-restart' : 'floating-restart'" :title="message">
    <div :class="variant === 'inline' ? 'inline-restart__head' : 'floating-restart__head'">
      <div>
        <p class="panel__label">需要重启</p>
        <strong>OpenClaw</strong>
      </div>
      <button class="button button--ghost button--small" :disabled="busy" @click="$emit('dismiss')">关闭</button>
    </div>
    <p :class="variant === 'inline' ? 'inline-restart__message' : 'floating-restart__message'">{{ message }}</p>
    <div class="button-row">
      <button class="button" :disabled="busy" @click="$emit('restart')">
        {{ busy ? '重启中...' : '立即重启' }}
      </button>
      <button class="button button--ghost" :disabled="busy" @click="$emit('dismiss')">{{ variant === 'inline' ? '稍后' : '稍后' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
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
