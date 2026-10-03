import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { parseOr400 } from '../lib/http.js';
import { testGemini } from '../services/analysis.js';
import { requireAdmin } from '../services/auth.js';
import { importFromV1 } from '../services/legacyImport.js';
import { activatePromptVersion, createPromptVersion, listPromptVersions } from '../services/prompts.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/prompts', async (_req, res) => {
  res.json({ versions: await listPromptVersions(), variables: ['flowName', 'period', 'currency'], model: config.GEMINI_MODEL });
});

adminRouter.post('/prompts', async (req, res) => {
  const { content } = parseOr400(z.object({ content: z.string().trim().min(50).max(50_000) }), req.body);
  res.status(201).json({ version: await createPromptVersion(content) });
});

adminRouter.post('/prompts/:id/activate', async (req, res) => {
  res.json({ version: await activatePromptVersion(req.params.id) });
});

adminRouter.post('/import-v1', async (_req, res) => {
  res.json(await importFromV1());
});

adminRouter.post('/gemini-test', async (_req, res) => {
  res.json(await testGemini());
});
