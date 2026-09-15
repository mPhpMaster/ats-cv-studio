declare module 'nspell' {
  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
    add(word: string): NSpell;
  }
  export default function nspell(aff: string, dic: string): NSpell;
}

declare module 'dictionary-en-data/index.aff?raw' {
  const content: string;
  export default content;
}

declare module 'dictionary-en-data/index.dic?raw' {
  const content: string;
  export default content;
}
