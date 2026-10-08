import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'functions/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // jsdom es lento cuando corre junto a las pruebas de la API (suite completa).
    testTimeout: 20_000,
  },
});
