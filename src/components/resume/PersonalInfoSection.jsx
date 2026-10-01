import React, { useState, useCallback } from 'react';
import { useResume } from '../../context/ResumeContext';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import PhoneInputWithCountry from '../ui/PhoneInputWithCountry';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^https?:\/\/.+/;
const PROFESSIONAL_LINK_FIELDS = {
  linkedin: 'linkedin',
  website: 'portfolio',
  github: 'github',
  other: 'other',
};

const validateField = (name, value) => {
  if (!value) return null; // empty is ok (required is handled by HTML5)
  switch (name) {
    case 'email':
      return EMAIL_REGEX.test(value) ? null : 'Please enter a valid email address';
    case 'linkedin':
    case 'website':
    case 'github':
    case 'other':
      return !value || URL_REGEX.test(value) ? null : 'Please enter a valid URL (https://...)';
    default:
      return null;
  }
};

const PersonalInfoSection = () => {
  const { currentResume, updateCurrentResume } = useResume();
  const { personalInfo = {} } = currentResume;
  const [errors, setErrors] = useState({});

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    const currentProfessionalLinks = personalInfo.professionalLinks || {};
    const professionalLinkKey = PROFESSIONAL_LINK_FIELDS[name];
    const nextProfessionalLinks = professionalLinkKey ? {
      ...currentProfessionalLinks,
      [professionalLinkKey]: value,
    } : currentProfessionalLinks;

    // Clear error on change
    setErrors((prev) => ({ ...prev, [name]: null }));

    updateCurrentResume({
      personalInfo: {
        ...personalInfo,
        [name]: value,
        ...(name === 'website' ? { portfolio: value } : {}),
        professionalLinks: nextProfessionalLinks,
      }
    });
  }, [personalInfo, updateCurrentResume]);

  const handleBlur = useCallback((e) => {
    const { name, value } = e.target;
    const error = validateField(name, value);
    if (error) {
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Personal Information</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5">
        <Input
          label="Full Name"
          id="fullName"
          name="fullName"
          value={personalInfo.fullName || ''}
          onChange={handleChange}
          required
          tooltip="Use the professional name you want employers to see"
          placeholder="John Doe"
        />

        <Input
          label="Resume headline"
          id="jobTitle"
          name="jobTitle"
          value={personalInfo.jobTitle || ''}
          onChange={handleChange}
          hint="Match your actual experience. For a goal role, write e.g. Target role: Software Engineer, or leave this blank."
          placeholder="Software Engineer"
        />

        <Input
          label="Email"
          id="email"
          name="email"
          type="email"
          value={personalInfo.email || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.email}
          required
          tooltip="Use a professional email address"
          placeholder="john.doe@example.com"
        />

        <PhoneInputWithCountry
          label="Phone"
          id="phone"
          name="phone"
          value={personalInfo.phone || ''}
          onChange={handleChange}
          tooltip="Select country code and enter your phone number"
          placeholder="Phone number"
        />

        <Input
          label="LinkedIn"
          id="linkedin"
          name="linkedin"
          value={personalInfo.linkedin || personalInfo.professionalLinks?.linkedin || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.linkedin}
          tooltip="Include your full LinkedIn URL"
          placeholder="https://linkedin.com/in/johndoe"
        />

        <Input
          label="Website/Portfolio"
          id="website"
          name="website"
          value={personalInfo.website || personalInfo.portfolio || personalInfo.professionalLinks?.portfolio || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.website}
          tooltip="Include your personal website or portfolio if relevant"
          placeholder="https://johndoe.com"
        />

        <Input
          label="GitHub Profile"
          id="github"
          name="github"
          value={personalInfo.github || personalInfo.professionalLinks?.github || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.github}
          tooltip="Include your GitHub URL for technical roles or public code samples"
          placeholder="https://github.com/johndoe"
        />

        <Input
          label="Other Professional Link"
          id="other"
          name="other"
          value={personalInfo.other || personalInfo.professionalLinks?.other || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.other}
          tooltip="Add another relevant profile such as Behance, Dribbble, Medium, or Substack"
          placeholder="https://medium.com/@johndoe"
        />

        <Input
          label="Location"
          id="location"
          name="location"
          value={personalInfo.location || ''}
          onChange={handleChange}
          tooltip="For US locations, use 'City, State' format (e.g., 'New York, NY'). For international locations, use 'City, Country' format with full country name (e.g., 'Tbilisi, Georgia' or 'London, United Kingdom')."
          placeholder="City, State/Country"
          className="md:col-span-2"
        />

        <div className="md:col-span-2">
          <Textarea
            label="Professional Summary"
            id="summary"
            name="summary"
            value={personalInfo.summary || ''}
            onChange={handleChange}
            tooltip="Keep this concise (2-3 sentences) and focused on your key qualifications"
            rows={4}
            hint="Tailor it to each job you apply for."
            placeholder="Describe your relevant experience, strongest skills, and the value you bring."
          />
        </div>
      </div>

      <div className="mt-4 flex gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2z" />
        </svg>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">ATS tip</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Avoid headers, footers, tables, or images when the employer's instructions or parser may not support them.
            Keep the reading order simple and review the exported file before applying.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PersonalInfoSection;
