import { Fragment, type CSSProperties } from 'react';
import { messages } from '../i18n';
import type { CVData } from '../types';
import { contactItems, dateRange, splitLines, splitList } from '../lib/cvText';
import { cvLang, getDesign } from '../lib/design';

function Meta({ location, start, end }: { location: string; start: string; end: string }) {
  const range = dateRange(start, end);
  if (!location && !range) return null;
  return (
    <p className="cv-meta">
      {location}
      {location && range && ' | '}
      {range && <bdi>{range}</bdi>}
    </p>
  );
}

/** ATS-safe templates: single column, real text, standard headings, no tables/icons/images. */
export default function CVPreview({ cv }: { cv: CVData }) {
  const lang = cvLang(cv);
  const h = messages[lang].cv;
  const design = getDesign(cv);
  const p = cv.personal;
  const skills = splitList(cv.skills);
  const langs = splitList(cv.languages);
  const certs = cv.certifications.filter((c) => c.name);
  const projects = cv.projects.filter((pr) => pr.name || pr.description);
  const contact = contactItems(cv);
  const style = {
    '--cv-accent': design.accent,
    fontFamily: `'${design.font}', Arial, Tahoma, sans-serif`,
  } as CSSProperties;

  return (
    <article className={`cv-page tpl-${design.template}`} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} style={style}>
      <header>
        <h1>{p.fullName || h.yourName}</h1>
        {p.title && <p className="cv-title">{p.title}</p>}
        {contact.length > 0 && (
          <p className="cv-contact">
            {contact.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && ' | '}
                <bdi>{c}</bdi>
              </Fragment>
            ))}
          </p>
        )}
      </header>

      {cv.summary.trim() && (
        <section>
          <h2>{h.summary}</h2>
          <p>{cv.summary}</p>
        </section>
      )}

      {cv.experience.length > 0 && (
        <section>
          <h2>{h.experience}</h2>
          {cv.experience.map((e) => (
            <div className="cv-item" key={e.id}>
              <h3>{e.jobTitle}{e.company && <span> – {e.company}</span>}</h3>
              <Meta location={e.location} start={e.startDate} end={e.endDate} />
              <ul>{splitLines(e.bullets).map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          ))}
        </section>
      )}

      {cv.education.length > 0 && (
        <section>
          <h2>{h.education}</h2>
          {cv.education.map((e) => (
            <div className="cv-item" key={e.id}>
              <h3>{e.degree}{e.school && <span> – {e.school}</span>}</h3>
              <Meta location={e.location} start={e.startDate} end={e.endDate} />
              {splitLines(e.details).length > 0 && <ul>{splitLines(e.details).map((b, i) => <li key={i}>{b}</li>)}</ul>}
            </div>
          ))}
        </section>
      )}

      {skills.length > 0 && (
        <section>
          <h2>{h.skills}</h2>
          <p>{skills.join(h.listSep)}</p>
        </section>
      )}

      {certs.length > 0 && (
        <section>
          <h2>{h.certifications}</h2>
          <ul>{certs.map((c) => <li key={c.id}>{[c.name, c.issuer, c.date].filter(Boolean).join(' – ')}</li>)}</ul>
        </section>
      )}

      {projects.length > 0 && (
        <section>
          <h2>{h.projects}</h2>
          {projects.map((pr) => (
            <div className="cv-item" key={pr.id}>
              {pr.name && <h3>{pr.name}{pr.link && <span> | <bdi>{pr.link}</bdi></span>}</h3>}
              <ul>{splitLines(pr.description).map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          ))}
        </section>
      )}

      {langs.length > 0 && (
        <section>
          <h2>{h.languages}</h2>
          <p>{langs.join(h.listSep)}</p>
        </section>
      )}
    </article>
  );
}
