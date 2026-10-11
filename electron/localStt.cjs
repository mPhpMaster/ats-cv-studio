// Speech to text that runs on this computer: no API key, no provider, and nothing leaves the machine.
//
// The model is NOT shipped with the app — it would add tens of megabytes to every download, for a feature most
// people never turn on. It is fetched once, on request, into the app's own data folder, and from then on the
// transcription itself is entirely offline. Only these exact files are ever fetched.
'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

/** Whisper tiny, quantized: the smallest model that transcribes usefully, and the only one downloaded. */
const MODEL_ID = 'onnx-community/whisper-tiny';
const HOST = 'https://huggingface.co';
const FILES = [
  'added_tokens.json', 'config.json', 'generation_config.json', 'merges.txt', 'normalizer.json',
  'preprocessor_config.json', 'quantize_config.json', 'special_tokens_map.json', 'tokenizer.json',
  'tokenizer_config.json', 'vocab.json',
  'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
];

const modelsRoot = (userData) => path.join(userData, 'models');
const modelDir = (userData) => path.join(modelsRoot(userData), ...MODEL_ID.split('/'));
const filePath = (userData, file) => path.join(modelDir(userData), ...file.split('/'));

/** What is on disk right now: every file present, and how much space it takes. */
function modelStatus(userData) {
  let bytes = 0;
  const missing = [];
  for (const file of FILES) {
    try {
      bytes += fs.statSync(filePath(userData, file)).size;
    } catch {
      missing.push(file);
    }
  }
  return { modelId: MODEL_ID, installed: missing.length === 0, missing: missing.length, files: FILES.length, bytes };
}

/**
 * Downloads whatever is missing. Reports progress as whole files finished plus bytes, so a slow connection
 * still shows movement. A half-written file is never left behind: each one lands under a .part name first.
 */
async function installModel(userData, onProgress = () => {}, options = {}) {
  const doFetch = options.fetchImpl || globalThis.fetch;
  const host = options.host || HOST;
  const pending = FILES.filter((file) => !fs.existsSync(filePath(userData, file)));
  if (!pending.length) return { ok: true, ...modelStatus(userData) };

  let done = 0;
  let bytes = 0;
  for (const file of pending) {
    const target = filePath(userData, file);
    const part = `${target}.part`;
    await fsp.mkdir(path.dirname(target), { recursive: true });
    let res;
    try {
      res = await doFetch(`${host}/${MODEL_ID}/resolve/main/${file}`, { redirect: 'follow' });
    } catch (e) {
      return { ok: false, error: 'network', message: String((e && e.message) || e) };
    }
    if (!res.ok) return { ok: false, error: res.status === 404 ? 'not-found' : 'http', message: `${res.status} ${file}` };
    try {
      const buffer = Buffer.from(await res.arrayBuffer());
      await fsp.writeFile(part, buffer);
      await fsp.rename(part, target);
      bytes += buffer.length;
    } catch (e) {
      await fsp.rm(part, { force: true }).catch(() => {});
      return { ok: false, error: 'write', message: String((e && e.message) || e) };
    }
    done++;
    try { onProgress({ done, total: pending.length, bytes, file }); } catch { /* renderer gone */ }
  }
  return { ok: true, ...modelStatus(userData) };
}

/** Removes the downloaded model. The feature keeps working the moment it is downloaded again. */
async function removeModel(userData) {
  await fsp.rm(modelDir(userData), { recursive: true, force: true });
  // Leave no empty shell behind: the publisher folder goes too once its last model is removed.
  await fsp.rmdir(path.dirname(modelDir(userData))).catch(() => {});
  return modelStatus(userData);
}

/**
 * Serves a downloaded file to the renderer through the app's own ats-model:// scheme. Anything that resolves
 * outside the models folder is refused, so a crafted URL cannot read the rest of the disk.
 */
function resolveModelFile(userData, requestUrl) {
  let url;
  try { url = new URL(requestUrl); } catch { return null; }
  // The host names the one folder this scheme serves; it is not part of the path (ats-model://models/<file>).
  if (url.hostname !== 'models') return null;
  const root = modelsRoot(userData);
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

module.exports = { MODEL_ID, FILES, modelStatus, installModel, removeModel, resolveModelFile, modelDir, modelsRoot };
