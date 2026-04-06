import client from './client'
import type { Template, Assessment, Issue, ZoneGroup, ChecklistItem, ZoneConfig, Facility } from '@/types'

export const getTemplates = () => client.get<Template[]>('/templates').then(r => r.data)
export const getTemplateItemsByZone = (id: string) => client.get<{ zones: ZoneGroup[] }>(`/templates/${id}/items-by-zone`).then(r => r.data)
export const createAssessment = (data: { building_type: string; categories: string[]; facility_name: string; assessor_name: string }) =>
  client.post<Assessment>('/assessments', data).then(r => r.data)
export const getAssessments = () => client.get<Assessment[]>('/assessments').then(r => r.data)
export const getAssessment = (id: string) => client.get<Assessment & { issues: Issue[] }>(`/assessments/${id}`).then(r => r.data)
export const completeAssessment = (id: string) => client.put<Assessment & { issues: Issue[] }>(`/assessments/${id}/complete`).then(r => r.data)
export const createIssue = (data: Partial<Issue>) => client.post<Issue>('/issues', data).then(r => r.data)
export const getIssues = (params?: Record<string, string>) => client.get<Issue[]>('/issues', { params }).then(r => r.data)
export const getIssue = (id: string) => client.get<Issue>(`/issues/${id}`).then(r => r.data)
export const updateIssue = (id: string, data: Partial<Issue>) => client.put<Issue>(`/issues/${id}`, data).then(r => r.data)
export const deleteIssue = (id: string) => client.delete(`/issues/${id}`).then(r => r.data)
export const uploadPhoto = (file: File) => {
  const fd = new FormData()
  fd.append('photo', file)
  return client.post<{ filename: string; url: string }>('/photos', fd).then(r => r.data)
}

// Settings APIs
export const getCategories = () => client.get<Template[]>('/settings/categories').then(r => r.data)
export const createCategory = (data: { name: string; description?: string }) => client.post<Template>('/settings/categories', data).then(r => r.data)
export const updateCategory = (id: string, data: Partial<Template>) => client.put<Template>(`/settings/categories/${id}`, data).then(r => r.data)
export const deleteCategory = (id: string) => client.delete(`/settings/categories/${id}`).then(r => r.data)

export const getCategoryItems = (id: string) => client.get<ChecklistItem[]>(`/settings/categories/${id}/items`).then(r => r.data)
export const createItem = (data: { template_id: string; zone_code: string; label: string }) => client.post<ChecklistItem>('/settings/items', data).then(r => r.data)
export const updateItem = (id: string, data: Partial<ChecklistItem>) => client.put<ChecklistItem>(`/settings/items/${id}`, data).then(r => r.data)
export const deleteItem = (id: string) => client.delete(`/settings/items/${id}`).then(r => r.data)

export const getZones = () => client.get<ZoneConfig[]>('/settings/zones').then(r => r.data)
export const createZone = (data: { code: string; name: string }) => client.post<ZoneConfig>('/settings/zones', data).then(r => r.data)
export const updateZone = (code: string, data: Partial<ZoneConfig>) => client.put<ZoneConfig>(`/settings/zones/${code}`, data).then(r => r.data)
export const deleteZone = (code: string) => client.delete(`/settings/zones/${code}`).then(r => r.data)

export const getFacilities = () => client.get<Facility[]>('/settings/facilities').then(r => r.data)
export const createFacility = (data: { name: string; address?: string }) => client.post<Facility>('/settings/facilities', data).then(r => r.data)
export const updateFacility = (id: string, data: Partial<Facility>) => client.put<Facility>(`/settings/facilities/${id}`, data).then(r => r.data)
export const deleteFacility = (id: string) => client.delete(`/settings/facilities/${id}`).then(r => r.data)

export const getPresets = () => client.get<Record<string, string[]>>('/settings/presets').then(r => r.data)
export const updatePreset = (buildingType: string, templateIds: string[]) => client.put(`/settings/presets/${buildingType}`, { template_ids: templateIds }).then(r => r.data)
