import { Component, type ErrorInfo, type ReactNode } from 'react';
import { messages } from '../i18n';
import type { Lang } from '../types';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last resort for a render that throws. Without it a single bad object in localStorage takes the app down on
 * every launch — the render throws, nothing is drawn, and the offending object is reloaded next time, so the
 * user has no way back except clearing browser storage by hand.
 *
 * Clearing is offered, never done automatically: the stored CV may be the user's only copy, and a crash is
 * not authority to delete it. The JSON is offered for download first, so nothing is lost by recovering.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept in the console so a bug report can carry the real stack, not a screenshot of the message.
    console.error('ATS CV Studio crashed while rendering:', error, info.componentStack);
  }

  /** Hands back whatever is stored before the user decides whether to delete it. */
  private saveStored = () => {
    try {
      const raw = localStorage.getItem('ats.cv') ?? '';
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ats-cv-backup.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { /* storage unreadable — the clear button is still the way out */ }
  };

  private clearStored = () => {
    try {
      localStorage.removeItem('ats.cv');
      localStorage.removeItem('ats.jd');
    } catch { /* nothing more we can do */ }
    location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // The i18n context is above this boundary and may itself be gone, so the language is read directly.
    const stored = (() => {
      try { return localStorage.getItem('ats.lang'); } catch { return null; }
    })();
    const lang: Lang = stored?.includes('ar') ? 'ar' : 'en';
    const t = messages[lang].crash;

    return (
      <div className="crash" dir={messages[lang].dir}>
        <div className="crash-card">
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
          <p className="muted small-note" dir="ltr" style={{ userSelect: 'text' }}>{String(error.message || error)}</p>
          <div className="row-actions">
            <button className="primary" onClick={() => location.reload()}>{t.retry}</button>
            <button onClick={this.saveStored}>{t.download}</button>
            <button onClick={this.clearStored}>{t.clear}</button>
          </div>
          <p className="muted small-note">{t.clearNote}</p>
        </div>
      </div>
    );
  }
}
