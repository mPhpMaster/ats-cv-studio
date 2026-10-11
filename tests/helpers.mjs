// Shared bits for the suites: a tiny reporter, the Electron main-process modules, and the app's own
// TypeScript loaded through Vite (the same transform the app is built with, so no second toolchain).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Counts checks and ends the process with a non-zero code if any failed. */
export function reporter() {
  let pass = 0;
  const fails = [];
  const ok = (name, condition, extra = '') => {
    if (condition) {
      pass++;
      console.log(`  PASS  ${name}`);
    } else {
      fails.push(name);
      console.log(`  FAIL  ${name}  ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`);
    }
  };
  const done = () => {
    console.log(`\n${pass} passed, ${fails.length} failed`);
    if (fails.length) {
      console.log(fails.map((f) => ` - ${f}`).join('\n'));
      process.exit(1);
    }
  };
  return { ok, done, group: (title) => console.log(`\n${title}`) };
}

/** The main-process modules, which are plain CommonJS and need no transform. */
export const electron = (file) => createRequire(path.join(ROOT, 'electron/'))(path.join(ROOT, 'electron', file));

/** Loads the app's own modules (TypeScript) exactly as the build would. Remember to call close(). */
export async function loadApp(paths) {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: ROOT,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });
  const loaded = {};
  for (const p of paths) Object.assign(loaded, await server.ssrLoadModule(p));
  return { ...loaded, close: () => server.close() };
}
