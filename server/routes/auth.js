import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { HttpError, parseOr400 } from '../lib/http.js';
import { clearSessionCookie, setSessionCookie, verifyCredentials } from '../services/auth.js';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados intentos. Espera unos minutos.' } });

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parseOr400(loginSchema, req.body);
  const user = await verifyCredentials(email, password);
  if (!user) throw new HttpError(401, 'Correo o contraseña incorrectos');
  setSessionCookie(req, res, user);
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ?? null });
});
