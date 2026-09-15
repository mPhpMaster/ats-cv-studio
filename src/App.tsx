import { useEffect, useMemo, useState } from 'react';
import Builder from './components/Builder';
import Checker from './components/Checker';
import AiSettingsDialog from './components/AiSettingsDialog';
import InterviewPage from './components/InterviewPage';
import { I18nContext, messages } from './i18n';
import { isDesktop } from './lib/download';
import { sampleCV } from './lib/sample';
import type { CVData, Lang } from './types';

type Tab = 'build' | 'check' | 'interview';

function usePersistent<T>(key: string, initial: () => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial();
    } catch {
      return initial();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export default function App() {
  const [lang, setLang] = usePersistent<Lang>('ats.lang', () => (navigator.language?.startsWith('ar') ? 'ar' : 'en'));
  const t = messages[lang];
  const [tab, setTab] = useState<Tab>('build');
  const [cv, setCv] = usePersistent<CVData>('ats.cv', () => sampleCV(lang));
  const [jobDescription, setJobDescription] = usePersistent<string>('ats.jd', () => '');
  const [importNotice, setImportNotice] = useState<string | null>(null);
  /** The AI connection settings live behind their own button, not buried inside the AI dialogs. */
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
    document.title = `${lang === 'ar' ? 'استوديو السيرة الذاتية ATS' : 'ATS CV Studio'} ${__APP_VERSION__}`;
  }, [lang, t.dir]);

  const i18n = useMemo(() => ({ lang, t, setLang }), [lang, t, setLang]);

  const openInBuilder = (next: CVData, source: string) => {
    setCv(next);
    setImportNotice(source);
    setTab('build');
  };

  return (
    <I18nContext.Provider value={i18n}>
      <div className="app">
        <header className="topbar no-print">
          <div className="brand">
            <span className="logo">ATS</span>
            <div>
              <strong>{t.app.title} <span className="app-version" dir="ltr">v{__APP_VERSION__}</span></strong>
              <small>{t.app.subtitle}</small>
            </div>
          </div>
          <nav className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'build'} className={tab === 'build' ? 'active' : ''} onClick={() => setTab('build')}>
              {t.app.tabBuild}
            </button>
            <button role="tab" aria-selected={tab === 'check'} className={tab === 'check' ? 'active' : ''} onClick={() => setTab('check')}>
              {t.app.tabCheck}
            </button>
            <button role="tab" aria-selected={tab === 'interview'} className={tab === 'interview' ? 'active' : ''} onClick={() => setTab('interview')}>
              🗨 {t.interview.tab}
            </button>
          </nav>
          {/* Desktop only: the settings are written to a file on this computer, which the web build has no access to. */}
          {isDesktop() && (
            <button className="lang-switch" onClick={() => setSettingsOpen(true)} title={t.ai.settingsTitle}>
              ⚙ {t.ai.openSettings}
            </button>
          )}
          <button className="lang-switch" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} lang={lang === 'ar' ? 'en' : 'ar'}>
            {t.switchLabel}
          </button>
        </header>

        {/* Both views stay mounted so switching tabs keeps uploads and scroll position. */}
        <div hidden={tab !== 'build'}>
          <Builder
            cv={cv}
            setCv={setCv}
            jobDescription={jobDescription}
            setJobDescription={setJobDescription}
            importNotice={importNotice}
            onDismissNotice={() => setImportNotice(null)}
            onImported={openInBuilder}
            onOpenInterview={() => setTab('interview')}
          />
        </div>
        <div hidden={tab !== 'check'} className="no-print">
          <Checker jobDescription={jobDescription} setJobDescription={setJobDescription} onOpenInBuilder={openInBuilder} />
        </div>
        {/* Mounted only while open so the interview starts fresh and no microphone is left listening. */}
        {tab === 'interview' && (
          <div className="no-print">
            <InterviewPage cv={cv} jobDescription={jobDescription} onApplied={openInBuilder} />
          </div>
        )}
        {settingsOpen && <AiSettingsDialog onClose={() => setSettingsOpen(false)} />}
      </div>
    </I18nContext.Provider>
  );
}
