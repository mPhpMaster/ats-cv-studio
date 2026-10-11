import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { isDesktop, type AiProvider, type AiSettings, type AiSettingsPatch, type AiVoiceProvider } from '../lib/download';
import { useFeatures } from '../lib/features';

const PROVIDERS: { id: AiProvider; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic (Claude)' },
  { id: 'openai', label: 'OpenAI (ChatGPT)' },
  { id: 'google', label: 'Google (Gemini)' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'custom', label: 'Custom / local (OpenAI-compatible)' },
];

/**
 * Only these offer speech to text. Anthropic and DeepSeek have no such service at all, which is why voice
 * gets its own provider here instead of being tied to whichever provider answers the interview.
 */
const VOICE_PROVIDERS: { id: AiVoiceProvider; label: string }[] = [
  { id: 'openai', label: 'OpenAI (Whisper)' },
  { id: 'google', label: 'Google (Gemini)' },
  { id: 'custom', label: 'Custom / local (OpenAI-compatible)' },
];

/** Suggested models per provider. "Other" stays available so a newer model can always be typed in. */
const MODELS: Record<AiProvider, string[]> = {
  anthropic: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
  // Only the name Google itself named as current is listed: the 1.5, 2.0 and 2.5 names all answer 404 now,
  // and guessing at unreleased ones is what put a dead model in front of the user twice. "Other" is the
  // escape hatch for whatever Google ships next.
  google: ['gemini-3.6-flash'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  custom: [],
};

/** Where each provider hands out API keys. */
const KEY_PAGES: Record<AiProvider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/app/apikey',
  deepseek: 'https://platform.deepseek.com/api_keys',
  custom: '',
};

const OTHER_MODEL = '__other__';

interface Props {
  onClose: () => void;
}

/**
 * Every AI connection setting in one place, opened from the ⚙ button in the top bar. These used to be a
 * collapsed panel inside each AI dialog, which meant the voice settings could only be reached by first
 * opening a dialog for some unrelated reason.
 */
export default function AiSettingsDialog({ onClose }: Props) {
  const { t } = useI18n();
  const { features, setFeature } = useFeatures();
  const a = t.ai;
  const f = t.features;
  /** The AI connection lives in a file on this computer, so those sections only exist in the desktop app. */
  const desktop = isDesktop();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [keyInput, setKeyInput] = useState('');
  /** Kept apart from the chat key: the two can belong to different providers. */
  const [voiceKeyInput, setVoiceKeyInput] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [typeOwnModel, setTypeOwnModel] = useState(false);
  /** Model names fetched from the provider itself; null until asked, and dropped when the provider changes. */
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [modelsNote, setModelsNote] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [voiceModels, setVoiceModels] = useState<string[]>([]);
  const [voiceModelsNote, setVoiceModelsNote] = useState('');
  const [loadingVoiceModels, setLoadingVoiceModels] = useState(false);

  useEffect(() => {
    window.desktop?.aiSettingsGet?.().then(setSettings).catch(() => setSettings(null));
  }, []);

  /**
   * Text fields save on blur, but closing with Escape or a click outside does not blur them in Chromium, so a
   * model name or endpoint typed and then "closed" was silently lost. What is typed is kept here and saved on
   * close. Keys are not: a key is saved only with its own Save button.
   */
  const pending = useRef<Partial<AiSettingsPatch>>({});
  const typed = (field: 'model' | 'baseUrl' | 'voiceBaseUrl' | 'voiceModel', value: string) => { pending.current[field] = value; };
  const close = async () => {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length) {
      try { await window.desktop?.aiSettingsSet?.(patch); } catch { /* the dialog closes regardless */ }
    }
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') void closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const provider: AiProvider = settings?.provider ?? 'anthropic';
  const voiceProvider: AiVoiceProvider | '' = settings?.voiceProvider ?? '';
  const modelList = fetchedModels ?? MODELS[provider];
  const savedModel = settings?.model ?? '';
  /** A model already saved but absent from the list (e.g. a newer one) keeps the free-text box open. */
  const unlistedModel = Boolean(savedModel) && !modelList.includes(savedModel);
  const typedModel = provider === 'custom' || typeOwnModel || unlistedModel;
  const selectedModel = savedModel || settings?.defaultModel || modelList[0] || '';

  /** The provider's own answer beats any list shipped in this app, which goes stale as models are retired. */
  async function loadModels() {
    if (typeof window.desktop?.aiModels !== 'function') return;
    setLoadingModels(true);
    setModelsNote('');
    try {
      const res = await window.desktop.aiModels('chat');
      if (res.ok) {
        setFetchedModels(res.models);
        setTypeOwnModel(false);
        setModelsNote(a.modelsFound(res.models.length));
      } else {
        setModelsNote((a.aiErrors as Record<string, string>)[res.error] ?? a.aiErrors.http);
      }
    } catch {
      setModelsNote(a.aiErrors.http);
    } finally {
      setLoadingModels(false);
    }
  }

  /** The same question for the voice provider, which has its own credentials and its own kind of model. */
  async function loadVoiceModels() {
    if (typeof window.desktop?.aiModels !== 'function') return;
    setLoadingVoiceModels(true);
    setVoiceModelsNote('');
    try {
      const res = await window.desktop.aiModels('stt');
      if (res.ok) {
        setVoiceModels(res.models);
        setVoiceModelsNote(a.modelsFound(res.models.length));
      } else {
        setVoiceModelsNote((a.aiErrors as Record<string, string>)[res.error] ?? a.aiErrors.http);
      }
    } catch {
      setVoiceModelsNote(a.aiErrors.http);
    } finally {
      setLoadingVoiceModels(false);
    }
  }

  async function save(patch: Partial<AiSettingsPatch>) {
    // Switching provider resets the model in the main process, so drop back to its picker too — and a list
    // fetched from the old provider must not be offered for the new one.
    if (patch.provider) {
      setTypeOwnModel(false);
      setFetchedModels(null);
      setModelsNote('');
    }
    const next = await window.desktop!.aiSettingsSet!(patch);
    setSettings(next);
    if (patch.apiKey !== undefined) setKeyInput('');
    if (patch.voiceApiKey !== undefined) setVoiceKeyInput('');
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  return (
    <div className="modal-backdrop" onClick={() => void close()}>
      <div className="modal ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 id="ai-settings-title">⚙ {a.settingsTitle}</h2>
          <button className="icon-btn" onClick={() => void close()} aria-label={a.cancel}>✕</button>
        </header>

        <div className="modal-body">
          {/* Nothing added on top of the CV is compulsory. These switches work in the web build too, which is
              why this section is outside the desktop-only AI settings below. */}
          <section className="import-option">
            <h3>{f.title}</h3>
            <p className="muted small-note">{f.intro}</p>
            {([['donate', f.donate], ['voice', f.voice], ['extras', f.extras]] as const).map(([key, label]) => (
              <label key={key} className="check">
                <input type="checkbox" checked={features[key]} onChange={(e) => setFeature(key, e.target.checked)} />
                <span>{label}</span>
              </label>
            ))}
          </section>

          {!desktop && <p className="muted small-note">{a.desktopOnly}</p>}

          {desktop && (
          <>
          <section className="import-option">
            <h3>{a.connection}</h3>
            <label className="field">
              <span>{a.provider}</span>
              <select value={provider} onChange={(e) => save({ provider: e.target.value as AiProvider })}>
                {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            {provider !== 'custom' && (
              <>
                <label className="field">
                  <span>{a.apiKey}</span>
                  <input type="password" dir="ltr" autoComplete="off" value={keyInput}
                    placeholder={settings?.hasKey ? '••••••••••••' : a.keyPlaceholder}
                    onChange={(e) => setKeyInput(e.target.value)} />
                </label>
                <div className="row-actions">
                  <button disabled={!keyInput.trim()} onClick={() => save({ apiKey: keyInput })}>
                    {savedFlash ? a.saved : a.save}
                  </button>
                  {settings?.hasKey && <button onClick={() => save({ apiKey: '' })}>{a.removeKey}</button>}
                  {KEY_PAGES[provider] && (
                    <button type="button" onClick={() => window.open(KEY_PAGES[provider], '_blank', 'noopener')}>
                      {a.getKey} ↗
                    </button>
                  )}
                </div>
                {settings?.hasKey && <p className="muted small-note">{a.keySaved}</p>}
              </>
            )}
            <label className="field">
              <span>{a.model}</span>
              {typedModel ? (
                <input key={`model-${provider}`} type="text" dir="ltr" defaultValue={savedModel}
                  placeholder={settings?.defaultModel} onChange={(e) => typed('model', e.target.value)}
                  onBlur={(e) => { delete pending.current.model; save({ model: e.target.value }); }} />
              ) : (
                <select value={selectedModel} onChange={(e) => {
                  if (e.target.value === OTHER_MODEL) setTypeOwnModel(true);
                  else save({ model: e.target.value });
                }}>
                  {modelList.map((m) => <option key={m} value={m}>{m}</option>)}
                  <option value={OTHER_MODEL}>{a.otherModel}</option>
                </select>
              )}
            </label>
            {/* The provider is the only authority on which of its models still work. */}
            <div className="row-actions">
              <button type="button" onClick={loadModels} disabled={loadingModels}>
                {loadingModels ? a.modelsLoading : `↻ ${a.refreshModels}`}
              </button>
              {modelsNote && <span className="muted small-note">{modelsNote}</span>}
            </div>
            {provider === 'custom' && (
              <label className="field">
                <span>{a.endpoint}</span>
                <input key="chat-base" type="url" dir="ltr" defaultValue={settings?.baseUrl ?? ''}
                  placeholder="http://localhost:1234" onChange={(e) => typed('baseUrl', e.target.value)}
                  onBlur={(e) => { delete pending.current.baseUrl; save({ baseUrl: e.target.value }); }} />
              </label>
            )}
          </section>

          <section className="import-option">
            <h3>🎙 {a.voiceSection}</h3>
            <p className="muted small-note">{a.voiceIntro}</p>
            <label className="field">
              <span>{a.voiceUse}</span>
              <select value={voiceProvider}
                onChange={(e) => save({ voiceProvider: e.target.value as AiVoiceProvider | '' })}>
                <option value="">{a.voiceSameAsChat}</option>
                {VOICE_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            {voiceProvider && voiceProvider !== 'custom' && (
              <>
                <label className="field">
                  <span>{a.voiceKey}</span>
                  <input type="password" dir="ltr" autoComplete="off" value={voiceKeyInput}
                    placeholder={settings?.hasVoiceKey ? '••••••••••••' : a.keyPlaceholder}
                    onChange={(e) => setVoiceKeyInput(e.target.value)} />
                </label>
                <div className="row-actions">
                  <button disabled={!voiceKeyInput.trim()} onClick={() => save({ voiceApiKey: voiceKeyInput })}>
                    {savedFlash ? a.saved : a.save}
                  </button>
                  {settings?.hasVoiceKey && <button onClick={() => save({ voiceApiKey: '' })}>{a.removeKey}</button>}
                  <button type="button" onClick={() => window.open(KEY_PAGES[voiceProvider], '_blank', 'noopener')}>
                    {a.getKey} ↗
                  </button>
                </div>
              </>
            )}
            {voiceProvider && (
              <>
                <label className="field">
                  <span>{a.voiceModelLabel}</span>
                  {/* Free text with suggestions: transcription model names change as often as chat ones. */}
                  <input key={`voice-model-${voiceProvider}`} type="text" dir="ltr" list="voice-models"
                    defaultValue={settings?.voiceModel ?? ''} placeholder={settings?.defaultVoiceModel}
                    onChange={(e) => typed('voiceModel', e.target.value)}
                    onBlur={(e) => { delete pending.current.voiceModel; save({ voiceModel: e.target.value }); }} />
                  <datalist id="voice-models">
                    {voiceModels.map((m) => <option key={m} value={m} />)}
                  </datalist>
                </label>
                <div className="row-actions">
                  <button type="button" onClick={loadVoiceModels} disabled={loadingVoiceModels}>
                    {loadingVoiceModels ? a.modelsLoading : `↻ ${a.refreshModels}`}
                  </button>
                  {voiceModelsNote && <span className="muted small-note">{voiceModelsNote}</span>}
                </div>
              </>
            )}
            {voiceProvider === 'custom' && (
              <label className="field">
                <span>{a.endpoint}</span>
                <input key="voice-base" type="url" dir="ltr" defaultValue={settings?.voiceBaseUrl ?? ''}
                  placeholder="http://localhost:1234" onChange={(e) => typed('voiceBaseUrl', e.target.value)}
                  onBlur={(e) => { delete pending.current.voiceBaseUrl; save({ voiceBaseUrl: e.target.value }); }} />
              </label>
            )}
            <p className={settings?.voiceReady ? 'muted small-note' : 'hint'}>
              {settings?.voiceReady ? a.voiceReady
                : settings?.voiceCanTranscribe ? a.voiceNotReady : a.voiceNoStt}
            </p>
          </section>

          <p className="muted small-note">{a.keyPrivacy}</p>
          </>
          )}
          <div className="row-actions">
            <button className="primary" onClick={() => void close()}>{a.close}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
