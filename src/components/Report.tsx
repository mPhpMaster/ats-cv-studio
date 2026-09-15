import { useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import type { AnalysisResult, CategoryKey, CategoryScore, Check, CheckFix } from '../types';

type Level = 'pass' | 'warn' | 'fail' | 'na';

export function levelOf(score: number | null): Level {
  if (score === null) return 'na';
  return score >= 80 ? 'pass' : score >= 60 ? 'warn' : 'fail';
}

const CHECK_ICON = { pass: '✓', warn: '✕', fail: '✕', na: '?' } as const;

const CAT_ICON: Record<CategoryKey, string> = {
  essentials: '⚙', content: '✎', sections: '☰', redFlags: '⚑', discrimination: '⚖', seniority: '▲', tailoring: '◎',
};

export function Gauge({ score, size = 170 }: { score: number; size?: number }) {
  const { t } = useI18n();
  const len = Math.PI * 50;
  const label = score >= 85 ? t.report.excellent : score >= 70 ? t.report.good : score >= 50 ? t.report.needsWork : t.report.poor;
  return (
    <div className={`gauge ${levelOf(score)}`} style={{ width: size }}>
      <svg viewBox="0 0 120 66" width={size} height={(size * 66) / 120} aria-hidden>
        <path d="M10 60 A50 50 0 0 1 110 60" className="gauge-track" />
        <path d="M10 60 A50 50 0 0 1 110 60" className="gauge-value" strokeDasharray={len} strokeDashoffset={len * (1 - score / 100)} />
      </svg>
      <div className="gauge-score"><b>{score}</b>/100</div>
      <div className="gauge-label">{label}</div>
    </div>
  );
}

function Pill({ score }: { score: number | null }) {
  const { t } = useI18n();
  return <span className={`pill ${levelOf(score)}`}>{score === null ? t.report.notEvaluated : `${score}%`}</span>;
}

function IssueBadge({ c }: { c: Check }) {
  const { t } = useI18n();
  if (c.severity === 'na') return <span className="badge na">{t.report.naBadge}</span>;
  return c.issues === 0
    ? <span className="badge ok">{t.report.noIssuesBadge}</span>
    : <span className="badge issues">{t.report.issuesBadge(c.issues)}</span>;
}

const scrollToCheck = (id: string) => {
  const el = document.getElementById(`check-${id}`);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1200);
};

/** Sidebar-style list: category header with percentage, expandable to its named checks. */
function CategoryList({ result, onSelect, defaultOpen = true }: { result: AnalysisResult; onSelect?: (checkId: string) => void; defaultOpen?: boolean }) {
  const { t } = useI18n();
  return (
    <ul className="cat-list">
      {result.categories.map((cat) => (
        <li key={cat.key}>
          <details open={defaultOpen}>
            <summary>
              <span className="cat-name">{t.report.categories[cat.key]}</span>
              <Pill score={cat.score} />
              <span className="chev" aria-hidden>⌃</span>
            </summary>
            <ul className="sub-checks">
              {result.checks.filter((c) => c.category === cat.key).map((c) => (
                <li key={c.id}>
                  <button type="button" className={`sub-check ${c.severity}`} onClick={() => onSelect?.(c.id)}>
                    <span className="sub-icon" aria-hidden>{CHECK_ICON[c.severity]}</span>
                    <span className="sub-label">{c.label}</span>
                    <IssueBadge c={c} />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}

function CheckRow({ c, onFix }: { c: Check; onFix?: (fix: CheckFix) => void }) {
  const { t } = useI18n();
  return (
    <details id={`check-${c.id}`} className={`check ${c.severity}`} open={c.issues > 0}>
      <summary>
        <span className="check-icon" aria-hidden>{CHECK_ICON[c.severity]}</span>
        <span className="check-title">{c.label}</span>
        <IssueBadge c={c} />
      </summary>
      <div className="check-body">
        <p className="check-detail">{c.detail}</p>
        {c.items.length > 0 && <ul className="check-items">{c.items.map((item, i) => <li key={i} dir="auto">{item}</li>)}</ul>}
        {onFix && c.fixes && c.fixes.length > 0 && (
          <div className="fixes">
            {c.fixes.map((f) => (
              <button key={f.from} type="button" className="fix-btn" onClick={() => onFix(f)}>
                <s>{f.from}</s> → <b>{f.to}</b> <span>{t.report.applyFix}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

export function KeywordChips({ result, onAdd }: { result: AnalysisResult; onAdd?: (keyword: string) => void }) {
  const { t } = useI18n();
  const { matched, missing } = result.keywords;
  if (!matched.length && !missing.length) return null;
  return (
    <div className="keywords">
      {missing.length > 0 && (
        <>
          <p className="muted">{t.report.missingNote}</p>
          <div className="chips">
            {missing.map((k) => (onAdd
              ? <button key={k} type="button" className="chip missing" onClick={() => onAdd(k)}>+ {k}</button>
              : <span key={k} className="chip missing">{k}</span>))}
          </div>
        </>
      )}
      {matched.length > 0 && (
        <>
          <p className="muted">{t.report.foundNote}</p>
          <div className="chips">{matched.map((k) => <span key={k} className="chip matched">{k}</span>)}</div>
        </>
      )}
    </div>
  );
}

function ParseRate({ rate }: { rate: number }) {
  const { t } = useI18n();
  const missed = 100 - rate;
  return (
    <div className="parse-rate">
      <div className="bar" role="img" aria-label={t.report.parseRead(rate)}>
        <div className="bar-read" style={{ width: `${rate}%` }} />
        <div className="bar-missed" style={{ width: `${missed}%` }} />
        <span className="bar-pin" style={{ insetInlineStart: `${rate}%` }} />
      </div>
      <div className="bar-labels">
        <span className="pass-text">{t.report.parseRead(rate)}</span>
        {missed > 0 && <span className="fail-text">{t.report.parseMissed(missed)}</span>}
      </div>
      <p className="parse-headline">{missed <= 5 ? t.report.parseGood : t.report.parseBad(missed)}</p>
    </div>
  );
}

function CategoryPanel({ cat, result, extra, onFix }: { cat: CategoryScore; result: AnalysisResult; extra?: ReactNode; onFix?: (f: CheckFix) => void }) {
  const { t } = useI18n();
  const checks = result.checks.filter((c) => c.category === cat.key);
  return (
    <section id={`cat-${cat.key}`} className="cat-panel">
      <header>
        <span className={`cat-icon ${levelOf(cat.score)}`} aria-hidden>{CAT_ICON[cat.key]}</span>
        <h2>{t.report.categories[cat.key]}</h2>
        <Pill score={cat.score} />
        <span className="issues-pill">{t.report.issuesFound(cat.issues)}</span>
      </header>
      <div className="cat-body">
        <p className="cat-intro">{t.report.intros[cat.key]}</p>
        {cat.key === 'content' && <ParseRate rate={result.parseRate} />}
        {cat.key === 'content' && extra}
        {cat.key === 'tailoring' && cat.score === null && <p className="hint">{t.report.jdTip}</p>}
        {cat.key === 'tailoring' && <KeywordChips result={result} />}
        <div className="checks">{checks.map((c) => <CheckRow key={c.id} c={c} onFix={onFix} />)}</div>
      </div>
    </section>
  );
}

/** Full report: score sidebar with categories and their checks, plus one detailed panel per category. */
export function FullReport({ result, contentExtra }: { result: AnalysisResult; contentExtra?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="report-layout">
      <aside className="score-card">
        <h3>{t.report.yourScore}</h3>
        <Gauge score={result.score} />
        <div className="mini-stats">
          <div><b>{result.stats.words}</b><span>{t.report.words}</span></div>
          <div><b>{result.stats.yearsExperience ?? '—'}</b><span>{t.report.yearsStat}</span></div>
          <div>
            <b>{result.keywords.matchRate === null ? '—' : `${Math.round(result.keywords.matchRate * 100)}%`}</b>
            <span>{t.report.keywordMatchStat}</span>
          </div>
        </div>
        <CategoryList result={result} onSelect={scrollToCheck} />
      </aside>
      <div className="cat-panels">
        {result.categories.map((c) => (
          <CategoryPanel key={c.key} cat={c} result={result} extra={c.key === 'content' ? contentExtra : undefined} />
        ))}
      </div>
    </div>
  );
}

/** Live report next to the CV builder: gauge, category checklist and the most valuable fixes. */
export function CompactReport({ result, onAddKeyword, onFix }: {
  result: AnalysisResult; onAddKeyword?: (k: string) => void; onFix?: (f: CheckFix) => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const issues = result.checks
    .filter((c) => c.issues > 0)
    .sort((a, b) => (b.weight - b.earned) - (a.weight - a.earned));
  const focused = selected ? result.checks.find((c) => c.id === selected) : null;
  const shown = focused ? [focused] : issues.slice(0, 4);

  return (
    <div className="report-compact">
      <div className="compact-head">
        <Gauge score={result.score} size={140} />
        <CategoryList result={result} defaultOpen={false} onSelect={(id) => setSelected((s) => (s === id ? null : id))} />
      </div>
      {shown.length === 0 ? (
        <p className="muted">{t.report.noIssues}</p>
      ) : (
        <>
          <h4>{focused ? focused.label : t.report.topIssues}</h4>
          <div className="checks">{shown.map((c) => <CheckRow key={c.id} c={c} onFix={onFix} />)}</div>
        </>
      )}
      <KeywordChips result={result} onAdd={onAddKeyword} />
    </div>
  );
}
