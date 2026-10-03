import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { HttpError, parseOr400 } from '../lib/http.js';
import { prisma } from '../lib/db.js';
import { checkPassword, clearSessionCookie, hashPassword, requireAuth, setSessionCookie, verifyCredentials } from '../services/auth.js';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados intentos. Espera unos minutos.' } });

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parseOr400(loginSchema, req.body);
  const user = await verifyCredentials(email, password);
  if (!user) throw new HttpError(401, 'Correo o contraseña incorrectos');
  setSessionCookie(req, res, user);
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ?? null });
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres').max(200),
});

/** Cambio de contraseña propio. Cierra las demás sesiones y renueva la actual. */
authRouter.post('/password', requireAuth, loginLimiter, async (req, res) => {
  const { currentPassword, newPassword } = parseOr400(passwordSchema, req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await checkPassword(currentPassword, user.passwordHash))) throw new HttpError(400, 'La contraseña actual no es correcta');
  const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  setSessionCookie(req, res, updated);
  res.json({ ok: true });
});
