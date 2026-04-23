<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import {
  getCategories, createCategory, updateCategory, deleteCategory,
  getCategoryItems, createItem, updateItem, deleteItem,
  getZones, createZone, updateZone, deleteZone,
  getPresets, updatePreset,
  getFacilities, createFacility, updateFacility, deleteFacility,
} from '@/api'
import type { Template, ChecklistItem, ZoneConfig, BuildingType, Facility } from '@/types'
import { ElMessage, ElMessageBox } from 'element-plus'

const activeTab = ref('categories')

// ── Categories ──
const categories = ref<Template[]>([])
const catLoading = ref(true)
const newCatName = ref('')
const newCatDesc = ref('')
const editingCat = ref<string | null>(null)
const editCatName = ref('')
const editCatDesc = ref('')

async function loadCategories() {
  catLoading.value = true
  try { categories.value = await getCategories() } finally { catLoading.value = false }
}

async function handleAddCategory() {
  if (!newCatName.value.trim()) return
  await createCategory({ name: newCatName.value.trim(), description: newCatDesc.value.trim() })
  newCatName.value = ''
  newCatDesc.value = ''
  await loadCategories()
  ElMessage.success('Category added')
}

function startEditCat(cat: Template) {
  editingCat.value = cat.id
  editCatName.value = cat.name
  editCatDesc.value = cat.description
}

async function saveEditCat(id: string) {
  await updateCategory(id, { name: editCatName.value, description: editCatDesc.value })
  editingCat.value = null
  await loadCategories()
  ElMessage.success('Category updated')
}

async function handleDeleteCat(cat: Template) {
  await ElMessageBox.confirm(`Delete "${cat.name}" and all its checklist items?`, 'Confirm', { type: 'warning' })
  await deleteCategory(cat.id)
  if (selectedCatId.value === cat.id) selectedCatId.value = ''
  await loadCategories()
  ElMessage.success('Category deleted')
}

// ── Checklist Items ──
const selectedCatId = ref('')
const items = ref<ChecklistItem[]>([])
const itemsLoading = ref(false)
const zones = ref<ZoneConfig[]>([])
const newItemLabel = ref('')
const newItemZone = ref('')
const editingItem = ref<string | null>(null)
const editItemLabel = ref('')

const selectedCatName = computed(() => categories.value.find(c => c.id === selectedCatId.value)?.name || '')

const itemsByZone = computed(() => {
  const map: Record<string, ChecklistItem[]> = {}
  for (const z of zones.value) map[z.code] = []
  for (const item of items.value) {
    if (!map[item.zone_code]) map[item.zone_code] = []
    map[item.zone_code].push(item)
  }
  return map
})

async function loadZones() {
  zones.value = await getZones()
}

async function loadItems() {
  if (!selectedCatId.value) { items.value = []; return }
  itemsLoading.value = true
  try { items.value = await getCategoryItems(selectedCatId.value) } finally { itemsLoading.value = false }
}

watch(selectedCatId, loadItems)

async function handleAddItem() {
  if (!newItemLabel.value.trim() || !newItemZone.value || !selectedCatId.value) return
  await createItem({ template_id: selectedCatId.value, zone_code: newItemZone.value, label: newItemLabel.value.trim() })
  newItemLabel.value = ''
  await loadItems()
  ElMessage.success('Item added')
}

function startEditItem(item: ChecklistItem) {
  editingItem.value = item.id
  editItemLabel.value = item.label
}

async function saveEditItem(id: string) {
  await updateItem(id, { label: editItemLabel.value })
  editingItem.value = null
  await loadItems()
}

async function handleDeleteItem(item: ChecklistItem) {
  await deleteItem(item.id)
  await loadItems()
  ElMessage.success('Item removed')
}

// ── Zones ──
const newZoneCode = ref('')
const newZoneName = ref('')

async function handleAddZone() {
  if (!newZoneCode.value.trim() || !newZoneName.value.trim()) return
  await createZone({ code: newZoneCode.value.trim(), name: newZoneName.value.trim() })
  newZoneCode.value = ''
  newZoneName.value = ''
  await loadZones()
  ElMessage.success('Zone added')
}

async function handleDeleteZone(zone: ZoneConfig) {
  await ElMessageBox.confirm(`Delete zone "${zone.name}" and all items in it?`, 'Confirm', { type: 'warning' })
  await deleteZone(zone.code)
  await loadZones()
  ElMessage.success('Zone deleted')
}

// ── Facilities ──
const facilityList = ref<Facility[]>([])
const newFacName = ref('')
const newFacAddress = ref('')
const editingFac = ref<string | null>(null)
const editFacName = ref('')
const editFacAddress = ref('')

async function loadFacilities() {
  facilityList.value = await getFacilities()
}

async function handleAddFacility() {
  if (!newFacName.value.trim()) return
  await createFacility({ name: newFacName.value.trim(), address: newFacAddress.value.trim() })
  newFacName.value = ''
  newFacAddress.value = ''
  await loadFacilities()
  ElMessage.success('Facility added')
}

function startEditFac(fac: Facility) {
  editingFac.value = fac.id
  editFacName.value = fac.name
  editFacAddress.value = fac.address
}

async function saveEditFac(id: string) {
  await updateFacility(id, { name: editFacName.value, address: editFacAddress.value })
  editingFac.value = null
  await loadFacilities()
  ElMessage.success('Facility updated')
}

async function handleDeleteFac(fac: Facility) {
  await ElMessageBox.confirm(`Delete facility "${fac.name}"?`, 'Confirm', { type: 'warning' })
  await deleteFacility(fac.id)
  await loadFacilities()
  ElMessage.success('Facility deleted')
}

// ── Presets ──
const presets = ref<Record<string, string[]>>({})
const presetsLoading = ref(false)
const buildingTypes: { value: BuildingType; label: string }[] = [
  { value: 'NEW', label: 'New Building' },
  { value: 'CURRENT', label: 'Current Building' },
  { value: 'CLOSING', label: 'Closing Building' },
  { value: 'CONSOLIDATING', label: 'Consolidating Building' },
]

async function loadPresets() {
  presetsLoading.value = true
  try { presets.value = await getPresets() } finally { presetsLoading.value = false }
}

function isPresetChecked(bt: string, catId: string) {
  return (presets.value[bt] || []).includes(catId)
}

async function togglePreset(bt: string, catId: string) {
  const current = presets.value[bt] || []
  const next = current.includes(catId) ? current.filter(id => id !== catId) : [...current, catId]
  presets.value[bt] = next
  await updatePreset(bt, next)
}

// ── Init ──
onMounted(async () => {
  await Promise.all([loadCategories(), loadZones(), loadPresets(), loadFacilities()])
})
</script>

<template>
  <div class="settings-view">
    <h2>Settings</h2>

    <div class="tab-row">
      <button class="tab" :class="{ active: activeTab === 'categories' }" @click="activeTab = 'categories'">Categories</button>
      <button class="tab" :class="{ active: activeTab === 'items' }" @click="activeTab = 'items'">Checklist Items</button>
      <button class="tab" :class="{ active: activeTab === 'zones' }" @click="activeTab = 'zones'">Zones</button>
      <button class="tab" :class="{ active: activeTab === 'facilities' }" @click="activeTab = 'facilities'">Facilities</button>
      <button class="tab" :class="{ active: activeTab === 'presets' }" @click="activeTab = 'presets'">Presets</button>
    </div>

    <!-- ═══ Categories Tab ═══ -->
    <div v-if="activeTab === 'categories'" class="tab-content">
      <div class="add-form">
        <el-input v-model="newCatName" placeholder="Category name" size="default" />
        <el-input v-model="newCatDesc" placeholder="Description (optional)" size="default" />
        <el-button type="primary" :disabled="!newCatName.trim()" @click="handleAddCategory">
          <el-icon><Plus /></el-icon> Add
        </el-button>
      </div>

      <div v-if="catLoading" class="empty">Loading...</div>
      <div v-for="cat in categories" :key="cat.id" class="list-card">
        <div v-if="editingCat !== cat.id" class="card-row">
          <div class="card-body">
            <div class="card-title">{{ cat.name }}</div>
            <div class="card-desc" v-if="cat.description">{{ cat.description }}</div>
          </div>
          <div class="card-actions">
            <el-button text type="primary" size="small" @click="startEditCat(cat)"><el-icon><Edit /></el-icon></el-button>
            <el-button text type="danger" size="small" @click="handleDeleteCat(cat)"><el-icon><Delete /></el-icon></el-button>
          </div>
        </div>
        <div v-else class="edit-row">
          <el-input v-model="editCatName" size="small" />
          <el-input v-model="editCatDesc" size="small" placeholder="Description" />
          <el-button size="small" type="primary" @click="saveEditCat(cat.id)">Save</el-button>
          <el-button size="small" @click="editingCat = null">Cancel</el-button>
        </div>
      </div>
    </div>

    <!-- ═══ Checklist Items Tab ═══ -->
    <div v-if="activeTab === 'items'" class="tab-content">
      <div class="picker-row">
        <label>Category:</label>
        <el-select v-model="selectedCatId" placeholder="Select category" size="default" style="flex:1">
          <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </div>

      <div v-if="selectedCatId" class="add-form">
        <el-select v-model="newItemZone" placeholder="Zone" size="default" style="width:140px">
          <el-option v-for="z in zones" :key="z.code" :label="z.name" :value="z.code" />
        </el-select>
        <el-input v-model="newItemLabel" placeholder="Item label" size="default" style="flex:1" />
        <el-button type="primary" :disabled="!newItemLabel.trim() || !newItemZone" @click="handleAddItem">
          <el-icon><Plus /></el-icon>
        </el-button>
      </div>

      <div v-if="!selectedCatId" class="empty">Select a category to manage its items</div>
      <div v-else-if="itemsLoading" class="empty">Loading...</div>

      <template v-for="zone in zones" :key="zone.code">
        <div v-if="(itemsByZone[zone.code] || []).length > 0" class="zone-section">
          <div class="zone-header">{{ zone.name }} <span class="zone-count">{{ (itemsByZone[zone.code] || []).length }}</span></div>
          <div v-for="item in itemsByZone[zone.code]" :key="item.id" class="item-row">
            <template v-if="editingItem !== item.id">
              <span class="item-label">{{ item.label }}</span>
              <el-button text type="primary" size="small" @click="startEditItem(item)"><el-icon><Edit /></el-icon></el-button>
              <el-button text type="danger" size="small" @click="handleDeleteItem(item)"><el-icon><Delete /></el-icon></el-button>
            </template>
            <template v-else>
              <el-input v-model="editItemLabel" size="small" style="flex:1" @keyup.enter="saveEditItem(item.id)" />
              <el-button size="small" type="primary" @click="saveEditItem(item.id)">Save</el-button>
              <el-button size="small" @click="editingItem = null">Cancel</el-button>
            </template>
          </div>
        </div>
      </template>

      <div v-if="selectedCatId && !itemsLoading && items.length === 0" class="empty">No items yet. Add some above.</div>
    </div>

    <!-- ═══ Zones Tab ═══ -->
    <div v-if="activeTab === 'zones'" class="tab-content">
      <div class="add-form">
        <el-input v-model="newZoneCode" placeholder="Code (e.g. BREAK_ROOM)" size="default" style="width:160px" />
        <el-input v-model="newZoneName" placeholder="Display name" size="default" style="flex:1" />
        <el-button type="primary" :disabled="!newZoneCode.trim() || !newZoneName.trim()" @click="handleAddZone">
          <el-icon><Plus /></el-icon>
        </el-button>
      </div>

      <div v-for="zone in zones" :key="zone.code" class="list-card">
        <div class="card-row">
          <div class="card-body">
            <div class="card-title">{{ zone.name }}</div>
            <div class="card-desc">{{ zone.code }}</div>
          </div>
          <el-button text type="danger" size="small" @click="handleDeleteZone(zone)"><el-icon><Delete /></el-icon></el-button>
        </div>
      </div>
    </div>

    <!-- ═══ Facilities Tab ═══ -->
    <div v-if="activeTab === 'facilities'" class="tab-content">
      <div class="add-form">
        <el-input v-model="newFacName" placeholder="Facility name" size="default" style="flex:1" />
        <el-input v-model="newFacAddress" placeholder="Address (optional)" size="default" style="flex:1" />
        <el-button type="primary" :disabled="!newFacName.trim()" @click="handleAddFacility">
          <el-icon><Plus /></el-icon> Add
        </el-button>
      </div>

      <div v-for="fac in facilityList" :key="fac.id" class="list-card">
        <div v-if="editingFac !== fac.id" class="card-row">
          <div class="card-body">
            <div class="card-title">{{ fac.name }}</div>
            <div class="card-desc" v-if="fac.address">{{ fac.address }}</div>
          </div>
          <div class="card-actions">
            <el-button text type="primary" size="small" @click="startEditFac(fac)"><el-icon><Edit /></el-icon></el-button>
            <el-button text type="danger" size="small" @click="handleDeleteFac(fac)"><el-icon><Delete /></el-icon></el-button>
          </div>
        </div>
        <div v-else class="edit-row">
          <el-input v-model="editFacName" size="small" placeholder="Name" />
          <el-input v-model="editFacAddress" size="small" placeholder="Address" />
          <el-button size="small" type="primary" @click="saveEditFac(fac.id)">Save</el-button>
          <el-button size="small" @click="editingFac = null">Cancel</el-button>
        </div>
      </div>

      <div v-if="!facilityList.length" class="empty">No facilities yet. Add your warehouse locations above.</div>
    </div>

    <!-- ═══ Presets Tab ═══ -->
    <div v-if="activeTab === 'presets'" class="tab-content">
      <p class="hint">Choose which categories are pre-selected for each building type.</p>

      <div v-for="bt in buildingTypes" :key="bt.value" class="preset-card">
        <div class="preset-title">{{ bt.label }}</div>
        <div v-for="cat in categories" :key="cat.id" class="preset-row" @click="togglePreset(bt.value, cat.id)">
          <el-checkbox :model-value="isPresetChecked(bt.value, cat.id)" @change="togglePreset(bt.value, cat.id)" />
          <span class="preset-label">{{ cat.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings-view { padding: 16px; }
h2 { font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0 0 16px; }

.tab-row {
  display: flex; gap: 4px; margin-bottom: 16px; overflow-x: auto;
  -webkit-overflow-scrolling: touch; scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}
.tab {
  padding: 7px 14px; border-radius: 20px; font-size: 13px; font-weight: 500;
  background: var(--bg-secondary); border: 1px solid var(--border-primary); color: var(--text-secondary);
  cursor: pointer; white-space: nowrap; transition: all 0.15s; flex-shrink: 0;
  &.active { background: var(--bg-brand-primary); color: var(--text-on-brand); border-color: var(--bg-brand-primary); }
}

.tab-content { min-height: 200px; }
.add-form { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.picker-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
  label { font-size: 13px; font-weight: 600; color: var(--text-secondary); white-space: nowrap; }
}
.empty { text-align: center; padding: 30px; color: var(--text-tertiary); font-size: 14px; }
.hint { font-size: 13px; color: var(--text-secondary); margin: 0 0 16px; }

.list-card {
  background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 10px;
  padding: 12px 14px; margin-bottom: 8px;
}
.card-row { display: flex; align-items: center; gap: 10px; }
.card-body { flex: 1; min-width: 0; }
.card-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.card-desc { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.card-actions { display: flex; gap: 2px; flex-shrink: 0; }
.edit-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

.zone-section { margin-bottom: 16px; }
.zone-header {
  font-size: 13px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase;
  letter-spacing: 0.5px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;
}
.zone-count {
  font-size: 11px; background: var(--bg-tertiary); color: var(--text-primary);
  padding: 1px 6px; border-radius: 8px;
}
.item-row {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 8px; margin-bottom: 4px;
}
.item-label { flex: 1; font-size: 14px; color: var(--text-primary); }

.preset-card {
  background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px;
  padding: 14px 16px; margin-bottom: 12px;
}
.preset-title { font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px; }
.preset-row {
  display: flex; align-items: center; gap: 10px; padding: 6px 0; cursor: pointer;
  &:not(:last-child) { border-bottom: 1px solid var(--border-primary); }
}
.preset-label { font-size: 14px; color: var(--text-primary); }

.model-card {
  background: var(--bg-secondary); border: 1px solid var(--border-primary);
  border-radius: 10px; padding: 14px;
}
.model-row {
  display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
  label { font-size: 13px; font-weight: 600; color: var(--text-secondary); white-space: nowrap; }
}
.model-desc { border-top: 1px solid var(--border-primary); padding-top: 12px; }
.model-compare {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;
}
.model-col {
  background: var(--bg-primary); border: 1px solid var(--border-primary);
  border-radius: 8px; padding: 10px 12px;
}
.model-col-title {
  font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;
}
.model-col ul {
  margin: 0; padding-left: 18px;
  li { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
}
</style>
