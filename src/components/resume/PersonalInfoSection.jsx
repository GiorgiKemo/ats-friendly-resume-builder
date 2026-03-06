import React, { useState, useCallback } from 'react';
import { useResume } from '../../context/ResumeContext';
import Input from '../ui/Input';
import PhoneInputWithCountry from '../ui/PhoneInputWithCountry';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^https?:\/\/.+/;

const validateField = (name, value) => {
  if (!value) return null; // empty is ok (required is handled by HTML5)
  switch (name) {
    case 'email':
      return EMAIL_REGEX.test(value) ? null : 'Please enter a valid email address';
    case 'linkedin':
      return !value || URL_REGEX.test(value) ? null : 'Please enter a valid URL (https://...)';
    case 'website':
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
    // Clear error on change
    setErrors((prev) => ({ ...prev, [name]: null }));
    updateCurrentResume({
      personalInfo: {
        ...personalInfo,
        [name]: value
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Full Name"
          id="fullName"
          name="fullName"
          value={personalInfo.fullName || ''}
          onChange={handleChange}
          required
          tooltip="Use your full legal name for ATS compatibility"
          placeholder="John Doe"
        />

        <Input
          label="Job Title"
          id="jobTitle"
          name="jobTitle"
          value={personalInfo.jobTitle || ''}
          onChange={handleChange}
          tooltip="Use a specific title that matches your target position"
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
          value={personalInfo.linkedin || ''}
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
          value={personalInfo.website || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.website}
          tooltip="Include your personal website or portfolio if relevant"
          placeholder="https://johndoe.com"
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
          <Input
            label="Professional Summary"
            id="summary"
            name="summary"
            value={personalInfo.summary || ''}
            onChange={handleChange}
            tooltip="Keep this concise (2-3 sentences) and focused on your key qualifications"
            placeholder="Experienced software engineer with 5+ years of expertise in developing scalable web applications..."
          />
          <p className="mt-2 text-sm text-gray-500">
            A brief 2-3 sentence overview of your professional background, key skills, and career goals.
            This should be tailored to each job application.
          </p>
        </div>
      </div>

      <div className="mt-8 p-4 bg-yellow-50 rounded-md">
        <h3 className="font-medium text-yellow-800 mb-2">ATS Tip</h3>
        <p className="text-sm text-yellow-700">
          Avoid using headers, footers, tables, or images in your resume as ATS systems often can't read them properly.
          Stick to plain text formatting for maximum compatibility.
        </p>
      </div>
    </div>
  );
};

export default PersonalInfoSection;
