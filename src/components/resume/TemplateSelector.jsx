import React from 'react';
import { useResume } from '../../context/ResumeContext';
import Select from '../ui/Select';
import ATSFriendlyTemplate from '../templates/ATSFriendlyTemplate';
import BasicTemplate from '../templates/BasicTemplate';
import MinimalistTemplate from '../templates/MinimalistTemplate';
import TraditionalTemplate from '../templates/TraditionalTemplate';
import ModernTemplate from '../templates/ModernTemplate';

const PREVIEW_RESUME = {
  personalInfo: {
    fullName: 'Alex Morgan',
    jobTitle: 'Product Designer',
    email: 'alex@example.com',
    location: 'Remote',
    summary: 'Designs clear, accessible product experiences for growing teams.',
  },
  workExperience: [{
    jobTitle: 'Product Designer',
    company: 'Northstar',
    startDate: '2022-01',
    current: true,
    description: 'Improved onboarding clarity and partnered with engineering on accessible interfaces.',
  }],
  education: [{ degree: 'B.A. Design', institution: 'State University', endDate: '2021' }],
  skills: ['Research', 'Figma', 'Accessibility'],
  projects: [{ title: 'Portfolio refresh', description: 'Simplified the case-study navigation.' }],
  certifications: [],
  additionalSections: [],
  selectedFont: 'Arial',
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

  const handleTemplateChange = (e) => {
    updateCurrentResume({
      selectedTemplate: e.target.value
    });
  };

  const handleFontChange = (e) => {
    updateCurrentResume({
      selectedFont: e.target.value
    });
  };

  const templates = [
    { value: 'ats-friendly', label: 'ATS-Friendly - Clear single-column structure' },
    { value: 'basic', label: 'Basic - Clean and minimal' },
    { value: 'minimalist', label: 'Minimalist - Simple and elegant' },
    { value: 'traditional', label: 'Traditional - Classic professional look' },
    { value: 'modern', label: 'Modern - Contemporary design' },
  ];

  const fonts = [
    { value: 'Arial', label: 'Arial' },
    { value: 'Calibri', label: 'Calibri' },
    { value: 'Garamond', label: 'Garamond' },
    { value: 'Helvetica', label: 'Helvetica' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Lora', label: 'Lora' },
    { value: 'Roboto', label: 'Roboto' },
    { value: 'Ubuntu', label: 'Ubuntu' },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Template Selection</h2>

      <div className="mb-8">
        <Select
          label="Choose a Template"
          id="template"
          options={templates}
          value={currentResume.selectedTemplate || 'basic'}
          onChange={handleTemplateChange}
          tooltip="All templates use readable, single-column layouts; parsing varies by employer"
        />

        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4">Template Selection</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            {templates.map((template) => (
              <button
                key={template.value}
                type="button"
                aria-pressed={currentResume.selectedTemplate === template.value}
                aria-label={`Choose ${template.label}`}
                className={`w-full border rounded-lg overflow-hidden text-left transition-[border-color,background-color,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  currentResume.selectedTemplate === template.value
                    ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 bg-white dark:bg-slate-800'
                }`}
                onClick={() => updateCurrentResume({ selectedTemplate: template.value })}
              >
                <div className="p-4 md:p-5">
                  <h4 className={`text-base md:text-lg font-medium mb-2 ${
                    currentResume.selectedTemplate === template.value ? 'text-blue-600' : 'text-gray-700 dark:text-slate-300'
                  }`}>
                    {template.label.split(' - ')[0]}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
                    {template.label.split(' - ')[1] || 'Professional template'}
                  </p>

                  {/* Render the actual template so the choice matches the resume preview. */}
                  <div aria-hidden="true" className="relative mb-3 h-40 overflow-hidden rounded border border-gray-200 bg-gray-50 dark:border-slate-600 dark:bg-slate-900">
                    <div
                      className="pointer-events-none origin-top-left"
                      style={{ transform: 'scale(0.29)', width: '345%', height: '345%' }}
                    >
                      <TemplatePreview template={template.value} />
                    </div>
                  </div>

                  {template.value === 'ats-friendly' && (
                    <div className="text-xs font-medium text-green-600">
                      Readable single-column structure
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-8">
        <Select
          label="Choose a Font"
          id="font"
          options={fonts}
          value={currentResume.selectedFont || 'Arial'}
          onChange={handleFontChange}
          tooltip="These are common, readable choices; follow the employer's format requirements"
        />

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          {fonts.map((font) => (
            <button
              key={font.value}
              type="button"
              aria-pressed={currentResume.selectedFont === font.value}
              aria-label={`Choose ${font.label} font`}
              className={`w-full p-3 text-left md:p-4 border rounded-lg transition-[border-color,background-color,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                currentResume.selectedFont === font.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 dark:hover:bg-slate-800/70'
              }`}
              onClick={() => updateCurrentResume({ selectedFont: font.value })}
              style={{ fontFamily: font.value }}
            >
              <p className="text-base md:text-lg mb-1 md:mb-2">{font.label}</p>
              <p className="text-xs md:text-sm text-gray-600 dark:text-slate-400 truncate">
                AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz
              </p>
              <p className="text-xs md:text-sm text-gray-600 dark:text-slate-400">
                1234567890!@#$%^&*()
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
        <h3 className="font-medium text-yellow-800 dark:text-yellow-300 mb-2">ATS Template Guidelines</h3>
        <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-400 space-y-2">
          <li>Single-column layouts and familiar headings make the reading order easier to review.</li>
          <li>Avoid headers, footers, tables, or images when the employer's instructions or parser may not support them.</li>
          <li>Use standard section headings like "Work Experience," "Education," and "Skills"</li>
          <li>Keep formatting simple with standard bullet points and minimal styling</li>
          <li>Use 11-12pt font size for body text and 14-16pt for headers</li>
          <li>Maintain 1-inch margins for better readability</li>
        </ul>
      </div>
    </div>
  );
};

export default TemplateSelector;
