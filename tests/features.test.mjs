// The feature switches. Everything added on top of the CV can be turned off, the choice is remembered, and a
// corrupt or half-written stored value can never leave a switch undefined (which would render as "off").
import { loadApp, reporter } from './helpers.mjs';

const { ok, done, group } = reporter();

// A stand-in for the browser's localStorage, so the module under test can be exercised in Node.
let store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const app = await loadApp(['/src/lib/features.ts']);
const { loadFeatures, saveFeatures, DEFAULT_FEATURES } = app;

try {
  group('defaults');
  {
    store = {};
    const f = loadFeatures();
    ok('nothing stored gives the defaults', JSON.stringify(f) === JSON.stringify(DEFAULT_FEATURES), f);
    ok('everything ships switched on', Object.values(DEFAULT_FEATURES).every((v) => v === true), DEFAULT_FEATURES);
    ok('the donation link, voice and extra sections can all be switched off',
      ['donate', 'voice', 'extras'].every((k) => k in DEFAULT_FEATURES), Object.keys(DEFAULT_FEATURES));
  }

  group('a choice is remembered');
  {
    store = {};
    saveFeatures({ ...DEFAULT_FEATURES, donate: false });
    ok('switching one off survives a reload', loadFeatures().donate === false);
    ok('the others stay on', loadFeatures().voice === true && loadFeatures().extras === true, loadFeatures());
    saveFeatures({ ...loadFeatures(), donate: true });
    ok('and it can be switched back on', loadFeatures().donate === true);
  }

  group('nothing stored can break a switch');
  {
    store = { 'ats.features': '{"donate":false}' };
    const partial = loadFeatures();
    ok('a half-written value keeps the rest at their defaults', partial.donate === false && partial.voice === true, partial);
    store = { 'ats.features': 'not json at all' };
    ok('unreadable storage falls back to the defaults', JSON.stringify(loadFeatures()) === JSON.stringify(DEFAULT_FEATURES));
    store = { 'ats.features': '{"donate":"yes","voice":null,"nonsense":1}' };
    const junk = loadFeatures();
    ok('non-boolean values are ignored', junk.donate === true && junk.voice === true, junk);
    ok('unknown keys are dropped', !('nonsense' in junk), Object.keys(junk));
    store = { 'ats.features': 'null' };
    ok('a stored null falls back to the defaults', JSON.stringify(loadFeatures()) === JSON.stringify(DEFAULT_FEATURES));
  }

  group('storage that refuses to work');
  {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const real = globalThis.localStorage;
    globalThis.localStorage = broken;
    ok('reading never throws', JSON.stringify(loadFeatures()) === JSON.stringify(DEFAULT_FEATURES));
    let threw = false;
    try { saveFeatures(DEFAULT_FEATURES); } catch { threw = true; }
    ok('writing never throws', !threw);
    globalThis.localStorage = real;
  }
} finally {
  await app.close();
}
done();
