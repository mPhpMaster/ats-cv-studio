import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // The app shows its own version, taken from package.json so the two can never drift apart.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
