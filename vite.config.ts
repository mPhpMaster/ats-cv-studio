import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths so the build also loads from file:// inside the Electron app.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      // dictionary-en only exports its Node entry; point straight at the raw Hunspell files.
      'dictionary-en-data': fileURLToPath(new URL('./node_modules/dictionary-en', import.meta.url)),
    },
  },
  server: { port: 5173 },
});
