import { config } from '../config.js';
import { CURRENCIES, MONTHS } from '../lib/catalog.js';
import { prisma } from '../lib/db.js';
import { HttpError } from '../lib/http.js';

const ZERO_FIELDS = ['avgDeposits', 'avgDepositAmount', 'avgActivityDays'];
const ZERO_FIELDS_SELECT = Object.fromEntries(ZERO_FIELDS.map((k) => [k, true]));

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Importa los reportes del sistema V1 leyendo su API pública (solo GET, nunca escribe en V1).
 * Es idempotente: usa el id original como legacyId, así que repetirlo solo agrega lo nuevo
 * * y nunca sobrescribe lo ya importado (solo completa ceros guardados como vacíos).
 */
export async function importFromV1() {
  if (!config.V1_API_URL) throw new HttpError(400, 'Define V1_API_URL para importar desde el sistema anterior');

  const url = `${config.V1_API_URL.replace(/\/$/, '')}/history`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new HttpError(502, `El sistema anterior respondió ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new HttpError(502, 'Respuesta inesperada del sistema anterior');

  let created = 0;
  let alreadyImported = 0;
  let zerosRestored = 0;
  const skipped = [];

  for (const row of rows) {
    const month = MONTHS.indexOf(row.month) + 1;
    const year = Number(row.year);
    if (!row.id || !month || !year || !CURRENCIES.includes(row.currency)) {
      skipped.push(row.flowName ?? row.id);
      continue;
    }
    const data = {
      flowName: String(row.flowName).trim(),
      month,
      year,
      currency: row.currency,
      // Un 0 es un dato válido (regla del equipo de CRM): se conserva como 0.
      avgDeposits: num(row.metrics?.avgDeposits),
      avgDepositAmount: num(row.metrics?.avgDepositAmount),
      avgNetRevenue: num(row.metrics?.netRevenue),
      avgActivityDays: num(row.metrics?.activityDays),
      analysis: row.analysis ?? '',
    };
    const savedAt = row.dateSaved ? new Date(row.dateSaved) : new Date();

    // Si ya existe no se sobrescribe (puede haber sido corregido en V2). Solo se completan
    // los ceros que una versión anterior de la importación guardó como "no disponible".
    const existing = await prisma.report.findUnique({ where: { legacyId: row.id }, select: { id: true, ...ZERO_FIELDS_SELECT } });
    if (existing) {
      alreadyImported++;
      const zeros = Object.fromEntries(ZERO_FIELDS.filter((k) => existing[k] === null && data[k] === 0).map((k) => [k, 0]));
      if (Object.keys(zeros).length) {
        await prisma.report.update({ where: { id: existing.id }, data: zeros });
        zerosRestored++;
      }
    } else {
      await prisma.report.create({
        data: { ...data, legacyId: row.id, source: 'V1', status: 'PUBLISHED', createdAt: savedAt, publishedAt: savedAt },
      });
      created++;
    }
  }

  return { total: rows.length, created, alreadyImported, zerosRestored, skipped };
}
