# Analíticas CRM · V2

Sistema para analizar flujos/campañas de **Optimove** con **Gemini**. Se suben capturas de pantalla y CSV de cada flujo, la IA extrae las métricas y redacta el reporte, el admin lo revisa y lo publica. Los jefes ven todo en un solo enlace, sin iniciar sesión.

## Cómo funciona

| Quién | Qué puede hacer |
|---|---|
| **Visitante** (enlace público) | Ver dashboard, lista de reportes publicados y cada reporte. Copiar enlace / exportar a PDF. |
| **Analista** (botón *Iniciar sesión*) | Crear análisis, subir archivos, ejecutar la IA, corregir métricas y texto, publicar/despublicar, eliminar. Cambiar su contraseña. |
| **Administrador** | Todo lo anterior + crear/editar/eliminar usuarios (Ajustes → Usuarios del equipo), editar el prompt, importar historial de V1 y ver **Consumo IA** (análisis, tokens y costo estimado por mes y por persona). |

Los usuarios se crean desde **Ajustes**. Si un administrador cambia la contraseña de alguien (o la persona la cambia), se cierran sus sesiones abiertas.

Flujo de un análisis: **Nuevo análisis (o "Duplicar" de un mes anterior) → subir archivos → Analizar con IA → revisar métricas y avisos → Enviar a revisión → Aprobar y publicar.**

- **Subir archivos:** casilla por casilla, pegando capturas con **Ctrl+V** (van a la casilla seleccionada o a la primera vacía) o **todo de una vez**: la IA propone la casilla de cada archivo y el usuario confirma.
- **Estados:** Borrador → En revisión (con revisor opcional) → Publicado. La pestaña **Revisión** muestra lo pendiente y un contador.
- **Comentarios internos** por reporte, con el historial de cambios de estado. Solo los ve el equipo.
- **Control de calidad** (solo equipo): marca "Verificar" en valores fuera del rango habitual (comparando con el historial del mismo flujo o, si no tiene, con los flujos del mes) y avisa de archivos/métricas clave faltantes antes de publicar. Reglas en `server/lib/quality.js`.
- **Resúmenes mensuales**: por mes y moneda, con cifras calculadas por el sistema y redacción de la IA (solo descriptiva, sin recomendaciones). Los flujos a verificar no entran en el ranking.

### Reglas de datos
- **Mercado ≠ moneda:** VES/USD, CLP, PEN y MXN indican el mercado; en Optimove todos los montos están en **USD**.
- **Fecha en el nombre del flujo** = fecha de última modificación. El flujo se identifica por su nombre sin fechas; dos reportes del mismo flujo en el mismo mes se marcan como posible duplicado.
- **Vertical** según el nombre: CASINO o DEPORTE; si no dice ninguna, abarca ambas.
- **Valores en 0** son datos válidos. **Números abreviados** (21.69K) se completan a enteros.
- **Depositantes (Optimove)** y **Depositantes únicos (CSV)** se guardan por separado; es normal que difieran.
- **IDs destacados:** con los CSV se calcula en qué KPI tiene protagonismo cada ID (top 10 / 10 más bajos) y su línea temporal (si hay fechas) o atemporal.
- Una métrica vacía significa **dato no disponible**. La IA tiene prohibido estimar; si no ve un dato, devuelve `null` y deja un aviso.
- Los CSV se procesan en el servidor: los pequeños se envían completos y los grandes como **estadísticas exactas** (suma, promedio, mín/máx, negativos, top/bottom) + muestra. Los depositantes únicos se **cuentan** del CSV de IDs (no los lee la IA).
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
  services/        analysis (Gemini), summary (resumen mensual), usage (consumo/costo), csv, prompts, auth, legacyImport
  lib/quality.js   control de calidad (valores atípicos, datos faltantes)
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
| `GEMINI_PRICE_INPUT_PER_M` / `GEMINI_PRICE_OUTPUT_PER_M` | No | Precio USD por 1M tokens para el costo estimado, si el modelo no está en `server/services/usage.js` |
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
