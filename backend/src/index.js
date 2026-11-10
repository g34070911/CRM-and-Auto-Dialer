import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import fieldRoutes from './routes/fields.js';
import recordRoutes from './routes/records.js';
import importRoutes from './routes/import.js';
import exportRoutes from './routes/export.js';
import savedFilterRoutes from './routes/saved_filters.js';
import dialerRoutes from './routes/dialer.js';
import extensionRoutes from './routes/extension.js';

dotenv.config();

// Catch unhandled rejections to keep server stable
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

const app = express();
const allowedOrigins = new Set((process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(value => value.trim()).filter(Boolean));
const extensionOrigin = process.env.EXTENSION_ORIGIN || '';
app.use(cors({ origin(origin, callback) {
  const extensionAllowed = origin?.startsWith('chrome-extension://') &&
    (process.env.NODE_ENV !== 'production' || process.env.ALLOW_EXTENSION_ORIGIN === 'true');
  if (!origin || allowedOrigins.has(origin) || origin === extensionOrigin || extensionAllowed) return callback(null, true);
  callback(new Error('Origin not allowed'));
} }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));
app.get('/api', (req, res) => res.json({ ok: true, service: 'Ledger CRM API', health: '/api/health' }));

app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/profiles/:profileId/fields', fieldRoutes);
app.use('/api/profiles/:profileId/records', recordRoutes);
app.use('/api/profiles/:profileId/import', importRoutes);
app.use('/api/profiles/:profileId/export', exportRoutes);
app.use('/api/profiles/:profileId/saved-filters', savedFilterRoutes);
app.use('/api/profiles/:profileId/dialer', dialerRoutes);
app.use('/api/profiles/:profileId/extension', extensionRoutes);

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[API Error]:', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Ledger CRM API running on port ${PORT}`));
