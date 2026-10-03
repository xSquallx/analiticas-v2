import { prisma } from '../lib/db.js';
import { DEFAULT_FLOW_PROMPT } from '../prompts/flowAnalysis.js';

export const FLOW_PROMPT_KEY = 'flow_analysis';

/** Crea la versión 1 del prompt si la tabla está vacía. */
export async function seedPrompts() {
  const count = await prisma.promptVersion.count({ where: { key: FLOW_PROMPT_KEY } });
  if (count === 0) {
    await prisma.promptVersion.create({
      data: { key: FLOW_PROMPT_KEY, version: 1, content: DEFAULT_FLOW_PROMPT, isActive: true },
    });
  }
}

export async function getActivePrompt(key = FLOW_PROMPT_KEY) {
  const active = await prisma.promptVersion.findFirst({ where: { key, isActive: true } });
  return active ?? { version: 0, content: DEFAULT_FLOW_PROMPT };
}

export function listPromptVersions(key = FLOW_PROMPT_KEY) {
  return prisma.promptVersion.findMany({ where: { key }, orderBy: { version: 'desc' } });
}

/** Guarda una nueva versión y la deja activa (las anteriores quedan como historial). */
export async function createPromptVersion(content, key = FLOW_PROMPT_KEY) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.promptVersion.findFirst({ where: { key }, orderBy: { version: 'desc' } });
    await tx.promptVersion.updateMany({ where: { key }, data: { isActive: false } });
    return tx.promptVersion.create({ data: { key, version: (last?.version ?? 0) + 1, content, isActive: true } });
  });
}

export async function activatePromptVersion(id) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.promptVersion.findUniqueOrThrow({ where: { id } });
    await tx.promptVersion.updateMany({ where: { key: target.key }, data: { isActive: false } });
    return tx.promptVersion.update({ where: { id }, data: { isActive: true } });
  });
}

export function renderPrompt(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}
