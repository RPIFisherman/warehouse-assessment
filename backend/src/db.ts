import Database from 'better-sqlite3';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'warehouse-assessment.db');
// Explicit type annotation — without it, tsc --declaration can't name the
// inferred instance type from the default import and emits TS4023.
const db: BetterSqliteDatabase = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS template (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_code TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS checklist_item (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      zone_code TEXT NOT NULL,
      zone_name TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS assessment (
      id TEXT PRIMARY KEY,
      building_type TEXT NOT NULL,
      categories TEXT NOT NULL,
      facility_name TEXT,
      assessor_name TEXT NOT NULL,
      status TEXT DEFAULT 'IN_PROGRESS',
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      total_items INTEGER DEFAULT 0,
      total_issues INTEGER DEFAULT 0,
      critical_issues INTEGER DEFAULT 0,
      overall_score REAL,
      overall_rating TEXT,
      current_zone TEXT
    );
    CREATE TABLE IF NOT EXISTS facility (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS building_type_preset (
      building_type TEXT NOT NULL,
      template_id TEXT NOT NULL,
      PRIMARY KEY (building_type, template_id)
    );
    CREATE TABLE IF NOT EXISTS zone_config (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS issue (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL,
      checklist_item_id TEXT NOT NULL,
      checklist_label TEXT,
      zone_code TEXT NOT NULL,
      zone_name TEXT,
      severity TEXT NOT NULL,
      comment TEXT,
      photo_filenames TEXT DEFAULT '[]',
      owner TEXT,
      due_date TEXT,
      tracking_status TEXT DEFAULT 'OPEN',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Additive migrations — idempotent columns that newer code expects but
  // older databases may not yet have. ALTER TABLE ADD COLUMN is not
  // conditional in SQLite, so we gate it behind a PRAGMA table_info check.
  ensureColumn('assessment', 'created_by_user_id', 'TEXT');
  ensureColumn('issue', 'created_by_user_id', 'TEXT');

  const count = db.prepare('SELECT COUNT(*) as c FROM template').get() as { c: number };
  if (count.c === 0) seed();
  // Always ensure zone_config and presets exist
  const zoneCount = db.prepare('SELECT COUNT(*) as c FROM zone_config').get() as { c: number };
  if (zoneCount.c === 0) seedZonesAndPresets();
  const facCount = db.prepare('SELECT COUNT(*) as c FROM facility').get() as { c: number };
  if (facCount.c === 0) seedFacilities();
}

function ensureColumn(table: string, column: string, definition: string): void {
  const cols = db.pragma(`table_info(${table})`) as { name: string }[];
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Migrated: ${table}.${column} added.`);
  }
}

function seed() {
  const ins = db.prepare('INSERT INTO template (id, name, category_code, description, sort_order) VALUES (?,?,?,?,?)');
  const insItem = db.prepare('INSERT INTO checklist_item (id, template_id, zone_code, zone_name, label, sort_order) VALUES (?,?,?,?,?,?)');

  const templates: { id: string; name: string; code: string; desc: string; order: number; items: Record<string, string[]> }[] = [
    {
      id: 'SAFETY', name: 'Safety & Regulatory Compliance', code: 'SAFETY',
      desc: 'OSHA, fire safety, PPE, hazard communication, forklift & MHE safety', order: 1,
      items: {
        RECEIVING: ['Fire extinguisher accessible', 'Emergency exit signs visible', 'Floor markings intact', 'PPE station stocked', 'First aid kit available', 'Forklift horn/lights working'],
        PICKING: ['Aisle clearance adequate', 'Step ladder condition', 'Overhead signage secure', 'PPE compliance observed', 'Spill kit accessible', 'Lighting adequate'],
        PACKING: ['Workstation ergonomics', 'Box cutter safety', 'Anti-fatigue mats present', 'Emergency exit clear', 'Ventilation adequate'],
        DOCK: ['Dock lock engaged', 'Wheel chocks in place', 'Dock plate condition', 'Safety bollards intact', 'Loading area clear', 'Trailer inspection current'],
        RESTROOMS: ['Wet floor signs available', 'Cleaning schedule posted', 'Hand sanitizer stocked', 'Ventilation working', 'Emergency contact posted'],
        STAGE: ['Fire lane clear', 'Sprinkler clearance maintained', 'Staging area organized', 'Height limits posted', 'Load capacity signs visible'],
        PROJECTS: ['Safety briefing posted', 'Barricades in place', 'Permit to work displayed', 'Tool inspection current', 'Dust/noise controls active'],
      },
    },
    {
      id: 'FACILITY', name: 'Facility & Infrastructure', code: 'FACILITY',
      desc: 'Racking integrity, floor condition, lighting, HVAC, dock doors, space utilization', order: 2,
      items: {
        RECEIVING: ['Racking integrity', 'Floor condition', 'Lighting adequate', 'HVAC operational', 'Dock door functional'],
        PICKING: ['Rack labels readable', 'Floor markings visible', 'Overhead lighting working', 'Conveyor condition', 'Shelving stable'],
        PACKING: ['Bench condition', 'Power outlets working', 'Scale calibration current', 'Lighting adequate', 'Ventilation working'],
        DOCK: ['Dock leveler working', 'Overhead door condition', 'Drainage clear', 'Bumper condition', 'Lighting adequate'],
        RESTROOMS: ['Plumbing working', 'Tile/floor condition', 'Mirror intact', 'Door locks working', 'Water temperature OK'],
        STAGE: ['Floor load capacity OK', 'Column protectors in place', 'Signage condition', 'Paint markings visible', 'Ceiling integrity'],
        PROJECTS: ['Temporary structure stable', 'Utility connections safe', 'Waste containers placed', 'Access path clear', 'Lighting adequate'],
      },
    },
    {
      id: 'OPERATIONS', name: 'Operational Efficiency', code: 'OPERATIONS',
      desc: 'Pick rate, putaway flow, dock-to-stock cycle, order fulfillment, labor utilization', order: 3,
      items: {
        RECEIVING: ['Dock-to-stock flow clear', 'Putaway staging organized', 'ASN verification process', 'Inbound quality check area', 'Receiving paperwork current'],
        PICKING: ['Pick path unobstructed', 'Batch pick cart available', 'Replenishment timely', 'Pick accuracy controls', 'Zone assignment clear'],
        PACKING: ['Packing materials stocked', 'Shipping labels ready', 'QC checkpoint active', 'Carton sizing correct', 'Outbound staging clear'],
        DOCK: ['Trailer loading sequence', 'Bill of lading ready', 'Carrier scheduling visible', 'Yard management active', 'Load verification process'],
        RESTROOMS: ['Break schedule visible', 'Cleanliness maintained', 'Supplies stocked'],
        STAGE: ['FIFO compliance visible', 'Project materials organized', 'WIP tracking current', 'Space allocation marked'],
        PROJECTS: ['Timeline posted', 'Resource allocation visible', 'Progress tracking active', 'Communication board current'],
      },
    },
  ];

  const zoneNames: Record<string, string> = {
    RECEIVING: 'Receiving Area', PICKING: 'Picking Area', PACKING: 'Packing Area',
    DOCK: 'Dock Area', RESTROOMS: 'Restrooms Area', STAGE: 'Stage', PROJECTS: 'Projects',
  };

  const transaction = db.transaction(() => {
    for (const t of templates) {
      ins.run(t.id, t.name, t.code, t.desc, t.order);
      for (const [zone, items] of Object.entries(t.items)) {
        items.forEach((label, idx) => {
          insItem.run(uuidv4(), t.id, zone, zoneNames[zone] || zone, label, (idx + 1) * 10);
        });
      }
    }
  });
  transaction();
  console.log('Database seeded with 3 categories and checklist items.');
}

function seedZonesAndPresets() {
  const insZone = db.prepare('INSERT OR IGNORE INTO zone_config (code, name, sort_order, enabled) VALUES (?,?,?,1)');
  const zones = [
    ['RECEIVING', 'Receiving Area', 1], ['PICKING', 'Picking Area', 2], ['PACKING', 'Packing Area', 3],
    ['DOCK', 'Dock Area', 4], ['RESTROOMS', 'Restrooms Area', 5], ['STAGE', 'Stage', 6], ['PROJECTS', 'Projects', 7],
  ] as const;
  for (const [code, name, order] of zones) insZone.run(code, name, order);

  const insPreset = db.prepare('INSERT OR IGNORE INTO building_type_preset (building_type, template_id) VALUES (?,?)');
  const templates = db.prepare('SELECT id FROM template').all() as { id: string }[];
  const allIds = templates.map(t => t.id);
  // All building types default to all categories
  for (const bt of ['NEW', 'CURRENT', 'CLOSING', 'CONSOLIDATING']) {
    for (const tid of allIds) insPreset.run(bt, tid);
  }
  console.log('Zone configs and building type presets seeded.');
}

function seedFacilities() {
  const ins = db.prepare('INSERT OR IGNORE INTO facility (id, name, address, sort_order) VALUES (?,?,?,?)');
  const facilities = [
    ['FAC-BP', 'Buena Park', 'Buena Park, CA', 1],
    ['FAC-EP', 'El Paso', 'El Paso, TX', 2],
    ['FAC-HOU', 'Houston', 'Houston, TX', 3],
    ['FAC-LAX', 'Los Angeles', 'Los Angeles, CA', 4],
    ['FAC-DAL', 'Dallas', 'Dallas, TX', 5],
  ] as const;
  for (const [id, name, address, order] of facilities) ins.run(id, name, address, order);
  console.log('Facilities seeded.');
}

export default db;
