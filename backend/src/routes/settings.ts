import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

const router = Router();

// ── Categories (Templates) CRUD ──

router.get('/settings/categories', (_req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM template ORDER BY sort_order').all();
    res.json(categories);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post('/settings/categories', (req, res) => {
  try {
    const { name, description } = req.body;
    const id = uuidv4().substring(0, 8).toUpperCase();
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM template').get() as { m: number };
    db.prepare('INSERT INTO template (id, name, category_code, description, sort_order) VALUES (?,?,?,?,?)').run(id, name, id, description || '', maxOrder.m + 1);
    res.json(db.prepare('SELECT * FROM template WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.put('/settings/categories/:id', (req, res) => {
  try {
    const { name, description, sort_order } = req.body;
    const existing = db.prepare('SELECT * FROM template WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE template SET name=?, description=?, sort_order=? WHERE id=?').run(
      name ?? (existing as any).name, description ?? (existing as any).description,
      sort_order ?? (existing as any).sort_order, req.params.id
    );
    res.json(db.prepare('SELECT * FROM template WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.delete('/settings/categories/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM checklist_item WHERE template_id = ?').run(req.params.id);
    db.prepare('DELETE FROM building_type_preset WHERE template_id = ?').run(req.params.id);
    db.prepare('DELETE FROM template WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Checklist Items CRUD ──

router.get('/settings/categories/:id/items', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM checklist_item WHERE template_id = ? ORDER BY zone_code, sort_order').all(req.params.id);
    res.json(items);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post('/settings/items', (req, res) => {
  try {
    const { template_id, zone_code, label } = req.body;
    const id = uuidv4();
    const zoneConfig = db.prepare('SELECT name FROM zone_config WHERE code = ?').get(zone_code) as { name: string } | undefined;
    const zoneName = zoneConfig?.name || zone_code;
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM checklist_item WHERE template_id=? AND zone_code=?').get(template_id, zone_code) as { m: number };
    db.prepare('INSERT INTO checklist_item (id, template_id, zone_code, zone_name, label, sort_order) VALUES (?,?,?,?,?,?)').run(id, template_id, zone_code, zoneName, label, maxOrder.m + 10);
    res.json(db.prepare('SELECT * FROM checklist_item WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.put('/settings/items/:id', (req, res) => {
  try {
    const { label, zone_code, sort_order } = req.body;
    const existing = db.prepare('SELECT * FROM checklist_item WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const newZone = zone_code ?? existing.zone_code;
    const zoneConfig = db.prepare('SELECT name FROM zone_config WHERE code = ?').get(newZone) as { name: string } | undefined;
    db.prepare('UPDATE checklist_item SET label=?, zone_code=?, zone_name=?, sort_order=? WHERE id=?').run(
      label ?? existing.label, newZone, zoneConfig?.name || newZone,
      sort_order ?? existing.sort_order, req.params.id
    );
    res.json(db.prepare('SELECT * FROM checklist_item WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.delete('/settings/items/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM checklist_item WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Zones Config ──

router.get('/settings/zones', (_req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM zone_config ORDER BY sort_order').all());
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post('/settings/zones', (req, res) => {
  try {
    const { code, name } = req.body;
    const zoneCode = code.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM zone_config').get() as { m: number };
    db.prepare('INSERT INTO zone_config (code, name, sort_order, enabled) VALUES (?,?,?,1)').run(zoneCode, name, maxOrder.m + 1);
    res.json(db.prepare('SELECT * FROM zone_config WHERE code = ?').get(zoneCode));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.put('/settings/zones/:code', (req, res) => {
  try {
    const { name, enabled } = req.body;
    const existing = db.prepare('SELECT * FROM zone_config WHERE code = ?').get(req.params.code) as any;
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE zone_config SET name=?, enabled=? WHERE code=?').run(
      name ?? existing.name, enabled ?? existing.enabled, req.params.code
    );
    res.json(db.prepare('SELECT * FROM zone_config WHERE code = ?').get(req.params.code));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.delete('/settings/zones/:code', (req, res) => {
  try {
    db.prepare('DELETE FROM checklist_item WHERE zone_code = ?').run(req.params.code);
    db.prepare('DELETE FROM zone_config WHERE code = ?').run(req.params.code);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Facilities ──

router.get('/settings/facilities', (_req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM facility ORDER BY sort_order').all());
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post('/settings/facilities', (req, res) => {
  try {
    const { name, address } = req.body;
    const id = 'FAC-' + uuidv4().substring(0, 6).toUpperCase();
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM facility').get() as { m: number };
    db.prepare('INSERT INTO facility (id, name, address, sort_order) VALUES (?,?,?,?)').run(id, name, address || '', maxOrder.m + 1);
    res.json(db.prepare('SELECT * FROM facility WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.put('/settings/facilities/:id', (req, res) => {
  try {
    const { name, address } = req.body;
    const existing = db.prepare('SELECT * FROM facility WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE facility SET name=?, address=? WHERE id=?').run(name ?? existing.name, address ?? existing.address, req.params.id);
    res.json(db.prepare('SELECT * FROM facility WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.delete('/settings/facilities/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM facility WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── Building Type Presets ──

router.get('/settings/presets', (_req, res) => {
  try {
    const presets = db.prepare('SELECT * FROM building_type_preset ORDER BY building_type').all();
    // Group by building_type
    const grouped: Record<string, string[]> = {};
    for (const p of presets as { building_type: string; template_id: string }[]) {
      if (!grouped[p.building_type]) grouped[p.building_type] = [];
      grouped[p.building_type].push(p.template_id);
    }
    // Ensure all 4 building types exist
    for (const bt of ['NEW', 'CURRENT', 'CLOSING', 'CONSOLIDATING']) {
      if (!grouped[bt]) grouped[bt] = [];
    }
    res.json(grouped);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.put('/settings/presets/:buildingType', (req, res) => {
  try {
    const bt = req.params.buildingType;
    const { template_ids } = req.body as { template_ids: string[] };
    db.prepare('DELETE FROM building_type_preset WHERE building_type = ?').run(bt);
    const ins = db.prepare('INSERT INTO building_type_preset (building_type, template_id) VALUES (?,?)');
    for (const tid of template_ids) ins.run(bt, tid);
    res.json({ building_type: bt, template_ids });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
