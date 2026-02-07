import React from 'react';
import { useResume } from '../../context/ResumeContext';
import Select from '../ui/Select';

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
    { value: 'ats-friendly', label: 'ATS-Optimized - Maximized for applicant tracking systems' },
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
          tooltip="All templates are ATS-friendly with clean, single-column layouts"
        />

        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4">Template Selection</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            {templates.map((template) => (
              <div
                key={template.value}
                className={`border rounded-lg overflow-hidden cursor-pointer transition-all ${
                  currentResume.selectedTemplate === template.value
                    ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
                onClick={() => updateCurrentResume({ selectedTemplate: template.value })}
              >
                <div className="p-4 md:p-5">
                  <h4 className={`text-base md:text-lg font-medium mb-2 ${
                    currentResume.selectedTemplate === template.value ? 'text-blue-600' : 'text-gray-700'
                  }`}>
                    {template.label.split(' - ')[0]}
                  </h4>
                  <p className="text-sm text-gray-600 mb-3">
                    {template.label.split(' - ')[1] || 'Professional template'}
                  </p>

                  {/* Template preview using CSS instead of images */}
                  <div className="h-32 border border-gray-200 rounded bg-gray-50 flex items-center justify-center mb-3">
                    <div className="w-3/4 h-5/6 flex flex-col p-2">
                      {template.value === 'ats-friendly' && (
                        <>
                          <div className="w-full h-4 bg-gray-300 mb-2 rounded"></div>
                          <div className="w-3/4 h-3 bg-gray-300 mb-3 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                          <div className="w-2/3 h-3 bg-gray-300 mb-3 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 rounded"></div>
                        </>
                      )}
                      {template.value === 'basic' && (
                        <>
                          <div className="w-full h-4 bg-gray-300 mb-3 rounded text-center"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                          <div className="w-3/4 h-3 bg-gray-300 mb-3 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 rounded"></div>
                        </>
                      )}
                      {template.value === 'minimalist' && (
                        <>
                          <div className="w-1/2 h-4 bg-gray-300 mb-3 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                          <div className="w-3/4 h-3 bg-gray-300 mb-3 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 rounded"></div>
                        </>
                      )}
                      {template.value === 'traditional' && (
                        <>
                          <div className="w-full h-4 bg-gray-300 mb-2 rounded text-center"></div>
                          <div className="w-full border-t border-gray-300 mb-2"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                          <div className="w-3/4 h-3 bg-gray-300 mb-3 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                        </>
                      )}
                      {template.value === 'modern' && (
                        <>
                          <div className="w-full h-6 bg-gray-200 mb-2 rounded p-1">
                            <div className="w-1/2 h-full bg-gray-300 rounded"></div>
                          </div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                          <div className="w-3/4 h-3 bg-gray-300 mb-3 rounded"></div>
                          <div className="w-full h-3 bg-gray-300 mb-1 rounded"></div>
                        </>
                      )}
                    </div>
                  </div>

                  {template.value === 'ats-friendly' && (
                    <div className="text-xs text-green-600 font-medium">
                      ✓ Optimized for ATS systems
                    </div>
                  )}
                </div>
              </div>
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
          tooltip="All fonts are ATS-friendly and professional"
        />

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          {fonts.map((font) => (
            <div
              key={font.value}
              className={`p-3 md:p-4 border rounded-lg cursor-pointer transition-all ${
                currentResume.selectedFont === font.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => updateCurrentResume({ selectedFont: font.value })}
              style={{ fontFamily: font.value }}
            >
              <p className="text-base md:text-lg mb-1 md:mb-2">{font.label}</p>
              <p className="text-xs md:text-sm text-gray-600 truncate">
                AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz
              </p>
              <p className="text-xs md:text-sm text-gray-600">
                1234567890!@#$%^&*()
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 p-4 bg-yellow-50 rounded-md">
        <h3 className="font-medium text-yellow-800 mb-2">ATS Template Guidelines</h3>
        <ul className="list-disc list-inside text-sm text-yellow-700 space-y-2">
          <li>All templates use a single-column layout for maximum ATS compatibility</li>
          <li>Avoid using headers, footers, tables, or images as ATS systems often can't read them</li>
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
