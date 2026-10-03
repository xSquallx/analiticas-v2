import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../lib/db.js';
import { HttpError } from '../lib/http.js';

export const SESSION_COOKIE = 'analiticas_session';
export const ROLES = ['ADMIN', 'EDITOR'];
export const PUBLIC_USER = { id: true, email: true, name: true, role: true, createdAt: true };
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 días

const DUMMY_HASH = bcrypt.hashSync('no-user', 12);

let sessionSecret;

/** Usa SESSION_SECRET si existe; si no, genera uno una sola vez y lo guarda en la BD. */
async function loadSessionSecret() {
  if (config.SESSION_SECRET) return config.SESSION_SECRET;
  const existing = await prisma.setting.findUnique({ where: { key: 'session_secret' } });
  if (existing) return existing.value;
  const value = crypto.randomBytes(48).toString('hex');
  await prisma.setting.upsert({ where: { key: 'session_secret' }, update: {}, create: { key: 'session_secret', value } });
  return (await prisma.setting.findUnique({ where: { key: 'session_secret' } })).value;
}

/**
 * Crea el admin inicial definido en ADMIN_EMAIL / ADMIN_PASSWORD si no existe.
 * Si ya existe no toca su contraseña (puede haberla cambiado desde la app),
 * salvo que ADMIN_FORCE_PASSWORD_RESET=true (útil si se olvidó).
 */
async function ensureAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = config;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    if ((await prisma.user.count()) === 0) {
      console.warn('⚠️  No hay administradores. Define ADMIN_EMAIL y ADMIN_PASSWORD para poder iniciar sesión.');
    }
    return;
  }
  const email = ADMIN_EMAIL.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await prisma.user.create({ data: { email, name: ADMIN_NAME, role: 'ADMIN', passwordHash: await hashPassword(ADMIN_PASSWORD) } });
    console.log(`👤 Administrador creado: ${email}`);
    return;
  }
  const data = {};
  if (user.role !== 'ADMIN') data.role = 'ADMIN';
  if (config.ADMIN_FORCE_PASSWORD_RESET && !(await bcrypt.compare(ADMIN_PASSWORD, user.passwordHash))) {
    data.passwordHash = await hashPassword(ADMIN_PASSWORD);
    console.log(`🔑 Contraseña de ${email} restablecida desde ADMIN_PASSWORD`);
  }
  if (Object.keys(data).length) await prisma.user.update({ where: { id: user.id }, data });
}

export const hashPassword = (password) => bcrypt.hash(password, 12);

export const checkPassword = (password, hash) => bcrypt.compare(password, hash);

export async function initAuth() {
  sessionSecret = await loadSessionSecret();
  await ensureAdmin();
}

export async function verifyCredentials(email, password) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Comparamos siempre para no revelar por tiempo de respuesta si el correo existe.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  return ok && user ? user : null;
}

export function setSessionCookie(req, res, user) {
  const token = jwt.sign({ sub: user.id, pv: passwordFingerprint(user.passwordHash) }, sessionSecret, { expiresIn: SESSION_TTL_SECONDS });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

/** Cambia si cambia la contraseña, invalidando las sesiones abiertas con la anterior. */
const passwordFingerprint = (hash) => crypto.createHash('sha256').update(hash).digest('hex').slice(0, 16);

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Middleware: carga req.user si hay sesión válida. Nunca bloquea. */
export async function loadUser(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    try {
      const { sub, pv } = jwt.verify(token, sessionSecret);
      const user = await prisma.user.findUnique({ where: { id: sub }, select: { ...PUBLIC_USER, passwordHash: true } });
      if (user && passwordFingerprint(user.passwordHash) === pv) {
        const { passwordHash: _omit, ...publicUser } = user;
        req.user = publicUser;
      }
    } catch {
      // token inválido o vencido: se trata como visitante
    }
  }
  next();
}

/** Middleware: exige cualquier usuario con sesión (administrador o analista). */
export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Debes iniciar sesión'));
  next();
}

/** Middleware: exige rol de administrador. */
export function requireAdmin(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Debes iniciar sesión'));
  if (req.user.role !== 'ADMIN') return next(new HttpError(403, 'Solo un administrador puede hacer esto'));
  next();
}
