import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { apiMiddleware } from './server/api.mjs';

/** Gắn API trung gian (/api/hts, /api/schedules) vào dev server – giống máy chủ `npm start` */
const portrankApi = (env: Record<string, string | undefined>): Plugin => ({
  name: 'portrank-api',
  configureServer(server) {
    server.middlewares.use(apiMiddleware(env));
  },
  configurePreviewServer(server) {
    server.middlewares.use(apiMiddleware(env));
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), portrankApi({ ...loadEnv(mode, process.cwd(), ''), ...process.env })],
  server: { host: true, port: 5173 },
  build: { chunkSizeWarningLimit: 4000 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any));
