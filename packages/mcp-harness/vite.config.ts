import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** Empacota o servidor num único .mjs: o CLI roda `node dist/server.mjs`, sem instalar nada. */
export default defineConfig({
  resolve: {
    alias: {
      '@donkey/harness': fileURLToPath(new URL('../harness/src/index.ts', import.meta.url)),
    },
  },
  build: {
    target: 'node22',
    ssr: true,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/server.ts', import.meta.url)),
      output: { entryFileNames: 'server.mjs', format: 'esm' },
    },
  },
});
