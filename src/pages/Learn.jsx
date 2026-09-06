import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TouchLink, PageHero } from '../components/ui';
import AnimatedElement from '../components/ui/AnimatedElement';
import StaggeredContainer from '../components/ui/StaggeredContainer';
import StaggeredItem from '../components/ui/StaggeredItem';
import { fadeInUp } from '../utils/animationVariants';

const sectionAnchors = [
  { id: 'best-practices', label: 'Best practices' },
  { id: 'keyword-optimization', label: 'Keywords' },
  { id: 'formatting', label: 'Formatting' },
];

const doList = [
  'Use a clean, single-column layout',
  'Include standard section headings (e.g., "Work Experience," "Education")',
  'Use readable fonts (Arial, Calibri, Helvetica, etc.)',
  'Use relevant job-description terms only when supported by your experience',
  'Use standard date formats (MM/YYYY or Month YYYY)',
  'Follow the employer’s file-format and file-size requirements',
];

const dontList = [
  'Use tables, columns, headers, or footers',
  'Include images, graphics, or charts',
  'Use fancy fonts, colors, or creative layouts',
  'Include information in the header or footer',
  'Use non-standard section headings',
  'Submit a file type the employer does not accept',
];

const keywordSteps = [
  {
    title: 'Analyze the Job Description',
    body: 'Carefully read the job posting and identify key skills, qualifications, and responsibilities. These are likely the keywords the ATS will be scanning for.',
  },
  {
    title: 'Include Exact Keyword Matches',
    body: 'Use the employer’s terminology where it accurately describes your work. Do not add a skill, qualification, or responsibility you do not have just to match a keyword.',
  },
  {
    title: 'Use Both Acronyms and Full Terms',
    body: 'When relevant, include an acronym and its full term, such as "Search Engine Optimization (SEO)," so the meaning is clear to readers.',
  },
  {
    title: 'Incorporate Industry-Specific Terminology',
    body: 'Include relevant industry terms, tools, software, and methodologies specific to your field.',
  },
  {
    title: 'Avoid Keyword Stuffing',
    body: 'While keywords are important, don\'t overdo it. Your resume should still read naturally and be written for humans, not just the ATS.',
  },
];

const layoutBullets = [
  'Use a clean, single-column layout',
  'Standard 1-inch margins on all sides',
  'Clear section headings (Work Experience, Education, Skills)',
  'Consistent formatting throughout the document',
  'Simple bullet points (• or -) for listing accomplishments',
];

const fontBullets = [
  'Use readable fonts: Arial, Calibri, Helvetica, Times New Roman',
  'Font size: 10–12pt for body text, 14–16pt for headings',
  'Simple formatting (bold, italics) used sparingly',
  'Black text on white background',
  'No text boxes, tables, or columns',
];

const cardClass =
  'rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm transition-shadow duration-200 ease-out hover:shadow-md sm:p-8 dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-900/40';

const CheckIcon = () => (
  <svg
    className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg
    className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const Learn = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <PageHero
        eyebrow="ATS Resume Guide"
        title="Make your experience easier to read."
        lead="Practical guidance for clear resume structure, truthful tailoring, and readable exports. No format or score can guarantee an interview."
        titleId="learn-page-title"
      >
        <nav
          aria-label="Guide sections"
          className="flex flex-wrap gap-2"
        >
          {sectionAnchors.map((anchor) => (
            <Link
              key={anchor.id}
              to={`/learn#${anchor.id}`}
              className="rounded-full border border-blue-200 bg-white/80 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-500/40 dark:bg-slate-900/60 dark:text-blue-300 dark:hover:bg-slate-800"
            >
              {anchor.label}
            </Link>
          ))}
        </nav>
      </PageHero>

      <div className="app-page max-w-4xl space-y-8 sm:space-y-10">
        <AnimatedElement variants={fadeInUp} delay={0.05}>
          <section className={cardClass}>
            <h2 className="text-2xl font-bold sm:text-3xl">What is an ATS?</h2>
            <div className="mt-4 space-y-4 text-gray-700 dark:text-slate-300">
              <p>
                An Applicant Tracking System (ATS) helps employers organize applications. Resume parsing extracts details from a document
                into candidate fields; it is not the same as a hiring decision.
              </p>
              <p>
                Greenhouse documents that images, complex layouts, columns, and contact details in headers or text boxes can cause incomplete parsing.
                Its guidance says a failed parse leaves the resume attached and requires manual correction, not that it automatically rejects the candidate.
              </p>
              <p>
                Read the employer&apos;s instructions and review any fields populated after upload. Our checklist is editing guidance,
                not a test of an employer&apos;s ATS or a prediction of a hiring outcome.{' '}
                <a className="underline text-blue-700 dark:text-blue-300" href="https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse" target="_blank" rel="noopener noreferrer">
                  Read Greenhouse&apos;s parsing guidance
                </a>.
              </p>
            </div>
          </section>
        </AnimatedElement>

        <AnimatedElement variants={fadeInUp} delay={0.05}>
          <section id="best-practices" className={cardClass}>
            <h2 className="text-2xl font-bold sm:text-3xl">ATS Best Practices</h2>
            <p className="mt-2 text-gray-600 dark:text-slate-400">
              These conservative formatting choices can reduce parsing problems. Always follow the application instructions.
            </p>
            <div className="mt-6 grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-lg font-semibold text-emerald-700 dark:text-emerald-300">Do</h3>
                <StaggeredContainer className="space-y-3" staggerDelay={0.04} initialDelay={0.05}>
                  {doList.map((item) => (
                    <StaggeredItem key={item}>
                      <div className="flex items-start gap-3">
                        <CheckIcon />
                        <span className="text-gray-700 dark:text-slate-300">{item}</span>
                      </div>
                    </StaggeredItem>
                  ))}
                </StaggeredContainer>
              </div>

              <div>
                <h3 className="mb-3 text-lg font-semibold text-red-600 dark:text-red-300">Don&apos;t</h3>
                <StaggeredContainer className="space-y-3" staggerDelay={0.04} initialDelay={0.05}>
                  {dontList.map((item) => (
                    <StaggeredItem key={item}>
                      <div className="flex items-start gap-3">
                        <XIcon />
                        <span className="text-gray-700 dark:text-slate-300">{item}</span>
                      </div>
                    </StaggeredItem>
                  ))}
                </StaggeredContainer>
              </div>
            </div>
          </section>
        </AnimatedElement>

        <AnimatedElement variants={fadeInUp} delay={0.05}>
          <section id="keyword-optimization" className={cardClass}>
            <h2 className="text-2xl font-bold sm:text-3xl">Keyword Optimization</h2>
            <p className="mt-2 text-gray-700 dark:text-slate-300">
              Help recruiters understand how your real experience relates to the role.
              Use the job description as context, not as a source of new qualifications:
            </p>
            <StaggeredContainer className="mt-6 space-y-4" staggerDelay={0.05} initialDelay={0.05}>
              {keywordSteps.map((step, index) => (
                <StaggeredItem key={step.title}>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-5 transition-colors hover:bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10 dark:hover:bg-blue-500/15">
                    <h3 className="text-base font-semibold text-blue-900 dark:text-blue-200 sm:text-lg">
                      {index + 1}. {step.title}
                    </h3>
                    <p className="mt-2 text-sm text-gray-700 dark:text-slate-300 sm:text-base">{step.body}</p>
                  </div>
                </StaggeredItem>
              ))}
            </StaggeredContainer>
          </section>
        </AnimatedElement>

        <AnimatedElement variants={fadeInUp} delay={0.05}>
          <section id="formatting" className={cardClass}>
            <h2 className="text-2xl font-bold sm:text-3xl">ATS-Friendly Formatting</h2>
            <p className="mt-2 text-gray-600 dark:text-slate-400">
              Two short checklists for the layout and styling decisions that affect parsing the most.
            </p>
            <div className="mt-6 grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-lg font-semibold text-gray-800 dark:text-slate-200">Layout &amp; Structure</h3>
                <ul className="space-y-2.5 text-gray-700 dark:text-slate-300">
                  {layoutBullets.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span aria-hidden="true" className="mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600 dark:bg-blue-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-3 text-lg font-semibold text-gray-800 dark:text-slate-200">Fonts &amp; Styling</h3>
                <ul className="space-y-2.5 text-gray-700 dark:text-slate-300">
                  {fontBullets.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span aria-hidden="true" className="mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-600 dark:bg-blue-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </AnimatedElement>

        <AnimatedElement variants={fadeInUp} delay={0.05}>
          <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 p-8 text-center shadow-lg sm:p-10">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              Ready to Create Your ATS-Optimized Resume?
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-blue-100 sm:text-lg">
              Organize your experience, review common formatting issues, and check the final document before applying.
            </p>
            <div className="mt-6 flex justify-center">
              <TouchLink
                to="/builder"
                className="inline-flex min-h-[3rem] items-center justify-center rounded-xl bg-white px-7 text-base font-semibold text-blue-700 shadow-md transition-transform hover:scale-[1.02] hover:bg-gray-50"
                ariaLabel="Build your resume now"
              >
                Build your resume now
              </TouchLink>
            </div>
          </section>
        </AnimatedElement>
      </div>
    </motion.div>
  );
};

export default Learn;
