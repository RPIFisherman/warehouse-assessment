import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ZoneGroup, Issue } from '@/types'
import { getTemplateItemsByZone } from '@/api'

export const useAssessmentStore = defineStore('assessment', () => {
  const zones = ref<ZoneGroup[]>([])
  const currentZoneIndex = ref(0)
  const issues = ref<Map<string, Issue>>(new Map()) // keyed by checklist_item_id
  const assessmentId = ref('')

  const currentZone = computed(() => zones.value[currentZoneIndex.value])
  const totalZones = computed(() => zones.value.length)
  const progress = computed(() => totalZones.value > 0 ? ((currentZoneIndex.value + 1) / totalZones.value) * 100 : 0)

  async function loadZones(templateIds: string[]) {
    const allZones = new Map<string, ZoneGroup>()
    for (const tid of templateIds) {
      const data = await getTemplateItemsByZone(tid)
      for (const zone of data.zones) {
        if (allZones.has(zone.code)) {
          allZones.get(zone.code)!.items.push(...zone.items)
        } else {
          allZones.set(zone.code, { ...zone, items: [...zone.items] })
        }
      }
    }
    const order = ['RECEIVING', 'PICKING', 'PACKING', 'DOCK', 'RESTROOMS', 'STAGE', 'PROJECTS']
    zones.value = order.filter(z => allZones.has(z)).map(z => allZones.get(z)!)
    currentZoneIndex.value = 0
    issues.value = new Map()
  }

  function nextZone() {
    if (currentZoneIndex.value < zones.value.length - 1) currentZoneIndex.value++
  }
  function prevZone() {
    if (currentZoneIndex.value > 0) currentZoneIndex.value--
  }
  function goToZone(idx: number) {
    if (idx >= 0 && idx < zones.value.length) currentZoneIndex.value = idx
  }
  function addIssue(issue: Issue) {
    issues.value.set(issue.checklist_item_id, issue)
  }
  function removeIssue(checklistItemId: string) {
    issues.value.delete(checklistItemId)
  }
  function hasIssue(checklistItemId: string) {
    return issues.value.has(checklistItemId)
  }
  function getIssueForItem(checklistItemId: string) {
    return issues.value.get(checklistItemId)
  }

  function reset() {
    zones.value = []
    currentZoneIndex.value = 0
    issues.value = new Map()
    assessmentId.value = ''
  }

  return { zones, currentZoneIndex, issues, assessmentId, currentZone, totalZones, progress, loadZones, nextZone, prevZone, goToZone, addIssue, removeIssue, hasIssue, getIssueForItem, reset }
})
