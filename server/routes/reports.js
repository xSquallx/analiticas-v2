import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ACCEPTED_MIME, CURRENCIES, MAX_FILE_BYTES, METRICS, REPORT_STATUS, UPLOAD_SLOTS } from '../lib/catalog.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { familyKey, periodIndex, previousMatches } from '../lib/flowKey.js';
import { HttpError, notFound, parseOr400 } from '../lib/http.js';
import { computeOutliers, missingData } from '../lib/quality.js';
import { analyzeReport, classifyFiles } from '../services/analysis.js';
import { requireAuth } from '../services/auth.js';

export const reportsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
const uploadMany = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 12 } });

/** Algunos navegadores en Windows envían los CSV como application/octet-stream. */
function normalizeMime(file) {
  return /\.csv$/i.test(file.originalname) && !ACCEPTED_MIME.test(file.mimetype) ? 'text/csv' : file.mimetype;
}

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
  reviewerId: z.string().uuid().nullable().optional(),
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

// ---------- Control de calidad (equipo) ----------

/** Avisos de valores fuera del rango habitual de todos los reportes: { reportId: [avisos] }. */
reportsRouter.get('/quality', requireAuth, async (_req, res) => {
  const all = await prisma.report.findMany({ select: LIST_SELECT });
  res.json({ flags: Object.fromEntries(computeOutliers(all)) });
});

/** Revisión de un reporte: valores atípicos + archivos y métricas clave faltantes. */
reportsRouter.get('/:id/quality', requireAuth, async (req, res) => {
  const report = await findReportOr404(req, req.params.id);
  const [sameCurrency, files] = await Promise.all([
    prisma.report.findMany({ where: { currency: report.currency }, select: LIST_SELECT }),
    prisma.reportFile.findMany({ where: { reportId: report.id }, select: { slot: true } }),
  ]);
  const outliers = computeOutliers(sameCurrency).get(report.id) ?? [];
  const missing = missingData(report, files);
  res.json({ outliers, ...missing, ok: !outliers.length && !missing.missingFiles.length && !missing.missingMetrics.length });
});

reportsRouter.get('/:id', async (req, res) => {
  const report = await findReportOr404(req, req.params.id, {
    include: req.user
      ? {
          files: { select: { slot: true, filename: true, mimeType: true, size: true, createdAt: true } },
          createdBy: { select: { name: true } },
          reviewer: { select: { id: true, name: true } },
        }
      : undefined,
  });
  if (!req.user) {
    // Datos internos que no hacen falta en la vista pública
    delete report.notes;
    delete report.aiWarnings;
    delete report.createdById;
    delete report.reviewerId;
  }
  res.json({ report: toApi(report) });
});

/** Todos los reportes visibles de la misma familia de flujo (misma moneda), en orden cronológico. */
export async function findFlowHistory(report, where = {}) {
  const key = familyKey(report.flowName, report.currency);
  const sameCurrency = await prisma.report.findMany({ where: { ...where, currency: report.currency }, select: LIST_SELECT });
  return sameCurrency
    .filter((r) => familyKey(r.flowName, r.currency) === key)
    .sort((a, b) => periodIndex(a) - periodIndex(b) || a.flowName.localeCompare(b.flowName));
}

reportsRouter.get('/:id/history', async (req, res) => {
  const report = await findReportOr404(req, req.params.id);
  const items = await findFlowHistory(report, visibleWhere(req));
  const prev = previousMatches(items);
  res.json({ items: items.map((r) => ({ ...r, previousId: prev.get(r.id)?.id ?? null })) });
});

// ---------- Revisión y comentarios (equipo) ----------

/** Reportes en revisión: los asignados a mí, los sin revisor y los demás. */
reportsRouter.get('/review/inbox', requireAuth, async (req, res) => {
  const items = await prisma.report.findMany({
    where: { status: 'IN_REVIEW' },
    select: {
      id: true, flowName: true, month: true, year: true, currency: true, submittedAt: true, reviewerId: true,
      reviewer: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { comments: { where: { kind: 'COMMENT' } } } },
    },
    orderBy: { submittedAt: 'asc' },
  });
  const list = items.map(({ _count, ...r }) => ({ ...r, commentCount: _count.comments }));
  res.json({
    items: list,
    mine: list.filter((r) => r.reviewerId === req.user.id).length,
    unassigned: list.filter((r) => !r.reviewerId).length,
  });
});

/** Usuarios que pueden ser elegidos como revisores. */
reportsRouter.get('/review/reviewers', requireAuth, async (_req, res) => {
  res.json({ users: await prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }) });
});

reportsRouter.get('/:id/comments', requireAuth, async (req, res) => {
  const report = await findReportOr404(req, req.params.id);
  const comments = await prisma.reportComment.findMany({
    where: { reportId: report.id },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true } } },
  });
  res.json({
    comments: comments.map((c) => ({ id: c.id, kind: c.kind, body: c.body, createdAt: c.createdAt, userId: c.userId, author: c.user?.name ?? c.userLabel ?? 'Usuario eliminado' })),
  });
});

reportsRouter.post('/:id/comments', requireAuth, async (req, res) => {
  const report = await findReportOr404(req, req.params.id);
  const { body } = parseOr400(z.object({ body: z.string().trim().min(1, 'Escribe un comentario').max(5000) }), req.body);
  const c = await prisma.reportComment.create({ data: { reportId: report.id, userId: req.user.id, userLabel: req.user.name, body } });
  res.status(201).json({ comment: { id: c.id, kind: c.kind, body: c.body, createdAt: c.createdAt, userId: c.userId, author: req.user.name } });
});

reportsRouter.delete('/:id/comments/:commentId', requireAuth, async (req, res) => {
  const c = await prisma.reportComment.findFirst({ where: { id: req.params.commentId, reportId: req.params.id } });
  if (!c) throw notFound('Comentario');
  if (c.kind !== 'COMMENT') throw new HttpError(400, 'Los eventos del historial no se pueden borrar');
  if (c.userId !== req.user.id && req.user.role !== 'ADMIN') throw new HttpError(403, 'Solo puedes borrar tus propios comentarios');
  await prisma.reportComment.delete({ where: { id: c.id } });
  res.json({ ok: true });
});

// ---------- Escritura (equipo) ----------

/** Sube varios archivos y devuelve a qué casilla propone la IA asignar cada uno (no guarda nada). */
reportsRouter.post('/classify', requireAuth, uploadMany.array('files', 12), async (req, res) => {
  const files = (req.files ?? []).map((f) => ({ name: f.originalname, mimeType: normalizeMime(f), buffer: f.buffer }));
  if (files.length === 0) throw new HttpError(400, 'No se recibió ningún archivo');
  const bad = files.find((f) => !ACCEPTED_MIME.test(f.mimeType));
  if (bad) throw new HttpError(400, `"${bad.name}" no es una imagen ni un CSV`);
  res.json({ suggestions: await classifyFiles(files, { user: req.user }) });
});

reportsRouter.post('/', requireAuth, async (req, res) => {
  const data = parseOr400(metaSchema, req.body);
  const report = await prisma.report.create({ data: { ...data, createdById: req.user.id } });
  res.status(201).json({ report });
});

/** Texto del evento que queda en los comentarios al cambiar de estado. */
function statusEvent(from, to, who, reviewerName) {
  if (to === 'IN_REVIEW') return `${who} envió el reporte a revisión${reviewerName ? ` (revisa: ${reviewerName})` : ''}`;
  if (to === 'PUBLISHED') return `${who} publicó el reporte`;
  if (to === 'DRAFT' && from === 'PUBLISHED') return `${who} despublicó el reporte (pasó a borrador)`;
  if (to === 'DRAFT') return `${who} devolvió el reporte a borrador`;
  return null;
}

reportsRouter.patch('/:id', requireAuth, async (req, res) => {
  const current = await findReportOr404(req, req.params.id);
  const { metrics, status, reviewerId, ...rest } = parseOr400(updateSchema, req.body);
  const data = { ...rest, ...(metrics ?? {}) };

  let reviewer = null;
  if (reviewerId !== undefined) {
    if (reviewerId) {
      reviewer = await prisma.user.findUnique({ where: { id: reviewerId }, select: { id: true, name: true } });
      if (!reviewer) throw new HttpError(400, 'El revisor elegido no existe');
    }
    data.reviewerId = reviewerId;
  }

  const statusChanged = status && status !== current.status;
  if (statusChanged) {
    data.status = status;
    if (status === 'IN_REVIEW') data.submittedAt = new Date();
    if (status === 'PUBLISHED' && !current.publishedAt) data.publishedAt = new Date();
  }

  const report = await prisma.$transaction(async (tx) => {
    const updated = await tx.report.update({ where: { id: current.id }, data });
    if (statusChanged) {
      const body = statusEvent(current.status, status, req.user.name, reviewer?.name);
      if (body) await tx.reportComment.create({ data: { reportId: current.id, userId: req.user.id, userLabel: req.user.name, kind: 'EVENT', body } });
    }
    return updated;
  });
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

  const mimeType = normalizeMime(file);
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
  // Meses anteriores del mismo flujo (publicados) para que la IA compare la evolución
  const history = (await findFlowHistory(report, { status: 'PUBLISHED' })).filter((r) => periodIndex(r) < periodIndex(report));
  const result = await analyzeReport(report, files, history, { user: req.user });

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      ...result.metrics,
      analysis: result.analysis,
      aiModel: result.model,
      promptVersion: result.promptVersion,
      aiWarnings: result.warnings,
      idInsights: result.idInsights ?? Prisma.DbNull,
      analyzedAt: new Date(),
    },
  });
  res.json({ report: updated, warnings: result.warnings });
});
