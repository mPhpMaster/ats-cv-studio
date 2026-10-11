// The AI client: what each provider is sent, where it may be sent, and how failures are reported.
// Runs against a LOCAL mock server — no real provider, no real API key, and the user's own settings file is
// never read or written (every settings check uses a throwaway directory).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { electron, reporter } from './helpers.mjs';

const { callAi, readSettings, writeSettings, publicSettings } = electron('aiClient.cjs');
const { ok, done, group } = reporter();

const seen = [];
let mode = 'ok';
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    seen.push({ url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (mode === 'auth') return send(401, { error: 'invalid key sk-secret-123' });
    if (mode === 'rate') return send(429, { error: 'slow down' });
    if (mode === 'boom') return send(500, { error: 'server on fire' });
    if (mode === 'badmodel') return send(400, { error: { message: 'model: claude-x-9 not found' } });
    // Providers disagree about status codes, so the wording has to decide. These are real messages.
    if (mode === 'credit') return send(400, { error: { message: 'Your credit balance is too low to access the Anthropic API.' } });
    if (mode === 'quota') return send(429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.' } });
    if (mode === 'region') return send(400, { error: { message: 'User location is not supported for the API use.' } });
    if (mode === 'badkey') return send(400, { error: [{ message: 'API key not valid. Please pass a valid API key.' }] });
    if (mode === 'toolarge') return send(400, { error: { message: "This model's maximum context length is 128000 tokens." } });
    if (mode === 'empty') return send(200, { content: [], choices: [], candidates: [] });
    if (req.url.includes(':generateContent')) return send(200, { candidates: [{ content: { parts: [{ text: 'GOOGLE REPLY' }] } }] });
    if (req.url.endsWith('/v1/messages')) return send(200, { content: [{ type: 'text', text: 'ANTHROPIC REPLY' }] });
    return send(200, { choices: [{ message: { content: 'OPENAI REPLY' } }] });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// A hosted provider always targets its own official address, so requests are rerouted to the mock here and the
// address each call really aimed at is recorded.
const requested = [];
const via = (url, init) => { requested.push(url); return fetch(url.replace(/^https:\/\/[^/]+/, base), init); };
const aimed = () => requested[requested.length - 1];
const last = () => seen[seen.length - 1];
const run = (opts) => callAi({ prompt: 'PROMPT TEXT', ...opts }, via);

group('what each provider is sent');
{
  const a = await run({ provider: 'anthropic', apiKey: 'sk-secret-123', model: 'claude-sonnet-5' });
  ok('anthropic returns the reply', a.ok && a.text === 'ANTHROPIC REPLY', a);
  ok('anthropic posts to /v1/messages with its key and version headers',
    last().url === '/v1/messages' && last().headers['x-api-key'] === 'sk-secret-123' && last().headers['anthropic-version'] === '2023-06-01');

  const o = await run({ provider: 'openai', apiKey: 'sk-secret-123', model: 'gpt-4o' });
  ok('openai uses chat/completions with a bearer token',
    o.ok && last().url === '/v1/chat/completions' && last().headers.authorization === 'Bearer sk-secret-123', o);

  const g = await run({ provider: 'google', apiKey: 'sk-secret-123', model: 'gemini-3.6-flash' });
  // The key used to ride in the query string, where URLs carry it into logs, proxies and crash reports.
  ok('google puts the model in the path and the key in a header, never the URL',
    g.ok && last().url.includes('gemini-3.6-flash:generateContent')
      && last().headers['x-goog-api-key'] === 'sk-secret-123' && !last().url.includes('sk-secret-123'), last().url);

  const d = await run({ provider: 'deepseek', apiKey: 'sk-secret-123', model: 'deepseek-chat' });
  ok('deepseek speaks the OpenAI protocol', d.ok && last().url === '/v1/chat/completions' && last().body.model === 'deepseek-chat', d);

  const c = await callAi({ provider: 'custom', model: 'local-model', baseUrl: base, prompt: 'x' }, via);
  ok('a custom endpoint works with no key at all', c.ok && last().headers.authorization === undefined, c);
}

group('multi-turn conversations (the interview)');
{
  const history = [
    { role: 'user', content: 'THE INTERVIEW PROMPT' },
    { role: 'assistant', content: 'What is your phone number?' },
    { role: 'user', content: '+966 5xx xxx xxx' },
  ];
  await run({ provider: 'anthropic', apiKey: 'k', model: 'm', messages: history });
  ok('the whole conversation is sent, assistant turns included',
    last().body.messages.length === 3 && last().body.messages[1].role === 'assistant', last().body.messages);

  await run({ provider: 'google', apiKey: 'k', model: 'm', messages: history });
  ok('google renames assistant turns to "model" and keeps the order',
    last().body.contents[1].role === 'model' && last().body.contents[2].parts[0].text === '+966 5xx xxx xxx');

  const before = seen.length;
  const bare = { provider: 'openai', apiKey: 'k', model: 'm' };
  ok('an empty conversation is refused', (await callAi({ ...bare, messages: [] }, via)).error === 'no-prompt');
  ok('a blank turn is dropped, not sent', (await callAi({ ...bare, messages: [{ role: 'user', content: '  ' }] }, via)).error === 'no-prompt');
  ok('neither reached the network', seen.length === before, seen.length - before);
}

group('refused before any network call');
{
  const before = seen.length;
  ok('a hosted provider without a key is refused', (await run({ provider: 'anthropic', apiKey: '' })).error === 'no-key');
  ok('an unknown provider is refused', (await callAi({ provider: 'nope', prompt: 'x' }, via)).error === 'bad-provider');
  ok('an empty prompt is refused', (await run({ provider: 'anthropic', apiKey: 'k', prompt: '  ' })).error === 'no-prompt');
  ok('custom without an endpoint is refused', (await callAi({ provider: 'custom', model: 'm', prompt: 'x' }, via)).error === 'no-base-url');
  ok('nothing was sent over the network', seen.length === before, `${seen.length - before} requests leaked`);
}

group('where the key may be sent');
{
  const evil = 'https://collector.example';
  for (const [provider, host] of [['anthropic', 'https://api.anthropic.com/'], ['openai', 'https://api.openai.com/'],
    ['google', 'https://generativelanguage.googleapis.com/'], ['deepseek', 'https://api.deepseek.com/']]) {
    const r = await callAi({ provider, apiKey: 'sk-test-abcdef123456', model: 'm', baseUrl: evil, prompt: 'x' }, via);
    ok(`${provider} ignores a planted baseUrl and uses its own address`, r.ok && aimed().startsWith(host), aimed());
  }
  const before = seen.length;
  ok('plain http to another machine is refused',
    (await callAi({ provider: 'custom', apiKey: 'k', model: 'm', baseUrl: 'http://collector.example', prompt: 'x' }, via)).error === 'bad-base-url');
  ok('credentials inside the URL are refused',
    (await callAi({ provider: 'custom', model: 'm', baseUrl: 'https://user:pw@collector.example', prompt: 'x' }, via)).error === 'bad-base-url');
  ok('a non-web scheme is refused',
    (await callAi({ provider: 'custom', model: 'm', baseUrl: 'file:///C:/x', prompt: 'x' }, via)).error === 'bad-base-url');
  ok('none of them reached the network', seen.length === before, seen.length - before);
  ok('plain http to this machine still works (local models)',
    (await callAi({ provider: 'custom', model: 'm', baseUrl: base, prompt: 'x' }, via)).ok);
}

group('failures are named by what the provider said');
{
  mode = 'auth';
  const a = await run({ provider: 'anthropic', apiKey: 'sk-secret-123' });
  ok('401 reads as a key problem', a.error === 'auth', a);
  ok('the key is scrubbed from the message', !JSON.stringify(a).includes('sk-secret-123'), a.message);
  mode = 'rate';
  ok('429 reads as rate limiting', (await run({ provider: 'anthropic', apiKey: 'k' })).error === 'rate-limit');
  mode = 'boom';
  ok('500 reads as a provider error', (await run({ provider: 'anthropic', apiKey: 'k' })).error === 'http');
  mode = 'badmodel';
  const bad = await run({ provider: 'anthropic', apiKey: 'k', model: 'claude-x-9' });
  ok('a genuine model complaint reads as a bad request', bad.error === 'bad-request', bad);
  ok("the provider's own wording is surfaced", String(bad.message).includes('model: claude-x-9 not found'), bad.message);
  // An empty balance arrives as 400 from Anthropic and 429 from OpenAI; neither is a bad model name.
  mode = 'credit';
  ok('an empty Anthropic balance reads as billing', (await run({ provider: 'anthropic', apiKey: 'k' })).error === 'billing');
  mode = 'quota';
  ok('an exhausted OpenAI quota reads as billing', (await run({ provider: 'openai', apiKey: 'k' })).error === 'billing');
  mode = 'region';
  ok('an unsupported country reads as region', (await run({ provider: 'google', apiKey: 'k' })).error === 'region');
  mode = 'badkey';
  const key400 = await run({ provider: 'google', apiKey: 'sk-test-abcdef123456' });
  ok("google's 400 for a bad key reads as a key problem", key400.error === 'auth', key400);
  ok("google's array-shaped error is unwrapped", String(key400.message).includes('API key not valid'), key400.message);
  mode = 'toolarge';
  ok('an over-long request says so', (await run({ provider: 'openai', apiKey: 'k' })).error === 'too-large');
  mode = 'empty';
  ok('an empty reply is reported', (await run({ provider: 'anthropic', apiKey: 'k' })).error === 'empty');
  mode = 'ok';
  ok('an unreachable host reads as a network failure',
    (await callAi({ provider: 'custom', model: 'm', baseUrl: 'http://127.0.0.1:1', prompt: 'x' })).error === 'network');
}

group('stored settings');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-ai-'));
  ok('a fresh install defaults to anthropic', readSettings(dir).provider === 'anthropic');
  writeSettings(dir, { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-secret-123' });
  ok('the key and provider round-trip to disk', readSettings(dir).apiKey === 'sk-secret-123' && readSettings(dir).provider === 'openai');
  const pub = publicSettings(readSettings(dir));
  ok('the renderer is told a key exists but never gets it', pub.hasKey === true && !JSON.stringify(pub).includes('sk-secret-123'), pub);
  writeSettings(dir, { model: 'gpt-4o-mini' });
  ok('an unrelated change keeps the key', readSettings(dir).apiKey === 'sk-secret-123');
  // A model name belongs to one provider: "claude-sonnet-5" survived a switch to Gemini and every call failed.
  writeSettings(dir, { provider: 'anthropic', model: 'claude-sonnet-5' });
  writeSettings(dir, { provider: 'google' });
  ok('switching provider drops the old provider’s model', readSettings(dir).model === '');
  writeSettings(dir, { apiKey: '' });
  ok('an empty string clears the key', readSettings(dir).apiKey === '' && publicSettings(readSettings(dir)).hasKey === false);
  const kept = readSettings(dir).provider;
  writeSettings(dir, { provider: 'evil' });
  ok('a bogus provider is rejected', readSettings(dir).provider === kept);
  fs.rmSync(dir, { recursive: true, force: true });
}

group('a saved key stays with the address it was saved for');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-ai-'));
  writeSettings(dir, { provider: 'openai', apiKey: 'sk-openai-abcdef' });
  writeSettings(dir, { provider: 'custom', baseUrl: 'https://collector.example' });
  ok('moving a hosted key to a custom endpoint drops it', readSettings(dir).apiKey === '');
  writeSettings(dir, { apiKey: 'sk-custom-abcdef' });
  writeSettings(dir, { baseUrl: 'https://other.example' });
  ok('changing the custom endpoint drops the key saved for the old one', readSettings(dir).apiKey === '');
  writeSettings(dir, { baseUrl: 'https://other.example', apiKey: 'sk-custom-abcdef' });
  writeSettings(dir, { baseUrl: 'https://other.example/' });
  ok('rewriting the same endpoint keeps the key', readSettings(dir).apiKey === 'sk-custom-abcdef');
  writeSettings(dir, { baseUrl: 'https://third.example', apiKey: 'sk-third-abcdef' });
  ok('a new endpoint saved with its key keeps that key', readSettings(dir).apiKey === 'sk-third-abcdef');

  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-ai-'));
  writeSettings(fresh, { provider: 'custom' });
  writeSettings(fresh, { apiKey: 'sk-local-abcdef' });
  writeSettings(fresh, { baseUrl: 'http://localhost:1234' });
  ok('the dialog order (key first, then the first endpoint) keeps the key', readSettings(fresh).apiKey === 'sk-local-abcdef');

  writeSettings(dir, { provider: 'anthropic', apiKey: 'sk-ant-abcdef' });
  writeSettings(dir, { provider: 'google' });
  ok('switching between hosted providers is unaffected', readSettings(dir).apiKey === 'sk-ant-abcdef');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(fresh, { recursive: true, force: true });
}

server.close();
done();
