<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getTemplates, createAssessment, getPresets, getFacilities } from '@/api'
import { getUserInfo } from '@/utils/auth'
import { useAssessmentStore } from '@/stores/assessment'
import type { Template, BuildingType, Facility } from '@/types'

const router = useRouter()
const store = useAssessmentStore()
const step = ref(1)
const templates = ref<Template[]>([])
const facilities = ref<Facility[]>([])
const presets = ref<Record<string, string[]>>({})
const selectedBuildingType = ref<BuildingType | ''>('')
const selectedCategories = ref<string[]>([])
const selectedFacility = ref('')
// Prefill from the signed-in IAM user — editable if they want to override.
const assessorName = ref(getUserInfo()?.userName || getUserInfo()?.email?.split('@')[0] || 'Assessor')
const creating = ref(false)

function toggleCat(id: string) {
  const idx = selectedCategories.value.indexOf(id)
  if (idx >= 0) selectedCategories.value.splice(idx, 1)
  else selectedCategories.value.push(id)
}

const buildingTypes: { value: BuildingType; label: string; icon: string; color: string }[] = [
  { value: 'NEW', label: 'New Building', icon: 'HomeFilled', color: 'var(--bg-brand-primary)' },
  { value: 'CURRENT', label: 'Current Building', icon: 'OfficeBuilding', color: 'var(--bg-positive-primary)' },
  { value: 'CLOSING', label: 'Closing Building', icon: 'CircleClose', color: 'var(--bg-warning-primary)' },
  { value: 'CONSOLIDATING', label: 'Consolidating', icon: 'Connection', color: 'var(--purple-500)' },
]

onMounted(async () => {
  const [tpls, prs, facs] = await Promise.all([getTemplates(), getPresets(), getFacilities()])
  templates.value = tpls
  presets.value = prs
  facilities.value = facs
  selectedCategories.value = tpls.map(t => t.id)
})

function selectBuildingType(bt: BuildingType) {
  selectedBuildingType.value = bt
  // Apply preset defaults for this building type
  const presetCats = presets.value[bt]
  if (presetCats && presetCats.length > 0) {
    selectedCategories.value = [...presetCats]
  }
  step.value = 2
}

async function startWalk() {
  if (!selectedFacility.value || !selectedCategories.value.length) return
  creating.value = true
  try {
    store.reset()
    const assessment = await createAssessment({
      building_type: selectedBuildingType.value,
      categories: selectedCategories.value,
      facility_name: selectedFacility.value,
      assessor_name: assessorName.value.trim() || 'Assessor',
    })
    store.assessmentId = assessment.id
    await store.loadZones(selectedCategories.value)
    router.push(`/assess/${assessment.id}/walk`)
  } finally { creating.value = false }
}
</script>

<template>
  <div class="wizard">
    <!-- Step 1: Building Type -->
    <div v-if="step === 1" class="step">
      <button class="back-link" @click="router.push('/')">
        <el-icon><ArrowLeft /></el-icon> Back
      </button>
      <h2>Building Type</h2>
      <p class="subtitle">What type of facility are you assessing?</p>
      <div class="type-grid">
        <div
          v-for="bt in buildingTypes" :key="bt.value"
          class="type-card"
          @click="selectBuildingType(bt.value)"
        >
          <el-icon :size="32" :style="{ color: bt.color }"><component :is="bt.icon" /></el-icon>
          <span class="type-label">{{ bt.label }}</span>
        </div>
      </div>
    </div>

    <!-- Step 2: Categories -->
    <div v-if="step === 2" class="step">
      <button class="back-link" @click="step = 1">
        <el-icon><ArrowLeft /></el-icon> Back
      </button>
      <h2>Assessment Categories</h2>
      <p class="subtitle">Select what to assess</p>
      <div v-for="t in templates" :key="t.id" class="cat-card" @click="toggleCat(t.id)">
        <el-checkbox :model-value="selectedCategories.includes(t.id)" @change="toggleCat(t.id)" />
        <div class="cat-info">
          <div class="cat-name">{{ t.name }}</div>
          <div class="cat-desc">{{ t.description }}</div>
        </div>
      </div>
      <el-button type="primary" class="continue-btn" :disabled="!selectedCategories.length" @click="step = 3">
        Continue
      </el-button>
    </div>

    <!-- Step 3: Start -->
    <div v-if="step === 3" class="step">
      <button class="back-link" @click="step = 2">
        <el-icon><ArrowLeft /></el-icon> Back
      </button>
      <h2>Ready to Start</h2>
      <p class="subtitle">{{ selectedCategories.length }} categories selected</p>
      <div class="form-section">
        <label>Facility *</label>
        <el-select v-model="selectedFacility" placeholder="Select facility" size="large" filterable style="width:100%">
          <el-option v-for="f in facilities" :key="f.id" :label="f.name" :value="f.name">
            <div>
              <div style="font-weight:500">{{ f.name }}</div>
              <div v-if="f.address" style="font-size:12px;color:var(--text-tertiary)">{{ f.address }}</div>
            </div>
          </el-option>
        </el-select>
        <div v-if="!facilities.length" class="no-facility-hint">
          No facilities configured. <span class="hint-link" @click="router.push('/settings')">Add in Settings</span>
        </div>
      </div>
      <div class="form-section">
        <label>Assessor Name</label>
        <el-input v-model="assessorName" placeholder="Your name" size="large" />
      </div>
      <el-button type="primary" class="continue-btn" :loading="creating" :disabled="!selectedFacility" @click="startWalk">
        Start Walk
      </el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.wizard { padding: 16px; }
.back-link { display: flex; align-items: center; gap: 4px; background: none; border: none; color: var(--text-brand); font-size: 14px; cursor: pointer; padding: 0; margin-bottom: 16px; }
h2 { font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0 0 4px; }
.subtitle { font-size: 14px; color: var(--text-secondary); margin: 0 0 20px; }
.type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.type-card {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 14px;
  padding: 28px 16px; cursor: pointer; transition: all 0.15s;
  &:active { transform: scale(0.97); background: var(--bg-secondary-hover); }
}
.type-label { font-size: 13px; font-weight: 600; color: var(--text-primary); text-align: center; }
.cat-card {
  display: flex; align-items: flex-start; gap: 12px;
  background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px;
  padding: 14px 16px; margin-bottom: 10px; cursor: pointer;
}
.cat-info { flex: 1; }
.cat-name { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.cat-desc { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.continue-btn { width: 100%; height: 50px; font-size: 16px; font-weight: 600; border-radius: 12px; margin-top: 20px; }
.form-section { margin-bottom: 16px;
  label { display: block; font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
}
.no-facility-hint { font-size: 12px; color: var(--text-tertiary); margin-top: 6px; }
.hint-link { color: var(--text-brand); cursor: pointer; text-decoration: underline; }
</style>
