// Which browser cookies the LinkedIn import may take. A synthetic in-memory database only: no real browser
// profile is opened, and every value is stored unencrypted so no key is involved.
import { electron, reporter } from './helpers.mjs';

const { _internals } = electron('chromeCookies.cjs');
const { ok, done } = reporter();

const SQL = await _internals.loadSqlJs();
const db = new SQL.Database();
db.run('CREATE TABLE cookies (host_key TEXT, name TEXT, encrypted_value BLOB, value TEXT, path TEXT, expires_utc INTEGER, is_secure INTEGER, is_httponly INTEGER, samesite INTEGER)');
for (const host of ['.linkedin.com', 'www.linkedin.com', 'linkedin.com', '.notlinkedin.com', 'evillinkedin.com', 'linkedin.com.evil.example', '.example.com']) {
  db.run('INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [host, 'c', new Uint8Array(0), `v-${host}`, '/', 0, 1, 1, 1]);
}
const buffer = Buffer.from(db.export());
db.close();

const hosts = _internals.cookiesFromBuffer(SQL, buffer, null).map((c) => c.domain).sort();
console.log('  taken:', hosts.join(', '));
ok('linkedin.com is taken', hosts.includes('linkedin.com'));
ok('its subdomains are taken', hosts.includes('.linkedin.com') && hosts.includes('www.linkedin.com'));
// A bare suffix match also took the cookies of any site whose name merely ends that way.
ok('notlinkedin.com is NOT taken', !hosts.includes('.notlinkedin.com'));
ok('evillinkedin.com is NOT taken', !hosts.includes('evillinkedin.com'));
ok('linkedin.com.evil.example is NOT taken', !hosts.includes('linkedin.com.evil.example'));
ok('an unrelated site is NOT taken', !hosts.includes('.example.com'));

done();
