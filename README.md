# Analíticas CRM · V2

Sistema para analizar flujos/campañas de **Optimove** con **Gemini**. Se suben capturas de pantalla y CSV de cada flujo, la IA extrae las métricas y redacta el reporte, el admin lo revisa y lo publica. Los jefes ven todo en un solo enlace, sin iniciar sesión.

## Cómo funciona

| Quién | Qué puede hacer |
|---|---|
| **Visitante** (enlace público) | Ver dashboard, lista de reportes publicados y cada reporte. Copiar enlace / exportar a PDF. |
| **Analista** (botón *Iniciar sesión*) | Crear análisis, subir archivos, ejecutar la IA, corregir métricas y texto, publicar/despublicar, eliminar. Cambiar su contraseña. |
| **Administrador** | Todo lo anterior + crear/editar/eliminar usuarios (Ajustes → Usuarios del equipo), editar el prompt e importar historial de V1. |

Los usuarios se crean desde **Ajustes**. Si un administrador cambia la contraseña de alguien (o la persona la cambia), se cierran sus sesiones abiertas.

Flujo de un análisis: **Nuevo análisis → datos del flujo → subir archivos (8 casillas) → Analizar con IA → revisar métricas y avisos → Guardar y publicar.**

### Reglas de datos
- Una métrica vacía significa **dato no disponible**. La IA tiene prohibido estimar; si no ve un dato, devuelve `null` y deja un aviso.
- Los CSV se procesan en el servidor: los pequeños se envían completos y los grandes como **estadísticas exactas** (suma, promedio, mín/máx, negativos, top/bottom) + muestra. El número de depositantes se **cuenta** del CSV de IDs, no lo lee la IA.
- Los archivos originales se guardan con el reporte, así se puede volver a analizar.
- El prompt es editable y versionado (Ajustes). Las reglas de extracción y el formato JSON los añade el código, por lo que editar el prompt no rompe nada.

## Estructura

```
server/            API (Express 5 + Prisma + Postgres)
  index.js         arranque (conexión, admin inicial, prompt por defecto)
  app.js           middlewares, rutas, frontend estático
  config.js        variables de entorno validadas
  lib/catalog.js   monedas, meses, métricas y casillas de archivos (fuente única)
  routes/          auth, reports, users, admin
  services/        analysis (Gemini), csv, prompts, auth, legacyImport
  prompts/         prompt por defecto (v1)
prisma/            schema + migraciones
client/            React 19 + Vite + Tailwind 4 + React Router
  src/pages/       Dashboard, Reports, ReportDetail, Login, admin/ReportEditor, admin/Settings, admin/Team
Dockerfile         imagen única (API + frontend) para Easypanel
```

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a Postgres |
| `GEMINI_API_KEY` | Sí (para analizar) | API key de Google AI Studio |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Sí (primer arranque) | Primer administrador. Solo se usa para crearlo; después la contraseña se cambia desde la app. |
| `ADMIN_FORCE_PASSWORD_RESET` | No | `true` para restablecer la contraseña del admin a `ADMIN_PASSWORD` al reiniciar (si se olvidó). Quítalo después. |
| `ADMIN_NAME` | No | Nombre visible del admin |
| `GEMINI_MODEL` | No | Por defecto `gemini-3.5-flash` |
| `V1_API_URL` | No | API del sistema anterior para importar (`https://backend-analiticas.166.1.85.144.nip.io/api`) |
| `SESSION_SECRET` | No | Si no se define se genera y guarda en la BD |

## Desarrollo local

```bash
npm install
npm --prefix client install
cp .env.example .env    # y completa los valores
npx prisma migrate deploy
npm run dev             # API en :3000
npm run dev:client      # frontend en :5173 (proxy a la API)
```

Para cambiar el esquema de la BD: edita `prisma/schema.prisma` y ejecuta `npm run db:migrate -- --name descripcion`.

## Despliegue (Easypanel)

Servicio tipo **App** con fuente GitHub (`main`) y build **Dockerfile**. Al arrancar aplica las migraciones pendientes (`prisma migrate deploy`). Puerto interno: `3000`. Cada push a `main` + *Implementar* (o auto-deploy) publica la nueva versión.
