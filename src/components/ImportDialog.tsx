import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useI18n } from '../i18n';
import { droppedSections, hasContent, parseCVText } from '../lib/cvParser';
import type { CVData } from '../types';

export type ImportTab = 'file' | 'linkedin';

const LINKEDIN_PROFILE_URL_RE = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/[^/?#\s]+\/?/i;

interface Props {
  tab: ImportTab;
  onTab: (tab: ImportTab) => void;
  onClose: () => void;
  onImported: (cv: CVData, source: string) => void;
}

export default function ImportDialog({ tab, onTab, onClose, onImported }: Props) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [link, setLink] = useState('');
  const [linkRunning, setLinkRunning] = useState(false);
  const [linkStage, setLinkStage] = useState<{ stage: string; detail?: string } | null>(null);
  // Off by default: reading the browser's LinkedIn cookies only happens when the user opts in.
  const [useChrome, setUseChrome] = useState(false);
  const pdfInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const canImportLink = typeof window !== 'undefined' && typeof window.desktop?.linkedinImport === 'function';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(task: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await task();
    } catch (e) {
      console.error('CV import failed:', e);
      const code = (e as { code?: keyof typeof t.checker.errors }).code;
      setError(code && t.checker.errors[code] ? t.checker.errors[code] : t.checker.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const finish = (cv: CVData | null, source: string) => {
    if (!cv || !hasContent(cv)) {
      setError(t.importer.noData);
      return;
    }
    onImported(cv, source);
    onClose();
  };

  const importCvFile = (file: File, expectLinkedIn = false) =>
    run(async () => {
      const { parseFile } = await import('../lib/parseFile');
      const parsed = await parseFile(file);
      if (parsed.linkedin) return finish(parsed.linkedin, `LinkedIn (${file.name})`);
      // Awards, volunteering and publications have no place in the CV yet; say so rather than drop them silently.
      const dropped = droppedSections(parsed.text);
      const left = dropped.length ? ` — ${t.importer.notImported(dropped.map((s) => t.importer.sectionNames[s]).join(lang === 'ar' ? '، ' : ', '))}` : '';
      finish(parseCVText(parsed.text), `${expectLinkedIn ? `${file.name} — ${t.importer.notLinkedIn}` : file.name}${left}`);
    });

  const importLinkedInExport = (files: File[]) =>
    run(async () => {
      const { parseLinkedInExport } = await import('../lib/linkedin');
      finish(await parseLinkedInExport(files), `LinkedIn (${files.map((f) => f.name).join(', ')})`);
    });

  const importFromLink = () => {
    const url = link.trim();
    if (!LINKEDIN_PROFILE_URL_RE.test(url)) {
      setError(t.importer.linkInvalid);
      return;
    }
    setLinkRunning(true);
    setLinkStage({ stage: 'opening' });
    const unsubscribe = window.desktop?.onLinkedinProgress?.((update) => setLinkStage(update));
    run(async () => {
      try {
        // The wait notice is shown inside the LinkedIn window by the main process, which needs to be told the UI language.
        const result = await window.desktop!.linkedinImport!(url, { useChrome, lang });
        if (!result.ok) {
          const messages = {
            'invalid-url': t.importer.linkInvalid,
            busy: t.importer.linkBusy,
            cancelled: t.importer.linkCancelled,
            timeout: t.importer.linkTimeout,
            failed: t.importer.linkFailed,
          };
          if (result.message) console.error('LinkedIn import failed:', result.message);
          setError(messages[result.error] ?? t.importer.linkFailed);
          return;
        }
        const { parseLinkedInScrape } = await import('../lib/linkedin');
        finish(parseLinkedInScrape(result.data), `LinkedIn (${url})`);
      } finally {
        unsubscribe?.();
        setLinkRunning(false);
        setLinkStage(null);
      }
    });
  };

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) importCvFile(file);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 id="import-title">{t.importer.title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t.importer.close}>✕</button>
        </header>
        <nav className="tabs small" role="tablist">
          <button role="tab" aria-selected={tab === 'file'} className={tab === 'file' ? 'active' : ''} onClick={() => onTab('file')}>{t.importer.tabFile}</button>
          <button role="tab" aria-selected={tab === 'linkedin'} className={tab === 'linkedin' ? 'active' : ''} onClick={() => onTab('linkedin')}>{t.importer.tabLinkedIn}</button>
        </nav>

        {tab === 'file' ? (
          <div className="modal-body">
            <p>{t.importer.fileIntro}</p>
            <label
              className={`dropzone ${dragging ? 'drag' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <input type="file" accept=".pdf,.docx,.txt,.doc" className="file-input" disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importCvFile(f); }} />
              <strong>{busy ? t.importer.parsing : t.importer.drop}</strong>
            </label>
          </div>
        ) : (
          <div className="modal-body">
            <div className="import-option">
              <h3>{t.importer.linkTitle}</h3>
              <p>{t.importer.linkIntro}</p>
              {canImportLink ? (
                <form className="link-row" onSubmit={(e) => { e.preventDefault(); importFromLink(); }}>
                  <input
                    type="url"
                    dir="ltr"
                    value={link}
                    placeholder={t.importer.linkPlaceholder}
                    disabled={busy}
                    onChange={(e) => setLink(e.target.value)}
                  />
                  <button className="primary" type="submit" disabled={busy || !link.trim()}>
                    {linkRunning ? t.importer.parsing : t.importer.linkButton}
                  </button>
                </form>
              ) : (
                <p className="hint">{t.importer.linkDesktopOnly}</p>
              )}
              {canImportLink && (
                <label className="check-row">
                  <input type="checkbox" checked={useChrome} disabled={busy} onChange={(e) => setUseChrome(e.target.checked)} />
                  <span>{t.importer.useBrowser}</span>
                </label>
              )}
              {linkRunning && (
                <div className="import-progress" role="status" aria-live="polite">
                  <span className="spinner" aria-hidden="true" />
                  <div>
                    <strong>{t.importer.importingTitle}</strong>
                    <p>{
                      linkStage?.stage === 'signin' ? t.importer.stageSignin
                        : linkStage?.stage === 'profile' ? t.importer.stageProfile
                          : linkStage?.stage === 'section' ? t.importer.stageSection(t.importer.stageSections[linkStage.detail ?? ''] ?? linkStage.detail ?? '')
                            : linkStage?.stage === 'contact' ? t.importer.stageContact
                              : linkStage?.stage === 'done' ? t.importer.stageDone
                                : t.importer.stageOpening
                    }</p>
                    <p className="muted small-note">{t.importer.linkWorking}</p>
                  </div>
                </div>
              )}
            </div>
            <h4>{t.importer.otherWays}</h4>
            <p>{t.importer.linkedinIntro}</p>
            <div className="import-option">
              <h3>{t.importer.pdfTitle}</h3>
              <ol>{t.importer.pdfSteps.map((s) => <li key={s}>{s}</li>)}</ol>
              <button className="primary" disabled={busy} onClick={() => pdfInput.current?.click()}>
                {busy ? t.importer.parsing : t.importer.pdfButton}
              </button>
              <input ref={pdfInput} type="file" accept=".pdf" hidden
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importCvFile(f, true); }} />
            </div>
            <div className="import-option">
              <h3>{t.importer.zipTitle}</h3>
              <ol>{t.importer.zipSteps.map((s) => <li key={s}>{s}</li>)}</ol>
              <button disabled={busy} onClick={() => zipInput.current?.click()}>{t.importer.zipButton}</button>
              <input ref={zipInput} type="file" accept=".zip,.csv" multiple hidden
                onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) importLinkedInExport(files); }} />
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <p className="muted small-note">{t.importer.replaceNote}</p>
      </div>
    </div>
  );
}
