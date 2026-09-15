# ATS CV Studio

A desktop application (Windows) for **building ATS-friendly CVs** and **checking any CV for ATS compatibility** — in **English and Arabic** with full RTL support.

**Your data:** the CV builder, the checker, all parsing and all scoring run entirely on your computer, and the app has no server of its own. The only time anything leaves your machine is when *you* use an AI feature: either you paste the prompt into an AI assistant yourself, or — if you save an API key — the app sends the prompt to the provider you chose. Everything else stays local.

## Download

Grab the latest installer from the [Releases page](https://github.com/mPhpMaster/ats-cv-studio/releases) (`ATS-CV-Studio-Setup-<version>.exe`), or build it yourself below.

## Install / build

| Goal | Command |
|------|---------|
| Build the Windows installer | Double-click `build-installer.bat`, or run `.\build-installer.ps1` (add `-SkipInstall` to reuse node_modules, `-Portable` for a portable .exe, `-Clean` for a fresh build; the same flags work with the `.bat`) |
| Run the desktop app in development | `npm run electron:dev` |
| Run in the browser only | `npm run dev` → http://localhost:5173 |

The installer is written to `release\ATS-CV-Studio-Setup-<version>.exe`. The script needs Node.js 20+; the first run downloads Electron and NSIS build tools. If you use PowerShell's default execution policy, run it with `powershell -ExecutionPolicy Bypass -File .\build-installer.ps1`.

## CV builder
- Guided editor for contact details, summary, experience, education, skills, certifications, projects and languages.
- **Import** from an existing CV (PDF, DOCX, TXT), from **LinkedIn** or from a JSON backup. LinkedIn import works three ways:
  - **Profile link** (desktop app): paste `linkedin.com/in/your-name`; a LinkedIn window opens inside the app, you sign in there if asked (the app never sees your password), and the profile's experience, education, skills, certifications, languages, projects and contact info are imported automatically. Optionally it can reuse an existing Chrome/Edge/Brave login instead of asking you to sign in — that option is **off by default** and only ever reads `linkedin.com` cookies.
  - The profile's "Save to PDF" file, or the full data-export ZIP/CSVs.
- The built-in English and Arabic samples score **100/100**.
- **CV language** English or Arabic (RTL layout, Arabic headings, Arabic-aware DOCX/PDF export). The interface language is switched separately.
- Three ATS-safe templates (Classic, Modern, Compact), ATS-safe fonts and accent colors — all single column with real text.
- Live report with the same categories and checks as the checker, per-bullet coaching (action verb, number, repetition, length), one-click wording fixes, spelling fixes and "make all bullets consistent".
- Export to text-based **PDF**, **DOCX** and **TXT**; autosave.

## The three AI buttons

All three build the prompt from your CV, hand you a preview of what changed and the new ATS score, and only touch your CV when you press **Apply**. The whole CV is sent — name, contact details, every section, empty fields included — so the assistant can see exactly what is missing.

| Button | What it does |
|--------|--------------|
| **✨ Enhance with AI** | Rewrites the CV for ATS, optionally tailored to a target job description. |
| **🛠 Fix issues with AI** | A targeted repair of only the issues the report lists — every other line must come back unchanged. When an issue asks for *more* (too few words, too few bullets, a skill with no evidence), the prompt requires real expansion rather than a token edit. Shows how many issues are open; disabled when there are none. |
| **🎤 Complete with AI questions** | The assistant interviews you **one question at a time**, and only about what is actually missing — sections you already filled in are never questioned. At the end it returns the completed CV. |

**Facts are protected.** Enhance and Fix take wording only: names, contact details, employers, job titles, dates, degrees, certifications and languages always stay exactly as you entered them. The interview may *fill* fields you left empty and add entries you described in your answers, but it still never overwrites anything you wrote.

After applying, the preview lists any issues that are **still open** and why — typically because they need a real number, a team size, a phone number or actual dates, which the AI is forbidden to invent. Those are what the interview button is for.

### Running the AI automatically (optional)

By default you copy the prompt into any assistant (ChatGPT, Claude, Gemini…) and paste the reply back — no account or key needed.

If you would rather the app do it for you, open **AI connection (API key)** inside any AI dialog and save a key for **Anthropic**, **OpenAI**, **Google**, **DeepSeek**, or a **custom OpenAI-compatible endpoint** (a local model or gateway, which may need no key at all). Pick the model from the list for that provider — or type your own — and use **Get an API key ↗** to open the provider's key page. The **⚡ Run with AI now** button then sends the prompt and brings the reply straight back into the preview.

- The key is stored only on your computer, in the app's own data folder (`ai-settings.json`), never in the page and never in a browser store.
- The request is made from the Electron main process, so the key is never exposed to the app's web page, and it is redacted from any error message shown or logged.
- Using this feature sends your CV text to the provider you choose. If you would rather nothing left your machine, use the copy/paste flow or point the app at a local model.

## ATS checker
Upload a CV (and optionally a job description and your LinkedIn profile). The report scores 7 categories:

| Category | Checks |
|----------|--------|
| ATS essentials | File Format & Size · Design · Email Address · Header Links · File Name Check · Dates & Links |
| Content | ATS Parse Rate · Quantifying Impact · Repetition · Spelling & Grammar · Bullets Consistency |
| Sections | Essential Sections · Contact Information · Sections Order |
| HR red flags | Credibility · Interview Risks · Peer Benchmarking · LinkedIn Match |
| Discrimination | Ageism & Date Bias · Employment Gaps · Personal Details & Photo |
| Seniority | Career Progression · Skill Evidence · Leadership Signals |
| Tailoring (needs a job description) | Hard Skills · Soft Skills · Action Verbs · Tailored Title |

A check only earns its full weight when it has **zero** findings, so a perfect score needs every check clear — including the ones that depend on facts only you can supply.

It also shows the ATS parse-rate bar and "Your CV, two ways": the raw text an ATS extracts vs. the CV rebuilt in an ATS template (with the score difference), which you can open in the builder.

## Project structure
```
electron/                 main process + preload (native save dialogs, PDF export)
electron/aiClient.cjs     provider calls (Anthropic/OpenAI/Google/custom) + API-key storage
electron/linkedin.cjs     LinkedIn profile-link import window (reads the visible profile pages)
electron/chromeCookies.cjs  optional reuse of a browser's LinkedIn login (off by default)
build-installer.bat       double-click wrapper for build-installer.ps1
build-installer.ps1       one-step installer build
src/
  i18n/                   English and Arabic UI + report text
  lib/analyzer.ts         all checks and scoring
  lib/cvParser.ts         CV text → structured builder data
  lib/linkedin.ts         LinkedIn profile link, profile PDF and data-export import
  lib/aiPrompt.ts         the three AI prompts, gap detection and reply merging
  lib/parseFile.ts        PDF (pdf.js) / DOCX (mammoth) extraction with layout detection
  lib/spell.ts            offline English spell checking (Hunspell dictionary)
  lib/exportDocx.ts       DOCX export (RTL-aware)
  components/             Builder, Checker, Report, ImportDialog, AiEnhanceDialog, CVPreview
```

## Contributing

Contributions are welcome — issues and pull requests both. Two things worth knowing before you start:

- `src/i18n/ar.ts` is typed against `src/i18n/en.ts`, so the two must stay key-for-key identical or the build fails.
- Run `npx tsc -b` before opening a pull request.

## License

MIT — see [LICENSE](LICENSE).

---

Scores are heuristics modelled on how common ATS parsers and recruiters behave; real systems (Workday, Taleo, Greenhouse, iCIMS…) differ, so treat the report as guidance.
