import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config.js';
import { METRICS, MONTHS, UPLOAD_SLOTS } from '../lib/catalog.js';
import { HttpError } from '../lib/http.js';
import { countUniqueIds, describeCsvForAi } from './csv.js';
import { getActivePrompt, renderPrompt } from './prompts.js';

const ai = config.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: config.GEMINI_API_KEY }) : null;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    metrics: {
      type: Type.OBJECT,
      properties: Object.fromEntries(
        METRICS.map((m) => [m.key, { type: Type.NUMBER, nullable: true, description: `${m.label}: ${m.description}` }]),
      ),
      required: METRICS.map((m) => m.key),
    },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
    analysis: { type: Type.STRING },
  },
  required: ['metrics', 'warnings', 'analysis'],
  propertyOrdering: ['metrics', 'warnings', 'analysis'],
};

// Reglas fijas: no son editables desde el panel para que el formato de salida nunca se rompa.
function extractionRules(verifiedFacts) {
  return `
EXTRACCIÓN DE MÉTRICAS (obligatorio)
Del material adjunto, extrae estos valores numéricos tal como aparecen (sin símbolos de moneda ni separadores de miles, punto decimal):
${METRICS.map((m) => `- ${m.key}: ${m.label} — ${m.description}`).join('\n')}

Reglas:
- Si un valor no aparece claramente en los archivos, devuelve null. NO lo estimes ni lo calcules por tu cuenta.
- Si una captura muestra grupo objetivo (target) y grupo de control, usa el grupo objetivo; puedes comentar la diferencia vs. control en el análisis.
- En "warnings" lista en español, en frases cortas, cada dato faltante, ilegible o inconsistente.
- En "analysis" escribe el reporte completo en Markdown siguiendo el formato indicado arriba.
${verifiedFacts.length ? `\nDatos calculados por el sistema (exactos, úsalos tal cual):\n${verifiedFacts.map((f) => `- ${f}`).join('\n')}` : ''}`;
}

/** Construye las "parts" para Gemini a partir de los archivos del reporte. */
function buildFileParts(files) {
  const parts = [];
  const verifiedFacts = [];
  const computed = {};

  for (const slot of UPLOAD_SLOTS) {
    const file = files.find((f) => f.slot === slot.key);
    if (!file) {
      parts.push({ text: `\n### Archivo: ${slot.label}\n(no fue subido)` });
      continue;
    }
    if (file.mimeType.startsWith('image/')) {
      parts.push({ text: `\n### Archivo: ${slot.label} (captura de pantalla)` });
      parts.push({ inlineData: { mimeType: file.mimeType, data: Buffer.from(file.data).toString('base64') } });
    } else {
      const text = Buffer.from(file.data).toString('utf8');
      const described = describeCsvForAi(text);
      const note = described.mode === 'full' ? 'CSV completo' : `CSV grande (${described.rowCount} filas): resumen exacto + muestra`;
      parts.push({ text: `\n### Archivo: ${slot.label} (${note})\n${described.content}` });

      if (slot.key === 'depositor_ids') {
        const unique = countUniqueIds(text);
        if (unique) {
          computed.depositors = unique;
          verifiedFacts.push(`Clientes depositantes únicos en el CSV de IDs: ${unique}`);
        }
      }
    }
  }
  return { parts, verifiedFacts, computed };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return JSON.parse(fenced[1]);
    throw new Error('La respuesta de la IA no es JSON válido');
  }
}

function sanitizeMetrics(raw) {
  const out = {};
  for (const m of METRICS) {
    const v = raw?.[m.key];
    const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
    out[m.key] = typeof n === 'number' && Number.isFinite(n) ? (m.type === 'int' ? Math.round(n) : n) : null;
  }
  return out;
}

async function callGemini(contents, systemInstruction) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: config.GEMINI_MODEL,
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4,
        },
      });
      return parseJson(response.text ?? '');
    } catch (err) {
      lastError = err;
      console.error(`Gemini intento ${attempt} falló:`, err.message);
      // Errores de cuenta/permisos no se arreglan reintentando.
      if ([400, 401, 402, 403, 404].includes(err.status)) break;
    }
  }
  throw new HttpError(502, friendlyGeminiError(lastError));
}

function friendlyGeminiError(err) {
  switch (err?.status) {
    case 402: return 'Gemini: se agotaron los créditos prepagados de la API. Recarga en AI Studio (ai.studio/projects → Billing).';
    case 401:
    case 403: return 'Gemini: la API key no es válida o no tiene permisos.';
    case 404: return `Gemini: el modelo "${config.GEMINI_MODEL}" no existe o no está disponible para tu key.`;
    case 429: return 'Gemini: límite de uso alcanzado. Intenta de nuevo en unos minutos.';
    default: return `La IA no pudo generar el análisis: ${err?.message ?? 'error desconocido'}`;
  }
}

/** Llamada mínima para verificar que la key y el modelo funcionan. */
export async function testGemini() {
  if (!ai) return { ok: false, model: config.GEMINI_MODEL, message: 'Falta configurar GEMINI_API_KEY en el servidor' };
  try {
    const response = await ai.models.generateContent({ model: config.GEMINI_MODEL, contents: 'Responde solo: OK' });
    return { ok: true, model: config.GEMINI_MODEL, message: `Conexión correcta. Respuesta: ${(response.text ?? '').trim().slice(0, 50)}` };
  } catch (err) {
    console.error('Prueba de Gemini falló:', err.message);
    return { ok: false, model: config.GEMINI_MODEL, message: friendlyGeminiError(err) };
  }
}

/**
 * Ejecuta el análisis de un reporte con sus archivos.
 * Devuelve métricas (null = no disponible), avisos y el texto en Markdown.
 */
export async function analyzeReport(report, files) {
  if (!ai) throw new HttpError(503, 'Falta configurar GEMINI_API_KEY en el servidor');
  if (files.length === 0) throw new HttpError(400, 'Sube al menos un archivo antes de analizar');

  const prompt = await getActivePrompt();
  const instructions = renderPrompt(prompt.content, {
    flowName: report.flowName,
    period: `${MONTHS[report.month - 1]} ${report.year}`,
    currency: report.currency,
  });

  const { parts, verifiedFacts, computed } = buildFileParts(files);
  const result = await callGemini(
    [{ role: 'user', parts: [{ text: 'Archivos del flujo a analizar:' }, ...parts] }],
    instructions + '\n' + extractionRules(verifiedFacts),
  );

  const metrics = sanitizeMetrics(result.metrics);
  const warnings = Array.isArray(result.warnings) ? result.warnings.filter((w) => typeof w === 'string') : [];

  // Los datos calculados por el sistema mandan sobre lo que lea la IA.
  for (const [key, value] of Object.entries(computed)) {
    if (metrics[key] !== null && metrics[key] !== value) {
      warnings.push(`La IA leyó ${metrics[key]} en "${key}", pero el CSV tiene ${value}. Se usó el valor del CSV.`);
    }
    metrics[key] = value;
  }

  return {
    metrics,
    warnings,
    analysis: typeof result.analysis === 'string' ? result.analysis.trim() : '',
    model: config.GEMINI_MODEL,
    promptVersion: prompt.version,
  };
}
