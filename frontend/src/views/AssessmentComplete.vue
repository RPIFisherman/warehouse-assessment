<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getAssessment, completeAssessment, updateIssue } from '@/api'
import type { Assessment, Issue } from '@/types'
import dayjs from 'dayjs'

const props = defineProps<{ id: string }>()
const router = useRouter()
const assessment = ref<Assessment | null>(null)
const issues = ref<Issue[]>([])
const loading = ref(true)
const editingIssue = ref<string | null>(null)
const ownerInput = ref('')
const dueInput = ref('')
const previewUrl = ref<string | null>(null)

const allZones = ['RECEIVING', 'PICKING', 'PACKING', 'DOCK', 'RESTROOMS', 'STAGE', 'PROJECTS']

onMounted(async () => {
  try {
    const data = await getAssessment(props.id)
    assessment.value = data
    issues.value = data.issues || []
    if (data.status !== 'COMPLETED') {
      const completed = await completeAssessment(props.id)
      assessment.value = completed
      issues.value = completed.issues || []
    }
  } finally { loading.value = false }
})

const ratingLabel = computed(() => {
  const r = assessment.value?.overall_rating
  if (r === 'GREEN') return 'All Clear'
  if (r === 'YELLOW') return 'Minor Issues'
  return 'Critical Issues Found'
})
const ratingColor = computed(() => {
  const r = assessment.value?.overall_rating
  if (r === 'GREEN') return 'var(--bg-positive-primary)'
  if (r === 'YELLOW') return 'var(--bg-warning-primary)'
  return 'var(--bg-danger-primary)'
})
const zoneIssues = computed(() => {
  const map: Record<string, { count: number; hasCritical: boolean }> = {}
  for (const i of issues.value) {
    if (!map[i.zone_code]) map[i.zone_code] = { count: 0, hasCritical: false }
    map[i.zone_code].count++
    if (i.severity === 'HIGH') map[i.zone_code].hasCritical = true
  }
  return map
})
const activeZones = computed(() => allZones.filter(z => zoneIssues.value[z] || true))

function startEdit(issue: Issue) {
  editingIssue.value = issue.id
  ownerInput.value = issue.owner || ''
  dueInput.value = issue.due_date || ''
}
async function saveEdit(issue: Issue) {
  await updateIssue(issue.id, { owner: ownerInput.value || undefined, due_date: dueInput.value || undefined })
  issue.owner = ownerInput.value || null
  issue.due_date = dueInput.value || null
  editingIssue.value = null
}

function sevColor(s: string) {
  if (s === 'HIGH') return 'danger'
  if (s === 'MEDIUM') return 'warning'
  return 'info'
}

function openPhoto(url: string) {
  previewUrl.value = url
}

function buildMailtoLink() {
  const a = assessment.value
  if (!a) return '#'
  const reportUrl = `${window.location.origin}/assess/${a.id}/complete`
  const score = Math.round(a.overall_score || 0)
  const rating = a.overall_rating || 'N/A'
  const ratingEmoji = rating === 'GREEN' ? '🟢' : rating === 'YELLOW' ? '🟡' : '🔴'

  const subject = `Warehouse Assessment Report - ${a.facility_name || 'Facility'} - ${dayjs(a.started_at).format('MMM D, YYYY')}`

  let body = `Warehouse Assessment Report\n`
  body += `${'='.repeat(40)}\n\n`
  body += `Facility: ${a.facility_name || 'N/A'}\n`
  body += `Assessor: ${a.assessor_name}\n`
  body += `Building Type: ${a.building_type}\n`
  body += `Date: ${dayjs(a.started_at).format('MMM D, YYYY')}\n`
  body += `Score: ${score}% ${ratingEmoji} ${rating}\n`
  body += `Total Items: ${a.total_items} | Issues: ${a.total_issues} | Critical: ${a.critical_issues}\n\n`
  body += `Zone Breakdown\n`
  body += `${'-'.repeat(30)}\n`
  for (const z of allZones) {
    const zi = zoneIssues.value[z]
    const icon = zi?.hasCritical ? '🔴' : zi?.count ? '🟡' : '🟢'
    body += `${icon} ${z}: ${zi?.count || 0} issues\n`
  }
  if (issues.value.length > 0) {
    body += `\nIssues Detail\n`
    body += `${'-'.repeat(30)}\n`
    for (const issue of issues.value) {
      body += `• [${issue.severity}] ${issue.checklist_label} (${issue.zone_name || issue.zone_code})`
      if (issue.comment) body += ` - ${issue.comment}`
      if (issue.owner) body += ` [Owner: ${issue.owner}]`
      if (issue.due_date) body += ` [Due: ${dayjs(issue.due_date).format('MMM D')}]`
      body += `\n`
    }
  }
  body += `\nFull Report: ${reportUrl}\n`

  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
</script>

<template>
  <div class="complete-view" v-if="assessment && !loading">
    <button class="back-link" @click="router.push('/')"><el-icon><ArrowLeft /></el-icon> Home</button>

    <!-- Score Hero -->
    <div class="score-hero">
      <div class="score-circle" :style="{ borderColor: ratingColor }">
        <span class="score-num">{{ Math.round(assessment.overall_score || 0) }}</span>
        <span class="score-pct">%</span>
      </div>
      <div class="score-label" :style="{ color: ratingColor }">{{ ratingLabel }}</div>
      <div class="score-stats">
        {{ assessment.total_items }} items &middot; {{ assessment.total_issues }} issues
        <span v-if="assessment.critical_issues"> &middot; <strong class="crit-text">{{ assessment.critical_issues }} critical</strong></span>
      </div>
    </div>

    <!-- Email button -->
    <a :href="buildMailtoLink()" class="email-btn">
      <el-icon><Message /></el-icon>
      Send Report by Email
    </a>

    <!-- Zone breakdown -->
    <div class="section-title">Zone Breakdown</div>
    <div class="zone-row" v-for="z in activeZones" :key="z">
      <div class="zone-dot" :style="{ background: zoneIssues[z]?.hasCritical ? 'var(--bg-danger-primary)' : zoneIssues[z]?.count ? 'var(--bg-warning-primary)' : 'var(--bg-positive-primary)' }" />
      <span class="zone-name">{{ z }}</span>
      <span class="zone-count">{{ zoneIssues[z]?.count || 0 }} issues</span>
    </div>

    <!-- Issues list -->
    <div class="section-title" v-if="issues.length" style="margin-top: 20px;">Issues Found</div>
    <div v-for="issue in issues" :key="issue.id" class="issue-card">
      <div class="issue-header">
        <el-tag :type="sevColor(issue.severity)" size="small">{{ issue.severity }}</el-tag>
        <span class="issue-zone">{{ issue.zone_name || issue.zone_code }}</span>
      </div>
      <div class="issue-label">{{ issue.checklist_label }}</div>
      <div v-if="issue.comment" class="issue-comment">{{ issue.comment }}</div>
      <div v-if="issue.photo_filenames?.length" class="issue-photos">
        <img
          v-for="fn in issue.photo_filenames" :key="fn"
          :src="`/uploads/${fn}`" class="issue-photo"
          @click="openPhoto(`/uploads/${fn}`)"
        />
      </div>
      <div v-if="editingIssue === issue.id" class="edit-section">
        <el-input v-model="ownerInput" placeholder="Assign owner" size="small" />
        <el-date-picker v-model="dueInput" type="date" placeholder="Due date" size="small" style="width:100%" value-format="YYYY-MM-DD" />
        <el-button size="small" type="primary" @click="saveEdit(issue)">Save</el-button>
      </div>
      <div v-else class="issue-footer">
        <span v-if="issue.owner">{{ issue.owner }}</span>
        <span v-if="issue.due_date">Due: {{ dayjs(issue.due_date).format('MMM D') }}</span>
        <el-button size="small" text type="primary" @click="startEdit(issue)">Assign Owner</el-button>
      </div>
    </div>

    <el-button class="home-btn" @click="router.push('/')">Back to Home</el-button>

    <!-- Photo preview overlay -->
    <Teleport to="body">
      <div v-if="previewUrl" class="photo-overlay" @click="previewUrl = null">
        <button class="overlay-close">&times;</button>
        <img :src="previewUrl" class="overlay-img" @click.stop />
      </div>
    </Teleport>
  </div>
  <div v-else class="loading">Loading...</div>
</template>

<style scoped lang="scss">
.complete-view { padding: 16px; }
.back-link { display: flex; align-items: center; gap: 4px; background: none; border: none; color: var(--text-brand); font-size: 14px; cursor: pointer; padding: 0; margin-bottom: 16px; }
.score-hero { text-align: center; padding: 20px 0 16px; }
.score-circle { width: 100px; height: 100px; border-radius: 50%; border: 4px solid; display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 0 auto 12px; }
.score-num { font-size: 32px; font-weight: 800; color: var(--text-primary); line-height: 1; }
.score-pct { font-size: 14px; color: var(--text-secondary); }
.score-label { font-size: 18px; font-weight: 700; margin-bottom: 6px; }
.score-stats { font-size: 14px; color: var(--text-secondary); }
.crit-text { color: var(--text-danger); }

.email-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; height: 48px; border-radius: 10px; font-size: 15px; font-weight: 600;
  background: var(--bg-brand-primary); color: var(--text-on-brand);
  text-decoration: none; margin-bottom: 20px; transition: background 0.15s;
  &:active { background: var(--bg-brand-primary-hover); }
}

.section-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
.zone-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
.zone-dot { width: 8px; height: 8px; border-radius: 50%; }
.zone-name { flex: 1; font-size: 13px; color: var(--text-primary); font-weight: 500; }
.zone-count { font-size: 12px; color: var(--text-secondary); }
.issue-card {
  background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 10px;
  padding: 12px 14px; margin-bottom: 10px;
}
.issue-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.issue-zone { font-size: 12px; color: var(--text-secondary); }
.issue-label { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.issue-comment { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
.issue-photos { display: flex; gap: 6px; margin-top: 8px; overflow-x: auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
.issue-photo {
  width: 72px; height: 72px; object-fit: cover; border-radius: 6px; flex-shrink: 0;
  cursor: pointer; border: 1px solid var(--border-primary);
  &:active { opacity: 0.8; }
}
.issue-footer { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 12px; color: var(--text-secondary); }
.edit-section { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.home-btn { width: 100%; height: 48px; margin-top: 20px; border-radius: 10px; font-size: 15px; font-weight: 600; }
.loading { text-align: center; padding: 60px; color: var(--text-tertiary); }

/* Photo preview overlay */
.photo-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0, 0, 0, 0.92);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.overlay-close {
  position: absolute; top: 16px; right: 16px; z-index: 10000;
  width: 40px; height: 40px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.15); color: white;
  border: none; font-size: 24px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.overlay-img {
  max-width: 95vw; max-height: 90vh; object-fit: contain;
  border-radius: 4px; cursor: default;
}
</style>
