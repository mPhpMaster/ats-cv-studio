// The offline speech model: what gets downloaded, where it is kept, and what the renderer is allowed to read.
// A LOCAL mock stands in for Hugging Face, so this suite downloads nothing from the internet.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { electron, reporter } from './helpers.mjs';

const { MODEL_ID, FILES, modelStatus, installModel, removeModel, resolveModelFile, modelsRoot } = electron('localStt.cjs');
const { ok, done, group } = reporter();

const served = [];
let mode = 'ok';
const server = http.createServer((req, res) => {
  served.push(req.url);
  if (mode === 'missing') { res.writeHead(404); return res.end('nope'); }
  if (mode === 'boom') { res.writeHead(500); return res.end('server on fire'); }
  res.writeHead(200, { 'content-type': 'application/octet-stream' });
  res.end(Buffer.from(`pretend contents of ${req.url}`));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const host = `http://127.0.0.1:${server.address().port}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-stt-'));

group('what it would download');
{
  ok('one model, named in full', MODEL_ID === 'onnx-community/whisper-tiny', MODEL_ID);
  ok('only the quantized weights, not the full-size ones',
    FILES.filter((f) => f.endsWith('.onnx')).every((f) => f.includes('quantized')), FILES.filter((f) => f.endsWith('.onnx')));
  ok('both halves of the model are listed', FILES.some((f) => f.includes('encoder')) && FILES.some((f) => f.includes('decoder')));
  ok('nothing is downloaded before it is asked for', modelStatus(dir).installed === false && served.length === 0);
}

group('downloading');
{
  const progress = [];
  const res = await installModel(dir, (p) => progress.push(p), { host });
  ok('it reports success', res.ok === true && res.installed === true, res);
  ok('every file is on disk', modelStatus(dir).missing === 0, modelStatus(dir));
  ok('progress is reported for each file', progress.length === FILES.length, progress.length);
  ok('progress counts up to the total', progress.at(-1).done === progress.at(-1).total, progress.at(-1));
  ok('only the listed files were fetched', served.length === FILES.length, served.length);
  ok('they came from the model repository path', served.every((u) => u.includes(`/${MODEL_ID}/resolve/main/`)), served[0]);
  ok('the folder layout matches what the renderer asks for',
    fs.existsSync(path.join(modelsRoot(dir), 'onnx-community', 'whisper-tiny', 'config.json')));
  ok('no .part leftovers', fs.readdirSync(path.join(modelsRoot(dir), 'onnx-community', 'whisper-tiny')).every((f) => !f.endsWith('.part')));

  const before = served.length;
  const again = await installModel(dir, () => {}, { host });
  ok('downloading again fetches nothing', again.ok && served.length === before, served.length - before);
}

group('when the download fails');
{
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-stt-'));
  mode = 'missing';
  const gone = await installModel(fresh, () => {}, { host });
  ok('a missing file is reported, not swallowed', gone.ok === false && gone.error === 'not-found', gone);
  mode = 'boom';
  const broken = await installModel(fresh, () => {}, { host });
  ok('a server error is reported', broken.ok === false && broken.error === 'http', broken);
  ok('nothing half-written is left behind',
    !fs.existsSync(path.join(modelsRoot(fresh), 'onnx-community')) || fs.readdirSync(path.join(modelsRoot(fresh), 'onnx-community', 'whisper-tiny')).length === 0);
  ok('an unreachable host is reported as a network failure',
    (await installModel(fresh, () => {}, { host: 'http://127.0.0.1:1' })).error === 'network');
  mode = 'ok';
  fs.rmSync(fresh, { recursive: true, force: true });
}

group('what the renderer may read through ats-model://');
{
  const inside = resolveModelFile(dir, 'ats-model://models/onnx-community/whisper-tiny/config.json');
  ok('a model file resolves', inside && inside.startsWith(modelsRoot(dir)) && inside.endsWith('config.json'), inside);
  ok('the host is the folder, not part of the path', !inside.includes(`models${path.sep}models`), inside);
  // The scheme serves one folder; a crafted URL must not reach the settings file or anything else on disk.
  for (const url of [
    'ats-model://models/..%2F..%2Fai-settings.json',
    'ats-model://models/%2E%2E%2F%2E%2E%2FWindows%2Fwin.ini',
    'ats-model://settings/ai-settings.json',
    'ats-model://models.evil.example/config.json',
  ]) ok(`refused: ${url}`, resolveModelFile(dir, url) === null, resolveModelFile(dir, url));
  // These normalise to somewhere inside the folder, which is harmless — but must never land outside it.
  for (const url of ['ats-model://models/../ai-settings.json', 'ats-model://models/a/../../b.json']) {
    const resolved = resolveModelFile(dir, url);
    ok(`stays inside the folder: ${url}`, resolved === null || resolved.startsWith(modelsRoot(dir)), resolved);
  }
  ok('nonsense is refused', resolveModelFile(dir, 'not a url') === null);
}

group('removing it');
{
  const after = await removeModel(dir);
  ok('the model is gone', after.installed === false && after.bytes === 0, after);
  ok('the folder is gone too', !fs.existsSync(path.join(modelsRoot(dir), 'onnx-community')));
}

fs.rmSync(dir, { recursive: true, force: true });
server.close();
done();
