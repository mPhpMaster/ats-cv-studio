import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { AiResponseError, applyAiResponse, buildAiPrompt, gapLines, issueLines, type AiApplyResult, type AiMode } from '../lib/aiPrompt';
import type { AiMessage, AiSettings } from '../lib/download';
import type { AnalysisResult, CVData } from '../types';
import AiSettingsDialog from './AiSettingsDialog';

const AI_SITES = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Claude', url: 'https://claude.ai/new' },
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
];

interface Props {
  cv: CVData;
  jobDescription: string;
  result: AnalysisResult;
  /** Full report for a candidate CV, computed exactly like the builder's live report. */
  analyze: (cv: CVData) => AnalysisResult;
  /** "enhance" rewrites the CV; "fix" only repairs the issues the report found. */
  mode?: AiMode;
  onClose: () => void;
  onApply: (cv: CVData) => void;
}

export default function AiEnhanceDialog({ cv, jobDescription, result, analyze, mode = 'enhance', onClose, onApply }: Props) {
  const { t, lang } = useI18n();
  const a = t.ai;
  const hasJob = jobDescription.trim().length > 40;
  const [tailor, setTailor] = useState(hasJob);
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  /** The provider's own wording for a failure — without it the user only sees "something went wrong". */
  const [errorDetail, setErrorDetail] = useState('');
  const [preview, setPreview] = useState<(AiApplyResult & { score: number; remaining: string[] }) | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  /** The connection settings are edited in their own dialog, which this can open on top of itself. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  /** The running interview: the whole conversation is kept so the assistant remembers what it already asked. */
  const [chat, setChat] = useState<AiMessage[] | null>(null);
  const [answer, setAnswer] = useState('');
  const canChat = typeof window !== 'undefined' && typeof window.desktop?.aiChat === 'function';
  /** Only the desktop build can reach a provider directly; the web build keeps the copy/paste flow. */
  const canRunAuto = typeof window !== 'undefined' && typeof window.desktop?.aiComplete === 'function';
  /** A hosted provider needs a key; a custom endpoint needs a URL instead. */
  const aiReady = Boolean(settings && (settings.provider === 'custom' ? settings.baseUrl : settings.hasKey));
  /** The settings dialog does the writing; this only picks up whatever it changed. */
  const refreshSettings = () => {
    window.desktop?.aiSettingsGet?.().then(setSettings).catch(() => setSettings(null));
  };

  useEffect(refreshSettings, []);

  const issues = useMemo(() => issueLines(result), [result]);
  const gaps = useMemo(() => gapLines(cv, lang), [cv, lang]);
  const useJob = hasJob && (mode === 'enhance' ? tailor : true);
  const prompt = useMemo(
    () => buildAiPrompt({ cv, jobDescription: useJob ? jobDescription : '', result, uiLang: lang, mode }),
    [cv, jobDescription, useJob, result, lang, mode],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const area = document.getElementById('ai-prompt') as HTMLTextAreaElement | null;
      area?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /** Ask the configured provider directly, then land on the same preview the manual paste produces. */
  async function runWithAi() {
    if (!canRunAuto) return;
    setError('');
    setErrorDetail('');
    setRunning(true);
    try {
      const res = await window.desktop!.aiComplete!(prompt);
      if (!res.ok) {
        setError((a.aiErrors as Record<string, string>)[res.error] ?? a.aiErrors.http);
        // Already scrubbed of the API key in the main process, so it is safe to show.
        setErrorDetail(res.message ?? '');
        return;
      }
      setReply(res.text);
      onPreview(res.text);
    } finally {
      setRunning(false);
    }
  }

  /**
   * One turn of the interview. The assistant either asks the next question or sends the finished CV, and the
   * only reliable way to tell them apart is to try to apply the reply: a question will not parse as a CV.
   */
  async function sendTurn(history: AiMessage[]) {
    setError('');
    setErrorDetail('');
    setChat(history);
    setRunning(true);
    try {
      const res = await window.desktop!.aiChat!(history);
      if (!res.ok) {
        setError((a.aiErrors as Record<string, string>)[res.error] ?? a.aiErrors.http);
        setErrorDetail(res.message ?? '');
        return;
      }
      setChat([...history, { role: 'assistant', content: res.text }]);
      try {
        const applied = applyAiResponse(cv, res.text, 'interview');
        const after = analyze(applied.cv);
        setReply(res.text);
        setPreview({ ...applied, score: after.score, remaining: issueLines(after) });
      } catch {
        /* Not the final CV yet — the reply is the next question, already shown in the transcript. */
      }
    } finally {
      setRunning(false);
    }
  }

  const startChat = () => sendTurn([{ role: 'user', content: prompt }]);

  const answerChat = (text: string) => {
    setAnswer('');
    sendTurn([...(chat ?? []), { role: 'user', content: text }]);
  };

  function onPreview(text = reply) {
    setError('');
    setErrorDetail('');
    try {
      const applied = applyAiResponse(cv, text, mode);
      // Re-run the full report so the dialog can say exactly which issues the AI could not clear, and why.
      const after = analyze(applied.cv);
      setPreview({ ...applied, score: after.score, remaining: issueLines(after) });
    } catch (e) {
      setError(e instanceof AiResponseError && e.code === 'no-json' ? a.errNoJson : a.errInvalid);
    }
  }

  const changedRoles = preview
    ? preview.cv.experience.filter((e, i) => i < cv.experience.length && e.bullets !== cv.experience[i]?.bullets)
    : [];

  /** Fields and entries that were empty before — new content from the user's answers, not a rewrite. */
  const added = useMemo(() => {
    if (!preview) return [];
    const out: string[] = [];
    const fields: [keyof CVData['personal'], string][] = [
      ['fullName', t.builder.fullName], ['title', t.builder.title], ['email', t.builder.email],
      ['phone', t.builder.phone], ['location', t.builder.location],
      ['linkedin', t.builder.linkedin], ['website', t.builder.website],
    ];
    for (const [key, label] of fields) {
      if (!cv.personal[key].trim() && preview.cv.personal[key].trim()) out.push(`${label}: ${preview.cv.personal[key]}`);
    }
    const join = (...parts: string[]) => parts.filter(Boolean).join(' – ');
    for (const e of preview.cv.experience.slice(cv.experience.length)) out.push(`${t.builder.experience}: ${join(e.jobTitle, e.company)}`);
    for (const e of preview.cv.education.slice(cv.education.length)) out.push(`${t.builder.education}: ${join(e.degree, e.school)}`);
    for (const c of preview.cv.certifications.slice(cv.certifications.length)) out.push(`${t.builder.certifications}: ${c.name}`);
    for (const p of preview.cv.projects.slice(cv.projects.length)) out.push(`${t.builder.projects}: ${p.name}`);
    if (!cv.languages.trim() && preview.cv.languages.trim()) out.push(`${t.builder.languages}: ${preview.cv.languages}`);
    return out;
  }, [preview, cv, t]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 id="ai-title">{
            mode === 'fix' ? `🛠 ${a.fixTitle}`
              : mode === 'interview' ? `🎤 ${a.interviewTitle}`
                : mode === 'translate' ? `🌐 ${a.translateTitle}`
                  : `✨ ${a.title}`
          }</h2>
          <button className="icon-btn" onClick={onClose} aria-label={a.cancel}>✕</button>
        </header>

        {!preview ? (
          <div className="modal-body">
            <p>{
              mode === 'fix' ? a.fixIntro
                : mode === 'interview' ? a.interviewIntro
                  : mode === 'translate' ? a.translateIntro
                    : a.intro
            }</p>

            {mode === 'fix' ? (
              <section className="ai-change">
                <h4>{a.issuesTitle(issues.length)}</h4>
                {issues.length
                  ? <ul dir="auto">{issues.map((line, i) => <li key={i}>{line.replace(/^- /, '')}</li>)}</ul>
                  : <p className="muted">{a.noIssues}</p>}
              </section>
            ) : mode === 'interview' ? (
              <section className="ai-change">
                {gaps.length > 0 && <h4>{a.gapsTitle(gaps.length)}</h4>}
                {gaps.length
                  ? <ul dir="auto">{gaps.map((line, i) => <li key={i}>{line.replace(/^- /, '')}</li>)}</ul>
                  : <p className="muted">{a.noGaps}</p>}
              </section>
            ) : mode === 'enhance' ? (
              <>
                <label className="check-row">
                  <input type="checkbox" checked={tailor && hasJob} disabled={!hasJob} onChange={(e) => setTailor(e.target.checked)} />
                  <span>{a.tailor}</span>
                </label>
                {!hasJob && <p className="muted small-note">{a.tailorNeedsJob}</p>}
              </>
            ) : null}

            {mode === 'interview' && canChat && aiReady && (
              <section className="import-option">
                <h3>🗨 {a.chatStart}</h3>
                <p className="muted small-note">{a.chatIntro}</p>

                {chat && chat.length > 1 && (
                  <div className="ai-change">
                    <h4>{a.chatQuestionCount(chat.filter((m) => m.role === 'assistant').length)}</h4>
                    <ul dir="auto">
                      {chat.slice(1).map((m, i) => (
                        <li key={i}>
                          <strong>{m.role === 'assistant' ? a.chatAi : a.chatYou}: </strong>
                          {m.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {running && <p className="hint">{a.chatThinking}</p>}

                {!chat && !running && (
                  <button className="primary" onClick={startChat}>🗨 {a.chatStart}</button>
                )}

                {chat && !running && (
                  <>
                    <textarea rows={3} dir="auto" value={answer} placeholder={a.chatAnswerPh}
                      onChange={(e) => setAnswer(e.target.value)} />
                    <div className="row-actions">
                      <button className="primary" disabled={!answer.trim()} onClick={() => answerChat(answer)}>{a.chatSend}</button>
                      <button onClick={() => answerChat('skip')}>{a.chatSkip}</button>
                      <button onClick={() => { setChat(null); setAnswer(''); }}>{a.chatRestart}</button>
                    </div>
                  </>
                )}
              </section>
            )}

            {canRunAuto && (
              <section className="import-option">
                <div className="ai-links">
                  <button className="primary" disabled={running || !aiReady} onClick={runWithAi}>
                    {running ? a.running : `⚡ ${a.runNow}`}
                  </button>
                  <span className="muted">{a.autoHint}</span>
                </div>
                {!aiReady && <p className="hint">{a.needsKey}</p>}
                <div className="row-actions">
                  <button type="button" onClick={() => setSettingsOpen(true)}>⚙ {a.openSettings}</button>
                </div>
              </section>
            )}

            <h3>{a.step1}</h3>
            <textarea id="ai-prompt" className="prompt" readOnly rows={8} dir="auto" value={prompt} onFocus={(e) => e.target.select()} />
            <div className="ai-links">
              <button className="primary" onClick={copyPrompt}>{copied ? a.copied : a.copy}</button>
              <span className="muted">{a.open}</span>
              {AI_SITES.map((site) => (
                <button key={site.name} onClick={() => window.open(site.url, '_blank', 'noopener')}>{site.name} ↗</button>
              ))}
            </div>
            <p className="muted small-note">{a.privacy}</p>

            <h3>{a.step2}</h3>
            <textarea rows={8} dir="auto" value={reply} placeholder={a.responsePh} onChange={(e) => setReply(e.target.value)} />
            {error && <p className="error">{error}</p>}
            {errorDetail && (
              <p className="muted small-note" dir="ltr" style={{ userSelect: 'text' }}>
                {a.providerSaid} {errorDetail}
              </p>
            )}
            <div className="row-actions">
              <button className="primary" disabled={!reply.trim()} onClick={() => onPreview()}>{a.preview}</button>
              <button onClick={onClose}>{a.cancel}</button>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <p className="score-change">{a.scoreChange(result.score, preview.score)}</p>
            <p className="muted">{mode === 'interview' ? a.interviewKeptFacts : a.keptFacts}</p>
            {preview.warnings.includes('experience') && <p className="hint">{a.warnExperience}</p>}
            {preview.warnings.includes('projects') && <p className="hint">{a.warnProjects}</p>}

            {preview.cv.personal.title !== cv.personal.title && (
              <section className="ai-change">
                <h4>{t.builder.title}</h4>
                <p dir="auto">{preview.cv.personal.title}</p>
              </section>
            )}
            {preview.cv.summary !== cv.summary && (
              <section className="ai-change">
                <h4>{t.builder.summary}</h4>
                <p dir="auto">{preview.cv.summary}</p>
              </section>
            )}
            {changedRoles.map((role) => (
              <section className="ai-change" key={role.id}>
                <h4 dir="auto">{[role.jobTitle, role.company].filter(Boolean).join(' – ')}</h4>
                <ul dir="auto">{role.bullets.split('\n').map((line, i) => <li key={i}>{line}</li>)}</ul>
              </section>
            ))}
            {preview.cv.skills !== cv.skills && (
              <section className="ai-change">
                <h4>{t.builder.skills}</h4>
                <p dir="auto">{preview.cv.skills}</p>
              </section>
            )}
            {added.length > 0 && (
              <section className="ai-change">
                <h4>{a.addedTitle}</h4>
                <ul dir="auto">{added.map((line, i) => <li key={i}>{line}</li>)}</ul>
              </section>
            )}
            {preview.notes.length > 0 && (
              <section className="ai-change">
                <h4>{a.notesTitle}</h4>
                <ul dir="auto">{preview.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
              </section>
            )}

            {preview.remaining.length > 0 ? (
              <section className="ai-change">
                <h4>{a.stillOpenTitle(preview.remaining.length)}</h4>
                <ul dir="auto">{preview.remaining.map((line, i) => <li key={i}>{line.replace(/^- /, '')}</li>)}</ul>
                {mode !== 'interview' && <p className="muted small-note">{a.stillOpenHint}</p>}
              </section>
            ) : (
              <p className="muted">{a.allClear}</p>
            )}

            <div className="row-actions">
              <button className="primary" onClick={() => onApply(preview.cv)}>{a.apply}</button>
              <button onClick={() => setPreview(null)}>{a.back}</button>
            </div>
          </div>
        )}
        {settingsOpen && <AiSettingsDialog onClose={() => { setSettingsOpen(false); refreshSettings(); }} />}
      </div>
    </div>
  );
}
