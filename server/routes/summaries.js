import { Router } from 'express';
import { z } from 'zod';
import { CURRENCIES } from '../lib/catalog.js';
import { prisma } from '../lib/db.js';
import { notFound, parseOr400 } from '../lib/http.js';
import { requireAuth } from '../services/auth.js';
import { buildMonthStats, generateSummary } from '../services/summary.js';

export const summariesRouter = Router();

const periodSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  currency: z.enum(CURRENCIES),
});

const LIST_SELECT = { id: true, year: true, month: true, currency: true, status: true, reportCount: true, generatedAt: true, publishedAt: true, updatedAt: true };
const visibleWhere = (req) => (req.user ? {} : { status: 'PUBLISHED' });

summariesRouter.get('/', async (req, res) => {
  const summaries = await prisma.monthlySummary.findMany({
    where: visibleWhere(req),
    select: LIST_SELECT,
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { currency: 'asc' }],
  });
  res.json({ summaries });
});

/** Vista previa de las cifras (sin IA) para saber cuántos reportes entrarían. */
summariesRouter.get('/preview', requireAuth, async (req, res) => {
  const { year, month, currency } = parseOr400(periodSchema, req.query);
  const stats = await buildMonthStats(year, month, currency);
  const existing = await prisma.monthlySummary.findUnique({ where: { year_month_currency: { year, month, currency } }, select: LIST_SELECT });
  res.json({ reportCount: stats.reportCount, flagged: stats.flagged.length, existing });
});

summariesRouter.post('/generate', requireAuth, async (req, res) => {
  const { year, month, currency } = parseOr400(periodSchema, req.body);
  res.json({ summary: await generateSummary(year, month, currency, { user: req.user }) });
});

summariesRouter.get('/:id', async (req, res) => {
  const summary = await prisma.monthlySummary.findFirst({
    where: { id: req.params.id, ...visibleWhere(req) },
    include: req.user ? { createdBy: { select: { name: true } } } : undefined,
  });
  if (!summary) throw notFound('Resumen');
  if (!req.user && summary.stats) {
    // Los flujos pendientes de verificación son información interna del equipo
    summary.stats = { ...summary.stats, flagged: [], flows: summary.stats.flows?.filter((f) => !f.flagged) };
  }
  res.json({ summary });
});

summariesRouter.patch('/:id', requireAuth, async (req, res) => {
  const { content, status } = parseOr400(
    z.object({ content: z.string().max(50_000).optional(), status: z.enum(['DRAFT', 'PUBLISHED']).optional() }),
    req.body,
  );
  const current = await prisma.monthlySummary.findUnique({ where: { id: req.params.id } });
  if (!current) throw notFound('Resumen');
  const data = {};
  if (content !== undefined) data.content = content;
  if (status) {
    data.status = status;
    if (status === 'PUBLISHED' && !current.publishedAt) data.publishedAt = new Date();
  }
  res.json({ summary: await prisma.monthlySummary.update({ where: { id: current.id }, data }) });
});

summariesRouter.delete('/:id', requireAuth, async (req, res) => {
  await prisma.monthlySummary.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
