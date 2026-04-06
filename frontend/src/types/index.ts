export interface Template {
  id: string
  name: string
  category_code: string
  description: string
  sort_order: number
}
export interface ChecklistItem {
  id: string
  template_id: string
  zone_code: string
  zone_name: string
  label: string
  sort_order: number
}
export interface ZoneGroup {
  code: string
  name: string
  items: ChecklistItem[]
}
export interface Assessment {
  id: string
  building_type: string
  categories: string
  facility_name: string
  assessor_name: string
  status: string
  started_at: string
  completed_at: string | null
  total_items: number
  total_issues: number
  critical_issues: number
  overall_score: number | null
  overall_rating: string | null
  current_zone: string | null
  issues?: Issue[]
}
export interface Issue {
  id: string
  assessment_id: string
  checklist_item_id: string
  checklist_label: string
  zone_code: string
  zone_name: string
  severity: string
  comment: string
  photo_filenames: string[]
  owner: string | null
  due_date: string | null
  tracking_status: string
  created_at: string
  updated_at: string
}
export interface Facility {
  id: string
  name: string
  address: string
  sort_order: number
}
export interface ZoneConfig {
  code: string
  name: string
  sort_order: number
  enabled: number
}
export type BuildingType = 'NEW' | 'CURRENT' | 'CLOSING' | 'CONSOLIDATING'
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH'
export type TrackingStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED'
