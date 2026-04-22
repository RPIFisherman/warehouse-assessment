<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { aiHealthCheck, assessVideo } from '@/api'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
type Step = 'setup' | 'processing' | 'results'
const step = ref<Step>('setup')
const aiReady = ref<boolean | null>(null) // null = checking, true = ok, false = down
const gpuName = ref('')

// Setup
const videoFile = ref<File | null>(null)
const videoPreviewUrl = ref('')
const frameInterval = ref(3)
const questions = ref([
  'Are there any safety hazards or obstructions?',
  'Are fire extinguishers accessible and visible?',
  'Is proper PPE being worn by workers?',
  'Are emergency exits clear and properly marked?',
])

// Processing
const processing = ref(false)
const error = ref('')

// Results
interface Finding {
  question: string
  answer: string
  has_issue: boolean
  severity: string
  grounding_phrase: string
  annotated_url?: string
  bboxes?: number[][]
}
interface FrameResult {
  frame_index: number
  timestamp_sec: number
  frame_url: string
  status: string
  caption: string
  findings: Finding[]
}
const sessionId = ref('')
const totalFrames = ref(0)
const totalIssues = ref(0)
const results = ref<FrameResult[]>([])
const expandedFrame = ref<number | null>(null)
const previewImage = ref('')

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------
const canAnalyze = computed(() => videoFile.value && questions.value.some(q => q.trim()) && aiReady.value)

const summaryRating = computed(() => {
  if (!totalFrames.value) return 'none'
  const issueRate = totalIssues.value / totalFrames.value
  if (issueRate > 0.5) return 'RED'
  if (issueRate > 0) return 'YELLOW'
  return 'GREEN'
})

const summaryColor = computed(() => {
  if (summaryRating.value === 'GREEN') return 'var(--bg-positive-primary)'
  if (summaryRating.value === 'YELLOW') return 'var(--bg-warning-primary)'
  if (summaryRating.value === 'RED') return 'var(--bg-danger-primary)'
  return 'var(--bg-tertiary)'
})

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
onMounted(async () => {
  try {
    const health = await aiHealthCheck()
    aiReady.value = health.model_loaded
    gpuName.value = health.gpu
  } catch {
    aiReady.value = false
  }
})

function onVideoSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  videoFile.value = file
  videoPreviewUrl.value = URL.createObjectURL(file)
}

function addQuestion() {
  questions.value.push('')
}

function removeQuestion(idx: number) {
  questions.value.splice(idx, 1)
}

async function startAnalysis() {
  if (!videoFile.value) return
  const activeQuestions = questions.value.filter(q => q.trim())
  if (!activeQuestions.length) return

  step.value = 'processing'
  processing.value = true
  error.value = ''

  try {
    const data = await assessVideo(videoFile.value, activeQuestions, frameInterval.value)
    sessionId.value = data.session_id
    totalFrames.value = data.total_frames
    totalIssues.value = data.total_issues
    results.value = data.results
    step.value = 'results'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    step.value = 'setup'
  } finally {
    processing.value = false
  }
}

function toggleFrame(idx: number) {
  expandedFrame.value = expandedFrame.value === idx ? null : idx
}

function openPreview(url: string) {
  previewImage.value = url
}

function closePreview() {
  previewImage.value = ''
}

function resetScan() {
  step.value = 'setup'
  videoFile.value = null
  videoPreviewUrl.value = ''
  results.value = []
  expandedFrame.value = null
  totalFrames.value = 0
  totalIssues.value = 0
  sessionId.value = ''
  error.value = ''
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function severityColor(sev: string): string {
  if (sev === 'high') return 'var(--bg-danger-primary)'
  if (sev === 'medium') return 'var(--bg-warning-primary)'
  if (sev === 'low') return '#f59e0b'
  return 'var(--bg-positive-primary)'
}
</script>

<template>
  <div class="ai-view">
    <!-- ============================== SETUP ============================== -->
    <template v-if="step === 'setup'">
      <div class="header">
        <h1>AI Video Scan</h1>
        <p v-if="aiReady === true" class="ai-status ready">
          <el-icon><CircleCheck /></el-icon> Florence-2 ready · {{ gpuName }}
        </p>
        <p v-else-if="aiReady === false" class="ai-status down">
          <el-icon><Warning /></el-icon> AI service offline — start the sidecar
        </p>
        <p v-else class="ai-status">Checking AI service…</p>
      </div>

      <!-- Video Upload -->
      <div class="section">
        <div class="section-title">Video</div>
        <div v-if="!videoFile" class="upload-area" @click="($refs.videoInput as HTMLInputElement).click()">
          <el-icon :size="40"><VideoCamera /></el-icon>
          <span>Record or upload video</span>
          <span class="hint">Tap to open camera or select a file</span>
        </div>
        <div v-else class="video-preview">
          <video :src="videoPreviewUrl" controls class="preview-video" />
          <el-button size="small" type="danger" plain @click="videoFile = null; videoPreviewUrl = ''">
            Remove
          </el-button>
        </div>
        <input
          ref="videoInput"
          type="file"
          accept="video/*"
          capture="environment"
          style="display:none"
          @change="onVideoSelected"
        >
      </div>

      <!-- Questions -->
      <div class="section">
        <div class="section-title">Assessment Questions</div>
        <div v-for="(q, i) in questions" :key="i" class="question-row">
          <el-input v-model="questions[i]" :placeholder="`Question ${i + 1}`" size="large" />
          <el-button v-if="questions.length > 1" circle size="small" type="danger" plain @click="removeQuestion(i)">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
        <el-button size="small" text type="primary" @click="addQuestion">
          <el-icon><Plus /></el-icon> Add question
        </el-button>
      </div>

      <!-- Frame Interval -->
      <div class="section">
        <div class="section-title">Frame Interval</div>
        <el-select v-model="frameInterval" size="large" style="width: 100%">
          <el-option :value="2" label="Every 2 seconds (more frames)" />
          <el-option :value="3" label="Every 3 seconds (balanced)" />
          <el-option :value="5" label="Every 5 seconds (fewer frames)" />
        </el-select>
      </div>

      <p v-if="error" class="error-msg">{{ error }}</p>

      <el-button
        type="primary"
        class="action-btn"
        :disabled="!canAnalyze"
        @click="startAnalysis"
      >
        <el-icon><VideoPlay /></el-icon>
        Analyze Video
      </el-button>
    </template>

    <!-- ========================== PROCESSING ============================= -->
    <template v-if="step === 'processing'">
      <div class="processing-view">
        <el-icon class="spin" :size="48"><Loading /></el-icon>
        <h2>Analyzing Video…</h2>
        <p>Extracting frames and running Florence-2 inference.</p>
        <p class="hint">This may take 30-60 seconds depending on video length.</p>
      </div>
    </template>

    <!-- ============================ RESULTS ============================== -->
    <template v-if="step === 'results'">
      <div class="header">
        <h1>Scan Results</h1>
      </div>

      <!-- Summary Card -->
      <div class="summary-card" :style="{ borderLeftColor: summaryColor }">
        <div class="summary-main">
          <span class="summary-frames">{{ totalFrames }} frames</span>
          <span class="summary-sep">·</span>
          <span :style="{ color: summaryColor, fontWeight: 700 }">
            {{ totalIssues }} issue{{ totalIssues !== 1 ? 's' : '' }} found
          </span>
        </div>
        <el-tag :type="summaryRating === 'GREEN' ? 'success' : summaryRating === 'RED' ? 'danger' : 'warning'" size="small">
          {{ summaryRating }}
        </el-tag>
      </div>

      <!-- Frame list -->
      <div v-for="fr in results" :key="fr.frame_index" class="frame-card" @click="toggleFrame(fr.frame_index)">
        <div class="frame-header">
          <img
            :src="fr.frame_url"
            class="frame-thumb"
            loading="lazy"
            @click.stop="openPreview(fr.frame_url)"
          >
          <div class="frame-info">
            <div class="frame-time">{{ formatTime(fr.timestamp_sec) }}</div>
            <div class="frame-caption">{{ fr.caption }}</div>
          </div>
          <div class="frame-badge" :class="fr.status">
            <el-icon v-if="fr.status === 'ok'"><CircleCheck /></el-icon>
            <el-icon v-else><Warning /></el-icon>
          </div>
        </div>

        <!-- Expanded findings -->
        <div v-if="expandedFrame === fr.frame_index" class="frame-findings">
          <div v-for="(f, fi) in fr.findings" :key="fi" class="finding-row">
            <div class="finding-q">{{ f.question }}</div>
            <div class="finding-a" :style="{ color: f.has_issue ? severityColor(f.severity) : 'var(--text-secondary)' }">
              {{ f.answer }}
            </div>
            <el-tag v-if="f.has_issue" :type="f.severity === 'high' ? 'danger' : 'warning'" size="small">
              {{ f.severity.toUpperCase() }}
            </el-tag>
            <el-tag v-else type="success" size="small">OK</el-tag>
            <img
              v-if="f.annotated_url"
              :src="f.annotated_url"
              class="annotated-thumb"
              loading="lazy"
              @click.stop="openPreview(f.annotated_url)"
            >
          </div>
        </div>
      </div>

      <el-button type="primary" class="action-btn" @click="resetScan">
        <el-icon><RefreshRight /></el-icon>
        New Scan
      </el-button>
    </template>

    <!-- Full-screen image overlay -->
    <Teleport to="body">
      <div v-if="previewImage" class="photo-overlay" @click="closePreview">
        <img :src="previewImage" class="overlay-img">
        <button class="overlay-close" @click.stop="closePreview">
          <el-icon :size="28"><Close /></el-icon>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.ai-view { padding: 20px 16px 24px; }
.header {
  margin-bottom: 20px;
  h1 { font-size: 24px; font-weight: 700; color: var(--text-primary); margin: 0; }
}
.ai-status {
  font-size: 13px; margin: 6px 0 0; display: flex; align-items: center; gap: 4px;
  &.ready { color: var(--bg-positive-primary); }
  &.down { color: var(--bg-danger-primary); }
}

.section { margin-bottom: 20px; }
.section-title {
  font-size: 13px; font-weight: 600; color: var(--text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;
}

.upload-area {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 40px 16px; border: 2px dashed var(--border-primary);
  border-radius: 14px; cursor: pointer; color: var(--text-secondary);
  transition: all 0.15s;
  &:active { background: var(--bg-secondary-hover); border-color: var(--bg-brand-primary); }
  .hint { font-size: 12px; opacity: 0.7; }
}

.video-preview {
  display: flex; flex-direction: column; gap: 8px;
}
.preview-video {
  width: 100%; max-height: 240px; border-radius: 12px;
  background: #000; object-fit: contain;
}

.question-row {
  display: flex; gap: 8px; align-items: center; margin-bottom: 8px;
}

.error-msg { color: var(--el-color-danger); font-size: 13px; margin-bottom: 12px; }

.action-btn {
  width: 100%; height: 52px; font-size: 16px; font-weight: 600;
  border-radius: 12px; margin-top: 12px;
}

// Processing
.processing-view {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 50vh; gap: 16px; text-align: center;
  h2 { font-size: 20px; margin: 0; color: var(--text-primary); }
  p { font-size: 14px; color: var(--text-secondary); margin: 0; }
  .hint { font-size: 12px; opacity: 0.7; }
}
.spin { animation: spin 1s linear infinite; color: var(--bg-brand-primary); }
@keyframes spin { to { transform: rotate(360deg); } }

// Results
.summary-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-left: 4px solid; border-radius: 12px;
  background: var(--bg-secondary); margin-bottom: 16px;
}
.summary-main { display: flex; align-items: center; gap: 6px; font-size: 15px; }
.summary-frames { color: var(--text-primary); font-weight: 600; }
.summary-sep { color: var(--text-tertiary); }

.frame-card {
  background: var(--bg-secondary); border: 1px solid var(--border-primary);
  border-radius: 12px; margin-bottom: 10px; overflow: hidden; cursor: pointer;
  transition: background 0.15s;
  &:active { background: var(--bg-secondary-hover); }
}
.frame-header {
  display: flex; align-items: center; gap: 12px; padding: 12px;
}
.frame-thumb {
  width: 64px; height: 48px; object-fit: cover; border-radius: 6px; flex-shrink: 0;
}
.frame-info { flex: 1; min-width: 0; }
.frame-time { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.frame-caption {
  font-size: 12px; color: var(--text-secondary); margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.frame-badge {
  width: 28px; height: 28px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; flex-shrink: 0;
  &.ok { background: var(--bg-positive-primary); color: #fff; }
  &.issue { background: var(--bg-danger-primary); color: #fff; }
}

.frame-findings {
  padding: 0 12px 12px; border-top: 1px solid var(--border-primary);
}
.finding-row {
  padding: 10px 0;
  &:not(:last-child) { border-bottom: 1px solid var(--border-primary); }
}
.finding-q { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.finding-a { font-size: 13px; margin: 4px 0 6px; }
.annotated-thumb {
  width: 100%; max-height: 200px; object-fit: contain; border-radius: 8px;
  margin-top: 8px; cursor: pointer;
  border: 1px solid var(--border-primary);
}

// Photo overlay (matches existing app pattern)
.photo-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0, 0, 0, 0.92);
  display: flex; align-items: center; justify-content: center;
}
.overlay-img {
  max-width: 95vw; max-height: 90vh; object-fit: contain; border-radius: 8px;
}
.overlay-close {
  position: absolute; top: env(safe-area-inset-top, 12px); right: 12px;
  background: rgba(255, 255, 255, 0.15); border: none; border-radius: 50%;
  width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
  color: #fff; cursor: pointer;
}
</style>
