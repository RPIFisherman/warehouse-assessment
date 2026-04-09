import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

const router = Router();

function parseIssueRow(row: any) {
  if (!row) return row;
  return { ...row, photo_filenames: JSON.parse(row.photo_filenames || '[]') };
}

router.post('/assessments', (req, res) => {
  try {
    const { building_type, categories, facility_name, assessor_name } = req.body;
    const id = uuidv4();
    const catArray: string[] = Array.isArray(categories) ? categories : [categories];
    const placeholders = catArray.map(() => '?').join(',');
    const totalItems = (db.prepare(`SELECT COUNT(*) as c FROM checklist_item WHERE template_id IN (${placeholders})`).get(...catArray) as { c: number }).c;
    const createdBy = req.user?.id ?? null;

    db.prepare(
      'INSERT INTO assessment (id, building_type, categories, facility_name, assessor_name, total_items, current_zone, created_by_user_id) VALUES (?,?,?,?,?,?,?,?)'
    ).run(id, building_type, JSON.stringify(catArray), facility_name, assessor_name, totalItems, 'RECEIVING', createdBy);

    const assessment = db.prepare('SELECT * FROM assessment WHERE id = ?').get(id);
    res.json(assessment);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get('/assessments', (_req, res) => {
  try {
    const assessments = db.prepare('SELECT * FROM assessment ORDER BY started_at DESC').all();
    res.json(assessments);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get('/assessments/:id', (req, res) => {
  try {
    const assessment = db.prepare('SELECT * FROM assessment WHERE id = ?').get(req.params.id);
    if (!assessment) return res.status(404).json({ error: 'Not found' });
    const issues = db.prepare('SELECT * FROM issue WHERE assessment_id = ? ORDER BY created_at DESC').all(req.params.id) as any[];
    res.json({ ...(assessment as object), issues: issues.map(parseIssueRow) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.put('/assessments/:id/complete', (req, res) => {
  try {
    const assessment = db.prepare('SELECT * FROM assessment WHERE id = ?').get(req.params.id) as {
      id: string; total_items: number; categories: string;
    } | undefined;
    if (!assessment) return res.status(404).json({ error: 'Not found' });

    const issues = db.prepare('SELECT * FROM issue WHERE assessment_id = ?').all(req.params.id) as { severity: string }[];
    const totalIssues = issues.length;
    const criticalIssues = issues.filter(i => i.severity === 'HIGH').length;
    const score = assessment.total_items > 0 ? ((assessment.total_items - totalIssues) / assessment.total_items) * 100 : 100;
    let rating = 'GREEN';
    if (criticalIssues > 0 || score < 70) rating = 'RED';
    else if (score < 90) rating = 'YELLOW';

    db.prepare(
      `UPDATE assessment SET status='COMPLETED', completed_at=datetime('now'), total_issues=?, critical_issues=?, overall_score=?, overall_rating=? WHERE id=?`
    ).run(totalIssues, criticalIssues, Math.round(score * 10) / 10, rating, req.params.id);

    const updated = db.prepare('SELECT * FROM assessment WHERE id = ?').get(req.params.id);
    const updatedIssues = db.prepare('SELECT * FROM issue WHERE assessment_id = ? ORDER BY created_at DESC').all(req.params.id) as any[];
    res.json({ ...(updated as object), issues: updatedIssues.map(parseIssueRow) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
