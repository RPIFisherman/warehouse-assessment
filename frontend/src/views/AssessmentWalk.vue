<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAssessmentStore } from '@/stores/assessment'
import { createIssue, deleteIssue, updateIssue, uploadPhoto, completeAssessment, getAssessment } from '@/api'
import type { Severity, ChecklistItem } from '@/types'

const props = defineProps<{ id: string }>()
const router = useRouter()
const store = useAssessmentStore()

const expandedItem = ref<string | null>(null)
const severity = ref<Severity>('MEDIUM')
const comment = ref('')
const pendingPhotos = ref<{ file: File; preview: string; uploading: boolean }[]>([])
const saving = ref(false)
const completing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const zoneTabsRef = ref<HTMLElement | null>(null)
const fullPreviewUrl = ref<string | null>(null)

// For editing existing issues
const editSeverity = ref<Severity>('MEDIUM')
const editComment = ref('')

const currentZone = computed(() => store.currentZone)
const zoneItems = computed(() => currentZone.value?.items || [])
const isLastZone = computed(() => store.currentZoneIndex >= store.totalZones - 1)

onMounted(async () => {
  if (!store.zones.length) {
    const data = await getAssessment(props.id)
    store.assessmentId = props.id
    const cats: string[] = JSON.parse(data.categories)
    await store.loadZones(cats)
    if (data.issues) {
      for (const issue of data.issues) store.addIssue(issue)
    }
  }
})

function toggleItem(itemId: string) {
  if (expandedItem.value === itemId) {
    expandedItem.value = null
    return
  }
  expandedItem.value = itemId
  if (store.hasIssue(itemId)) {
    // Load existing issue data into edit fields
    const issue = store.getIssueForItem(itemId)!
    editSeverity.value = (issue.severity as Severity) || 'MEDIUM'
    editComment.value = issue.comment || ''
  } else {
    severity.value = 'MEDIUM'
    comment.value = ''
    pendingPhotos.value = []
  }
}

function triggerCamera() {
  fileInput.value!.value = ''
  fileInput.value?.click()
}

function onPhotoSelected(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  for (const file of Array.from(files)) {
    pendingPhotos.value.push({ file, preview: URL.createObjectURL(file), uploading: false })
  }
}

function removePendingPhoto(idx: number) {
  URL.revokeObjectURL(pendingPhotos.value[idx].preview)
  pendingPhotos.value.splice(idx, 1)
}

async function saveIssue(item: ChecklistItem) {
  saving.value = true
  try {
    const filenames: string[] = []
    for (const p of pendingPhotos.value) {
      p.uploading = true
      const result = await uploadPhoto(p.file)
      filenames.push(result.filename)
      p.uploading = false
    }
    const issue = await createIssue({
      assessment_id: store.assessmentId,
      checklist_item_id: item.id,
      checklist_label: item.label,
      zone_code: item.zone_code,
      zone_name: item.zone_name,
      severity: severity.value,
      comment: comment.value || undefined,
      photo_filenames: filenames,
    } as any)
    store.addIssue(issue)
    pendingPhotos.value = []
    expandedItem.value = null
  } finally { saving.value = false }
}

async function saveExistingIssue(item: ChecklistItem) {
  const issue = store.getIssueForItem(item.id)
  if (!issue) return
  saving.value = true
  try {
    const updated = await updateIssue(issue.id, {
      severity: editSeverity.value,
      comment: editComment.value || undefined,
    } as any)
    store.addIssue(updated)
    expandedItem.value = null
  } finally { saving.value = false }
}

async function removeIssue(item: ChecklistItem) {
  const issue = store.getIssueForItem(item.id)
  if (!issue) return
  await deleteIssue(issue.id)
  store.removeIssue(item.id)
  expandedItem.value = null
}

async function onAddPhotoToExisting(e: Event, item: ChecklistItem) {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  const issue = store.getIssueForItem(item.id)
  if (!issue) return
  const newFilenames = [...issue.photo_filenames]
  for (const file of Array.from(files)) {
    const result = await uploadPhoto(file)
    newFilenames.push(result.filename)
  }
  const updated = await updateIssue(issue.id, { photo_filenames: newFilenames } as any)
  store.addIssue(updated)
}

async function removeExistingPhoto(item: ChecklistItem, idx: number) {
  const issue = store.getIssueForItem(item.id)
  if (!issue) return
  const newFilenames = [...issue.photo_filenames]
  newFilenames.splice(idx, 1)
  const updated = await updateIssue(issue.id, { photo_filenames: newFilenames } as any)
  store.addIssue(updated)
}

function goToZone(idx: number) {
  store.goToZone(idx)
  expandedItem.value = null
  nextTick(() => {
    const active = zoneTabsRef.value?.querySelector('.zone-pill.active') as HTMLElement
    active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  })
}

function handleNext() {
  if (isLastZone.value) {
    completing.value = true
    completeAssessment(props.id).then(() => {
      router.push(`/assess/${props.id}/complete`)
    }).finally(() => { completing.value = false })
  } else {
    goToZone(store.currentZoneIndex + 1)
  }
}

// Severity-aware colors for tags
function severityTagType(s: string) {
  if (s === 'HIGH') return 'danger'
  return 'warning'
}

// Severity-aware border color for the left stripe
function issueBorderClass(itemId: string): string {
  const issue = store.getIssueForItem(itemId)
  if (!issue) return ''
  return issue.severity === 'HIGH' ? 'issue-high' : 'issue-warn'
}

// Severity-aware icon
function issueIconName(itemId: string): string {
  const issue = store.getIssueForItem(itemId)
  if (!issue) return 'WarningFilled'
  return issue.severity === 'HIGH' ? 'CircleCloseFilled' : 'WarningFilled'
}

function getItemPhotos(itemId: string): string[] {
  const issue = store.getIssueForItem(itemId)
  return issue?.photo_filenames || []
}
</script>

<template>
  <div class="walk-view">
    <input ref="fileInput" type="file" accept="image/*" capture="environment" style="display:none" @change="onPhotoSelected" />

    <!-- Header -->
    <div class="walk-header">
      <button class="back-btn" @click="router.push('/')"><el-icon><ArrowLeft /></el-icon></button>
      <span class="header-title">Assessment</span>
      <span class="header-progress">Zone {{ store.currentZoneIndex + 1 }}/{{ store.totalZones }}</span>
    </div>

    <!-- Progress bar -->
    <div class="progress-track"><div class="progress-fill" :style="{ width: store.progress + '%' }" /></div>

    <!-- Zone tabs -->
    <div class="zone-tabs" ref="zoneTabsRef">
      <button
        v-for="(z, i) in store.zones" :key="z.code"
        class="zone-pill"
        :class="{ active: i === store.currentZoneIndex, completed: i < store.currentZoneIndex }"
        @click="goToZone(i)"
      >
        <el-icon v-if="i < store.currentZoneIndex" :size="14"><CircleCheck /></el-icon>
        {{ z.name.replace(' Area', '') }}
      </button>
    </div>

    <!-- Checklist Items -->
    <div class="items-list">
      <div
        v-for="item in zoneItems" :key="item.id"
        class="checklist-item"
        :class="{ [issueBorderClass(item.id)]: store.hasIssue(item.id) }"
      >
        <div class="item-row" @click="toggleItem(item.id)">
          <!-- OK: green check -->
          <el-icon :size="20" class="item-icon" v-if="!store.hasIssue(item.id)"><CircleCheck /></el-icon>
          <!-- HIGH: red X circle -->
          <el-icon :size="20" class="item-icon icon-high" v-else-if="store.getIssueForItem(item.id)?.severity === 'HIGH'"><CircleCloseFilled /></el-icon>
          <!-- LOW/MEDIUM: yellow warning -->
          <el-icon :size="20" class="item-icon icon-warn" v-else><Warning /></el-icon>

          <span class="item-label">{{ item.label }}</span>
          <div class="item-right">
            <span v-if="getItemPhotos(item.id).length" class="photo-count">
              <el-icon :size="14"><Picture /></el-icon>{{ getItemPhotos(item.id).length }}
            </span>
            <span class="item-badge ok" v-if="!store.hasIssue(item.id)">OK</span>
            <el-tag v-else :type="severityTagType(store.getIssueForItem(item.id)?.severity || '')" size="small">
              {{ store.getIssueForItem(item.id)?.severity }}
            </el-tag>
          </div>
        </div>

        <!-- Inline photo thumbnails (collapsed) -->
        <div v-if="store.hasIssue(item.id) && getItemPhotos(item.id).length && expandedItem !== item.id" class="inline-photos">
          <img
            v-for="fn in getItemPhotos(item.id)" :key="fn"
            :src="`/uploads/${fn}`" class="inline-thumb"
            @click.stop="fullPreviewUrl = `/uploads/${fn}`"
          />
        </div>

        <!-- ═══ New issue capture ═══ -->
        <div v-if="expandedItem === item.id && !store.hasIssue(item.id)" class="issue-capture">
          <div class="sev-label">Severity</div>
          <div class="severity-row">
            <button class="sev-btn low" :class="{ selected: severity === 'LOW' }" @click="severity = 'LOW'">Low</button>
            <button class="sev-btn med" :class="{ selected: severity === 'MEDIUM' }" @click="severity = 'MEDIUM'">Medium</button>
            <button class="sev-btn high" :class="{ selected: severity === 'HIGH' }" @click="severity = 'HIGH'">High</button>
          </div>

          <div v-if="severity !== 'LOW'" class="photo-section">
            <div class="photo-grid">
              <div v-for="(p, idx) in pendingPhotos" :key="idx" class="photo-thumb-wrap">
                <img :src="p.preview" class="photo-thumb" @click="fullPreviewUrl = p.preview" />
                <button class="remove-x" @click.stop="removePendingPhoto(idx)">&times;</button>
                <div v-if="p.uploading" class="upload-spinner" />
              </div>
              <button class="add-photo-btn" @click="triggerCamera">
                <el-icon :size="24"><Camera /></el-icon>
                <span>Add</span>
              </button>
            </div>
          </div>

          <el-input v-model="comment" placeholder="Add comment (optional)" size="default" class="comment-input" />
          <div class="capture-actions">
            <el-button @click="expandedItem = null">Cancel</el-button>
            <el-button type="danger" :loading="saving" @click="saveIssue(item)">Save Issue</el-button>
          </div>
        </div>

        <!-- ═══ Existing issue edit (full form) ═══ -->
        <div v-if="expandedItem === item.id && store.hasIssue(item.id)" class="issue-capture">
          <div class="sev-label">Severity</div>
          <div class="severity-row">
            <button class="sev-btn low" :class="{ selected: editSeverity === 'LOW' }" @click="editSeverity = 'LOW'">Low</button>
            <button class="sev-btn med" :class="{ selected: editSeverity === 'MEDIUM' }" @click="editSeverity = 'MEDIUM'">Medium</button>
            <button class="sev-btn high" :class="{ selected: editSeverity === 'HIGH' }" @click="editSeverity = 'HIGH'">High</button>
          </div>

          <!-- Photos with delete + add more -->
          <div class="photo-grid">
            <div v-for="(fn, idx) in getItemPhotos(item.id)" :key="fn" class="photo-thumb-wrap">
              <img :src="`/uploads/${fn}`" class="photo-thumb" @click="fullPreviewUrl = `/uploads/${fn}`" />
              <button class="remove-x" @click.stop="removeExistingPhoto(item, idx)">&times;</button>
            </div>
            <label class="add-photo-btn">
              <input type="file" accept="image/*" capture="environment" style="display:none" @change="(e: any) => onAddPhotoToExisting(e, item)" />
              <el-icon :size="24"><Camera /></el-icon>
              <span>Add</span>
            </label>
          </div>

          <el-input v-model="editComment" placeholder="Add comment (optional)" size="default" class="comment-input" />

          <div class="capture-actions">
            <el-button type="danger" plain size="small" @click="removeIssue(item)">Remove Issue</el-button>
            <el-button @click="expandedItem = null">Cancel</el-button>
            <el-button type="primary" :loading="saving" @click="saveExistingIssue(item)">Save</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Photo preview overlay -->
    <Teleport to="body">
      <div v-if="fullPreviewUrl" class="photo-overlay" @click="fullPreviewUrl = null">
        <button class="overlay-close">&times;</button>
        <img :src="fullPreviewUrl" class="overlay-img" @click.stop />
      </div>
    </Teleport>

    <!-- Next zone button -->
    <div class="next-zone-bar">
      <el-button type="primary" class="next-btn" :loading="completing" @click="handleNext">
        {{ isLastZone ? 'Complete Assessment' : 'Next Zone' }}
        <el-icon v-if="!isLastZone"><ArrowRight /></el-icon>
      </el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.walk-view { display: flex; flex-direction: column; height: 100%; }

.walk-header {
  display: flex; align-items: center; padding: 12px 16px; gap: 12px; flex-shrink: 0;
  background: var(--bg-secondary); border-bottom: 1px solid var(--border-primary);
}
.back-btn { background: none; border: none; cursor: pointer; color: var(--text-brand); display: flex; }
.header-title { flex: 1; font-size: 16px; font-weight: 600; color: var(--text-primary); }
.header-progress { font-size: 13px; color: var(--text-secondary); font-weight: 500; }

.progress-track { height: 3px; background: var(--bg-tertiary); flex-shrink: 0; }
.progress-fill { height: 100%; background: var(--bg-brand-primary); transition: width 0.3s ease; }

.zone-tabs {
  display: flex; gap: 8px; padding: 10px 16px; overflow-x: auto; flex-shrink: 0;
  -webkit-overflow-scrolling: touch; scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}
.zone-pill {
  display: flex; align-items: center; gap: 4px; white-space: nowrap;
  padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 500;
  border: 1px solid var(--border-primary); background: var(--bg-secondary);
  color: var(--text-secondary); cursor: pointer; flex-shrink: 0; transition: all 0.2s;
  &.active { background: var(--bg-brand-primary); color: var(--text-on-brand); border-color: var(--bg-brand-primary); }
  &.completed { background: var(--bg-positive-tertiary); color: var(--text-positive); border-color: var(--border-positive-tertiary); }
}

.items-list { flex: 1; overflow-y: auto; padding: 8px 16px; }

.checklist-item {
  background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 10px;
  margin-bottom: 8px; overflow: hidden; transition: all 0.2s;
  border-left: 3px solid var(--bg-positive-primary);
  /* Severity-specific left borders */
  &.issue-warn { border-left-color: var(--bg-warning-primary); }
  &.issue-high { border-left-color: var(--bg-danger-primary); }
}
.item-row {
  display: flex; align-items: center; gap: 10px; padding: 14px 14px; cursor: pointer;
  min-height: 48px;
}
.item-icon { color: var(--text-positive); flex-shrink: 0; }
.icon-warn { color: var(--text-warning); }
.icon-high { color: var(--text-danger); }
.item-label { flex: 1; font-size: 14px; color: var(--text-primary); }
.item-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.photo-count { display: flex; align-items: center; gap: 2px; font-size: 12px; color: var(--text-tertiary); }
.item-badge.ok { font-size: 12px; font-weight: 600; color: var(--text-positive); padding: 2px 8px; border-radius: 4px; background: var(--bg-positive-tertiary); }

.inline-photos {
  display: flex; gap: 6px; padding: 0 14px 10px; overflow-x: auto;
  scrollbar-width: none; &::-webkit-scrollbar { display: none; }
}
.inline-thumb {
  width: 52px; height: 52px; border-radius: 6px; object-fit: cover; flex-shrink: 0;
  cursor: pointer; border: 1px solid var(--border-primary);
  &:active { opacity: 0.7; }
}

.issue-capture { padding: 0 14px 14px; }

.sev-label {
  font-size: 12px; font-weight: 600; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;
}
.severity-row { display: flex; gap: 8px; margin-bottom: 12px; }
.sev-btn {
  flex: 1; padding: 10px; border-radius: 8px; font-size: 13px; font-weight: 600;
  border: 1px solid var(--border-primary); background: var(--bg-secondary);
  color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
  /* Low - green */
  &.low { color: var(--text-warning); border-color: var(--border-warning-tertiary); opacity: 0.7; }
  &.low.selected { background: var(--bg-warning-tertiary); color: var(--text-warning); border-color: var(--border-warning-secondary); opacity: 1; }
  /* Medium - yellow/warning */
  &.med { color: var(--text-warning); border-color: var(--border-warning-tertiary); }
  &.med.selected { background: var(--bg-warning-primary); color: var(--text-on-warning-primary); border-color: var(--bg-warning-primary); }
  /* High - red/danger */
  &.high { color: var(--text-danger); border-color: var(--border-danger-tertiary); }
  &.high.selected { background: var(--bg-danger-primary); color: var(--text-on-danger-primary); border-color: var(--bg-danger-primary); }
}

.photo-section { margin-bottom: 12px; }

.photo-grid {
  display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;
}
.photo-thumb-wrap {
  position: relative; width: 72px; height: 72px; flex-shrink: 0;
}
.photo-thumb {
  width: 100%; height: 100%; object-fit: cover; border-radius: 8px;
  cursor: pointer; border: 1px solid var(--border-primary);
  &:active { opacity: 0.7; }
}
.remove-x {
  position: absolute; top: -6px; right: -6px;
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--bg-danger-primary); color: white;
  border: 2px solid var(--bg-secondary); font-size: 14px; line-height: 1;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  z-index: 1;
}
.upload-spinner {
  position: absolute; inset: 0; border-radius: 8px;
  background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;
  &::after {
    content: ''; width: 20px; height: 20px; border: 2px solid white;
    border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite;
  }
}
@keyframes spin { to { transform: rotate(360deg); } }

.add-photo-btn {
  width: 72px; height: 72px; border-radius: 8px; flex-shrink: 0;
  border: 2px dashed var(--border-primary); background: var(--bg-primary);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  cursor: pointer; color: var(--text-tertiary); font-size: 11px; font-weight: 500;
  transition: all 0.15s;
  &:active { background: var(--bg-secondary-hover); }
}

.comment-input { margin-bottom: 12px; }
.capture-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }

.next-zone-bar {
  padding: 12px 16px; flex-shrink: 0;
  background: var(--bg-secondary); border-top: 1px solid var(--border-primary);
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}
.next-btn { width: 100%; height: 48px; font-size: 15px; font-weight: 600; border-radius: 10px; }

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
