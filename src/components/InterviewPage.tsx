import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { analyzeCV } from '../lib/analyzer';
import { applyAiResponse, buildAiPrompt, issueLines } from '../lib/aiPrompt';
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

/**
 * The interview on its own page: the assistant asks, the user answers by typing or by voice, and the app
 * carries the conversation. Kept apart from the prompt dialogs so there is no read-only box to get stuck in.
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
  const [finished, setFinished] = useState<{ cv: CVData; notes: string[]; before: number; after: number } | null>(null);

  const [transcribing, setTranscribing] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

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
  const question = [...visible].reverse().find((m) => m.role === 'assistant')?.content ?? '';

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chat, running]);
  useEffect(() => () => {
    try {
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      if (recorder.current?.state === 'recording') recorder.current.stop();
    } catch { /* already gone */ }
  }, []);

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
      setChat([...history, { role: 'assistant', content: res.text }]);
      try {
        const applied = applyAiResponse(cv, res.text, 'interview');
        const after = analyze(applied.cv);
        setFinished({ cv: applied.cv, notes: applied.notes, before: result.score, after: after.score });
      } catch {
        /* Not the finished CV — it is the next question, already in the transcript. */
      }
    } finally {
      setRunning(false);
    }
  }

  const send = (text: string) => {
    const said = text.trim();
    if (!said || running) return;
    stopListening();
    setAnswer('');
    sendTurn([...chat, { role: 'user', content: said }]);
  };

  function stopListening() {
    setListening(false);
    try {
      if (recorder.current?.state === 'recording') recorder.current.stop();
    } catch { /* not running */ }
  }

  /** Sends the finished recording to the provider and drops the transcription into the answer box. */
  async function transcribe(blob: Blob) {
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
            : res.error === 'empty' ? v.micNothing : v.micFailed);
        return;
      }
      setAnswer((current) => (current.trim() ? `${current.trim()} ${res.text}` : res.text));
    } catch {
      setMicNote(v.micFailed);
    } finally {
      setTranscribing(false);
    }
  }

  async function startListening() {
    setMicNote('');
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

  if (!canChat) {
    return (
      <main className="checker interview-page">
        <section className="card"><h3>🗨 {v.title}</h3><p className="muted">{v.desktopOnly}</p></section>
      </main>
    );
  }

  return (
    <main className="checker interview-page">
      <section className="card">
        <div className="card-head">
          <h3>🗨 {v.title}</h3>
          {chat.length > 0 && <span className="muted">{v.answered(answers)}</span>}
        </div>
        <p className="muted">{v.intro}</p>

        {chat.length === 0 && !finished && (
          <div className="row-actions">
            <button className="primary" disabled={running} onClick={() => sendTurn([{ role: 'user', content: prompt }])}>
              {running ? v.thinking : `🗨 ${v.start}`}
            </button>
          </div>
        )}

        {visible.length > 0 && (
          <div className="chat-log" dir="auto">
            {visible.map((m, i) => (
              <p key={i} className={m.role === 'assistant' ? 'chat-ai' : 'chat-you'}>
                <strong>{m.role === 'assistant' ? v.ai : v.you}: </strong>{m.content}
              </p>
            ))}
            <div ref={endRef} />
          </div>
        )}

        {running && <p className="hint">{v.thinking}</p>}

        {!finished && chat.length > 0 && !running && (
          <>
            {question && <h3 dir="auto">{question}</h3>}
            <textarea rows={4} dir="auto" value={answer} placeholder={v.answerPh} autoFocus
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(answer); }} />
            {listening && <p className="hint">🎙 {v.micRecording}</p>}
            {transcribing && <p className="hint">{v.micTranscribing}</p>}
            {micNote && <p className="muted small-note">{micNote}</p>}
            <div className="row-actions">
              <button className="primary" disabled={!answer.trim()} onClick={() => send(answer)}>{v.send}</button>
              <button onClick={() => (listening ? stopListening() : startListening())}>
                {listening ? `⏹ ${v.micStop}` : `🎙 ${v.mic}`}
              </button>
              <button onClick={() => send('skip')}>{v.skip}</button>
              <button onClick={() => { setChat([]); setAnswer(''); setFinished(null); setError(''); }}>{v.restart}</button>
            </div>
          </>
        )}

        {error && <p className="error">{error}</p>}
        {errorDetail && <p className="muted small-note" dir="ltr">{errorDetail}</p>}

        {finished && (
          <>
            <p className="score-change">{v.scoreLine(finished.before, finished.after)}</p>
            <p className="muted">{v.done}</p>
            {finished.notes.length > 0 && (
              <ul dir="auto">{finished.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            )}
            <div className="row-actions">
              <button className="primary" onClick={() => onApplied(finished.cv, v.tab)}>{v.apply}</button>
              <button onClick={() => { setChat([]); setAnswer(''); setFinished(null); }}>{v.restart}</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
