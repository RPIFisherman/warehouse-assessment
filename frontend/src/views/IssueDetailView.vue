<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getIssue, updateIssue, deleteIssue } from '@/api'
import type { Issue, TrackingStatus } from '@/types'
import { ElMessageBox, ElMessage } from 'element-plus'
import dayjs from 'dayjs'

const props = defineProps<{ id: string }>()
const router = useRouter()
const issue = ref<Issue | null>(null)
const loading = ref(true)
const saving = ref(false)
const owner = ref('')
const dueDate = ref('')
const status = ref<TrackingStatus>('OPEN')
const comment = ref('')
const previewUrl = ref<string | null>(null)

onMounted(async () => {
  try {
    issue.value = await getIssue(props.id)
    owner.value = issue.value.owner || ''
    dueDate.value = issue.value.due_date || ''
    status.value = (issue.value.tracking_status as TrackingStatus) || 'OPEN'
    comment.value = issue.value.comment || ''
  } finally { loading.value = false }
})

async function save() {
  saving.value = true
  try {
    await updateIssue(props.id, { owner: owner.value || undefined, due_date: dueDate.value || undefined, tracking_status: status.value, comment: comment.value || undefined })
    ElMessage.success('Issue updated')
    router.back()
  } finally { saving.value = false }
}

async function remove() {
  await ElMessageBox.confirm('Delete this issue?', 'Confirm', { type: 'warning' })
  await deleteIssue(props.id)
  ElMessage.success('Issue deleted')
  router.back()
}
</script>

<template>
  <div class="detail-view" v-if="issue">
    <button class="back-link" @click="router.back()"><el-icon><ArrowLeft /></el-icon> Back</button>

    <div v-if="issue.photo_filenames?.length" class="photos-row">
      <img v-for="fn in issue.photo_filenames" :key="fn" :src="`/uploads/${fn}`" class="photo-thumb" @click="previewUrl = `/uploads/${fn}`" />
    </div>

    <h2>{{ issue.checklist_label }}</h2>
    <div class="meta">
      <el-tag :type="issue.severity === 'HIGH' ? 'danger' : 'warning'" size="small">{{ issue.severity }}</el-tag>
      <span>{{ issue.zone_name || issue.zone_code }}</span>
      <span>{{ dayjs(issue.created_at).format('MMM D, YYYY') }}</span>
    </div>

    <div class="form-section">
      <label>Owner</label>
      <el-input v-model="owner" placeholder="Assign to..." size="large" />
    </div>
    <div class="form-section">
      <label>Due Date</label>
      <el-date-picker v-model="dueDate" type="date" placeholder="Set due date" size="large" style="width:100%" value-format="YYYY-MM-DD" />
    </div>
    <div class="form-section">
      <label>Status</label>
      <div class="status-row">
        <button class="status-btn open" :class="{ selected: status === 'OPEN' }" @click="status = 'OPEN'">Open</button>
        <button class="status-btn progress" :class="{ selected: status === 'IN_PROGRESS' }" @click="status = 'IN_PROGRESS'">In Progress</button>
        <button class="status-btn closed" :class="{ selected: status === 'CLOSED' }" @click="status = 'CLOSED'">Closed</button>
      </div>
    </div>
    <div class="form-section">
      <label>Comment</label>
      <el-input v-model="comment" type="textarea" :rows="3" placeholder="Add details..." />
    </div>

    <el-button type="primary" class="save-btn" :loading="saving" @click="save">Save Changes</el-button>
    <el-button type="danger" plain class="delete-btn" @click="remove">Delete Issue</el-button>

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
.detail-view { padding: 16px; }
.back-link { display: flex; align-items: center; gap: 4px; background: none; border: none; color: var(--text-brand); font-size: 14px; cursor: pointer; padding: 0; margin-bottom: 16px; }
.photos-row { display: flex; gap: 8px; margin-bottom: 16px; overflow-x: auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
.photo-thumb { width: 90px; height: 90px; object-fit: cover; border-radius: 10px; flex-shrink: 0; cursor: pointer; border: 1px solid var(--border-primary); &:active { opacity: 0.8; } }
h2 { font-size: 20px; font-weight: 700; color: var(--text-primary); margin: 0 0 8px; }
.meta { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; }
.form-section { margin-bottom: 16px;
  label { display: block; font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
}
.status-row { display: flex; gap: 8px; }
.status-btn {
  flex: 1; padding: 10px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
  border: 1px solid var(--border-primary); background: var(--bg-secondary); color: var(--text-secondary); transition: all 0.15s;
  &.open.selected { background: var(--bg-danger-tertiary); color: var(--text-danger); border-color: var(--border-danger-tertiary); }
  &.progress.selected { background: var(--bg-warning-tertiary); color: var(--text-warning); border-color: var(--border-warning-tertiary); }
  &.closed.selected { background: var(--bg-positive-tertiary); color: var(--text-positive); border-color: var(--border-positive-tertiary); }
}
.save-btn { width: 100%; height: 48px; border-radius: 10px; font-size: 15px; font-weight: 600; margin-bottom: 10px; }
.delete-btn { width: 100%; height: 44px; border-radius: 10px; }
.loading { text-align: center; padding: 60px; color: var(--text-tertiary); }
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
