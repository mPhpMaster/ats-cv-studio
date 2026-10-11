// Fetching the model list from the provider itself, so a retired model name is never offered.
// Local mock only — no real provider and no real key.
import http from 'node:http';
import { electron, reporter } from './helpers.mjs';

const { listModels } = electron('aiClient.cjs');
const { ok, done, group } = reporter();

const seen = [];
let mode = 'ok';
const server = http.createServer((req, res) => {
  seen.push({ url: req.url, method: req.method, headers: req.headers });
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (mode === 'auth') return send(401, { error: { message: 'bad key' } });
  if (mode === 'badkey400') return send(400, { error: { message: 'API key not valid. Please pass a valid API key.' } });
  if (mode === 'none') return send(200, { data: [], models: [] });
  if (req.url.startsWith('/v1beta/models')) {
    return send(200, { models: [
      { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/imagen-3', supportedGenerationMethods: ['predict'] },
    ] });
  }
  if (req.headers['x-api-key']) return send(200, { data: [{ id: 'claude-opus-5' }, { id: 'claude-sonnet-5' }] });
  return send(200, { data: [
    { id: 'gpt-4o' }, { id: 'gpt-4.1' }, { id: 'whisper-1' }, { id: 'text-embedding-3-small' },
    { id: 'dall-e-3' }, { id: 'gpt-4o-transcribe' }, { id: 'omni-moderation-latest' },
  ] });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const requested = [];
const via = (url, init) => { requested.push(url); return fetch(url.replace(/^https:\/\/[^/]+/, base), init); };
const aimed = () => requested[requested.length - 1];
const last = () => seen[seen.length - 1];

group('per provider');
{
  const a = await listModels({ provider: 'anthropic', apiKey: 'sk-test-abcdef123456' }, via);
  ok('anthropic returns its models', a.ok && a.models.includes('claude-sonnet-5'), a);
  ok('asked at its own address, with its headers, as a GET',
    aimed().startsWith('https://api.anthropic.com/v1/models') && last().method === 'GET'
      && last().headers['x-api-key'] === 'sk-test-abcdef123456' && last().headers['anthropic-version'] === '2023-06-01');
  ok('the provider default is offered first', a.models[0] === 'claude-sonnet-5', a.models);

  const o = await listModels({ provider: 'openai', apiKey: 'sk-test-abcdef123456' }, via);
  ok('openai keeps chat models', o.ok && o.models.includes('gpt-4o') && o.models.includes('gpt-4.1'), o);
  ok('speech, embedding, image and moderation models are left out',
    !o.models.some((m) => /whisper|embedding|dall-e|moderation|transcribe/.test(m)), o.models);

  const stt = await listModels({ provider: 'openai', apiKey: 'sk-test-abcdef123456', kind: 'stt' }, via);
  ok('the speech list keeps only transcription models', stt.ok && stt.models.includes('whisper-1') && !stt.models.includes('gpt-4o'), stt.models);

  const g = await listModels({ provider: 'google', apiKey: 'k-abcdef123456' }, via);
  ok('google strips the models/ prefix', g.ok && g.models.includes('gemini-3.6-flash'), g);
  ok('google drops what cannot answer a prompt', !g.models.some((m) => /embedding|imagen/.test(m)), g.models);

  const d = await listModels({ provider: 'deepseek', apiKey: 'sk-test-abcdef123456' }, via);
  ok('deepseek uses the OpenAI listing path', d.ok && aimed() === 'https://api.deepseek.com/v1/models', aimed());

  const c = await listModels({ provider: 'custom', baseUrl: base }, via);
  ok('a custom endpoint works with no key', c.ok && c.models.includes('gpt-4o'), c);
}

group('the same rules about where the key goes');
{
  await listModels({ provider: 'openai', apiKey: 'sk-test-abcdef123456', baseUrl: 'https://collector.example' }, via);
  ok('a planted baseUrl is ignored for a hosted provider', aimed() === 'https://api.openai.com/v1/models', aimed());
  const before = seen.length;
  ok('a custom plain-http endpoint elsewhere is refused',
    (await listModels({ provider: 'custom', apiKey: 'k', baseUrl: 'http://collector.example' }, via)).error === 'bad-base-url');
  ok('no key saved means no request', (await listModels({ provider: 'openai', apiKey: '' }, via)).error === 'no-key');
  ok('an unknown provider is refused', (await listModels({ provider: 'nope' }, via)).error === 'bad-provider');
  ok('a custom endpoint with no URL is refused', (await listModels({ provider: 'custom' }, via)).error === 'no-base-url');
  ok('none of them reached the network', seen.length === before, seen.length - before);
}

group('failures');
{
  mode = 'auth';
  const a = await listModels({ provider: 'openai', apiKey: 'sk-test-abcdef123456' }, via);
  ok('401 reads as a key problem', a.error === 'auth', a);
  ok('the key is scrubbed from the message', !JSON.stringify(a).includes('sk-test-abcdef123456'), a.message);
  mode = 'badkey400';
  ok("google's 400 for a bad key reads as a key problem",
    (await listModels({ provider: 'google', apiKey: 'k-abcdef123456' }, via)).error === 'auth');
  mode = 'none';
  ok('an empty list says "no models", not "empty reply"',
    (await listModels({ provider: 'openai', apiKey: 'k-abcdef123456' }, via)).error === 'no-models');
  mode = 'ok';
  ok('an unreachable host reads as a network failure',
    (await listModels({ provider: 'custom', baseUrl: 'http://127.0.0.1:1' })).error === 'network');
}

server.close();
done();
