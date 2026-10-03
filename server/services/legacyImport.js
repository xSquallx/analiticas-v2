import { config } from '../config.js';
import { CURRENCIES, MONTHS } from '../lib/catalog.js';
import { prisma } from '../lib/db.js';
import { HttpError } from '../lib/http.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Importa los reportes del sistema V1 leyendo su API pública (solo GET, nunca escribe en V1).
 * Es idempotente: usa el id original como legacyId, así que repetirlo solo agrega lo nuevo
 * y nunca sobrescribe lo ya importado.
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
      // V1 guardaba 0 cuando no encontraba el dato; lo tratamos como "no disponible".
      avgDeposits: num(row.metrics?.avgDeposits) || null,
      avgDepositAmount: num(row.metrics?.avgDepositAmount) || null,
      avgNetRevenue: num(row.metrics?.netRevenue),
      avgActivityDays: num(row.metrics?.activityDays) || null,
      analysis: row.analysis ?? '',
    };
    const savedAt = row.dateSaved ? new Date(row.dateSaved) : new Date();

    // Si ya existe no se toca: puede haber sido corregido en V2.
    const existing = await prisma.report.findUnique({ where: { legacyId: row.id }, select: { id: true } });
    if (existing) {
      alreadyImported++;
    } else {
      await prisma.report.create({
        data: { ...data, legacyId: row.id, source: 'V1', status: 'PUBLISHED', createdAt: savedAt, publishedAt: savedAt },
      });
      created++;
    }
  }

  return { total: rows.length, created, alreadyImported, skipped };
}
