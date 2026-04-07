import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDB } from './db.js';
import templatesRouter from './routes/templates.js';
import assessmentsRouter from './routes/assessments.js';
import issuesRouter from './routes/issues.js';
import photosRouter from './routes/photos.js';
import settingsRouter from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

initDB();

const app = express();

// Comma-separated list of extra allowed origins for CORS. Set this in a
// local .env file (gitignored) if exposing via a tunnel/proxy:
//   ALLOWED_ORIGINS=https://my-tunnel.trycloudflare.com
const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:4173',
    ...extraOrigins,
  ],
}));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

app.use('/api', templatesRouter);
app.use('/api', assessmentsRouter);
app.use('/api', issuesRouter);
app.use('/api', photosRouter);
app.use('/api', settingsRouter);

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
