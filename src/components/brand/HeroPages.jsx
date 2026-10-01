import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import { HERO_PAGES, restingTransform } from './heroLayout';

// The hero's resume pages are real HTML, so the browser draws their text
// natively and it stays sharp. They follow the product's own designs
// (Clarity, Horizon and Heritage) at display size. Keywords on the front page
// light up when the scan passes them. Decorative: hidden from assistive tech.

const Keyword = ({ children }) => <mark className="hero-kw">{children}</mark>;
Keyword.propTypes = { children: PropTypes.node.isRequired };

const Entry = ({ title, dates, org, children }) => (
  <div className="hero-doc-entry">
    <div className="hero-doc-entry-head">
      <p className="hero-doc-entry-title">{title}</p>
      <p className="hero-doc-dates">{dates}</p>
    </div>
    <p className="hero-doc-org">{org}</p>
    {children && <ul className="hero-doc-bullets">{children}</ul>}
  </div>
);
Entry.propTypes = { title: PropTypes.string.isRequired, dates: PropTypes.string.isRequired, org: PropTypes.string.isRequired, children: PropTypes.node };

const Clarity = () => (
  <article className="hero-doc hero-doc--clarity">
    <header className="hero-doc-header">
      <p className="hero-doc-name">Alex Morgan</p>
      <p className="hero-doc-title">Product Designer</p>
      <p className="hero-doc-contacts">alex@example.com{' '}<i>•</i>{' '}Remote{' '}<i>•</i>{' '}alexmorgan.design</p>
    </header>
    <section className="hero-doc-section">
      <h3 className="hero-doc-heading">Professional Summary</h3>
      <p className="hero-doc-text">
        Product designer who pairs <Keyword>user research</Keyword> with fast iteration to ship clear, <Keyword>accessible</Keyword> experiences.
      </p>
    </section>
    <section className="hero-doc-section">
      <h3 className="hero-doc-heading">Core Competencies</h3>
      <p className="hero-doc-text">
        <Keyword>User research</Keyword>{' '}<i>•</i>{' '}<Keyword>Figma</Keyword>{' '}<i>•</i>{' '}<Keyword>Accessibility</Keyword>{' '}<i>•</i>{' '}Prototyping{' '}<i>•</i>{' '}<Keyword>Design systems</Keyword>
      </p>
    </section>
    <section className="hero-doc-section">
      <h3 className="hero-doc-heading">Professional Experience</h3>
      <Entry title="Senior Product Designer" dates="Jan 2022 – Present" org="Northstar · Remote">
        <li>Led the onboarding redesign from <Keyword>research</Keyword> to launch, lifting activation by <Keyword>28%</Keyword>.</li>
        <li>Built an <Keyword>accessible component library</Keyword> with engineering.</li>
      </Entry>
      <Entry title="Product Designer" dates="Jun 2019 – Dec 2021" org="Brightline · Austin, TX">
        <li>Ran weekly <Keyword>usability</Keyword> sessions and Figma prototype tests.</li>
      </Entry>
    </section>
    <section className="hero-doc-section">
      <h3 className="hero-doc-heading">Education</h3>
      <Entry title="B.A. Design" dates="2015 – 2019" org="State University" />
    </section>
    <section className="hero-doc-section">
      <h3 className="hero-doc-heading">Certifications &amp; Licenses</h3>
      <Entry title="Accessibility Specialist" dates="2023" org="IAAP" />
    </section>
  </article>
);

const Horizon = () => (
  <article className="hero-doc hero-doc--horizon">
    <span className="hero-doc-topbar" />
    <header className="hero-doc-header">
      <p className="hero-doc-name">Jordan Lee</p>
      <p className="hero-doc-title">Data Analyst</p>
      <p className="hero-doc-contacts">jordan@example.com{' '}<i>|</i>{' '}Chicago, IL{' '}<i>|</i>{' '}jordanlee.dev</p>
    </header>
    <section className="hero-doc-section">
      <h3 className="hero-doc-heading">Professional Summary</h3>
      <p className="hero-doc-text">Analyst who turns messy operational data into dashboards and decisions that teams actually use.</p>
    </section>
    <section className="hero-doc-section">
      <h3 className="hero-doc-heading">Work Experience</h3>
      <Entry title="Senior Data Analyst" dates="Mar 2021 – Present" org="Fieldline · Chicago, IL">
        <li>Built the weekly revenue dashboard used by 40 managers.</li>
        <li>Automated reporting in SQL and Python, saving six hours a week.</li>
      </Entry>
      <Entry title="Data Analyst" dates="2018 – 2021" org="Harbor Health · Chicago, IL">
        <li>Modeled patient demand to plan clinic staffing.</li>
      </Entry>
    </section>
    <section className="hero-doc-section">
      <h3 className="hero-doc-heading">Skills</h3>
      <p className="hero-doc-text">SQL{' '}<i>•</i>{' '}Python{' '}<i>•</i>{' '}Tableau{' '}<i>•</i>{' '}Forecasting{' '}<i>•</i>{' '}A/B testing</p>
    </section>
    <section className="hero-doc-section">
      <h3 className="hero-doc-heading">Education</h3>
      <Entry title="B.S. Statistics" dates="2014 – 2018" org="University of Illinois" />
    </section>
  </article>
);

const Heritage = () => (
  <article className="hero-doc hero-doc--heritage">
    <header className="hero-doc-header">
      <p className="hero-doc-name">Sam Rivera</p>
      <p className="hero-doc-title">Marketing Manager</p>
      <p className="hero-doc-contacts">sam@example.com{' '}<i>|</i>{' '}Denver, CO{' '}<i>|</i>{' '}samrivera.co</p>
    </header>
    <section className="hero-doc-section">
      <h3 className="hero-doc-heading">Professional Summary</h3>
      <p className="hero-doc-text">Marketing manager who builds brand programs that turn first visits into lasting customers.</p>
    </section>
    <section className="hero-doc-section">
      <h3 className="hero-doc-heading">Work Experience</h3>
      <Entry title="Marketing Manager" dates="2020 – Present" org="Ridgeway Outfitters · Denver, CO">
        <li>Grew email revenue 34% with lifecycle campaigns.</li>
        <li>Led a six-person team across brand, content and paid social.</li>
      </Entry>
      <Entry title="Marketing Specialist" dates="2017 – 2020" org="Peak & Pine · Boulder, CO">
        <li>Launched the brand&apos;s first loyalty program.</li>
      </Entry>
    </section>
    <section className="hero-doc-section">
      <h3 className="hero-doc-heading">Skills</h3>
      <p className="hero-doc-text">Lifecycle marketing{' '}<i>|</i>{' '}Brand strategy{' '}<i>|</i>{' '}Analytics{' '}<i>|</i>{' '}Copywriting</p>
    </section>
    <section className="hero-doc-section">
      <h3 className="hero-doc-heading">Education</h3>
      <Entry title="B.A. Communications" dates="2013 – 2017" org="University of Colorado" />
    </section>
  </article>
);

const DOCUMENTS = { back: Heritage, middle: Horizon, front: Clarity };

/** The page stack, positioned in 3D around the stage. */
const HeroPages = forwardRef(function HeroPages({ state }, ref) {
  return (
    <div ref={ref} className="hero-pages" data-state={state} aria-hidden="true">
      {HERO_PAGES.map((page) => {
        const Document = DOCUMENTS[page.id];
        return (
          <div key={page.id} className="hero-page" data-page={page.id} style={{ transform: restingTransform(page) }}>
            <div className="hero-paper">
              <Document />
              {page.id === 'front' && <span className="hero-paper-cover" />}
            </div>
            {page.id === 'front' && (
              <span className="hero-scan">
                <span className="hero-scan-wake" />
                <span className="hero-scan-line" />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});

HeroPages.propTypes = { state: PropTypes.string.isRequired };

export default HeroPages;
