import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@bata-pos/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@bata-pos/api-clients': path.resolve(__dirname, '../../packages/api-clients/src'),
    },
  },
});
