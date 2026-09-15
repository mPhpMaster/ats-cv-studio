import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import type { AiProvider, AiSettings, AiSettingsPatch, AiVoiceProvider } from '../lib/download';

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
  google: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
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
  const a = t.ai;
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [keyInput, setKeyInput] = useState('');
  /** Kept apart from the chat key: the two can belong to different providers. */
  const [voiceKeyInput, setVoiceKeyInput] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [typeOwnModel, setTypeOwnModel] = useState(false);

  useEffect(() => {
    window.desktop?.aiSettingsGet?.().then(setSettings).catch(() => setSettings(null));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const provider: AiProvider = settings?.provider ?? 'anthropic';
  const voiceProvider: AiVoiceProvider | '' = settings?.voiceProvider ?? '';
  const modelList = MODELS[provider];
  const savedModel = settings?.model ?? '';
  /** A model already saved but absent from the list (e.g. a newer one) keeps the free-text box open. */
  const unlistedModel = Boolean(savedModel) && !modelList.includes(savedModel);
  const typedModel = provider === 'custom' || typeOwnModel || unlistedModel;
  const selectedModel = savedModel || settings?.defaultModel || modelList[0] || '';

  async function save(patch: Partial<AiSettingsPatch>) {
    // Switching provider resets the model in the main process, so drop back to its picker too.
    if (patch.provider) setTypeOwnModel(false);
    const next = await window.desktop!.aiSettingsSet!(patch);
    setSettings(next);
    if (patch.apiKey !== undefined) setKeyInput('');
    if (patch.voiceApiKey !== undefined) setVoiceKeyInput('');
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 id="ai-settings-title">⚙ {a.settingsTitle}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={a.cancel}>✕</button>
        </header>

        <div className="modal-body">
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
                  placeholder={settings?.defaultModel} onBlur={(e) => save({ model: e.target.value })} />
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
            {provider === 'custom' && (
              <label className="field">
                <span>{a.endpoint}</span>
                <input key="chat-base" type="url" dir="ltr" defaultValue={settings?.baseUrl ?? ''}
                  placeholder="http://localhost:1234" onBlur={(e) => save({ baseUrl: e.target.value })} />
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
            {voiceProvider === 'custom' && (
              <label className="field">
                <span>{a.endpoint}</span>
                <input key="voice-base" type="url" dir="ltr" defaultValue={settings?.voiceBaseUrl ?? ''}
                  placeholder="http://localhost:1234" onBlur={(e) => save({ voiceBaseUrl: e.target.value })} />
              </label>
            )}
            <p className={settings?.voiceReady ? 'muted small-note' : 'hint'}>
              {settings?.voiceReady ? a.voiceReady
                : settings?.voiceCanTranscribe ? a.voiceNotReady : a.voiceNoStt}
            </p>
          </section>

          <p className="muted small-note">{a.keyPrivacy}</p>
          <div className="row-actions">
            <button className="primary" onClick={onClose}>{a.close}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
