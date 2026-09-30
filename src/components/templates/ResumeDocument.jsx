import React, { forwardRef } from 'react';
import {
  MAX_TRACKING_RATIO,
  buildResumeModel,
  resolveTemplateColor,
} from '../../../supabase/functions/_shared/resume/templates.js';

const pt = (value) => `${value}pt`;
const tracking = (size, value) => pt(Math.min(value || 0, size * MAX_TRACKING_RATIO));

/**
 * On-screen resume renderer. It reads the same content model and design tokens
 * as the text-native PDF and DOCX exports, so the preview matches the download.
 * Styles live in src/styles/resume-document.css.
 */
const ResumeDocument = forwardRef(({ resume = {}, templateId }, ref) => {
  const { template, header, sections } = buildResumeModel({ ...resume, selectedTemplate: templateId });
  const hasHeader = Boolean(header.name || header.title || header.contacts.length);
  const style = {
    '--rd-accent': template.accent,
    '--rd-text': template.text,
    '--rd-muted': template.muted,
    '--rd-rule': template.rule,
    '--rd-band': template.header.band || 'transparent',
    '--rd-name-size': pt(template.header.nameSize),
    '--rd-name-tracking': tracking(template.header.nameSize, template.header.nameTracking),
    '--rd-title-color': resolveTemplateColor(template, template.header.titleColor),
    '--rd-heading-size': pt(template.heading.size),
    '--rd-heading-tracking': tracking(template.heading.size, template.heading.tracking),
    '--rd-heading-color': resolveTemplateColor(template, template.heading.color),
    '--rd-subtitle-color': resolveTemplateColor(template, template.entry.subtitleColor),
    '--rd-topbar': pt(template.header.topBar || 0),
  };

  return (
    <div
      ref={ref}
      className="resume-doc"
      data-template={template.id}
      data-header-align={template.header.align}
      data-header-band={template.header.band ? 'true' : 'false'}
      data-header-rule={template.header.rule || 'none'}
      data-name-case={template.header.nameCase}
      data-name-weight={template.header.nameWeight || 'bold'}
      data-heading-rule={template.heading.rule}
      data-heading-align={template.heading.align}
      data-heading-case={template.heading.case}
      style={style}
    >
      {template.header.topBar ? <div className="resume-doc-topbar" aria-hidden="true" /> : null}

      {hasHeader && (
        <header className="resume-doc-header">
          {header.name && <p className="resume-doc-name">{header.name}</p>}
          {header.title && <p className="resume-doc-title">{header.title}</p>}
          {header.contacts.length > 0 && (
            <p className="resume-doc-contacts">
              {header.contacts.map((item, index) => (
                <React.Fragment key={`${item}-${index}`}>
                  {index > 0 && <span className="resume-doc-separator">{template.header.contactSeparator}</span>}
                  <span>{item}</span>
                </React.Fragment>
              ))}
            </p>
          )}
        </header>
      )}

      {sections.map((section, sectionIndex) => (
        <section key={`${section.key}-${sectionIndex}`} className="resume-doc-section">
          <h2 className="resume-doc-heading">{section.label}</h2>

          {section.kind === 'paragraphs' && section.paragraphs.map((paragraph, index) => (
            <p key={index} className="resume-doc-paragraph">{paragraph}</p>
          ))}

          {section.kind === 'inline' && (
            <p className="resume-doc-paragraph">{section.items.join(template.skills.separator)}</p>
          )}

          {section.kind === 'bullets' && (
            <ul className="resume-doc-bullets">
              {section.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
            </ul>
          )}

          {section.kind === 'entries' && section.entries.map((entry, index) => (
            <div key={index} className="resume-doc-entry">
              {(entry.title || entry.dates) && (
                <div className="resume-doc-entry-head">
                  <p className="resume-doc-entry-title">{entry.title}</p>
                  {entry.dates && <p className="resume-doc-entry-dates">{entry.dates}</p>}
                </div>
              )}
              {(entry.subtitle || entry.meta) && (
                <p className="resume-doc-entry-subtitle">
                  {entry.subtitle && <span className="resume-doc-entry-org">{entry.subtitle}</span>}
                  {entry.subtitle && entry.meta && <span className="resume-doc-entry-meta">{'  ·  '}</span>}
                  {entry.meta && <span className="resume-doc-entry-meta">{entry.meta}</span>}
                </p>
              )}
              {entry.bullets.length > 0 && (
                <ul className="resume-doc-bullets">
                  {entry.bullets.map((bullet, bulletIndex) => <li key={bulletIndex}>{bullet}</li>)}
                </ul>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
});

ResumeDocument.displayName = 'ResumeDocument';

export default ResumeDocument;
