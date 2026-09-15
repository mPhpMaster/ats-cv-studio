// Imports the user's own LinkedIn profile from its link.
//
// LinkedIn has no public API for reading profiles and blocks anonymous requests, so the profile is opened in a
// visible LinkedIn window with its own persistent session. The user signs in there themselves (the app never sees
// credentials or cookies), then the visible text of the profile's detail pages is read and returned to the renderer,
// which maps it to CV fields (src/lib/linkedin.ts → parseLinkedInScrape).
'use strict';
const { BrowserWindow, shell } = require('electron');
const { applyChromeLinkedInSession } = require('./chromeCookies.cjs');

const PROFILE_URL_RE = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/([^/?#\s]+)\/?/i;
const SECTIONS = ['experience', 'education', 'skills', 'certifications', 'languages', 'projects'];
const LOGIN_PATH_RE = /^\/(login|signup|authwall|checkpoint|uas|signin|m\/login)/i;
const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------------------------------------------------------
 * The functions below run inside the LinkedIn page (serialized with toString), so they must be self-contained.
 * They rely on stable structure — <main>, <h1>, list items and LinkedIn's aria-hidden "visible text" spans — rather
 * than LinkedIn's frequently changing class names.
 * ---------------------------------------------------------------------------------------------------------------- */

function pageProfileReady() {
  if (!/^\/in\//.test(location.pathname)) return false;
  if (document.querySelector('main h1')) return true;
  // LinkedIn's current (server-driven) profile page has no <h1>: the name is an <h2> that matches "Name | LinkedIn".
  const name = (document.title.split('|')[0] || '').replace(/\s+/g, ' ').trim();
  if (!name || /^linkedin$/i.test(name)) return false;
  return [...document.querySelectorAll('main h2, main h1')].some((h) => h.innerText.replace(/\s+/g, ' ').trim() === name);
}

function pageReadTop() {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const titleName = clean(document.title.split('|')[0]);
  const nameHeading = [...document.querySelectorAll('main h1, main h2')].find((h) => clean(h.innerText) === titleName);
  if (!document.querySelector('main h1') && nameHeading) {
    // Current LinkedIn layout: name <h2> inside a profile card; the lines below it are headline, location, badges.
    const card = nameHeading.closest('[componentkey^="com.linkedin.sdui.profile.card"]') || nameHeading.closest('section') || nameHeading.parentElement;
    const cardLines = (card ? card.innerText : '').split('\n').map(clean).filter(Boolean);
    const at = cardLines.indexOf(titleName);
    const topLines = cardLines.slice(at >= 0 ? at + 1 : 0, (at >= 0 ? at + 1 : 0) + 10);
    const aboutHeading = [...document.querySelectorAll('main h2')].find((h) => /^(about|نبذة عني|نبذة)$/i.test(clean(h.innerText)));
    let about = '';
    if (aboutHeading) {
      const aboutCard = aboutHeading.closest('[componentkey^="com.linkedin.sdui.profile.card"]') || aboutHeading.parentElement.parentElement;
      const texts = [...aboutCard.querySelectorAll('p, span')].map((el) => el.innerText.trim()).filter((t) => t && clean(t) !== clean(aboutHeading.innerText));
      about = texts.sort((a, b) => b.length - a.length)[0] || '';
    }
    return { name: titleName, headline: topLines[0] || '', location: '', about, topLines };
  }
  const h1 = document.querySelector('main h1');
  const card = h1 ? h1.closest('section') : null;
  const pick = (selector) => {
    const el = card ? card.querySelector(selector) : null;
    return clean(el ? el.innerText : '');
  };
  const aboutAnchor = document.getElementById('about');
  const aboutSection = aboutAnchor ? aboutAnchor.closest('section') : null;
  let about = '';
  if (aboutSection) {
    // The About text is the longest visible text block in its section (the heading is short).
    const texts = [...aboutSection.querySelectorAll('span[aria-hidden="true"]')].map((s) => s.innerText.trim()).filter(Boolean);
    about = texts.sort((a, b) => b.length - a.length)[0] || '';
  }
  return {
    name: clean(h1 ? h1.innerText : ''),
    headline: pick('.text-body-medium'),
    location: pick('.text-body-small.inline') || pick('span.text-body-small'),
    about,
  };
}

function pageListReady() {
  const main = document.querySelector('main');
  if (!main) return false;
  return main.querySelectorAll('[componentkey^="entity-collection-item"]').length > 0
    || main.querySelectorAll('li').length > 0
    || /nothing to see|no .+ (added|yet)|لا يوجد|لم تتم إضافة/i.test(main.innerText);
}

function pageScrollStep() {
  document.querySelectorAll('main button').forEach((b) => {
    if (/show more results|عرض المزيد من النتائج/i.test(b.innerText)) b.click();
  });
  window.scrollTo(0, document.body.scrollHeight);
  return document.body.scrollHeight;
}

function pageReadList() {
  const clean = (s) => (s || '').replace(/[ \t ]+/g, ' ').trim();
  const main = document.querySelector('main');
  if (!main) return [];

  // Current LinkedIn layout: each entry is an "entity-collection-item"; visible lines are <p> elements, and a company
  // with several roles nests them in ul > li.
  const ITEM = '[componentkey^="entity-collection-item"]';
  const entities = [...main.querySelectorAll(ITEM)].filter((el) => !el.parentElement.closest(ITEM));
  if (entities.length) {
    const linesOf = (root, exclude) => {
      const out = [];
      const nodes = [...root.querySelectorAll('p')].filter((p) => !exclude.some((x) => x.contains(p)));
      const texts = nodes.length ? nodes.map((p) => p.innerText) : [root.innerText];
      for (const text of texts) {
        for (const part of String(text).split('\n')) {
          const t = clean(part);
          if (t && out[out.length - 1] !== t) out.push(t);
        }
      }
      return out;
    };
    return entities
      .map((entity) => {
        const roles = [...entity.querySelectorAll('li')].filter((li) => !li.parentElement.closest('li'));
        return {
          lines: linesOf(entity, roles),
          children: roles.map((li) => ({ lines: linesOf(li, []), children: [] })),
        };
      })
      .filter((e) => e.lines.length || e.children.length);
  }

  const read = (li) => {
    const lines = [];
    const push = (text) => {
      for (const part of String(text).split('\n')) {
        const t = clean(part);
        if (t && lines[lines.length - 1] !== t) lines.push(t);
      }
    };
    const children = [...li.querySelectorAll('li')].filter((c) => c.parentElement.closest('li') === li);
    // aria-hidden spans hold LinkedIn's visible text; the screen-reader copies next to them would duplicate every line.
    const spans = [...li.querySelectorAll('span[aria-hidden="true"]')]
      .filter((s) => s.closest('li') === li && !s.parentElement.closest('span[aria-hidden="true"]'));
    if (!spans.length) {
      push(li.innerText);
      return { lines, children: [] };
    }
    spans.forEach((s) => push(s.innerText));
    return { lines, children: children.map(read) };
  };
  return [...main.querySelectorAll('li')]
    .filter((li) => !li.parentElement.closest('li'))
    .map(read)
    .filter((e) => e.lines.length || e.children.length);
}

function pageOpenContactInfo() {
  // Current layout: the contact dialog only opens from the "Contact info" link on the profile (client-side navigation).
  const link = [...document.querySelectorAll('main a, main button, main [role=button]')]
    .find((el) => /^(contact info|معلومات الاتصال)$/i.test((el.innerText || '').replace(/\s+/g, ' ').trim()));
  if (!link) return false;
  link.click();
  return true;
}

function pageReadContact() {
  const CONTACT_HEADING = /^(contact info|معلومات الاتصال)$/i;
  const candidates = [...document.querySelectorAll('dialog, [role="dialog"], .artdeco-modal')];
  const hasContactHeading = (d) => [...d.querySelectorAll('h1, h2, h3')].some((h) => CONTACT_HEADING.test(h.innerText.trim()));
  const hasContactContent = (d) => !!d.querySelector('a[href^="mailto:"], a[href^="tel:"]') || [...d.querySelectorAll('section h3')].some((h) => /phone|email|هاتف|البريد/i.test(h.innerText));
  // LinkedIn keeps other (empty) dialogs on the page, so prefer the one titled "Contact info".
  const dialog = candidates.find(hasContactHeading) || candidates.find(hasContactContent);
  if (!dialog) return null;
  // LinkedIn wraps external links in linkedin.com/redir/…?url=<target>; unwrap them.
  const unwrap = (href) => {
    try {
      const u = new URL(href);
      if (/(^|\.)linkedin\.com$/i.test(u.hostname) && /\/(redir|safety)\//i.test(u.pathname)) return u.searchParams.get('url') || '';
    } catch { /* not a URL */ }
    return href;
  };
  const hrefs = [...dialog.querySelectorAll('a[href]')].map((a) => a.href);
  const emails = hrefs.filter((h) => /^mailto:/i.test(h)).map((h) => decodeURIComponent(h.replace(/^mailto:/i, '')));
  const websites = hrefs.map(unwrap).filter((h) => {
    try { return /^https?:/i.test(h) && !/(^|\.)linkedin\.com$/i.test(new URL(h).hostname); } catch { return false; }
  });
  const phoneText = (t) => t.replace(/\s*\([^)]*\)\s*$/, '');
  const isPhone = (t) => t.replace(/\D/g, '').length >= 7 && t.length < 30 && !/@|linkedin|\/|(19|20)\d{2}\s*$/i.test(t);
  const phones = [];
  dialog.querySelectorAll('section').forEach((section) => {
    const heading = section.querySelector('h3');
    if (!heading || !/phone|هاتف/i.test(heading.innerText)) return;
    section.querySelectorAll('span, li').forEach((el) => {
      const t = el.innerText.trim();
      if (isPhone(t)) phones.push(phoneText(t));
    });
  });
  if (!phones.length) {
    // Current layout has no per-field sections: take leaf text that looks like a phone number.
    dialog.querySelectorAll('p, span').forEach((el) => {
      if (el.children.length) return;
      const t = el.innerText.trim();
      if (isPhone(t)) phones.push(phoneText(t));
    });
  }
  // Nothing rendered yet: return null so the caller keeps waiting for the dialog's content.
  if (!emails.length && !phones.length && !websites.length && !dialog.querySelector('a[href], p')) return null;
  return { emails: [...new Set(emails)], phones: [...new Set(phones)], websites: [...new Set(websites)] };
}

/** Covers the LinkedIn page with a "please wait" notice while the app reads it (outside <main>, so readers are unaffected). */
function pageShowImportOverlay(texts) {
  if (document.getElementById('ats-import-overlay')) return true;
  const style = document.createElement('style');
  style.textContent = '@keyframes ats-spin{to{transform:rotate(360deg)}}';
  const overlay = document.createElement('div');
  overlay.id = 'ats-import-overlay';
  overlay.setAttribute('aria-live', 'polite');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;'
    + 'background:rgba(248,250,252,.88);backdrop-filter:blur(2px);font-family:Segoe UI,Tahoma,Arial,sans-serif;';
  const card = document.createElement('div');
  card.style.cssText = 'background:#fff;border:1px solid #dbe2ec;border-inline-start:4px solid #2f7df6;border-radius:10px;'
    + 'box-shadow:0 20px 45px -22px rgba(30,41,59,.55);padding:22px 26px;max-width:460px;text-align:center;color:#1e293b;';
  const spinner = document.createElement('div');
  spinner.style.cssText = 'width:34px;height:34px;margin:0 auto 12px;border-radius:50%;border:4px solid #dbe8fd;border-top-color:#2f7df6;animation:ats-spin .8s linear infinite;';
  card.appendChild(spinner);
  texts.forEach((text, i) => {
    const line = document.createElement('div');
    line.textContent = text;
    line.dir = 'auto';
    line.style.cssText = i < 2 ? 'font-size:17px;font-weight:700;margin:4px 0;' : 'font-size:13px;color:#64748b;margin-top:10px;';
    card.appendChild(line);
  });
  overlay.appendChild(card);
  document.documentElement.appendChild(style);
  document.documentElement.appendChild(overlay);
  return true;
}

/** Shown inside the LinkedIn window, in the language the user set for the app itself. */
const TEXTS = {
  en: {
    overlay: [
      'Importing your profile… please wait',
      'Please keep this window open',
      'It closes automatically when the import is done',
    ],
    signIn: 'LinkedIn — sign in to continue the import',
    importing: 'LinkedIn — importing your profile, please wait…',
  },
  ar: {
    overlay: [
      'جارٍ استيراد بروفايلك… يرجى الانتظار',
      'من فضلك أبقِ هذه النافذة مفتوحة',
      'ستُغلق تلقائيًا عند انتهاء الاستيراد',
    ],
    signIn: 'LinkedIn — سجّل الدخول لإكمال الاستيراد',
    importing: 'LinkedIn — جارٍ استيراد بروفايلك، يرجى الانتظار…',
  },
};

/* ------------------------------------------------------------------------------------------------------------------ */

const inPage = (win, fn) => win.webContents.executeJavaScript(`(${fn.toString()})()`, true);

async function load(win, url) {
  try {
    await win.loadURL(url);
  } catch {
    // LinkedIn often redirects client-side, which aborts the original navigation; the page still loads.
  }
}

async function poll(win, fn, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end && !win.isDestroyed()) {
    try {
      const value = await inPage(win, fn);
      if (value) return value;
    } catch { /* page is navigating */ }
    await sleep(700);
  }
  return null;
}

let active = null;

async function importLinkedInProfile(parent, rawUrl, options = {}, onProgress = () => {}) {
  const match = String(rawUrl || '').trim().match(PROFILE_URL_RE);
  if (!match) return { ok: false, error: 'invalid-url' };
  let lastStage = '';
  const report = (stage, detail) => {
    const key = `${stage}:${detail ?? ''}`;
    if (key === lastStage) return;
    lastStage = key;
    try { onProgress({ stage, detail }); } catch { /* renderer gone */ }
  };
  // Browser cookies are read only when the user explicitly opted in (a missing option means off).
  const useChrome = options.useChrome === true;
  const texts = TEXTS[options.lang === 'ar' ? 'ar' : 'en'];
  if (active && !active.isDestroyed()) {
    active.focus();
    return { ok: false, error: 'busy' };
  }

  const base = `https://www.linkedin.com/in/${match[1]}/`;
  const win = new BrowserWindow({
    parent: parent ?? undefined,
    width: 1100,
    height: 860,
    title: 'LinkedIn',
    autoHideMenuBar: true,
    webPreferences: { partition: 'persist:linkedin', contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  active = win;
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  let closed = false;
  win.on('closed', () => { closed = true; });
  const alive = () => !closed && !win.isDestroyed();

  // Once reading starts, re-show the "please wait" notice on every page LinkedIn loads.
  let reading = false;
  const showOverlay = () =>
    win.webContents.executeJavaScript(`(${pageShowImportOverlay.toString()})(${JSON.stringify(texts.overlay)})`, true).catch(() => {});
  win.webContents.on('dom-ready', () => { if (reading) showOverlay(); });

  let usedBrowser = null;
  try {
    report('opening');
    // Reuse the browser the user is already signed into (Chrome/Edge/Brave), so no manual sign-in is needed.
    if (useChrome) {
      try { usedBrowser = await applyChromeLinkedInSession(win.webContents.session); } catch { usedBrowser = null; }
    }
    await load(win, base);

    // Wait for the profile to be visible. If LinkedIn asks the user to sign in, they do it in this window.
    const deadline = Date.now() + SIGN_IN_TIMEOUT_MS;
    let lastNudge = 0;
    for (;;) {
      if (!alive()) return { ok: false, error: 'cancelled' };
      if (Date.now() > deadline) return { ok: false, error: 'timeout' };
      if (await inPage(win, pageProfileReady).catch(() => false)) break;
      let current;
      try { current = new URL(win.webContents.getURL() || base); } catch { current = new URL(base); }
      const onLogin = LOGIN_PATH_RE.test(current.pathname);
      if (onLogin) {
        report('signin');
        win.setTitle(texts.signIn);
      }
      // After signing in LinkedIn lands on the feed; send the window back to the profile.
      if (!onLogin && !/^\/in\//.test(current.pathname) && /(^|\.)linkedin\.com$/i.test(current.hostname)
        && !win.webContents.isLoading() && Date.now() - lastNudge > 5000) {
        lastNudge = Date.now();
        await load(win, base);
      }
      await sleep(800);
    }

    win.setTitle(texts.importing);
    reading = true;
    await showOverlay();
    report('profile');
    await sleep(1500);
    // Profile cards (About, …) load lazily: scroll to load them and retry until About appears (or give up after ~6s).
    let top = await inPage(win, pageReadTop);
    for (let i = 0; i < 8 && !top.about; i++) {
      await inPage(win, pageScrollStep).catch(() => 0);
      await sleep(750);
      top = await inPage(win, pageReadTop).catch(() => top);
    }
    const data = { url: base, ...top, contact: { emails: [], phones: [], websites: [] } };

    for (const section of SECTIONS) {
      if (!alive()) return { ok: false, error: 'cancelled' };
      report('section', section);
      await load(win, `${base}details/${section}/`);
      const ready = await poll(win, pageListReady, 12000);
      if (ready) {
        let height = 0;
        for (let i = 0; i < 10; i++) {
          const h = await inPage(win, pageScrollStep).catch(() => 0);
          await sleep(700);
          if (h === height) break;
          height = h;
        }
      }
      data[section] = ready ? await inPage(win, pageReadList).catch(() => []) : [];
    }

    if (alive()) {
      report('contact');
      // Open contact info from the profile's own link (the overlay URL alone no longer opens the dialog).
      await load(win, base);
      await poll(win, pageProfileReady, 15000);
      await sleep(1000);
      const opened = await inPage(win, pageOpenContactInfo).catch(() => false);
      if (!opened) await load(win, `${base}overlay/contact-info/`);
      const contact = await poll(win, pageReadContact, 8000);
      if (contact) data.contact = contact;
    }
    report('done');
    return { ok: true, data, usedBrowser };
  } catch (e) {
    return { ok: false, error: closed ? 'cancelled' : 'failed', message: String((e && e.message) || e) };
  } finally {
    active = null;
    if (!win.isDestroyed()) win.close();
  }
}

module.exports = {
  importLinkedInProfile,
  PROFILE_URL_RE,
  // Exported for tests that run the page readers against fixture HTML.
  pageReaders: { pageProfileReady, pageReadTop, pageListReady, pageReadList, pageOpenContactInfo, pageReadContact },
};
