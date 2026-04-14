import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

const SIDECAR_URL = process.env.FLORENCE_SIDECAR_URL || 'http://localhost:8100';
const AI_SIDECAR_SECRET = process.env.AI_SIDECAR_SECRET || '';
const AI_COMMENT_TIMEOUT_MS = 30_000;

/**
 * If the issue has photos but no human comment, ask Florence-2 to describe the
 * photos in context. Returns the AI-generated comment or null on failure.
 * Never throws — the caller should treat this as best-effort.
 */
async function tryGenerateAIComment(
  photoFilenames: string[],
  context: { checklist_label: string; zone_name: string; severity: string },
): Promise<string | null> {
  if (!photoFilenames.length) return null;
  try {
    const photoPaths = photoFilenames.map(f => path.join(uploadsDir, f));
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (AI_SIDECAR_SECRET) headers['X-AI-Auth'] = AI_SIDECAR_SECRET;
    const res = await fetch(`${SIDECAR_URL}/describe-photos`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ photo_paths: photoPaths, context }),
      signal: AbortSignal.timeout(AI_COMMENT_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { comment: string | null; confident: boolean };
    return data.comment; // null if model wasn't confident
  } catch (e) {
    console.error('[ai-comment] sidecar call failed (non-blocking):', String(e));
    return null;
  }
}

const router = Router();

router.post('/issues', async (req, res) => {
  try {
    const { assessment_id, checklist_item_id, checklist_label, zone_code, zone_name, severity, comment, photo_filenames } = req.body;
    const id = uuidv4();
    const filenameArray: string[] = Array.isArray(photo_filenames) ? photo_filenames : [];
    const photos = JSON.stringify(filenameArray);
    const createdBy = req.user?.id ?? null;
    const humanComment = (comment && String(comment).trim()) || null;

    db.prepare(
      'INSERT INTO issue (id, assessment_id, checklist_item_id, checklist_label, zone_code, zone_name, severity, comment, photo_filenames, created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).run(id, assessment_id, checklist_item_id, checklist_label, zone_code, zone_name, severity, humanComment, photos, createdBy);

    // If assessor left the comment empty but attached photos, ask AI to describe them.
    console.log('[ai-comment]',`POST /issues: humanComment=${JSON.stringify(humanComment)}, photoCount=${filenameArray.length}, shouldTrigger=${!humanComment && filenameArray.length > 0}`);
    if (!humanComment && filenameArray.length > 0) {
      console.log('[ai-comment]','calling sidecar /describe-photos...');
      const aiComment = await tryGenerateAIComment(filenameArray, {
        checklist_label: checklist_label || '',
        zone_name: zone_name || '',
        severity: severity || '',
      });
      console.log('[ai-comment]',`sidecar returned: ${aiComment ? aiComment.slice(0, 80) + '...' : 'null'}`);
      if (aiComment) {
        db.prepare(`UPDATE issue SET comment = ?, updated_at = datetime('now') WHERE id = ?`).run(aiComment, id);
      }
    }

    const row = db.prepare('SELECT * FROM issue WHERE id = ?').get(id) as any;
    res.json({ ...row, photo_filenames: JSON.parse(row.photo_filenames || '[]') });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

function parseIssueRow(row: any) {
  if (!row) return row;
  return { ...row, photo_filenames: JSON.parse(row.photo_filenames || '[]') };
}

router.get('/issues', (req, res) => {
  try {
    let sql = 'SELECT i.* FROM issue i WHERE 1=1';
    const params: string[] = [];
    if (req.query.assessment_id) { sql += ' AND i.assessment_id=?'; params.push(req.query.assessment_id as string); }
    if (req.query.tracking_status) { sql += ' AND i.tracking_status=?'; params.push(req.query.tracking_status as string); }
    if (req.query.severity) { sql += ' AND i.severity=?'; params.push(req.query.severity as string); }
    if (req.query.facility_name) {
      sql += ' AND i.assessment_id IN (SELECT id FROM assessment WHERE facility_name=?)';
      params.push(req.query.facility_name as string);
    }
    sql += ' ORDER BY i.created_at DESC';
    const rows = db.prepare(sql).all(...params) as any[];
    res.json(rows.map(parseIssueRow));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get('/issues/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM issue WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(parseIssueRow(row));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.put('/issues/:id', async (req, res) => {
  try {
    const { owner, due_date, tracking_status, comment, photo_filenames, severity } = req.body;
    const existing = db.prepare('SELECT * FROM issue WHERE id = ?').get(req.params.id) as Record<string, any> | undefined;
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const finalPhotos: string[] = photo_filenames !== undefined
      ? (Array.isArray(photo_filenames) ? photo_filenames : [])
      : JSON.parse(existing.photo_filenames || '[]');
    const finalComment = comment ?? existing.comment;
    const humanCommentProvided = comment !== undefined && comment !== null && String(comment).trim() !== '';
    const existingHasComment = existing.comment && String(existing.comment).trim() !== '';

    db.prepare(
      `UPDATE issue SET owner=?, due_date=?, tracking_status=?, comment=?, photo_filenames=?, severity=?, updated_at=datetime('now') WHERE id=?`
    ).run(
      owner ?? existing.owner, due_date ?? existing.due_date,
      tracking_status ?? existing.tracking_status, finalComment,
      JSON.stringify(finalPhotos), severity ?? existing.severity, req.params.id
    );

    // AI auto-comment: trigger when photos were just added to an issue that has
    // no human comment. This covers the common flow: save issue first → add
    // photos later via the "add photo to existing" button.
    const noComment = !humanCommentProvided && !existingHasComment;
    const photosJustAdded = photo_filenames !== undefined && finalPhotos.length > 0;
    console.log('[ai-comment]',`PUT /issues/${req.params.id}: noComment=${noComment}, photosJustAdded=${photosJustAdded}, photoCount=${finalPhotos.length}`);

    if (noComment && photosJustAdded) {
      console.log('[ai-comment]','PUT: calling sidecar /describe-photos for newly added photos...');
      const aiComment = await tryGenerateAIComment(finalPhotos, {
        checklist_label: existing.checklist_label || '',
        zone_name: existing.zone_name || '',
        severity: severity ?? existing.severity ?? '',
      });
      console.log('[ai-comment]',`PUT sidecar returned: ${aiComment ? aiComment.slice(0, 80) + '...' : 'null'}`);
      if (aiComment) {
        db.prepare(`UPDATE issue SET comment = ?, updated_at = datetime('now') WHERE id = ?`).run(aiComment, req.params.id);
      }
    }

    const updated = db.prepare('SELECT * FROM issue WHERE id = ?').get(req.params.id);
    res.json(parseIssueRow(updated));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete('/issues/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM issue WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
