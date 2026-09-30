import React from 'react';
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
    jobTitle: 'Product Designer',
    email: 'alex@example.com',
    phone: '(555) 010-2030',
    location: 'Remote',
    summary: 'Designs clear, accessible product experiences for growing teams, pairing research with fast iteration.',
  },
  workExperience: [{
    jobTitle: 'Senior Product Designer',
    company: 'Northstar',
    startDate: '2022-01',
    current: true,
    description: '- Led the onboarding redesign that lifted activation by 18%.\n- Partnered with engineering on an accessible component library.',
  }, {
    jobTitle: 'Product Designer',
    company: 'Brightline',
    startDate: '2019-06',
    endDate: '2021-12',
    description: '- Shipped the mobile checkout used by 200k customers.',
  }],
  education: [{ degree: 'B.A. Design', institution: 'State University', startDate: '2015', endDate: '2019' }],
  skills: ['User research', 'Figma', 'Accessibility', 'Prototyping', 'Design systems'],
  projects: [],
  certifications: [],
  additionalSections: [],
};

const TemplatePreview = ({ template }) => {
  const props = { resume: PREVIEW_RESUME };
  if (template === 'ats-friendly') return <ATSFriendlyTemplate {...props} />;
  if (template === 'minimalist') return <MinimalistTemplate {...props} />;
  if (template === 'traditional') return <TraditionalTemplate {...props} />;
  if (template === 'modern') return <ModernTemplate {...props} />;
  return <BasicTemplate {...props} />;
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
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Choose a design</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
          Every design is a clear, ATS-friendly resume layout: one reading column, real selectable text and standard section headings. Your PDF and DOCX downloads use the design you pick here.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const selected = currentResume.selectedTemplate === template.value || (!RESUME_TEMPLATES[currentResume.selectedTemplate] && template.value === activeTemplate);
          return (
            <button
              key={template.value}
              type="button"
              aria-pressed={currentResume.selectedTemplate === template.value}
              aria-label={`Use the ${template.name} design`}
              onClick={() => updateCurrentResume({ selectedTemplate: template.value })}
              className={`group relative flex w-full flex-col overflow-hidden rounded-2xl border text-left transition-[border-color,box-shadow,transform] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                selected
                  ? 'border-blue-600 shadow-[0_0_0_3px_rgba(37,99,235,0.18)] dark:border-blue-400'
                  : 'border-gray-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg dark:border-slate-600 dark:hover:border-slate-500'
              }`}
            >
              {/* Render the real template so the choice matches the preview and the downloads. */}
              <div aria-hidden="true" className="relative h-52 overflow-hidden bg-slate-100 dark:bg-slate-900">
                <div className="pointer-events-none absolute left-1/2 top-4 w-[8.5in] origin-top -translate-x-1/2 scale-[0.36] shadow-[0_8px_24px_-8px_rgba(15,23,42,0.35)] transition-transform duration-300 group-hover:scale-[0.375]">
                  <TemplatePreview template={template.value} />
                </div>
                {selected && (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow">
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5"><path d="m4 8.5 2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Selected
                  </span>
                )}
              </div>
              <div className="flex flex-1 items-start gap-3 border-t border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <span aria-hidden="true" className="mt-1 h-3 w-3 flex-shrink-0 rounded-full" style={{ background: template.accent }} />
                <span className="min-w-0">
                  <span className={`block text-base font-semibold ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-slate-100'}`}>{template.name}</span>
                  <span className="mt-0.5 block text-sm text-gray-600 dark:text-slate-400">{template.tagline}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-8 rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
        <h3 className="font-semibold text-blue-900 dark:text-blue-200">What keeps these designs readable</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-blue-900/80 dark:text-blue-200/80">
          <li>A single reading column, so text is read top to bottom in the order you see it.</li>
          <li>Real text for every word: no images, tables, text boxes or icons carrying content.</li>
          <li>Familiar section headings such as “Work Experience,” “Education” and “Skills.”</li>
          <li>Contact details in the page body rather than in a header or footer.</li>
          <li>Color and rules are decoration only; parsing varies by employer, so follow any format they request.</li>
        </ul>
      </div>
    </div>
  );
};

export default TemplateSelector;
