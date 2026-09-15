// Calls the AI provider from the MAIN process, so the API key never reaches the renderer and CORS never applies.
// No electron import here on purpose: this module can be exercised in plain node against a local mock server.
const fs = require('node:fs');
const path = require('node:path');

const PROVIDERS = {
  anthropic: { base: 'https://api.anthropic.com', model: 'claude-sonnet-5' },
  openai: { base: 'https://api.openai.com', model: 'gpt-4o' },
  google: { base: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0-flash' },
  // OpenAI-compatible endpoint the user points at themselves (a local model, a gateway, a proxy).
  custom: { base: '', model: '' },
};

const SETTINGS_FILE = 'ai-settings.json';
const DEFAULTS = { provider: 'anthropic', model: '', baseUrl: '', apiKey: '' };
const trim = (v) => (typeof v === 'string' ? v.trim() : '');

function settingsPath(dir) {
  return path.join(dir, SETTINGS_FILE);
}

function readSettings(dir) {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(dir), 'utf8'));
    return {
      provider: PROVIDERS[saved.provider] ? saved.provider : DEFAULTS.provider,
      model: trim(saved.model),
      baseUrl: trim(saved.baseUrl),
      apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : '',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeSettings(dir, patch) {
  const next = { ...readSettings(dir) };
  if (patch && typeof patch === 'object') {
    if (PROVIDERS[patch.provider]) next.provider = patch.provider;
    if (typeof patch.model === 'string') next.model = trim(patch.model);
    if (typeof patch.baseUrl === 'string') next.baseUrl = trim(patch.baseUrl);
    // An empty string clears the stored key; undefined leaves it untouched.
    if (typeof patch.apiKey === 'string') next.apiKey = patch.apiKey.trim();
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath(dir), JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

/** What the renderer is allowed to see: never the key itself, only whether one is stored. */
function publicSettings(s) {
  const preset = PROVIDERS[s.provider] ?? PROVIDERS.anthropic;
  return {
    provider: s.provider,
    model: s.model,
    baseUrl: s.baseUrl,
    hasKey: Boolean(trim(s.apiKey)),
    defaultModel: preset.model,
    defaultBaseUrl: preset.base,
  };
}

/**
 * Keep the key out of anything we return, log or show. Only redacts a value long enough to actually be a
 * secret: a one- or two-character "key" would otherwise mangle ordinary words in the provider's own message.
 */
const MIN_SECRET = 6;
const scrub = (text, apiKey) => {
  const key = trim(apiKey);
  const s = String(text ?? '');
  return key.length >= MIN_SECRET ? s.split(key).join('***') : s;
};

function buildRequest({ provider, apiKey, model, base, prompt }) {
  const json = { 'content-type': 'application/json' };
  if (provider === 'anthropic') {
    return {
      url: `${base}/v1/messages`,
      headers: { ...json, 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: { model, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] },
    };
  }
  if (provider === 'google') {
    return {
      url: `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: json,
      body: { contents: [{ parts: [{ text: prompt }] }] },
    };
  }
  // openai and custom share the OpenAI chat-completions shape.
  return {
    url: `${base}/v1/chat/completions`,
    headers: apiKey ? { ...json, authorization: `Bearer ${apiKey}` } : json,
    body: { model, messages: [{ role: 'user', content: prompt }] },
  };
}

/**
 * Pulls the human-readable reason out of a provider's error body. Without this the UI could only say
 * "the provider returned an error", which tells the user nothing about what to change.
 */
function providerMessage(detail) {
  const raw = String(detail ?? '').trim();
  try {
    const d = JSON.parse(raw);
    const found = d?.error?.message
      ?? (Array.isArray(d?.error) ? d.error[0]?.message : undefined)
      ?? (typeof d?.error === 'string' ? d.error : undefined)
      ?? d?.message;
    if (typeof found === 'string' && found.trim()) return found.trim().slice(0, 300);
  } catch { /* not JSON — fall back to the raw text */ }
  return raw.slice(0, 300);
}

function extractText(provider, data) {
  if (!data || typeof data !== 'object') return '';
  if (provider === 'anthropic') {
    const parts = Array.isArray(data.content) ? data.content : [];
    return parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('').trim();
  }
  if (provider === 'google') {
    const parts = data.candidates?.[0]?.content?.parts;
    return (Array.isArray(parts) ? parts : []).map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('').trim();
  }
  const msg = data.choices?.[0]?.message?.content;
  return typeof msg === 'string' ? msg.trim() : '';
}

/**
 * Sends one prompt and returns the assistant's raw text.
 * Never throws: every failure comes back as { ok: false, error } with a code the UI can translate.
 */
async function callAi(options, fetchImpl) {
  const doFetch = fetchImpl || globalThis.fetch;
  const provider = options && PROVIDERS[options.provider] ? options.provider : '';
  if (!provider) return { ok: false, error: 'bad-provider' };

  const preset = PROVIDERS[provider];
  const apiKey = trim(options.apiKey);
  const model = trim(options.model) || preset.model;
  const base = (trim(options.baseUrl) || preset.base).replace(/\/+$/, '');
  const prompt = typeof options.prompt === 'string' ? options.prompt : '';

  if (!prompt.trim()) return { ok: false, error: 'no-prompt' };
  if (!base) return { ok: false, error: 'no-base-url' };
  if (!model) return { ok: false, error: 'no-model' };
  // A custom endpoint may legitimately need no key (a local model); the hosted providers always do.
  if (provider !== 'custom' && !apiKey) return { ok: false, error: 'no-key' };

  const { url, headers, body } = buildRequest({ provider, apiKey, model, base, prompt });

  let res;
  try {
    res = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    return { ok: false, error: 'network', message: scrub(e && e.message ? e.message : e, apiKey) };
  }

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* body already consumed or empty */ }
    const reason = providerMessage(detail);
    // Providers report "out of credit" inconsistently: Anthropic sends 400, OpenAI sends 429, some send 402.
    // Classifying on the wording keeps the user from being told to check a model name that is perfectly fine.
    const outOfCredit = /credit balance|billing|insufficient (?:funds|quota|credits?)|exceeded your current quota|payment required/i.test(reason);
    const error = outOfCredit || res.status === 402 ? 'billing'
      : res.status === 401 || res.status === 403 ? 'auth'
        : res.status === 429 ? 'rate-limit'
          : res.status === 404 ? 'not-found'
            : res.status === 400 || res.status === 422 ? 'bad-request'
              : 'http';
    return { ok: false, error, message: scrub(`${res.status} ${reason}`, apiKey) };
  }

  let data = null;
  try { data = await res.json(); } catch { return { ok: false, error: 'bad-response' }; }
  const text = extractText(provider, data);
  return text ? { ok: true, text } : { ok: false, error: 'empty' };
}

module.exports = { callAi, readSettings, writeSettings, publicSettings, PROVIDERS, _internals: { buildRequest, extractText, scrub } };
