import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useI18n } from '../i18n';
import { analyzeCV, type SourceInfo } from '../lib/analyzer';
import { hasContent, parseCVText } from '../lib/cvParser';
import { cvToText } from '../lib/cvText';
import { buildJobDescriptionPrompt, JOB_PRESETS } from '../lib/jobPresets';
import { useSpellChecker } from '../lib/spell';
import type { CVData } from '../types';
import AiEnhanceDialog from './AiEnhanceDialog';
import CVPreview from './CVPreview';
import { FullReport } from './Report';

/**
 * Three ways to fill the job description, because the box is the single biggest lever on the tailoring score
 * and an empty one silently disables half the report: a ready-made posting to start from, the real posting
 * brought in from a file or the clipboard, or one written by the user's own AI from a job title.
 */
function JobDescriptionTools({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t, lang } = useI18n();
  const c = t.checker;
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const canAi = typeof window !== 'undefined' && typeof window.desktop?.aiComplete === 'function';

  async function fromClipboard() {
    setNote('');
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) onChange(text);
      else setNote(c.jdClipboardFailed);
    } catch {
      setNote(c.jdClipboardFailed);
    }
  }

  async function fromFile(file: File) {
    setNote('');
    setBusy(true);
    try {
      // The same local parser the CV upload uses: PDF, DOCX and TXT, all read on this machine.
      const { parseFile } = await import('../lib/parseFile');
      const parsed = await parseFile(file);
      if (parsed.text.trim()) onChange(parsed.text);
      else setNote(c.jdReadFailed);
    } catch {
      setNote(c.jdReadFailed);
    } finally {
      setBusy(false);
    }
  }

  async function writeWithAi() {
    setNote('');
    if (!title.trim()) { setNote(c.jdAiNeedsTitle); return; }
    if (!canAi) { setNote(c.jdAiNeedsKey); return; }
    setBusy(true);
    try {
      const res = await window.desktop!.aiComplete!(buildJobDescriptionPrompt(title, lang));
      if (res.ok) onChange(res.text.trim());
      // Already scrubbed of the API key in the main process, so it is safe to show.
      else setNote(res.message ?? (t.ai.aiErrors as Record<string, string>)[res.error] ?? t.ai.aiErrors.http);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="jd-tools">
      <div className="chip-row">
        <span className="muted small-note jd-tools-label">{c.jdPresets}</span>
        {JOB_PRESETS.map((p) => (
          <button key={p.id} type="button" className="chip" onClick={() => { setNote(''); onChange(p.text[lang]); }}>
            {p.label[lang]}
          </button>
        ))}
        {value.trim() && <button type="button" className="chip" onClick={() => { setNote(''); onChange(''); }}>✕ {c.jdClear}</button>}
      </div>
      <p className="muted small-note">{c.jdPresetsHint}</p>

      <div className="row-actions">
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>{c.jdFromFile}</button>
        <button type="button" disabled={busy} onClick={fromClipboard}>{c.jdFromClipboard}</button>
        <input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.doc" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) fromFile(f); }} />
      </div>

      {canAi && (
        <div className="row-actions jd-ai">
          <input type="text" dir="auto" value={title} placeholder={c.jdAiTitlePh}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void writeWithAi(); } }} />
          <button type="button" className="primary" disabled={busy || !title.trim()} onClick={writeWithAi}>
            {busy ? c.jdAiRunning : c.jdWithAi}
          </button>
        </div>
      )}

      {note && <p className="muted small-note" dir="auto" style={{ userSelect: 'text' }}>{note}</p>}
    </div>
  );
}

interface Props {
  jobDescription: string;
  setJobDescription: (v: string) => void;
  onOpenInBuilder: (cv: CVData, source: string) => void;
}

function TwoWays({ text, rebuilt, before, after, onOpen }: {
  text: string; rebuilt: CVData; before: number; after: number | null; onOpen: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<'original' | 'ats'>('ats');
  return (
    <div className="two-ways">
      <div className="two-ways-head">
        <strong>📄 {t.report.twoWays}</strong>
        <div className="segmented">
          <button className={view === 'original' ? 'active' : ''} onClick={() => setView('original')}>{t.report.original}</button>
          <button className={view === 'ats' ? 'active' : ''} onClick={() => setView('ats')}>{t.report.atsVersion}</button>
        </div>
      </div>
      {view === 'original' ? (
        <>
          <p className="muted">{t.report.originalNote}</p>
          <pre className="plain-text" dir="auto">{text || t.report.noText}</pre>
        </>
      ) : (
        <>
          <div className="ats-banner">✓ {t.report.atsBanner}</div>
          {after !== null && <p className="score-compare">{t.report.atsVersionScore(before, after)}</p>}
          <div className="preview-frame"><CVPreview cv={rebuilt} /></div>
          <button className="primary" onClick={onOpen}>{t.report.openInBuilder}</button>
        </>
      )}
    </div>
  );
}

export default function Checker({ jobDescription, setJobDescription, onOpenInBuilder }: Props) {
  const { t, lang } = useI18n();
  const spell = useSpellChecker();
  const [text, setText] = useState('');
  const [source, setSource] = useState<SourceInfo>({ kind: 'paste' });
  const [linkedinCV, setLinkedinCV] = useState<CVData | undefined>();
  const [compare, setCompare] = useState<{ cv: CVData; name: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const compareInput = useRef<HTMLInputElement>(null);
  const [aiFix, setAiFix] = useState(false);

  const result = useMemo(
    () => (text.trim() || source.fileName
      ? analyzeCV(text, jobDescription, source, { lang, linkedin: compare?.cv, spell })
      : null),
    [text, jobDescription, source, lang, compare, spell],
  );
  const rebuilt = useMemo(() => (text.trim() ? linkedinCV ?? parseCVText(text) : null), [text, linkedinCV]);
  /** Open findings in the uploaded CV — drives the "Fix issues with AI" button. */
  const openIssues = useMemo(
    () => (result ? result.checks.filter((c) => c.severity === 'warn' || c.severity === 'fail').length : 0),
    [result],
  );
  const rebuiltScore = useMemo(
    () => (rebuilt && hasContent(rebuilt)
      ? analyzeCV(cvToText(rebuilt), jobDescription, { kind: 'builder' }, { lang, cv: rebuilt, linkedin: compare?.cv, spell }).score
      : null),
    [rebuilt, jobDescription, lang, compare, spell],
  );

  const errorMessage = (e: unknown) => {
    const code = (e as { code?: keyof typeof t.checker.errors }).code;
    return code && t.checker.errors[code] ? t.checker.errors[code] : t.checker.errors.generic;
  };

  async function handleFile(file: File) {
    setError('');
    setLoading(true);
    try {
      const { parseFile } = await import('../lib/parseFile');
      const parsed = await parseFile(file);
      setText(parsed.text);
      setSource(parsed.source);
      setLinkedinCV(parsed.linkedin);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCompare(files: File[]) {
    setError('');
    try {
      let profile: CVData | null = null;
      if (files.length === 1 && /\.pdf$/i.test(files[0].name)) {
        const { parseFile } = await import('../lib/parseFile');
        profile = (await parseFile(files[0])).linkedin ?? null;
      } else {
        const { parseLinkedInExport } = await import('../lib/linkedin');
        profile = await parseLinkedInExport(files);
      }
      if (!profile || !profile.experience.length) throw new Error('invalid');
      setCompare({ cv: profile, name: profile.personal.fullName || files[0].name });
    } catch {
      setError(t.checker.linkedinInvalid);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function reset() {
    setText('');
    setSource({ kind: 'paste' });
    setLinkedinCV(undefined);
    setError('');
  }

  return (
    <main className="checker">
      <div className="checker-inputs">
        <section className="card">
          <div className="card-head">
            <h3>{t.checker.yourCv}</h3>
            {result && <button onClick={reset}>⟳ {t.checker.newUpload}</button>}
          </div>
          <label
            className={`dropzone ${dragging ? 'drag' : ''} ${result ? 'slim' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input type="file" accept=".pdf,.docx,.txt,.doc,image/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f); }} />
            <strong>{loading ? t.checker.reading : source.fileName ?? t.checker.drop}</strong>
            {!result && <span className="muted">{t.checker.localNote}</span>}
          </label>
          {!source.fileName && (
            <details open={source.kind === 'paste' && Boolean(text)}>
              <summary className="muted">{t.checker.pasteToggle}</summary>
              <textarea rows={7} dir="auto" value={text} placeholder={t.checker.pastePh}
                onChange={(e) => { setSource({ kind: 'paste' }); setLinkedinCV(undefined); setText(e.target.value); }} />
            </details>
          )}
        </section>

        <section className="card">
          <h3>{t.checker.jd} <span className="muted">{t.checker.recommended}</span></h3>
          <textarea rows={result ? 5 : 9} dir="auto" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder={t.checker.jdPh} />
          <JobDescriptionTools value={jobDescription} onChange={setJobDescription} />
        </section>

        <section className="card">
          <h3>{t.checker.linkedinTitle} <span className="muted">{t.checker.optional}</span></h3>
          {compare ? (
            <div className="compare-loaded">
              <span>in · {t.checker.linkedinLoaded(compare.name)}</span>
              <button className="link" onClick={() => setCompare(null)}>{t.checker.linkedinRemove}</button>
            </div>
          ) : (
            <>
              <p className="muted">{t.checker.linkedinHelp}</p>
              <button onClick={() => compareInput.current?.click()}>in {t.checker.linkedinUpload}</button>
            </>
          )}
          <input ref={compareInput} type="file" accept=".pdf,.zip,.csv" multiple hidden
            onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) handleCompare(files); }} />
        </section>
      </div>

      {error && <p className="error">{error}</p>}

      {/* Fixing needs the CV as structured data, which only exists once the upload could be parsed. */}
      {result && rebuilt && hasContent(rebuilt) && openIssues > 0 && (
        <div className="row-actions no-print">
          <button className="ai-btn primary" onClick={() => setAiFix(true)}>
            🛠 {t.checker.fixWithAi} ({openIssues})
          </button>
          <span className="muted">{t.checker.fixWithAiNote}</span>
        </div>
      )}

      {aiFix && result && rebuilt && (
        <AiEnhanceDialog
          cv={rebuilt}
          jobDescription={jobDescription}
          result={result}
          mode="fix"
          analyze={(next) => analyzeCV(cvToText(next), jobDescription, { kind: 'builder' }, { lang, cv: next, spell })}
          onClose={() => setAiFix(false)}
          onApply={(next) => { setAiFix(false); onOpenInBuilder(next, t.ai.fixSource); }}
        />
      )}

      {result ? (
        <FullReport
          result={result}
          contentExtra={rebuilt && hasContent(rebuilt) ? (
            <TwoWays
              text={text}
              rebuilt={rebuilt}
              before={result.score}
              after={rebuiltScore}
              onOpen={() => onOpenInBuilder(rebuilt, source.fileName ?? t.report.original)}
            />
          ) : undefined}
        />
      ) : (
        <div className="card how-card">
          <h3>{t.checker.howTitle}</h3>
          <ul className="how">
            {t.checker.how.map(([title, body]) => <li key={title}><b>{title}</b> {body}</li>)}
          </ul>
        </div>
      )}
    </main>
  );
}
