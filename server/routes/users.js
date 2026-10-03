import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { HttpError, notFound, parseOr400 } from '../lib/http.js';
import { hashPassword, PUBLIC_USER, requireAdmin, ROLES } from '../services/auth.js';

// Gestión del equipo. Solo administradores.
export const usersRouter = Router();
usersRouter.use(requireAdmin);

const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200);

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password,
  role: z.enum(ROLES).default('EDITOR'),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(ROLES).optional(),
  password: password.optional(),
});

/** Evita quedarse sin ningún administrador. */
async function assertAnotherAdmin(excludingId) {
  const admins = await prisma.user.count({ where: { role: 'ADMIN', id: { not: excludingId } } });
  if (admins === 0) throw new HttpError(400, 'Debe quedar al menos un administrador');
}

usersRouter.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { ...PUBLIC_USER, _count: { select: { reports: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ users: users.map(({ _count, ...u }) => ({ ...u, reportCount: _count.reports })) });
});

usersRouter.post('/', async (req, res) => {
  const { password: plain, ...data } = parseOr400(createSchema, req.body);
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw new HttpError(409, 'Ya existe un usuario con ese correo');
  const user = await prisma.user.create({ data: { ...data, passwordHash: await hashPassword(plain) }, select: PUBLIC_USER });
  res.status(201).json({ user });
});

usersRouter.patch('/:id', async (req, res) => {
  const { password: plain, ...data } = parseOr400(updateSchema, req.body);
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) throw notFound('Usuario');
  if (data.role === 'EDITOR' && target.role === 'ADMIN') await assertAnotherAdmin(target.id);
  if (plain) data.passwordHash = await hashPassword(plain);
  const user = await prisma.user.update({ where: { id: target.id }, data, select: PUBLIC_USER });
  res.json({ user });
});

usersRouter.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.id) throw new HttpError(400, 'No puedes eliminar tu propio usuario');
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) throw notFound('Usuario');
  if (target.role === 'ADMIN') await assertAnotherAdmin(target.id);
  // Sus reportes se conservan (createdBy queda vacío).
  await prisma.user.delete({ where: { id: target.id } });
  res.json({ ok: true });
});
