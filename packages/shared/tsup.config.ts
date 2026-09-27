import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // tsup usa `baseUrl` internamente al generar los .d.ts; TypeScript 6 lo marca como obsoleto.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  // En watch no se limpia dist: la API y la web lo están leyendo mientras arrancan.
  clean: !options.watch,
  sourcemap: true,
  target: 'es2023',
}));
