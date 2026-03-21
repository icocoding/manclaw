<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="naiveThemeOverrides">
    <n-global-style />
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
            <RouterLink to="/">Overview</RouterLink>
            <RouterLink to="/models">Models</RouterLink>
            <RouterLink to="/agents">Agents</RouterLink>
            <RouterLink to="/channels">Channels</RouterLink>
            <RouterLink to="/plugins">Plugins</RouterLink>
            <RouterLink to="/skills">Skills</RouterLink>
            <RouterLink to="/best-practices">Best Practices</RouterLink>
          </nav>

          <ServiceControlDock />

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
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { NConfigProvider, NGlobalStyle, darkTheme } from 'naive-ui'

import ServiceControlDock from './components/ServiceControlDock.vue'

type ThemeId = 'forge' | 'harbor'

const THEME_STORAGE_KEY = 'manclaw.theme'

const themes: Array<{ id: ThemeId; label: string }> = [
  { id: 'forge', label: 'Forge' },
  { id: 'harbor', label: 'Harbor' },
]

const currentTheme = ref<ThemeId>('forge')
const naiveThemeOverrides = computed(() => {
  if (currentTheme.value === 'harbor') {
    return {
      common: {
        primaryColor: '#6fd5c9',
        primaryColorHover: '#84e2d7',
        primaryColorPressed: '#57b9ae',
        primaryColorSuppl: '#abf3e7',
        borderColor: 'rgba(130, 212, 201, 0.18)',
        inputColor: 'rgba(15, 35, 42, 0.88)',
        cardColor: 'rgba(15, 35, 42, 0.88)',
        modalColor: 'rgba(12, 29, 36, 0.98)',
        popoverColor: 'rgba(12, 29, 36, 0.98)',
      },
      Input: {
        color: 'rgba(15, 35, 42, 0.88)',
      },
      Select: {
        peers: {
          InternalSelection: {
            color: 'rgba(15, 35, 42, 0.88)',
          },
        },
      },
    }
  }

  return {
    common: {
      primaryColor: '#ddb06b',
      primaryColorHover: '#e8bd7f',
      primaryColorPressed: '#c7924b',
      primaryColorSuppl: '#f3c98f',
      borderColor: 'rgba(232, 198, 149, 0.16)',
      inputColor: 'rgba(34, 28, 24, 0.86)',
      cardColor: 'rgba(34, 28, 24, 0.86)',
      modalColor: 'rgba(24, 20, 17, 0.98)',
      popoverColor: 'rgba(24, 20, 17, 0.98)',
    },
    Input: {
      color: 'rgba(34, 28, 24, 0.86)',
    },
    Select: {
      peers: {
        InternalSelection: {
          color: 'rgba(34, 28, 24, 0.86)',
        },
      },
    },
  }
})

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
