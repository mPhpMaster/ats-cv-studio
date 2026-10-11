// Voice answers: the separate voice provider, and the speech-to-text call it produces.
// Local mock only — no real provider, no real key, no real audio, and a throwaway settings directory.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { electron, reporter } from './helpers.mjs';

const { transcribeAudio, readSettings, writeSettings, publicSettings, voiceConfig } = electron('aiClient.cjs');
const { ok, done, group } = reporter();

const seen = [];
let mode = 'ok';
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    seen.push({ url: req.url, headers: req.headers, body });
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (mode === 'auth') return send(401, { error: { message: 'bad key' } });
    if (mode === 'missing') return send(404, { error: { message: 'no such endpoint' } });
    if (req.url.includes(':generateContent')) return send(200, { candidates: [{ content: { parts: [{ text: 'GOOGLE HEARD THIS' }] } }] });
    return send(200, { text: 'OPENAI HEARD THIS' });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const audio = Buffer.from('not really audio').toString('base64');
const last = () => seen[seen.length - 1];
const requested = [];
const via = (url, init) => { requested.push(url); return fetch(url.replace(/^https:\/\/[^/]+/, base), init); };
const aimed = () => requested[requested.length - 1];
const tx = (opts) => transcribeAudio({ audio, ...opts }, via);

group('providers that offer speech to text');
{
  const o = await tx({ provider: 'openai', apiKey: 'sk-test-abcdef123456', mimeType: 'audio/webm', language: 'en' });
  ok('openai returns the transcription', o.ok && o.text === 'OPENAI HEARD THIS', o);
  ok('it is a multipart upload to the transcriptions endpoint',
    last().url === '/v1/audio/transcriptions' && /multipart\/form-data/.test(String(last().headers['content-type'])));
  ok('it names a transcription model, not the chat model', /whisper-1/.test(last().body), last().body.slice(0, 120));
  ok('it authenticates with a bearer token', last().headers.authorization === 'Bearer sk-test-abcdef123456');

  const g = await tx({ provider: 'google', apiKey: 'k-abcdef123456', mimeType: 'audio/webm' });
  ok('google returns the transcription', g.ok && g.text === 'GOOGLE HEARD THIS', g);
  ok('google sends the audio inline and the key in a header',
    /inline_data/.test(last().body) && last().headers['x-goog-api-key'] === 'k-abcdef123456' && !last().url.includes('k-abcdef123456'));

  const c = await tx({ provider: 'custom', baseUrl: base, mimeType: 'audio/webm' });
  ok('a custom endpoint works with no key', c.ok && c.text === 'OPENAI HEARD THIS', c);
}

group('providers that do not — refused before any upload');
{
  const before = seen.length;
  ok('anthropic is refused as unsupported', (await tx({ provider: 'anthropic', apiKey: 'k' })).error === 'no-transcription');
  ok('deepseek is refused as unsupported', (await tx({ provider: 'deepseek', apiKey: 'k' })).error === 'no-transcription');
  ok('nothing was uploaded for them', seen.length === before, seen.length - before);
}

group('where the recording may be sent');
{
  await tx({ provider: 'openai', apiKey: 'sk-test-abcdef123456', baseUrl: 'https://collector.example' });
  ok('a planted baseUrl cannot redirect a hosted provider', aimed() === 'https://api.openai.com/v1/audio/transcriptions', aimed());
  const before = seen.length;
  ok('a custom plain-http endpoint elsewhere is refused',
    (await tx({ provider: 'custom', baseUrl: 'http://collector.example' })).error === 'bad-base-url');
  ok('it reached no network', seen.length === before, seen.length - before);
}

group('validation and errors');
{
  const before = seen.length;
  ok('empty audio is refused', (await tx({ provider: 'openai', apiKey: 'k', audio: '' })).error === 'no-audio');
  ok('a missing key is refused', (await tx({ provider: 'openai', apiKey: '' })).error === 'no-key');
  ok('neither reached the network', seen.length === before, seen.length - before);
  mode = 'auth';
  const a = await tx({ provider: 'openai', apiKey: 'sk-test-abcdef123456' });
  ok('401 reads as a key problem, not a failed recording', a.error === 'auth', a);
  ok('the key is redacted from the error', !JSON.stringify(a).includes('sk-test-abcdef123456'), a.message);
  // Providers with no speech service at all are refused earlier, so a 404 here means a wrong model or endpoint —
  // calling that "no such service" used to send the user to configure what was already configured.
  mode = 'missing';
  ok('404 reads as a wrong model or endpoint', (await tx({ provider: 'openai', apiKey: 'k' })).error === 'not-found');
  mode = 'ok';
  ok('an unreachable host reads as a network failure',
    (await transcribeAudio({ provider: 'custom', baseUrl: 'http://127.0.0.1:1', audio })).error === 'network');
}

group('voice settings live apart from chat settings');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-voice-'));
  const CHAT_KEY = 'chat-key-deadbeef';
  const VOICE_KEY = 'voice-key-cafebabe';
  const fresh = readSettings(dir);
  ok('a fresh install has no separate voice provider', fresh.voiceProvider === '');
  let s = writeSettings(dir, { provider: 'deepseek', apiKey: CHAT_KEY });
  ok('voice falls back to the chat provider', voiceConfig(s).provider === 'deepseek' && voiceConfig(s).apiKey === CHAT_KEY);
  ok('the chat model is never reused as a transcription model', voiceConfig(s).model === '');
  ok('deepseek is reported as having no speech service', publicSettings(s).voiceCanTranscribe === false);

  s = writeSettings(dir, { voiceProvider: 'openai', voiceApiKey: VOICE_KEY });
  ok('the chat provider is untouched', s.provider === 'deepseek' && s.apiKey === CHAT_KEY);
  ok('voice uses its own key', voiceConfig(s).apiKey === VOICE_KEY);
  const pub = publicSettings(s);
  ok('voice is reported ready', pub.voiceReady === true && pub.hasVoiceKey === true, pub);
  ok('neither key reaches the renderer', !JSON.stringify(pub).includes(CHAT_KEY) && !JSON.stringify(pub).includes(VOICE_KEY));

  ok('a provider with no speech service is refused for voice',
    writeSettings(dir, { voiceProvider: 'deepseek' }).voiceProvider === 'openai');
  writeSettings(dir, { voiceModel: 'whisper-large-v3' });
  ok('switching voice provider clears the old voice model', writeSettings(dir, { voiceProvider: 'google' }).voiceModel === '');
  const custom = writeSettings(dir, { voiceProvider: 'custom', voiceBaseUrl: '' });
  ok('a custom voice endpoint with no URL is not ready', publicSettings(custom).voiceReady === false);
  ok('...and transcription says exactly why', (await transcribeAudio({ ...voiceConfig(custom), audio })).error === 'no-base-url');
  ok('clearing the voice provider hands voice back to chat',
    voiceConfig(writeSettings(dir, { voiceProvider: '' })).provider === 'deepseek');

  writeSettings(dir, { voiceProvider: 'openai', voiceApiKey: VOICE_KEY });
  const cleared = writeSettings(dir, { voiceApiKey: '' });
  ok('the voice key can be removed on its own', cleared.voiceApiKey === '' && cleared.apiKey === CHAT_KEY);
  fs.rmSync(dir, { recursive: true, force: true });
}

server.close();
done();
