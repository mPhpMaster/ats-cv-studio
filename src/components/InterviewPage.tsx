import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { analyzeCV } from '../lib/analyzer';
import { applyAiResponse, buildAiPrompt } from '../lib/aiPrompt';
import { cvToText } from '../lib/cvText';
import type { AiMessage } from '../lib/download';
import { useSpellChecker } from '../lib/spell';
import type { CVData } from '../types';

interface Props {
  cv: CVData;
  jobDescription: string;
  onApplied: (cv: CVData, source: string) => void;
}

/**
 * Voice answers record audio and send it to the provider's speech-to-text endpoint.
 * Chrome's own SpeechRecognition is deliberately not used: in Electron it always ends in "error: network",
 * because it uploads to a Google service with a key baked into Chrome that Electron builds do not carry.
 */
const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('read failed'));
  reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.readAsDataURL(blob);
});

const OPTIONS_LINE = /^\s*OPTIONS\s*:/i;
/** Answers are separated by a comma in either script, so a picked option can be found and removed again. */
const SEPARATORS = /[,،]/;

/**
 * The assistant ends a question with "OPTIONS: a | b | c". They become one-click answers, and the marker
 * line itself is stripped so the user never sees the machinery. A Latin marker on purpose: it survives an
 * Arabic reply, and it cannot be mistaken for the JSON that ends the interview.
 */
function splitQuestion(text: string): { question: string; options: string[] } {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => OPTIONS_LINE.test(l));
  if (at === -1) return { question: text.trim(), options: [] };
  const options = lines[at]
    .replace(OPTIONS_LINE, '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
  return { question: lines.filter((_, i) => i !== at).join('\n').trim(), options };
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));

/** The prompt asks for questions numbered "(3/7)", in either script — enough to draw a real progress bar. */
function parseProgress(question: string): { done: number; total: number } | null {
  const m = toLatinDigits(question).match(/\(\s*(\d+)\s*\/\s*(\d+)\s*\)/);
  if (!m) return null;
  const done = Number(m[1]);
  const total = Number(m[2]);
  return total > 0 && done > 0 && done <= total ? { done, total } : null;
}

/**
 * The interview on its own page: the assistant asks, the user answers by typing, by voice, or by tapping
 * one of the options the assistant offered, and the app carries the conversation.
 */
export default function InterviewPage({ cv, jobDescription, onApplied }: Props) {
  const { t, lang } = useI18n();
  const v = t.interview;
  const spell = useSpellChecker();

  const [chat, setChat] = useState<AiMessage[]>([]);
  const [answer, setAnswer] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState('');
  /** The provider's own wording for a failure. Without it, a mapped message can only guess at the cause. */
  const [micDetail, setMicDetail] = useState('');
  const [showLog, setShowLog] = useState(false);
  /** The manual path: copy the conversation into any assistant, paste its answer back. */
  const [pasted, setPasted] = useState('');
  const [copied, setCopied] = useState(false);
  const [finished, setFinished] = useState<{ cv: CVData; notes: string[]; before: number; after: number } | null>(null);

  const [transcribing, setTranscribing] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const canChat = typeof window !== 'undefined' && typeof window.desktop?.aiChat === 'function';
  const analyze = (next: CVData) =>
    analyzeCV(cvToText(next), jobDescription, { kind: 'builder' }, { lang, cv: next, spell });
  const result = useMemo(() => analyze(cv), [cv, jobDescription, lang, spell]);

  const prompt = useMemo(
    () => buildAiPrompt({ cv, jobDescription, result, uiLang: lang, mode: 'interview' }),
    [cv, jobDescription, result, lang],
  );

  const visible = chat.slice(1); // the first turn is the instructions, not something the user said
  const answers = visible.filter((m) => m.role === 'user').length;
  const latest = [...visible].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  const { question, options } = useMemo(() => splitQuestion(latest), [latest]);
  const progress = useMemo(() => parseProgress(question), [question]);
  const separator = lang === 'ar' ? '، ' : ', ';
  const chosen = useMemo(
    () => answer.split(SEPARATORS).map((s) => s.trim()).filter(Boolean),
    [answer],
  );

  useEffect(() => () => {
    try {
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      if (recorder.current?.state === 'recording') recorder.current.stop();
    } catch { /* already gone */ }
  }, []);

  /**
   * Takes an assistant reply from wherever it came — the configured provider, or pasted in by hand — and
   * decides what it is. The only reliable test is to try to read it as a CV: a question will not parse.
   */
  function acceptReply(history: AiMessage[], text: string) {
    setChat([...history, { role: 'assistant', content: text }]);
    try {
      const applied = applyAiResponse(cv, text, 'interview');
      const after = analyze(applied.cv);
      setFinished({ cv: applied.cv, notes: applied.notes, before: result.score, after: after.score });
    } catch {
      /* Not the finished CV — it is the next question, already in the transcript. */
    }
  }

  async function sendTurn(history: AiMessage[]) {
    setError('');
    setErrorDetail('');
    setChat(history);
    setRunning(true);
    try {
      const res = await window.desktop!.aiChat!(history);
      if (!res.ok) {
        setError(v.error);
        setErrorDetail(res.message ?? res.error);
        return;
      }
      acceptReply(history, res.text);
    } finally {
      setRunning(false);
    }
  }

  /** The whole conversation as plain text, for pasting into an assistant this app has no key for. */
  function conversationText(): string {
    const history = chat.length ? chat : [{ role: 'user' as const, content: prompt }];
    return history
      .map((m, i) => (i === 0 ? m.content : `${m.role === 'assistant' ? 'ASSISTANT' : 'ME'}: ${m.content}`))
      .join('\n\n');
  }

  async function copyConversation() {
    const text = conversationText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.getElementById('interview-manual-prompt') as HTMLTextAreaElement | null;
      area?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /** Feeds a hand-pasted reply through exactly the same path as one fetched from the provider. */
  function usePastedReply() {
    const text = pasted.trim();
    if (!text) { setError(v.manualEmpty); return; }
    setError('');
    setErrorDetail('');
    const history = chat.length ? chat : [{ role: 'user' as const, content: prompt }];
    setPasted('');
    acceptReply(history, text);
  }

  const send = (text: string) => {
    const said = text.trim();
    if (!said || running) return;
    stopListening();
    setAnswer('');
    setMicNote('');
    setMicDetail('');
    sendTurn([...chat, { role: 'user', content: said }]);
  };

  /** Tapping an option adds it to the answer; tapping it again takes it back out. */
  function togglePick(option: string) {
    setAnswer((current) => {
      const parts = current.split(SEPARATORS).map((s) => s.trim()).filter(Boolean);
      const at = parts.indexOf(option);
      if (at >= 0) parts.splice(at, 1);
      else parts.push(option);
      return parts.join(separator);
    });
    boxRef.current?.focus();
  }

  function restart() {
    setChat([]);
    setAnswer('');
    setFinished(null);
    setError('');
    setErrorDetail('');
    setMicNote('');
    setMicDetail('');
  }

  function stopListening() {
    setListening(false);
    try {
      if (recorder.current?.state === 'recording') recorder.current.stop();
    } catch { /* not running */ }
  }

  /** Sends the finished recording to the provider and drops the transcription into the answer box. */
  async function transcribe(blob: Blob) {
    setMicDetail('');
    if (!blob.size) { setMicNote(v.micNothing); return; }
    if (typeof window.desktop?.aiTranscribe !== 'function') { setMicNote(v.micUnsupported); return; }
    setTranscribing(true);
    try {
      const res = await window.desktop.aiTranscribe(
        await blobToBase64(blob),
        blob.type || 'audio/webm',
        lang === 'ar' ? 'ar' : 'en',
      );
      if (!res.ok) {
        setMicNote(res.error === 'no-transcription' || res.error === 'bad-provider' ? v.micNoProvider
          : res.error === 'no-key' || res.error === 'no-base-url' ? v.micNeedsVoiceKey
            : res.error === 'not-found' ? v.micNotFound
              : res.error === 'bad-base-url' ? t.ai.aiErrors['bad-base-url']
              : res.error === 'empty' ? v.micNothing : v.micFailed);
        // Already scrubbed of the API key in the main process, so it is safe to show.
        setMicDetail(res.message ?? '');
        return;
      }
      setAnswer((current) => (current.trim() ? `${current.trim()} ${res.text}` : res.text));
      boxRef.current?.focus();
    } catch {
      setMicNote(v.micFailed);
    } finally {
      setTranscribing(false);
    }
  }

  async function startListening() {
    setMicNote('');
    setMicDetail('');
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function' || typeof window.MediaRecorder !== 'function') {
      setMicNote(v.micUnsupported);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicNote(v.micDenied);
      return;
    }
    const rec = new MediaRecorder(stream);
    recorder.current = rec;
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      void transcribe(new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' }));
    };
    rec.start();
    setListening(true);
  }

  /** The manual copy/paste path needs no provider at all, so it is offered even when the app has no key. */
  const manualPanel = (
    <details className="panel manual-panel">
      <summary>📋 {v.manualTitle}</summary>
      <div className="panel-body">
        <p className="muted small-note">{v.manualIntro}</p>
        <textarea id="interview-manual-prompt" className="prompt" readOnly rows={7} dir="auto"
          value={conversationText()} onFocus={(e) => e.target.select()} />
        <div className="row-actions">
          <button type="button" onClick={copyConversation}>{copied ? v.manualCopied : `📋 ${v.manualCopy}`}</button>
        </div>
        <textarea rows={5} dir="auto" value={pasted} placeholder={v.manualPastePh}
          onChange={(e) => setPasted(e.target.value)} />
        <div className="row-actions">
          <button type="button" className="primary" disabled={!pasted.trim()} onClick={usePastedReply}>{v.manualUse}</button>
        </div>
      </div>
    </details>
  );

  if (!canChat) {
    return (
      <main className="checker interview-page">
        <section className="card">
          <h3>🗨 {v.title}</h3>
          <p className="muted">{v.desktopOnly}</p>
          {manualPanel}
        </section>
      </main>
    );
  }

  const asking = !finished && chat.length > 0 && !running;

  return (
    <main className="checker interview-page">
      <section className="card">
        <div className="card-head">
          <h3>🗨 {v.title}</h3>
          {chat.length > 0 && (
            <span className="muted">
              {progress ? v.progressLabel(progress.done, progress.total) : v.answered(answers)}
            </span>
          )}
        </div>

        {progress && !finished && (
          <div className="progress-track" role="progressbar" aria-valuenow={progress.done} aria-valuemin={1} aria-valuemax={progress.total}>
            <div className="progress-fill" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
        )}

        {chat.length === 0 && !finished && (
          <>
            <p className="muted">{v.intro}</p>
            <div className="row-actions">
              <button className="primary" disabled={running} onClick={() => sendTurn([{ role: 'user', content: prompt }])}>
                {running ? v.thinking : `🗨 ${v.start}`}
              </button>
            </div>
          </>
        )}

        {running && <p className="hint">{v.thinking}</p>}

        {asking && (
          <>
            {question && (
              <div className="q-card">
                <h3 dir="auto">{question}</h3>
              </div>
            )}

            {options.length > 0 && (
              <>
                <p className="muted small-note">{v.optionsHint}</p>
                <div className="chip-row" dir="auto">
                  {options.map((o) => (
                    <button key={o} type="button" className="chip" aria-pressed={chosen.includes(o)} onClick={() => togglePick(o)}>
                      {chosen.includes(o) ? '✓ ' : '+ '}{o}
                    </button>
                  ))}
                </div>
              </>
            )}

            <textarea ref={boxRef} rows={4} dir="auto" value={answer} placeholder={v.answerPh} autoFocus
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(answer); }} />

            {listening && <p className="hint"><span className="rec-dot" />{v.micRecording}</p>}
            {transcribing && <p className="hint">{v.micTranscribing}</p>}
            {micNote && <p className="muted small-note">{micNote}</p>}
            {micDetail && (
              <p className="muted small-note" dir="ltr" style={{ userSelect: 'text' }}>{t.ai.providerSaid} {micDetail}</p>
            )}

            <div className="row-actions">
              <button className="primary" disabled={!answer.trim() || transcribing} onClick={() => send(answer)}>
                {v.send}
              </button>
              <button className={listening ? 'recording' : ''} disabled={transcribing}
                onClick={() => (listening ? stopListening() : startListening())}>
                {listening ? `⏹ ${v.micStop}` : `🎙 ${v.mic}`}
              </button>
              {/* Sent in the interview's own language: the Arabic prompt tells the model to expect «تخطي»,
                  and the word lands in the visible transcript as the user's own answer. */}
              <button onClick={() => send(lang === 'ar' ? 'تخطي' : 'skip')} disabled={transcribing}>{v.skip}</button>
              <span className="spacer" />
              <button onClick={restart}>{v.restart}</button>
            </div>
            <p className="muted small-note">{v.sendHint}</p>
          </>
        )}

        {error && <p className="error">{error}</p>}
        {errorDetail && <p className="muted small-note" dir="ltr">{errorDetail}</p>}

        {!finished && manualPanel}

        {visible.length > 0 && !finished && (
          <details className="panel" open={showLog} onToggle={(e) => setShowLog((e.target as HTMLDetailsElement).open)}>
            <summary>{v.transcript(answers)}</summary>
            <div className="chat-log" dir="auto">
              {visible.map((m, i) => (
                <p key={i} className={m.role === 'assistant' ? 'chat-ai' : 'chat-you'}>
                  <strong>{m.role === 'assistant' ? v.ai : v.you}: </strong>
                  {m.role === 'assistant' ? splitQuestion(m.content).question : m.content}
                </p>
              ))}
            </div>
          </details>
        )}

        {finished && (
          <>
            <p className="score-change">{v.scoreLine(finished.before, finished.after)}</p>
            <p className="muted">{v.done}</p>
            {finished.notes.length > 0 && (
              <ul dir="auto">{finished.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            )}
            <div className="row-actions">
              <button className="primary" onClick={() => onApplied(finished.cv, v.tab)}>{v.apply}</button>
              <button onClick={restart}>{v.restart}</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
