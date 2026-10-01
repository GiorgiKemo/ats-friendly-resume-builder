import React, { useLayoutEffect, useRef, useState } from 'react';
import { useResume } from '../../context/ResumeContext';
import ATSFriendlyTemplate from '../templates/ATSFriendlyTemplate';
import BasicTemplate from '../templates/BasicTemplate';
import MinimalistTemplate from '../templates/MinimalistTemplate';
import TraditionalTemplate from '../templates/TraditionalTemplate';
import ModernTemplate from '../templates/ModernTemplate';
import { RESUME_TEMPLATES, RESUME_TEMPLATE_IDS } from '../../../supabase/functions/_shared/resume/templates.js';

const PREVIEW_RESUME = {
  personalInfo: {
    fullName: 'Alex Morgan',
    jobTitle: 'Senior Product Designer',
    email: 'alex@example.com',
    phone: '(555) 010-2030',
    location: 'Austin, TX',
    summary: 'Product designer with eight years of experience shaping clear, accessible experiences for growing software teams. Pairs qualitative research with fast iteration and works closely with engineering to ship polished, measurable improvements.',
  },
  workExperience: [{
    jobTitle: 'Senior Product Designer',
    company: 'Northstar',
    location: 'Remote',
    startDate: '2022-01',
    current: true,
    description: '- Led the onboarding redesign that lifted activation by 18% across web and mobile.\n- Partnered with engineering on an accessible component library used by 12 product teams.\n- Ran monthly research sessions and turned findings into a shared roadmap.',
  }, {
    jobTitle: 'Product Designer',
    company: 'Brightline',
    location: 'Austin, TX',
    startDate: '2019-06',
    endDate: '2021-12',
    description: '- Shipped the mobile checkout used by 200k customers each month.\n- Cut support tickets about billing by 30% with clearer account settings.\n- Mentored two junior designers through their first product launches.',
  }, {
    jobTitle: 'UX Designer',
    company: 'Fieldnote Studio',
    location: 'Denver, CO',
    startDate: '2017-03',
    endDate: '2019-05',
    description: '- Designed websites and prototypes for 15 clients in health and education.\n- Introduced usability testing to the studio delivery process.',
  }],
  education: [{ degree: 'B.A. Design', institution: 'State University', startDate: '2013', endDate: '2017' }],
  skills: ['User research', 'Figma', 'Accessibility (WCAG 2.2)', 'Prototyping', 'Design systems', 'Usability testing', 'HTML & CSS'],
  certifications: [{ name: 'Certified Usability Analyst', issuer: 'Human Factors International', date: '2020-04' }],
  projects: [{ title: 'Open accessibility checklist', description: 'Maintains a free checklist used by design teams to review interfaces before release.' }],
  additionalSections: [],
};

// US Letter at CSS pixel density; the thumbnail scales the real page to fit.
const PAGE_WIDTH_PX = 816;
const PAGE_HEIGHT_PX = 1056;

const TemplatePreview = ({ template }) => {
  const props = { resume: PREVIEW_RESUME };
  if (template === 'ats-friendly') return <ATSFriendlyTemplate {...props} />;
  if (template === 'minimalist') return <MinimalistTemplate {...props} />;
  if (template === 'traditional') return <TraditionalTemplate {...props} />;
  if (template === 'modern') return <ModernTemplate {...props} />;
  return <BasicTemplate {...props} />;
};

// Renders a full page at its true proportions, scaled to the card width, so
// the thumbnail is never cropped or stretched.
const PageThumbnail = ({ template }) => {
  const frameRef = useRef(null);
  const [scale, setScale] = useState(0.3);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const measure = () => {
      const width = frame.clientWidth;
      if (width > 0) setScale(width / PAGE_WIDTH_PX);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      className="relative w-full overflow-hidden rounded-[6px] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-12px_rgba(15,23,42,0.28)] ring-1 ring-black/5 transition-transform duration-300 ease-out group-hover:-translate-y-1"
      style={{ aspectRatio: `${PAGE_WIDTH_PX} / ${PAGE_HEIGHT_PX}` }}
    >
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left select-none"
        style={{ width: PAGE_WIDTH_PX, minHeight: PAGE_HEIGHT_PX, transform: `scale(${scale})` }}
      >
        <TemplatePreview template={template.value} />
      </div>
    </div>
  );
};

const TemplateSelector = () => {
  const { currentResume, updateCurrentResume } = useResume();
  const templates = RESUME_TEMPLATE_IDS.map((id) => ({
    value: id,
    name: RESUME_TEMPLATES[id].name,
    tagline: RESUME_TEMPLATES[id].tagline,
    accent: RESUME_TEMPLATES[id].accent,
  }));
  const activeTemplate = RESUME_TEMPLATES[currentResume.selectedTemplate] ? currentResume.selectedTemplate : 'basic';

  return (
    <div>
      <div className="mb-8 max-w-xl">
        <h2 className="text-2xl font-bold tracking-tight">Choose a design</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-slate-400">
          Every design keeps one reading column and real, selectable text. Your PDF and DOCX downloads match the one you pick.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:gap-x-7 lg:grid-cols-3">
        {templates.map((template) => {
          const selected = template.value === activeTemplate;
          return (
            <button
              key={template.value}
              type="button"
              aria-pressed={currentResume.selectedTemplate === template.value}
              aria-label={`Use the ${template.name} design`}
              onClick={() => updateCurrentResume({ selectedTemplate: template.value })}
              className="group flex w-full flex-col text-left focus:outline-none"
            >
              {/* Render the real template so the choice matches the preview and the downloads. */}
              <div
                aria-hidden="true"
                className={`relative w-full rounded-2xl p-2.5 transition-[background-color,box-shadow] duration-200 sm:p-4 group-focus-visible:ring-2 group-focus-visible:ring-blue-500 group-focus-visible:ring-offset-2 dark:group-focus-visible:ring-offset-slate-900 ${
                  selected
                    ? 'bg-blue-50 ring-2 ring-blue-600 dark:bg-blue-500/10 dark:ring-blue-400'
                    : 'bg-slate-100 group-hover:bg-slate-200/70 dark:bg-slate-900 dark:group-hover:bg-slate-900/70'
                }`}
              >
                <PageThumbnail template={template} />
                {selected && (
                  <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-blue-600 text-white shadow-md ring-4 ring-white dark:bg-blue-500 dark:ring-slate-800 sm:right-3 sm:top-3">
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4"><path d="m4 8.5 2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                )}
              </div>
              <span className="mt-3 flex items-center gap-2 px-1">
                <span aria-hidden="true" className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: template.accent }} />
                <span className={`text-sm font-semibold ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-slate-100'}`}>{template.name}</span>
              </span>
              <span className="mt-0.5 line-clamp-2 px-1 text-xs leading-relaxed text-gray-500 dark:text-slate-400">{template.tagline}</span>
            </button>
          );
        })}
      </div>

      <details className="group/notes mt-10 rounded-2xl border border-gray-200 p-4 text-sm dark:border-slate-700">
        <summary className="cursor-pointer list-none font-medium text-gray-700 marker:hidden dark:text-slate-200">
          <span className="inline-flex items-center gap-2">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 transition-transform group-open/notes:rotate-90"><path d="m7.5 5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            What keeps these designs readable
          </span>
        </summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-10 text-gray-500 dark:text-slate-400">
          <li>A single reading column, so text is read top to bottom in the order you see it.</li>
          <li>Real text for every word: no images, tables, text boxes or icons carrying content.</li>
          <li>Familiar section headings such as “Work Experience,” “Education” and “Skills.”</li>
          <li>Contact details in the page body rather than in a header or footer.</li>
          <li>Color and rules are decoration only; parsing varies by employer, so follow any format they request.</li>
        </ul>
      </details>
    </div>
  );
};

export default TemplateSelector;
