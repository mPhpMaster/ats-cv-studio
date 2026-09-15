import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useI18n } from '../i18n';
import { analyzeCV, type SourceInfo } from '../lib/analyzer';
import { hasContent, parseCVText } from '../lib/cvParser';
import { cvToText } from '../lib/cvText';
import { useSpellChecker } from '../lib/spell';
import type { CVData } from '../types';
import AiEnhanceDialog from './AiEnhanceDialog';
import CVPreview from './CVPreview';
import { FullReport } from './Report';

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
