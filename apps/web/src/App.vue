<template>
  <div class="shell">
    <aside class="shell__sidebar">
      <div class="shell__top">
        <div class="shell__brand">
          <div class="shell__brand-head">
            <img class="shell__brand-mark" src="/manclaw-mark.svg" alt="ManClaw logo" />
            <div class="shell__brand-copy">
              <p class="shell__brand-name">ManClaw</p>
              <h1>Claw Console</h1>
            </div>
          </div>
          <p class="shell__intro">把 OpenClaw 的服务控制、配置调整和技能管理收进一个面板。</p>
        </div>

        <nav class="shell__nav">
          <RouterLink to="/">概览</RouterLink>
          <RouterLink to="/skills">技能</RouterLink>
        </nav>

        <section class="theme-switcher">
          <p class="panel__label">风格切换</p>
          <div class="theme-switcher__list">
            <button
              v-for="theme in themes"
              :key="theme.id"
              type="button"
              class="theme-chip"
              :class="{ 'theme-chip--active': currentTheme === theme.id }"
              @click="setTheme(theme.id)"
            >
              <span class="theme-chip__swatch" :class="`theme-chip__swatch--${theme.id}`"></span>
              {{ theme.label }}
            </button>
          </div>
        </section>
      </div>
    </aside>

    <main class="shell__content">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

type ThemeId = 'forge' | 'harbor'

const THEME_STORAGE_KEY = 'manclaw.theme'

const themes: Array<{ id: ThemeId; label: string }> = [
  { id: 'forge', label: 'Forge' },
  { id: 'harbor', label: 'Harbor' },
]

const currentTheme = ref<ThemeId>('forge')

function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
  currentTheme.value = theme
}

function setTheme(theme: ThemeId): void {
  applyTheme(theme)
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)
}

onMounted(() => {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  const theme = themes.some((item) => item.id === saved) ? (saved as ThemeId) : 'forge'
  applyTheme(theme)
})
</script>
