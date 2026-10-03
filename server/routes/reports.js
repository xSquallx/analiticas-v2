import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ACCEPTED_MIME, CURRENCIES, MAX_FILE_BYTES, METRICS, REPORT_STATUS, UPLOAD_SLOTS } from '../lib/catalog.js';
import { prisma } from '../lib/db.js';
import { HttpError, notFound, parseOr400 } from '../lib/http.js';
import { analyzeReport } from '../services/analysis.js';
import { requireAuth } from '../services/auth.js';

export const reportsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

const SLOT_KEYS = UPLOAD_SLOTS.map((s) => s.key);
const METRIC_SELECT = Object.fromEntries(METRICS.map((m) => [m.key, true]));

// Campos de la lista (sin el texto del análisis para que sea liviana).
const LIST_SELECT = {
  id: true, flowName: true, month: true, year: true, currency: true, status: true, source: true,
  createdAt: true, updatedAt: true, publishedAt: true, ...METRIC_SELECT,
};

const metricsSchema = z.object(
  Object.fromEntries(METRICS.map((m) => [m.key, (m.type === 'int' ? z.number().int().min(0) : z.number()).nullable().optional()])),
);

const metaSchema = z.object({
  flowName: z.string().trim().min(1).max(200),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  currency: z.enum(CURRENCIES),
});

const updateSchema = metaSchema.partial().extend({
  metrics: metricsSchema.optional(),
  analysis: z.string().max(100_000).optional(),
  notes: z.string().max(10_000).nullable().optional(),
  status: z.enum(REPORT_STATUS).optional(),
});

const listQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().optional(),
  currency: z.enum(CURRENCIES).optional(),
  status: z.enum(REPORT_STATUS).optional(),
});

/** Los visitantes solo ven reportes publicados. */
const visibleWhere = (req) => (req.user ? {} : { status: 'PUBLISHED' });

async function findReportOr404(req, id, extra = {}) {
  const report = await prisma.report.findFirst({ where: { id, ...visibleWhere(req) }, ...extra });
  if (!report) throw notFound('Reporte');
  return report;
}

function toApi(report) {
  const { files, ...rest } = report;
  const out = { ...rest };
  if (files) out.files = files;
  return out;
}

// ---------- Lectura (pública) ----------

reportsRouter.get('/', async (req, res) => {
  const q = parseOr400(listQuerySchema, req.query);
  const where = { ...visibleWhere(req) };
  if (q.month) where.month = q.month;
  if (q.year) where.year = q.year;
  if (q.currency) where.currency = q.currency;
  if (q.status && req.user) where.status = q.status;

  const reports = await prisma.report.findMany({
    where,
    select: LIST_SELECT,
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { flowName: 'asc' }],
  });
  res.json({ reports });
});

reportsRouter.get('/:id', async (req, res) => {
  const report = await findReportOr404(req, req.params.id, {
    include: req.user
      ? { files: { select: { slot: true, filename: true, mimeType: true, size: true, createdAt: true } }, createdBy: { select: { name: true } } }
      : undefined,
  });
  if (!req.user) {
    // Datos internos que no hacen falta en la vista pública
    delete report.notes;
    delete report.aiWarnings;
    delete report.createdById;
  }
  res.json({ report: toApi(report) });
});

// ---------- Escritura (admin) ----------

reportsRouter.post('/', requireAuth, async (req, res) => {
  const data = parseOr400(metaSchema, req.body);
  const report = await prisma.report.create({ data: { ...data, createdById: req.user.id } });
  res.status(201).json({ report });
});

reportsRouter.patch('/:id', requireAuth, async (req, res) => {
  const current = await findReportOr404(req, req.params.id);
  const { metrics, status, ...rest } = parseOr400(updateSchema, req.body);
  const data = { ...rest, ...(metrics ?? {}) };
  if (status) {
    data.status = status;
    if (status === 'PUBLISHED' && !current.publishedAt) data.publishedAt = new Date();
  }
  const report = await prisma.report.update({ where: { id: current.id }, data });
  res.json({ report });
});

reportsRouter.delete('/:id', requireAuth, async (req, res) => {
  const current = await findReportOr404(req, req.params.id);
  await prisma.report.delete({ where: { id: current.id } });
  res.json({ ok: true });
});

// ---------- Archivos (admin) ----------

function assertSlot(slot) {
  if (!SLOT_KEYS.includes(slot)) throw new HttpError(400, `Tipo de archivo desconocido: ${slot}`);
}

reportsRouter.put('/:id/files/:slot', requireAuth, upload.single('file'), async (req, res) => {
  assertSlot(req.params.slot);
  const report = await findReportOr404(req, req.params.id);
  const file = req.file;
  if (!file) throw new HttpError(400, 'No se recibió ningún archivo');

  // Algunos navegadores en Windows envían los CSV como application/octet-stream.
  const mimeType = /\.csv$/i.test(file.originalname) && !ACCEPTED_MIME.test(file.mimetype) ? 'text/csv' : file.mimetype;
  if (!ACCEPTED_MIME.test(mimeType)) throw new HttpError(400, 'Formato no permitido. Sube una imagen (PNG/JPG/WebP) o un CSV.');

  const data = { filename: file.originalname, mimeType, size: file.size, data: file.buffer };
  const saved = await prisma.reportFile.upsert({
    where: { reportId_slot: { reportId: report.id, slot: req.params.slot } },
    update: data,
    create: { ...data, reportId: report.id, slot: req.params.slot },
    select: { slot: true, filename: true, mimeType: true, size: true, createdAt: true },
  });
  res.json({ file: saved });
});

reportsRouter.get('/:id/files/:slot', requireAuth, async (req, res) => {
  assertSlot(req.params.slot);
  const file = await prisma.reportFile.findUnique({ where: { reportId_slot: { reportId: req.params.id, slot: req.params.slot } } });
  if (!file) throw notFound('Archivo');
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
  res.send(Buffer.from(file.data));
});

reportsRouter.delete('/:id/files/:slot', requireAuth, async (req, res) => {
  assertSlot(req.params.slot);
  await prisma.reportFile.deleteMany({ where: { reportId: req.params.id, slot: req.params.slot } });
  res.json({ ok: true });
});

// ---------- IA (admin) ----------

reportsRouter.post('/:id/analyze', requireAuth, async (req, res) => {
  const report = await findReportOr404(req, req.params.id);
  const files = await prisma.reportFile.findMany({ where: { reportId: report.id } });
  const result = await analyzeReport(report, files);

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      ...result.metrics,
      analysis: result.analysis,
      aiModel: result.model,
      promptVersion: result.promptVersion,
      aiWarnings: result.warnings,
      analyzedAt: new Date(),
    },
  });
  res.json({ report: updated, warnings: result.warnings });
});
