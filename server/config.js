import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatorio'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
  // Admin inicial. Si cambias la contraseña aquí y reinicias, se actualiza.
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_NAME: z.string().default('Administrador'),
  // Opcional: si no se define, se genera uno y se guarda en la base de datos.
  SESSION_SECRET: z.string().min(32).optional(),
  // API pública del sistema anterior, solo lectura (GET /api/history).
  V1_API_URL: z.string().url().optional(),
});

// Una variable vacía (p. ej. "GEMINI_API_KEY=") cuenta como no definida.
const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ''));
const parsed = schema.safeParse(env);
if (!parsed.success) {
  console.error('Configuración inválida:\n' + parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === 'production';
