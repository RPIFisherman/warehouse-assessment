<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getAssessments } from '@/api'
import type { Assessment } from '@/types'
import dayjs from 'dayjs'

const router = useRouter()
const assessments = ref<Assessment[]>([])
const loading = ref(true)

onMounted(async () => {
  try { assessments.value = (await getAssessments()).filter(a => a.status === 'COMPLETED') } finally { loading.value = false }
})

function ratingColor(r: string | null) {
  if (r === 'GREEN') return 'var(--bg-positive-primary)'
  if (r === 'YELLOW') return 'var(--bg-warning-primary)'
  return 'var(--bg-danger-primary)'
}
</script>

<template>
  <div class="history-view">
    <h2>History</h2>
    <div v-if="loading" class="empty">Loading...</div>
    <div v-else-if="!assessments.length" class="empty">No completed assessments yet</div>
    <div v-for="a in assessments" :key="a.id" class="assess-card" @click="router.push(`/assess/${a.id}/complete`)">
      <div class="card-dot" :style="{ background: ratingColor(a.overall_rating) }" />
      <div class="card-body">
        <div class="card-title">{{ a.facility_name || 'Untitled' }}</div>
        <div class="card-meta">{{ dayjs(a.completed_at || a.started_at).format('MMM D, YYYY') }} &middot; {{ a.assessor_name }} &middot; {{ a.building_type }}</div>
        <div class="card-issues">{{ a.total_issues }} issue{{ a.total_issues !== 1 ? 's' : '' }}<span v-if="a.critical_issues" class="crit"> &middot; {{ a.critical_issues }} critical</span></div>
      </div>
      <div class="card-score">{{ Math.round(a.overall_score || 0) }}%</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.history-view { padding: 16px; }
h2 { font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0 0 16px; }
.empty { text-align: center; padding: 40px; color: var(--text-tertiary); }
.assess-card {
  display: flex; align-items: center; gap: 12px;
  background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px;
  padding: 14px 16px; margin-bottom: 10px; cursor: pointer;
  &:active { background: var(--bg-secondary-hover); }
}
.card-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.card-body { flex: 1; min-width: 0; }
.card-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.card-meta { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.card-issues { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }
.crit { color: var(--text-danger); font-weight: 600; }
.card-score { font-size: 18px; font-weight: 700; color: var(--text-primary); }
</style>
