import { defineConfig, devices } from '@playwright/test';

/**
 * F07 CA-15: flujos de humo contra una instancia ya en marcha (`pnpm dev` en local, o producción
 * con una organización de prueba). No levanta servidores por su cuenta.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
