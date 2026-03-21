import { createRouter, createWebHistory } from 'vue-router'

import AgentsView from '../views/AgentsView.vue'
import BestPracticesView from '../views/BestPracticesView.vue'
import ChannelsView from '../views/ChannelsView.vue'
import DashboardView from '../views/DashboardView.vue'
import ModelsView from '../views/ModelsView.vue'
import PluginsView from '../views/PluginsView.vue'
import SkillsView from '../views/SkillsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
      meta: {
        title: 'ManClaw - Command Your Claw.',
      },
    },
    {
      path: '/models',
      name: 'models',
      component: ModelsView,
      meta: {
        title: 'ManClaw - Models',
      },
    },
    {
      path: '/agents',
      name: 'agents',
      component: AgentsView,
      meta: {
        title: 'ManClaw - Agents',
      },
    },
    {
      path: '/channels',
      name: 'channels',
      component: ChannelsView,
      meta: {
        title: 'ManClaw - Channels',
      },
    },
    {
      path: '/best-practices',
      name: 'best-practices',
      component: BestPracticesView,
      meta: {
        title: 'ManClaw - Best Practices',
      },
    },
    {
      path: '/skills',
      name: 'skills',
      component: SkillsView,
      meta: {
        title: 'ManClaw - Skills',
      },
    },
    {
      path: '/plugins',
      name: 'plugins',
      component: PluginsView,
      meta: {
        title: 'ManClaw - Plugins',
      },
    },
  ],
})

router.afterEach((to) => {
  document.title = typeof to.meta.title === 'string' ? to.meta.title : 'ManClaw'
})
