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
  try { assessments.value = await getAssessments() } finally { loading.value = false }
})

function ratingColor(r: string | null) {
  if (r === 'GREEN') return 'var(--bg-positive-primary)'
  if (r === 'YELLOW') return 'var(--bg-warning-primary)'
  if (r === 'RED') return 'var(--bg-danger-primary)'
  return 'var(--bg-tertiary)'
}

function openAssessment(a: Assessment) {
  if (a.status === 'COMPLETED') router.push(`/assess/${a.id}/complete`)
  else router.push(`/assess/${a.id}/walk`)
}
</script>

<template>
  <div class="home-view">
    <div class="header">
      <h1>Warehouse Assessment</h1>
      <p>Tap-driven facility walkthrough</p>
    </div>

    <el-button type="primary" class="start-btn" @click="router.push('/assess/new')">
      <el-icon><Plus /></el-icon>
      Start New Assessment
    </el-button>

    <div class="section-title" v-if="assessments.length">Recent Assessments</div>

    <div v-if="loading" class="empty">Loading...</div>
    <div v-else-if="!assessments.length" class="empty">No assessments yet. Start your first one!</div>

    <div v-for="a in assessments" :key="a.id" class="assess-card" @click="openAssessment(a)">
      <div class="card-left">
        <div class="card-dot" :style="{ backgroundColor: ratingColor(a.overall_rating) }" />
      </div>
      <div class="card-body">
        <div class="card-title">{{ a.facility_name || 'Untitled' }}</div>
        <div class="card-meta">
          {{ dayjs(a.started_at).format('MMM D, YYYY') }} &middot; {{ a.assessor_name }}
          &middot; {{ a.building_type }}
        </div>
        <div class="card-stats" v-if="a.status === 'COMPLETED'">
          {{ a.total_issues }} issue{{ a.total_issues !== 1 ? 's' : '' }}
          <span v-if="a.critical_issues" class="crit"> &middot; {{ a.critical_issues }} critical</span>
        </div>
        <div class="card-stats" v-else>
          <el-tag size="small" type="warning">In Progress</el-tag>
        </div>
      </div>
      <div class="card-score" v-if="a.overall_score != null">
        {{ Math.round(a.overall_score) }}%
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.home-view { padding: 20px 16px 24px; }
.header { margin-bottom: 20px;
  h1 { font-size: 24px; font-weight: 700; color: var(--text-primary); margin: 0; }
  p { font-size: 14px; color: var(--text-secondary); margin: 4px 0 0; }
}
.start-btn { width: 100%; height: 52px; font-size: 16px; font-weight: 600; border-radius: 12px; margin-bottom: 24px; }
.section-title { font-size: 14px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
.empty { text-align: center; padding: 40px 0; color: var(--text-tertiary); }
.assess-card {
  display: flex; align-items: center; gap: 12px;
  background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px;
  padding: 14px 16px; margin-bottom: 10px; cursor: pointer;
  transition: background 0.15s;
  &:active { background: var(--bg-secondary-hover); }
}
.card-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.card-body { flex: 1; min-width: 0; }
.card-title { font-size: 15px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-meta { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.card-stats { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
.crit { color: var(--text-danger); font-weight: 600; }
.card-score { font-size: 18px; font-weight: 700; color: var(--text-primary); flex-shrink: 0; }
</style>
