import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // En desarrollo, el backend corre en :3000 (npm run dev en la raíz)
    proxy: { '/api': 'http://localhost:3000' },
  },
});
