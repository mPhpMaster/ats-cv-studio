import { createContext, useContext } from 'react';
import type { Lang } from '../types';
import { ar } from './ar';
import { en, type Messages } from './en';

export type { Messages };

export const messages: Record<Lang, Messages> = { en, ar };

export interface I18n {
  lang: Lang;
  t: Messages;
  setLang: (lang: Lang) => void;
}

export const I18nContext = createContext<I18n>({ lang: 'en', t: en, setLang: () => {} });

export const useI18n = () => useContext(I18nContext);
