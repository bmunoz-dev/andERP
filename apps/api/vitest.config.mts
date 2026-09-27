import swc from 'unplugin-swc';
import { defineProject } from 'vitest/config';

export default defineProject({
  // SWC emite la metadata de decoradores que necesita la inyección de dependencias de Nest.
  plugins: [swc.vite({ tsconfigFile: './tsconfig.json', module: { type: 'es6' } })],
  test: {
    name: 'api',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['./test/setup/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
