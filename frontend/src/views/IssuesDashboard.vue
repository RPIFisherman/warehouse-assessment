<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getIssues, getFacilities } from '@/api'
import type { Issue, Facility } from '@/types'
import dayjs from 'dayjs'

const router = useRouter()
const issues = ref<Issue[]>([])
const facilities = ref<Facility[]>([])
const loading = ref(true)

const statusFilter = ref('')
const severityFilter = ref('')
const facilityFilter = ref('')
const facilitySearch = ref('')

const statusOptions = [
  { value: '', label: 'All Status' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'CLOSED', label: 'Closed' },
]
const severityOptions = [
  { value: '', label: 'All Severity' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
]

const filteredFacilities = computed(() => {
  if (!facilitySearch.value) return facilities.value
  const q = facilitySearch.value.toLowerCase()
  return facilities.value.filter(f => f.name.toLowerCase().includes(q))
})

async function loadIssues() {
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (statusFilter.value) params.tracking_status = statusFilter.value
    if (severityFilter.value) params.severity = severityFilter.value
    if (facilityFilter.value) params.facility_name = facilityFilter.value
    issues.value = await getIssues(params)
  } finally { loading.value = false }
}

onMounted(async () => {
  facilities.value = await getFacilities()
  await loadIssues()
})

watch([statusFilter, severityFilter, facilityFilter], loadIssues)

function clearFilters() {
  statusFilter.value = ''
  severityFilter.value = ''
  facilityFilter.value = ''
}

const hasActiveFilters = computed(() => !!statusFilter.value || !!severityFilter.value || !!facilityFilter.value)

function sevBorder(s: string) {
  if (s === 'HIGH') return 'var(--bg-danger-primary)'
  if (s === 'MEDIUM') return 'var(--bg-warning-primary)'
  return 'var(--bg-warning-tertiary)'
}
function statusType(s: string) {
  if (s === 'CLOSED') return 'success'
  if (s === 'IN_PROGRESS') return 'warning'
  return 'danger'
}
</script>

<template>
  <div class="issues-view">
    <h2>Issues</h2>

    <!-- Status filter pills -->
    <div class="filter-section">
      <div class="filter-label">Status</div>
      <div class="filter-pills">
        <button
          v-for="opt in statusOptions" :key="opt.value"
          class="pill" :class="{ active: statusFilter === opt.value }"
          @click="statusFilter = opt.value"
        >{{ opt.label }}</button>
      </div>
    </div>

    <!-- Severity filter pills -->
    <div class="filter-section">
      <div class="filter-label">Severity</div>
      <div class="filter-pills">
        <button
          v-for="opt in severityOptions" :key="opt.value"
          class="pill" :class="{
            active: severityFilter === opt.value,
            'pill-high': opt.value === 'HIGH' && severityFilter === 'HIGH',
            'pill-med': opt.value === 'MEDIUM' && severityFilter === 'MEDIUM',
            'pill-low': opt.value === 'LOW' && severityFilter === 'LOW',
          }"
          @click="severityFilter = opt.value"
        >{{ opt.label }}</button>
      </div>
    </div>

    <!-- Facility filter -->
    <div class="filter-section">
      <div class="filter-label">Facility</div>
      <el-select
        v-model="facilityFilter"
        placeholder="All Facilities"
        clearable
        filterable
        size="default"
        class="facility-select"
      >
        <el-option label="All Facilities" value="" />
        <el-option v-for="f in facilities" :key="f.id" :label="f.name" :value="f.name" />
      </el-select>
    </div>

    <!-- Active filter indicator -->
    <div v-if="hasActiveFilters" class="active-filters">
      <span>Filtered</span>
      <el-button text type="primary" size="small" @click="clearFilters">Clear all</el-button>
    </div>

    <!-- Results -->
    <div class="results-count">{{ issues.length }} issue{{ issues.length !== 1 ? 's' : '' }}</div>

    <div v-if="loading" class="empty">Loading...</div>
    <div v-else-if="!issues.length" class="empty">No issues found</div>

    <div v-for="issue in issues" :key="issue.id" class="issue-card" :style="{ borderLeftColor: sevBorder(issue.severity) }" @click="router.push(`/issues/${issue.id}`)">
      <div class="card-top">
        <el-tag :type="statusType(issue.tracking_status)" size="small">{{ issue.tracking_status.replace('_', ' ') }}</el-tag>
        <el-tag type="info" size="small">{{ issue.severity }}</el-tag>
      </div>
      <div class="card-label">{{ issue.checklist_label }}</div>
      <div class="card-meta">
        {{ issue.zone_name || issue.zone_code }}
        &middot; {{ issue.owner || 'Unassigned' }}
        <span v-if="issue.due_date"> &middot; Due {{ dayjs(issue.due_date).format('MMM D') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.issues-view { padding: 16px; }
h2 { font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0 0 14px; }

.filter-section { margin-bottom: 10px; }
.filter-label { font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
.filter-pills { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
.pill {
  padding: 5px 14px; border-radius: 20px; font-size: 13px; font-weight: 500;
  background: var(--bg-secondary); border: 1px solid var(--border-primary); color: var(--text-secondary);
  cursor: pointer; white-space: nowrap; transition: all 0.15s; flex-shrink: 0;
  &.active { background: var(--bg-brand-primary); color: var(--text-on-brand); border-color: var(--bg-brand-primary); }
  &.pill-high { background: var(--bg-danger-primary); color: var(--text-on-danger-primary); border-color: var(--bg-danger-primary); }
  &.pill-med { background: var(--bg-warning-primary); color: var(--text-on-warning-primary); border-color: var(--bg-warning-primary); }
  &.pill-low { background: var(--bg-positive-primary); color: var(--text-on-positive-primary); border-color: var(--bg-positive-primary); }
}

.facility-select { width: 100%; }

.active-filters {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 0; margin-bottom: 6px;
  span { font-size: 12px; color: var(--text-brand); font-weight: 500; }
}

.results-count { font-size: 12px; color: var(--text-tertiary); margin-bottom: 10px; }
.empty { text-align: center; padding: 40px; color: var(--text-tertiary); }
.issue-card {
  background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 10px;
  border-left: 3px solid; padding: 12px 14px; margin-bottom: 10px; cursor: pointer;
  &:active { background: var(--bg-secondary-hover); }
}
.card-top { display: flex; gap: 6px; margin-bottom: 6px; }
.card-label { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.card-meta { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
</style>
