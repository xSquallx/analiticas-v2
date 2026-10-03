import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './lib/db.js';
import { initAuth } from './services/auth.js';
import { seedPrompts } from './services/prompts.js';

await prisma.$connect();
await initAuth();
await seedPrompts();

const server = createApp().listen(config.PORT, () => {
  console.log(`🚀 Analíticas V2 escuchando en el puerto ${config.PORT} (modelo IA: ${config.GEMINI_MODEL})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => prisma.$disconnect().finally(() => process.exit(0)));
  });
}
