import { useEffect, useState } from 'react';
import { TECH_WORDS } from './dictionaries';

export interface SpellChecker {
  correct(word: string): boolean;
  suggest(word: string): string | null;
}

let loading: Promise<SpellChecker> | null = null;

/** Lazily load the Hunspell en-US dictionary (≈550 KB) — only needed for the spelling check. */
export function loadSpellChecker(): Promise<SpellChecker> {
  loading ??= (async () => {
    const [{ default: nspell }, aff, dic] = await Promise.all([
      import('nspell'),
      import('dictionary-en-data/index.aff?raw'),
      import('dictionary-en-data/index.dic?raw'),
    ]);
    const spell = nspell(aff.default, dic.default);
    for (const word of TECH_WORDS) spell.add(word);
    const cache = new Map<string, string | null>();
    // Accept common British spellings (optimise, colour, centre) as well.
    const variants = (w: string) => [
      w,
      w.replace(/is(e|ed|es|ing|ation|ations)$/, 'iz$1'),
      w.replace(/our(s?)$/, 'or$1'),
      w.replace(/tre$/, 'ter'),
      w.replace(/lled$/, 'led'),
      w.replace(/lling$/, 'ling'),
    ];
    return {
      correct: (w) => variants(w).some((v) => spell.correct(v)),
      suggest: (w) => {
        if (!cache.has(w)) cache.set(w, spell.suggest(w)[0] ?? null);
        return cache.get(w) ?? null;
      },
    };
  })();
  return loading;
}

export function useSpellChecker(): SpellChecker | null {
  const [checker, setChecker] = useState<SpellChecker | null>(null);
  useEffect(() => {
    let alive = true;
    loadSpellChecker()
      .then((c) => alive && setChecker(c))
      .catch(() => { /* spelling check falls back to grammar heuristics */ });
    return () => { alive = false; };
  }, []);
  return checker;
}
