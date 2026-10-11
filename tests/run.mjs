// Runs every tests/*.test.mjs in its own process and reports one summary.
// Each suite is plain Node: no test framework, no watch mode, nothing to configure.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const suites = readdirSync(here)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => !only.length || only.some((o) => f.includes(o)))
  .sort();

if (!suites.length) {
  console.error(only.length ? `No suite matches ${only.join(', ')}` : 'No suites found.');
  process.exit(1);
}

let failed = 0;
const lines = [];
for (const suite of suites) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(here, suite)], { encoding: 'utf8' });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const summary = output.match(/^(\d+) passed, (\d+) failed$/m);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (run.status !== 0 || !summary) {
    failed++;
    process.stdout.write(output);
    lines.push(`  FAILED  ${suite} (${seconds}s)`);
  } else {
    lines.push(`  ok      ${suite} — ${summary[1]} checks (${seconds}s)`);
  }
}

console.log(`\n${lines.join('\n')}`);
console.log(failed ? `\n${failed} of ${suites.length} suites failed.` : `\nAll ${suites.length} suites passed.`);
process.exit(failed ? 1 : 0);
