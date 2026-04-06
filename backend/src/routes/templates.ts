import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/templates', (_req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM template ORDER BY sort_order').all();
    res.json(templates);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get('/templates/:id', (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM template WHERE id = ?').get(req.params.id);
    if (!template) return res.status(404).json({ error: 'Not found' });
    const items = db.prepare('SELECT * FROM checklist_item WHERE template_id = ? ORDER BY sort_order').all(req.params.id);
    res.json({ ...template as object, items });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get('/templates/:id/items-by-zone', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM checklist_item WHERE template_id = ? ORDER BY sort_order').all(req.params.id) as {
      zone_code: string; zone_name: string;
    }[];
    const zoneMap = new Map<string, { code: string; name: string; items: unknown[] }>();
    for (const item of items) {
      if (!zoneMap.has(item.zone_code)) {
        zoneMap.set(item.zone_code, { code: item.zone_code, name: item.zone_name, items: [] });
      }
      zoneMap.get(item.zone_code)!.items.push(item);
    }
    // Use zone_config order if available
    const zoneConfigs = db.prepare('SELECT code FROM zone_config WHERE enabled=1 ORDER BY sort_order').all() as { code: string }[];
    const zoneOrder = zoneConfigs.length > 0 ? zoneConfigs.map(z => z.code) : ['RECEIVING', 'PICKING', 'PACKING', 'DOCK', 'RESTROOMS', 'STAGE', 'PROJECTS'];
    const zones = zoneOrder
      .filter(z => zoneMap.has(z))
      .map(z => zoneMap.get(z)!);
    res.json({ zones });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
