import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { CURRENCIES, MAX_FILE_BYTES, METRICS, MONTHS, UPLOAD_SLOTS } from './lib/catalog.js';
import { HttpError } from './lib/http.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { reportsRouter } from './routes/reports.js';
import { usersRouter } from './routes/users.js';
import { loadUser } from './services/auth.js';

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Easypanel (Traefik) termina el HTTPS delante de la app

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );
  // Los reportes son para uso interno: que no los indexen buscadores.
  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(loadUser);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/meta', (_req, res) => res.json({ currencies: CURRENCIES, months: MONTHS, metrics: METRICS, uploadSlots: UPLOAD_SLOTS, maxFileBytes: MAX_FILE_BYTES }));
  app.use('/api/auth', authRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/users', usersRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));

  // Frontend (build de Vite) + fallback para rutas del SPA
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.code === 'LIMIT_FILE_SIZE') err = new HttpError(413, `El archivo supera ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    if (err?.code === 'P2025') err = new HttpError(404, 'Registro no encontrado');
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 && !(err instanceof HttpError) ? 'Error interno del servidor' : err.message, details: err.details });
  });

  return app;
}
