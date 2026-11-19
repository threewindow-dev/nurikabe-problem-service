import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts'
  },
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@storage': fileURLToPath(new URL('../../packages/storage/src/index.ts', import.meta.url))
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0'
  }
});
