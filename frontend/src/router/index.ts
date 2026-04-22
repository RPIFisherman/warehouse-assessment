import { createRouter, createWebHistory } from 'vue-router'
import MobileShell from '@/components/layout/MobileShell.vue'
import { isLoggedIn } from '@/utils/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/auth/callback', name: 'auth-callback', component: () => import('@/views/AuthCallbackView.vue'), meta: { public: true } },
    {
      path: '/',
      component: MobileShell,
      children: [
        { path: '', name: 'home', component: () => import('@/views/HomeView.vue') },
        { path: 'ai-scan', name: 'ai-scan', component: () => import('@/views/AIAssessmentView.vue') },
        { path: 'assess/new', name: 'wizard', component: () => import('@/views/AssessmentWizard.vue') },
        { path: 'assess/:id/walk', name: 'walk', component: () => import('@/views/AssessmentWalk.vue'), props: true },
        { path: 'assess/:id/complete', name: 'complete', component: () => import('@/views/AssessmentComplete.vue'), props: true },
        { path: 'issues', name: 'issues', component: () => import('@/views/IssuesDashboard.vue') },
        { path: 'issues/:id', name: 'issueDetail', component: () => import('@/views/IssueDetailView.vue'), props: true },
        { path: 'history', name: 'history', component: () => import('@/views/HistoryView.vue') },
        { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
      ],
    },
  ],
})

router.beforeEach((to) => {
  if (to.meta.public) return true
  if (!isLoggedIn()) {
    return { name: 'login', query: { from: to.fullPath } }
  }
  return true
})

export default router
