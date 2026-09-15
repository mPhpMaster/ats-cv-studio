// Reads the current LinkedIn sign-in cookies from a locally installed Chromium browser (Chrome, Edge, Brave) so the
// LinkedIn import window opens already signed in, using the session the user is already logged into on this machine.
//
// This only ever reads the LinkedIn cookies for the current Windows user, on the user's own machine, when the user
// asks for it. Cookies are copied into the app's own LinkedIn window session and nowhere else. Anything that cannot be
// read or decrypted is skipped, and the import falls back to a normal manual sign-in.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// microseconds between 1601-01-01 (Chrome/WebKit epoch) and 1970-01-01 (Unix epoch)
const EPOCH_DIFF_SECONDS = 11644473600;

const BROWSERS = [
  { name: 'Chrome', dir: ['Google', 'Chrome', 'User Data'] },
  { name: 'Edge', dir: ['Microsoft', 'Edge', 'User Data'] },
  { name: 'Brave', dir: ['BraveSoftware', 'Brave-Browser', 'User Data'] },
];

/** DPAPI-decrypt one or more base64 blobs for the current user, via PowerShell (no native module needed). */
function dpapiDecryptMany(base64List) {
  if (!base64List.length) return [];
  const script = [
    'Add-Type -AssemblyName System.Security',
    '$out = foreach ($s in $input) {',
    '  if ($s) { try { [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($s), $null, "CurrentUser")) } catch { "" } }',
    '  else { "" }',
    '}',
    '[string]::Join("`n", $out)',
  ].join('\n');
  const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: base64List.join('\n'),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  if (res.status !== 0 || typeof res.stdout !== 'string') return base64List.map(() => null);
  const lines = res.stdout.replace(/\r/g, '').split('\n');
  return base64List.map((_, i) => {
    const b64 = (lines[i] ?? '').trim();
    return b64 ? Buffer.from(b64, 'base64') : null;
  });
}

/** The AES-256-GCM key Chrome uses for "v10" cookies, taken from the browser's Local State and DPAPI-decrypted. */
function readAesKey(userDataDir) {
  const localState = path.join(userDataDir, 'Local State');
  if (!fs.existsSync(localState)) return null;
  let encryptedKey;
  try {
    encryptedKey = JSON.parse(fs.readFileSync(localState, 'utf8'))?.os_crypt?.encrypted_key;
  } catch {
    return null;
  }
  if (!encryptedKey) return null;
  const blob = Buffer.from(encryptedKey, 'base64');
  if (blob.subarray(0, 5).toString('latin1') !== 'DPAPI') return null;
  const [key] = dpapiDecryptMany([blob.subarray(5).toString('base64')]);
  return key && key.length === 32 ? key : null;
}

/** Decrypt a single Chrome cookie value. Returns the string value, or null when it can't be read with this key. */
function decryptCookieValue(encrypted, aesKey) {
  if (!encrypted || !encrypted.length) return '';
  const scheme = encrypted.subarray(0, 3).toString('latin1');
  if (scheme === 'v10' || scheme === 'v20') {
    if (!aesKey) return null;
    try {
      const iv = encrypted.subarray(3, 15);
      const tag = encrypted.subarray(encrypted.length - 16);
      const body = encrypted.subarray(15, encrypted.length - 16);
      const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(body), decipher.final()]);
      // "v20" (app-bound) prepends a 32-byte header to the plaintext; "v10" does not.
      return (scheme === 'v20' ? plain.subarray(32) : plain).toString('utf8');
    } catch {
      return null; // wrong key (e.g. app-bound v20) or corrupt value
    }
  }
  // Legacy: the whole value is DPAPI-encrypted.
  const [buf] = dpapiDecryptMany([encrypted.toString('base64')]);
  return buf ? buf.toString('utf8') : null;
}

const SAME_SITE = { 0: 'no_restriction', 1: 'lax', 2: 'strict' };

/**
 * Parse a copied Chrome "Cookies" SQLite file and return decrypted LinkedIn cookies ready for Electron's
 * session.cookies.set. `sql` is an initialized sql.js module.
 */
function cookiesFromBuffer(sql, buffer, aesKey) {
  const db = new sql.Database(buffer);
  try {
    const stmt = db.prepare(
      "SELECT host_key, name, encrypted_value, value, path, expires_utc, is_secure, is_httponly, samesite " +
        // Exactly linkedin.com and its subdomains: a bare suffix match also took cookies of any site whose
        // name merely ends that way (notlinkedin.com).
        "FROM cookies WHERE host_key IN ('linkedin.com', '.linkedin.com') OR host_key LIKE '%.linkedin.com'",
    );
    const cookies = [];
    while (stmt.step()) {
      const [host, name, enc, plainValue, cookiePath, expires, secure, httpOnly, sameSite] = stmt.get();
      const value = enc && enc.length ? decryptCookieValue(Buffer.from(enc), aesKey) : String(plainValue ?? '');
      if (value === null || value === '') continue;
      const cookie = {
        url: `https://${String(host).replace(/^\./, '')}${cookiePath || '/'}`,
        name,
        value,
        domain: host,
        path: cookiePath || '/',
        secure: !!secure,
        httpOnly: !!httpOnly,
        sameSite: SAME_SITE[sameSite] ?? 'unspecified',
      };
      if (Number(expires) > 0) cookie.expirationDate = Number(expires) / 1e6 - EPOCH_DIFF_SECONDS;
      // Electron rejects SameSite=None cookies that are not Secure.
      if (cookie.sameSite === 'no_restriction' && !cookie.secure) cookie.sameSite = 'unspecified';
      cookies.push(cookie);
    }
    stmt.free();
    return cookies;
  } finally {
    db.close();
  }
}

let sqlPromise = null;
function loadSqlJs() {
  sqlPromise ??= (async () => {
    const initSqlJs = require('sql.js');
    const wasmBinary = fs.readFileSync(path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm'));
    return initSqlJs({ wasmBinary });
  })();
  return sqlPromise;
}

/** Every profile folder in a browser's User Data dir that has a Cookies database. */
function profileCookieDbs(userDataDir) {
  let entries = [];
  try {
    entries = fs.readdirSync(userDataDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const dbs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name !== 'Default' && !/^Profile /.test(entry.name)) continue;
    for (const rel of [['Network', 'Cookies'], ['Cookies']]) {
      const file = path.join(userDataDir, entry.name, ...rel);
      if (fs.existsSync(file)) { dbs.push(file); break; }
    }
  }
  return dbs;
}

/** Copy a (possibly locked) SQLite DB to a temp file so it can be read while the browser is running. */
function copyToTemp(file) {
  const tmp = path.join(os.tmpdir(), `ats-cookies-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  fs.copyFileSync(file, tmp);
  return tmp;
}

/**
 * Collect the current user's LinkedIn cookies from installed Chromium browsers.
 * Returns { cookies, browser } for the first browser that yields the LinkedIn auth cookie, or null.
 */
async function collectLinkedInCookies() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  let sql = null;
  for (const browser of BROWSERS) {
    const userDataDir = path.join(base, ...browser.dir);
    if (!fs.existsSync(userDataDir)) continue;
    const aesKey = readAesKey(userDataDir);
    const dbs = profileCookieDbs(userDataDir);
    if (!dbs.length) continue;
    sql ??= await loadSqlJs();

    const all = [];
    for (const db of dbs) {
      let tmp = null;
      try {
        tmp = copyToTemp(db);
        all.push(...cookiesFromBuffer(sql, fs.readFileSync(tmp), aesKey));
      } catch {
        /* profile unreadable — skip it */
      } finally {
        if (tmp) { try { fs.unlinkSync(tmp); } catch { /* best effort */ } }
      }
    }
    // "li_at" is LinkedIn's main auth cookie; without it we are not really signed in.
    if (all.some((c) => c.name === 'li_at' && c.value)) {
      // De-duplicate by name+path, keeping the last (most specific) definition.
      const byKey = new Map(all.map((c) => [`${c.name} ${c.path}`, c]));
      return { cookies: [...byKey.values()], browser: browser.name };
    }
  }
  return null;
}

/** Load LinkedIn cookies from the browser into an Electron session. Returns the browser name, or null. */
async function applyChromeLinkedInSession(session) {
  let found = null;
  try {
    found = await collectLinkedInCookies();
  } catch {
    return null;
  }
  if (!found) return null;
  let set = 0;
  for (const cookie of found.cookies) {
    try {
      await session.cookies.set(cookie);
      set++;
    } catch {
      /* individual cookie rejected — ignore */
    }
  }
  return set > 0 ? found.browser : null;
}

module.exports = {
  applyChromeLinkedInSession,
  collectLinkedInCookies,
  // Exported for synthetic (non-credential) unit tests:
  _internals: { decryptCookieValue, cookiesFromBuffer, loadSqlJs, EPOCH_DIFF_SECONDS },
};
