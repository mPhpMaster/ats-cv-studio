import { createContext, useContext } from 'react';

/**
 * Switches for the parts of the app that are not the CV itself. Everything added on top — the donation link,
 * voice answers, the extra sections panel — can be turned off here, so the app stays exactly as useful as the
 * person wants it and nothing new is forced on them. Turning one off never changes stored CV data.
 */
export interface Features {
  /** The one-line donation link at the bottom of the window. */
  donate: boolean;
  /** The microphone button in the interview. */
  voice: boolean;
  /** The "Additional sections" panel in the builder. Imported sections are kept either way. */
  extras: boolean;
  /**
   * Transcribe voice answers on this computer instead of sending them to a provider. Off until asked for:
   * turning it on downloads a model of about 45 MB, which is nobody's business to do uninvited.
   */
  localStt: boolean;
}

export const DEFAULT_FEATURES: Features = { donate: true, voice: true, extras: true, localStt: false };

const KEY = 'ats.features';

export function loadFeatures(): Features {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Features>;
    // Merged onto the defaults: an unknown or missing switch must never leave a feature undefined.
    const out = { ...DEFAULT_FEATURES };
    for (const k of Object.keys(DEFAULT_FEATURES) as (keyof Features)[]) {
      if (typeof saved[k] === 'boolean') out[k] = saved[k] as boolean;
    }
    return out;
  } catch {
    return { ...DEFAULT_FEATURES };
  }
}

export function saveFeatures(features: Features): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(features));
  } catch {
    /* storage unavailable — the choice simply does not persist */
  }
}

export const FeaturesContext = createContext<{ features: Features; setFeature: (key: keyof Features, on: boolean) => void }>({
  features: DEFAULT_FEATURES,
  setFeature: () => {},
});

export const useFeatures = () => useContext(FeaturesContext);

/** Opens the settings dialog from anywhere (the interview's microphone errors point at it). */
export const OPEN_SETTINGS_EVENT = 'ats:open-settings';
export const openSettings = () => window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
