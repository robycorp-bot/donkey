import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  clearScreen: false,
  resolve: {
    alias: {
      // O Harness é fonte TypeScript no monorepo; sem build intermediário.
      '@donkey/harness': fileURLToPath(new URL('./packages/harness/src/index.ts', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 850 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    // Many jsdom workers start at once on Windows; the first App render can exceed 5 s under load.
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,svelte}'],
      // models.ts is types only; CodeEditor wraps Monaco and is covered by e2e/smoke.spec.ts.
      exclude: [
        'src/**/*.test.ts',
        'src/test/**',
        'src/main.ts',
        'src/vendor.d.ts',
        'src/domain/models.ts',
        'src/presentation/CodeEditor.svelte',
      ],
      reporter: ['text-summary', 'html'],
      thresholds: { lines: 85, functions: 85, branches: 75, statements: 85 },
    },
  },
});
