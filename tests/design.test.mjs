// Every stored or imported design is validated before anything renders with it. An unknown template used to
// render as classic while staying in the saved data, and a missing or non-hex accent reached the DOCX export
// as `design.accent.replace('#','')` and threw — which the button reported as nothing happening at all.
import { loadApp, reporter } from './helpers.mjs';

const { ok, done, group } = reporter();
const app = await loadApp(['/src/lib/design.ts', '/src/lib/exportDocx.ts', '/src/lib/sample.ts']);
const { getDesign, defaultDesign, FONTS, TEMPLATES, emptyCV } = app;

try {
  const withDesign = (design, lang = 'en') => getDesign({ ...emptyCV(lang), design });

  group('defaults');
  {
    const en = defaultDesign('en');
    const ar = defaultDesign('ar');
    ok('each language gets a font it can actually render', FONTS.en.includes(en.font) && FONTS.ar.includes(ar.font), [en.font, ar.font]);
    ok('the default template is a known one', TEMPLATES.includes(en.template));
    ok('the default accent is a hex colour', /^#[0-9a-f]{6}$/i.test(en.accent), en.accent);
  }

  group('anything broken is replaced, not passed through');
  {
    ok('a missing design becomes the default', getDesign(emptyCV('en')).template === defaultDesign('en').template);
    ok('an unknown template falls back', withDesign({ template: 'fancy' }).template === defaultDesign('en').template);
    ok('a font the language cannot render falls back', FONTS.en.includes(withDesign({ font: 'Comic Sans' }).font));
    ok('an Arabic CV gets an Arabic-capable font', FONTS.ar.includes(withDesign({ font: 'Calibri' }, 'ar').font));
    for (const accent of ['red', '#ff', '', '#12345g', undefined, null, 123]) {
      ok(`accent ${JSON.stringify(accent)} falls back to a hex colour`, /^#[0-9a-f]{6}$/i.test(withDesign({ accent }).accent), withDesign({ accent }).accent);
    }
    ok('a valid design is left alone', withDesign({ template: 'compact', font: 'Georgia', accent: '#0f766e' }).template === 'compact');
    ok('every field is always present', Object.keys(withDesign({})).sort().join() === 'accent,font,template');
  }

  group('the DOCX export can rely on it');
  {
    // The crash was `accent.replace('#','')` on a design that had no accent at all.
    const design = withDesign({ accent: undefined, template: 'nope', font: 'Nonexistent' });
    ok('the accent can always be stripped of its hash', typeof design.accent.replace('#', '') === 'string' && design.accent.length === 7, design);
    ok('exportDocx is exported for the app to call', typeof app.exportDocx === 'function');
  }
} finally {
  await app.close();
}
done();
