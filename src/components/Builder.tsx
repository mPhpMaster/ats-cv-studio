import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { analyzeCV, leadingActionVerb } from '../lib/analyzer';
import { gapLines, type AiMode } from '../lib/aiPrompt';
import { lightNormalize } from '../lib/arabic';
import { cvToText } from '../lib/cvText';
import { ACCENTS, FONTS, TEMPLATES, cvLang, getDesign } from '../lib/design';
import { WEAK_FIXES } from '../lib/dictionaries';
import { downloadBlob, savePdf } from '../lib/download';
import { emptyCV, sampleCV, uid } from '../lib/sample';
import { useSpellChecker } from '../lib/spell';
import type { Certification, CheckFix, CVData, Design, Education, Experience, Lang, Personal, Project } from '../types';
import AiEnhanceDialog from './AiEnhanceDialog';
import CVPreview from './CVPreview';
import ImportDialog, { type ImportTab } from './ImportDialog';
import { CompactReport } from './Report';

interface Props {
  cv: CVData;
  setCv: (cv: CVData | ((prev: CVData) => CVData)) => void;
  jobDescription: string;
  setJobDescription: (v: string) => void;
  importNotice: string | null;
  onDismissNotice: () => void;
  onImported: (cv: CVData, source: string) => void;
}

const PRESENT: Record<Lang, string> = { en: 'Present', ar: 'حتى الآن' };

const DATE_OK = /^((0[1-9]|1[0-2])\/(19|20)\d{2}|present|current|حتى الآن|حتى الان|الحالي|حاليا)?$/i;
const DATE_OR_YEAR_OK = /^((0[1-9]|1[0-2])\/(19|20)\d{2}|(19|20)\d{2}|present|current|حتى الآن|حتى الان|الحالي|حاليا)?$/i;

function Field({ label, value, onChange, placeholder, type = 'text', error, dir = 'auto' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; error?: string; dir?: 'ltr' | 'auto';
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} dir={dir} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={error ? 'invalid' : ''} />
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

function Area({ label, value, onChange, placeholder, rows = 4, children }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; children?: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea rows={rows} dir="auto" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {children}
    </label>
  );
}

function Panel({ title, children, defaultOpen = true, count }: { title: string; children: ReactNode; defaultOpen?: boolean; count?: number }) {
  return (
    <details className="panel" open={defaultOpen}>
      <summary>{title}{count !== undefined && <span className="count">{count}</span>}</summary>
      <div className="panel-body">{children}</div>
    </details>
  );
}

/** Per-bullet coaching: action verb, measurable result, repetition, length and one-click wording fixes. */
function BulletHints({ text, repeated, onChange }: { text: string; repeated: Set<string>; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const raw = text.split('\n');
  const rows = raw.map((line, index) => ({ line: line.replace(/^[-•*]\s*/, '').trim(), index })).filter((r) => r.line);
  if (!rows.length) return null;

  const applyFix = (index: number, fix: (typeof WEAK_FIXES)[number]) => {
    const next = [...raw];
    let fixed = raw[index].replace(/^[-•*]\s*/, '').trim().replace(fix.re, fix.to);
    if (/^[a-z]/.test(fixed)) fixed = fixed[0].toUpperCase() + fixed.slice(1);
    next[index] = fixed;
    onChange(next.join('\n'));
  };

  return (
    <ul className="bullet-hints">
      {rows.map(({ line, index }) => {
        const verb = leadingActionVerb(line);
        const number = /\d/.test(lightNormalize(line));
        const long = line.split(/\s+/).length > 35;
        const fix = WEAK_FIXES.find((f) => f.re.test(line));
        const ok = verb && number && !long && !(verb && repeated.has(verb));
        return (
          <li key={index} className={ok ? 'ok' : 'todo'}>
            <span className="bh-text" dir="auto">{line.length > 60 ? `${line.slice(0, 60)}…` : line}</span>
            <span className={verb ? 'tag ok' : 'tag'}>{verb ? t.builder.hintVerb : t.builder.hintNoVerb}</span>
            <span className={number ? 'tag ok' : 'tag'}>{number ? t.builder.hintNumber : t.builder.hintNoNumber}</span>
            {verb && repeated.has(verb) && <span className="tag">{t.builder.hintRepeated}</span>}
            {long && <span className="tag">{t.builder.hintLong}</span>}
            {fix && <button type="button" className="tag-btn" onClick={() => applyFix(index, fix)}>✨ {t.builder.fix}</button>}
          </li>
        );
      })}
    </ul>
  );
}

export default function Builder({ cv, setCv, jobDescription, setJobDescription, importNotice, onDismissNotice, onImported }: Props) {
  const { t, lang: uiLang } = useI18n();
  const b = t.builder;
  const [busy, setBusy] = useState(false);
  const [showText, setShowText] = useState(false);
  const [importTab, setImportTab] = useState<ImportTab | null>(null);
  const [aiMode, setAiMode] = useState<AiMode | null>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const importMenu = useRef<HTMLDetailsElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  /** Open or close every editor section at once. Panels stay individually toggleable afterwards. */
  const setAllPanels = (open: boolean) => {
    editorRef.current?.querySelectorAll<HTMLDetailsElement>('details.panel').forEach((panel) => { panel.open = open; });
  };

  const spell = useSpellChecker();
  const lang = cvLang(cv);
  const design = getDesign(cv);
  const text = useMemo(() => cvToText(cv), [cv]);
  const result = useMemo(
    () => analyzeCV(text, jobDescription, { kind: 'builder' }, { lang: uiLang, cv, spell }),
    [text, jobDescription, uiLang, cv, spell],
  );
  /** Open report issues — drives the "Fix issues with AI" button. */
  const openIssues = useMemo(
    () => result.checks.filter((c) => c.severity === 'warn' || c.severity === 'fail').length,
    [result],
  );
  /** What the CV is still missing — drives the "Complete with AI questions" button. */
  const gaps = useMemo(() => gapLines(cv, uiLang), [cv, uiLang]);

  /** Apply a spelling fix everywhere it appears in the CV (whole words only). */
  const applyFix = ({ from, to }: CheckFix) => {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
    const replaceDeep = (value: unknown): unknown => {
      if (typeof value === 'string') return value.replace(re, to);
      if (Array.isArray(value)) return value.map(replaceDeep);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'id' || k === 'design' ? v : replaceDeep(v)]));
      }
      return value;
    };
    setCv((c) => replaceDeep(c) as CVData);
  };

  /** Same capitalization and ending punctuation for every bullet (majority rule for the final period). */
  const makeBulletsConsistent = () =>
    setCv((c) => {
      const all = c.experience.flatMap((e) => e.bullets.split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean));
      const periods = all.filter((l) => /\.$/.test(l)).length > all.length / 2;
      const fixLine = (l: string) => {
        let s = l.replace(/^[-•*▪●◦➢➤►]\s*/, '').trim().replace(/\s{2,}/g, ' ');
        if (!s) return '';
        if (/^[a-z]/.test(s)) s = s[0].toUpperCase() + s.slice(1);
        s = s.replace(/[.;,]+$/, '');
        return periods ? `${s}.` : s;
      };
      return {
        ...c,
        experience: c.experience.map((e) => ({ ...e, bullets: e.bullets.split('\n').map(fixLine).filter(Boolean).join('\n') })),
      };
    });

  const repeatedVerbs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of cv.experience) {
      for (const line of e.bullets.split('\n')) {
        const v = leadingActionVerb(line);
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }
    return new Set([...counts].filter(([, n]) => n >= 3).map(([v]) => v));
  }, [cv.experience]);

  const setPersonal = (k: keyof Personal, v: string) => setCv((c) => ({ ...c, personal: { ...c.personal, [k]: v } }));
  const set = <K extends keyof CVData>(k: K, v: CVData[K]) => setCv((c) => ({ ...c, [k]: v }));
  const setDesign = (patch: Partial<Design>) => setCv((c) => ({ ...c, design: { ...getDesign(c), ...patch } }));

  const changeCvLanguage = (next: Lang) =>
    setCv((c) => {
      const from = PRESENT[cvLang(c)];
      return {
        ...c,
        language: next,
        experience: c.experience.map((e) => (e.endDate === from ? { ...e, endDate: PRESENT[next] } : e)),
      };
    });

  function listOps<T extends { id: string }>(key: 'experience' | 'education' | 'certifications' | 'projects', blank: () => T) {
    const items = cv[key] as unknown as T[];
    const save = (next: T[]) => set(key, next as never);
    return {
      items,
      add: () => save([...items, blank()]),
      update: (id: string, patch: Partial<T>) => save(items.map((it) => (it.id === id ? { ...it, ...patch } : it))),
      remove: (id: string) => save(items.filter((it) => it.id !== id)),
      move: (id: string, dir: -1 | 1) => {
        const i = items.findIndex((it) => it.id === id);
        const j = i + dir;
        if (j < 0 || j >= items.length) return;
        const copy = [...items];
        [copy[i], copy[j]] = [copy[j], copy[i]];
        save(copy);
      },
    };
  }

  const exp = listOps<Experience>('experience', () => ({ id: uid(), jobTitle: '', company: '', location: '', startDate: '', endDate: '', bullets: '' }));
  const edu = listOps<Education>('education', () => ({ id: uid(), degree: '', school: '', location: '', startDate: '', endDate: '', details: '' }));
  const certs = listOps<Certification>('certifications', () => ({ id: uid(), name: '', issuer: '', date: '' }));
  const projects = listOps<Project>('projects', () => ({ id: uid(), name: '', link: '', description: '' }));

  const baseName = `${(cv.personal.fullName || 'CV').trim().replace(/\s+/g, '_')}_CV`;
  const dateError = (v: string, allowYear = false) =>
    ((allowYear ? DATE_OR_YEAR_OK : DATE_OK).test(lightNormalize(v).trim()) ? undefined : b.dateError);

  async function onDocx() {
    setBusy(true);
    try {
      const { exportDocx } = await import('../lib/exportDocx');
      await downloadBlob(await exportDocx(cv), `${baseName}.docx`);
    } finally {
      setBusy(false);
    }
  }

  function onPdf() {
    if (showText) setShowText(false);
    // Let the formatted preview render before printing.
    setTimeout(() => savePdf(baseName), showText ? 80 : 0);
  }

  function onImportJson(file: File) {
    file.text().then((raw) => {
      try {
        const data = JSON.parse(raw) as CVData;
        if (!data.personal) throw new Error('invalid');
        onImported(data, file.name);
      } catch {
        alert(b.invalidJson);
      }
    });
  }

  const openImport = (tab: ImportTab | 'json') => {
    if (importMenu.current) importMenu.current.open = false;
    if (tab === 'json') jsonInput.current?.click();
    else setImportTab(tab);
  };

  const addKeyword = (k: string) => set('skills', [cv.skills.trim(), k].filter(Boolean).join(lang === 'ar' ? '، ' : ', '));

  const ItemTools = ({ id, remove, move }: { id: string; remove: (id: string) => void; move: (id: string, d: -1 | 1) => void }) => (
    <div className="item-tools">
      <button type="button" className="icon-btn" title={b.moveUp} aria-label={b.moveUp} onClick={() => move(id, -1)}>↑</button>
      <button type="button" className="icon-btn" title={b.moveDown} aria-label={b.moveDown} onClick={() => move(id, 1)}>↓</button>
      <button type="button" className="icon-btn danger" title={b.remove} aria-label={b.remove} onClick={() => remove(id)}>✕</button>
    </div>
  );

  return (
    <main className="builder">
      <div className="toolbar no-print">
        <div className="group">
          <details className="dropdown" ref={importMenu}>
            <summary className="btn">⤓ {b.import}</summary>
            <div className="menu">
              <button onClick={() => openImport('file')}>📄 {b.importFile}</button>
              <button onClick={() => openImport('linkedin')}>in {b.importLinkedIn}</button>
              <button onClick={() => openImport('json')}>{'{ }'} {b.importJson}</button>
            </div>
          </details>
          <input ref={jsonInput} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImportJson(f); }} />
          <button className="ai-btn" onClick={() => setAiMode('enhance')}>✨ {b.aiEnhance}</button>
          <button className="ai-btn" disabled={!openIssues} title={openIssues ? undefined : t.ai.noIssues} onClick={() => setAiMode('fix')}>
            🛠 {b.aiFix}{openIssues ? ` (${openIssues})` : ''}
          </button>
          <button className="ai-btn" title={gaps.length ? undefined : t.ai.noGaps} onClick={() => setAiMode('interview')}>
            🎤 {b.aiInterview}{gaps.length ? ` (${gaps.length})` : ''}
          </button>
          <button onClick={() => setCv(sampleCV(lang))}>{b.loadSample}</button>
          <button onClick={() => confirm(b.confirmClear) && setCv({ ...emptyCV(lang), design: cv.design })}>{b.newBlank}</button>
          <button onClick={() => downloadBlob(new Blob([JSON.stringify(cv, null, 2)], { type: 'application/json' }), `${baseName}.json`)}>{b.saveJson}</button>
        </div>
        <div className="group">
          <div className="segmented" role="group" aria-label={b.cvLanguage} title={b.cvLanguage}>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => changeCvLanguage('en')}>EN</button>
            <button className={lang === 'ar' ? 'active' : ''} onClick={() => changeCvLanguage('ar')}>ع</button>
          </div>
          <button className="primary" onClick={onPdf}>{b.downloadPdf}</button>
          <button className="primary" onClick={onDocx} disabled={busy}>{busy ? b.building : b.downloadDocx}</button>
          <button onClick={() => downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${baseName}.txt`)}>{b.txt}</button>
        </div>
      </div>

      {importNotice && (
        <div className="notice no-print">
          <span>{b.importedBanner(importNotice)}</span>
          <button className="link" onClick={onDismissNotice}>{b.dismiss}</button>
        </div>
      )}

      <div className="builder-grid">
        <div className="editor no-print" ref={editorRef}>
          <div className="row-actions panel-tools">
            <button type="button" onClick={() => setAllPanels(true)}>⤢ {b.expandAll}</button>
            <button type="button" onClick={() => setAllPanels(false)}>⤡ {b.collapseAll}</button>
          </div>
          <Panel title={b.targetJob} defaultOpen={!jobDescription}>
            <Area label={b.targetJobLabel} rows={5} value={jobDescription} onChange={setJobDescription} placeholder={b.targetJobPlaceholder} />
          </Panel>

          <Panel title={b.design} defaultOpen={false}>
            <div className="field">
              <span>{b.template}</span>
              <div className="template-picker">
                {TEMPLATES.map((id) => (
                  <button key={id} type="button" className={`template-card ${design.template === id ? 'active' : ''}`} onClick={() => setDesign({ template: id })}>
                    <span className={`tpl-thumb tpl-${id}`} style={{ '--cv-accent': design.accent } as React.CSSProperties}><i /><i /><i /><i /></span>
                    <strong>{b.templates[id]}</strong>
                    <small>{b.templateHints[id]}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid2">
              <label className="field">
                <span>{b.font}</span>
                <select value={design.font} onChange={(e) => setDesign({ font: e.target.value })}>
                  {FONTS[lang].map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                </select>
              </label>
              <div className="field">
                <span>{b.accent}</span>
                <div className="swatches">
                  {ACCENTS.map((c) => (
                    <button key={c} type="button" className={`swatch ${design.accent === c ? 'active' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setDesign({ accent: c })} />
                  ))}
                </div>
              </div>
            </div>
            <p className="muted small-note">{b.atsSafeNote}</p>
          </Panel>

          <Panel title={b.personal}>
            <div className="grid2">
              <Field label={b.fullName} value={cv.personal.fullName} onChange={(v) => setPersonal('fullName', v)} />
              <Field label={b.title} value={cv.personal.title} onChange={(v) => setPersonal('title', v)} placeholder={b.titlePlaceholder} />
              <Field label={b.email} type="email" dir="ltr" value={cv.personal.email} onChange={(v) => setPersonal('email', v)} />
              <Field label={b.phone} dir="ltr" value={cv.personal.phone} onChange={(v) => setPersonal('phone', v)} placeholder="+1 555 123 4567" />
              <Field label={b.location} value={cv.personal.location} onChange={(v) => setPersonal('location', v)} />
              <Field label={b.linkedin} dir="ltr" value={cv.personal.linkedin} onChange={(v) => setPersonal('linkedin', v)} placeholder="linkedin.com/in/your-name" />
              <Field label={b.website} dir="ltr" value={cv.personal.website} onChange={(v) => setPersonal('website', v)} />
            </div>
          </Panel>

          <Panel title={b.summary}>
            <Area label={b.summaryLabel} rows={4} value={cv.summary} onChange={(v) => set('summary', v)} />
          </Panel>

          <Panel title={b.experience} count={exp.items.length}>
            {exp.items.map((e) => (
              <fieldset key={e.id} className="item">
                <ItemTools id={e.id} remove={exp.remove} move={exp.move} />
                <div className="grid2">
                  <Field label={b.jobTitle} value={e.jobTitle} onChange={(v) => exp.update(e.id, { jobTitle: v })} />
                  <Field label={b.company} value={e.company} onChange={(v) => exp.update(e.id, { company: v })} />
                  <Field label={b.location} value={e.location} onChange={(v) => exp.update(e.id, { location: v })} />
                  <div className="grid2 tight">
                    <Field label={b.start} value={e.startDate} placeholder={b.startPh} error={dateError(e.startDate)} onChange={(v) => exp.update(e.id, { startDate: v })} />
                    <Field label={b.end} value={e.endDate} placeholder={b.endPh} error={dateError(e.endDate)} onChange={(v) => exp.update(e.id, { endDate: v })} />
                  </div>
                </div>
                <Area label={b.bulletsLabel} rows={5} value={e.bullets} onChange={(v) => exp.update(e.id, { bullets: v })} placeholder={b.bulletsPh}>
                  <BulletHints text={e.bullets} repeated={repeatedVerbs} onChange={(v) => exp.update(e.id, { bullets: v })} />
                </Area>
              </fieldset>
            ))}
            <div className="row-actions">
              <button type="button" className="add" onClick={exp.add}>{b.addPosition}</button>
              {exp.items.length > 0 && <button type="button" onClick={makeBulletsConsistent}>{b.makeConsistent}</button>}
            </div>
          </Panel>

          <Panel title={b.education} count={edu.items.length}>
            {edu.items.map((e) => (
              <fieldset key={e.id} className="item">
                <ItemTools id={e.id} remove={edu.remove} move={edu.move} />
                <div className="grid2">
                  <Field label={b.degree} value={e.degree} onChange={(v) => edu.update(e.id, { degree: v })} placeholder={b.degreePh} />
                  <Field label={b.school} value={e.school} onChange={(v) => edu.update(e.id, { school: v })} />
                  <Field label={b.location} value={e.location} onChange={(v) => edu.update(e.id, { location: v })} />
                  <div className="grid2 tight">
                    <Field label={b.start} value={e.startDate} placeholder={b.startPh} error={dateError(e.startDate, true)} onChange={(v) => edu.update(e.id, { startDate: v })} />
                    <Field label={b.end} value={e.endDate} placeholder={b.startPh} error={dateError(e.endDate, true)} onChange={(v) => edu.update(e.id, { endDate: v })} />
                  </div>
                </div>
                <Area label={b.detailsLabel} rows={2} value={e.details} onChange={(v) => edu.update(e.id, { details: v })} placeholder={b.detailsPh} />
              </fieldset>
            ))}
            <button type="button" className="add" onClick={edu.add}>{b.addEducation}</button>
          </Panel>

          <Panel title={b.skills}>
            <Area label={b.skillsLabel} rows={3} value={cv.skills} onChange={(v) => set('skills', v)} placeholder={b.skillsPh} />
            {result.keywords.missing.length > 0 && (
              <div className="suggest">
                <span className="muted">{b.missingKeywords}</span>
                {result.keywords.missing.slice(0, 15).map((k) => (
                  <button key={k} type="button" className="chip missing" onClick={() => addKeyword(k)}>+ {k}</button>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={b.certifications} count={certs.items.length} defaultOpen={false}>
            {certs.items.map((c) => (
              <fieldset key={c.id} className="item">
                <ItemTools id={c.id} remove={certs.remove} move={certs.move} />
                <div className="grid3">
                  <Field label={b.certName} value={c.name} onChange={(v) => certs.update(c.id, { name: v })} />
                  <Field label={b.issuer} value={c.issuer} onChange={(v) => certs.update(c.id, { issuer: v })} />
                  <Field label={b.year} value={c.date} onChange={(v) => certs.update(c.id, { date: v })} />
                </div>
              </fieldset>
            ))}
            <button type="button" className="add" onClick={certs.add}>{b.addCert}</button>
          </Panel>

          <Panel title={b.projects} count={projects.items.length} defaultOpen={false}>
            {projects.items.map((pr) => (
              <fieldset key={pr.id} className="item">
                <ItemTools id={pr.id} remove={projects.remove} move={projects.move} />
                <div className="grid2">
                  <Field label={b.projectName} value={pr.name} onChange={(v) => projects.update(pr.id, { name: v })} />
                  <Field label={b.link} dir="ltr" value={pr.link} onChange={(v) => projects.update(pr.id, { link: v })} />
                </div>
                <Area label={b.descLabel} rows={3} value={pr.description} onChange={(v) => projects.update(pr.id, { description: v })} />
              </fieldset>
            ))}
            <button type="button" className="add" onClick={projects.add}>{b.addProject}</button>
          </Panel>

          <Panel title={b.languages} defaultOpen={false}>
            <Area label={b.languagesLabel} rows={2} value={cv.languages} onChange={(v) => set('languages', v)} placeholder={b.languagesPh} />
          </Panel>
        </div>

        <div className="preview-col">
          <div className="no-print">
            <CompactReport result={result} onAddKeyword={addKeyword} onFix={applyFix} />
            <button className="link" onClick={() => setShowText((s) => !s)}>
              {showText ? b.showPreview : b.showAtsText}
            </button>
          </div>
          {showText ? <pre className="plain-text no-print" dir="auto">{text}</pre> : <CVPreview cv={cv} />}
        </div>
      </div>

      {importTab && (
        <ImportDialog tab={importTab} onTab={setImportTab} onClose={() => setImportTab(null)} onImported={onImported} />
      )}
      {aiMode && (
        <AiEnhanceDialog
          cv={cv}
          jobDescription={jobDescription}
          result={result}
          mode={aiMode}
          analyze={(next) => analyzeCV(cvToText(next), jobDescription, { kind: 'builder' }, { lang: uiLang, cv: next, spell })}
          onClose={() => setAiMode(null)}
          onApply={(next) => {
            const source = aiMode === 'fix' ? t.ai.fixSource : aiMode === 'interview' ? t.ai.interviewSource : t.ai.source;
            onImported(next, source);
            setAiMode(null);
          }}
        />
      )}
    </main>
  );
}
