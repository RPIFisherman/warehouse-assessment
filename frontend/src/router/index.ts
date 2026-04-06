import { createRouter, createWebHistory } from 'vue-router'
import MobileShell from '@/components/layout/MobileShell.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: MobileShell,
      children: [
        { path: '', name: 'home', component: () => import('@/views/HomeView.vue') },
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
export default router
