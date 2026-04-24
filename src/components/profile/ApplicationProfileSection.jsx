import React from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';

const YES_NO_OPTIONS = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
  { value: 'Prefer not to answer', label: 'Prefer not to answer' },
];

const WORK_SETUP_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
];

const SOURCE_OPTIONS = [
  { value: 'LinkedIn', label: 'LinkedIn' },
  { value: 'Company careers page', label: 'Company careers page' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Indeed', label: 'Indeed' },
  { value: 'Google Jobs', label: 'Google Jobs' },
  { value: 'Other', label: 'Other' },
];

const EEO_OPTIONS = [
  { value: 'Prefer not to answer', label: 'Prefer not to answer' },
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Non-binary', label: 'Non-binary' },
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
];

const VETERAN_OPTIONS = [
  { value: 'Prefer not to answer', label: 'Prefer not to answer' },
  { value: 'I am not a protected veteran', label: 'I am not a protected veteran' },
  { value: 'I identify as one or more classifications of protected veteran', label: 'Protected veteran' },
];

const DISABILITY_OPTIONS = [
  { value: 'Prefer not to answer', label: 'Prefer not to answer' },
  { value: 'No, I do not have a disability and have not had one in the past', label: 'No' },
  { value: 'Yes, I have a disability or have had one in the past', label: 'Yes' },
];

const ApplicationProfileSection = ({ data = {}, onChange }) => {
  const handleChange = (event) => {
    const { name, value } = event.target;
    onChange({
      ...data,
      [name]: value,
    });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Application Autofill Profile</h2>
      <p className="text-sm text-gray-600 dark:text-slate-400 mb-6">
        These answers help the browser extension fill ATS-specific questions and dropdowns without guessing.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Legally authorized to work?"
          id="workAuthorization"
          name="workAuthorization"
          value={data.workAuthorization || 'Yes'}
          onChange={handleChange}
          options={YES_NO_OPTIONS}
          tooltip="Used for work authorization dropdowns and yes/no questions."
        />

        <Select
          label="Require visa sponsorship?"
          id="requiresSponsorship"
          name="requiresSponsorship"
          value={data.requiresSponsorship || 'No'}
          onChange={handleChange}
          options={YES_NO_OPTIONS}
          tooltip="Used for sponsorship, H1-B, visa, and work permit questions."
        />

        <Input
          label="Current city"
          id="city"
          name="city"
          value={data.city || ''}
          onChange={handleChange}
          placeholder="Tbilisi"
        />

        <Input
          label="State / Province"
          id="stateProvince"
          name="stateProvince"
          value={data.stateProvince || ''}
          onChange={handleChange}
          placeholder="Georgia, Silesian, California"
        />

        <Input
          label="Country"
          id="country"
          name="country"
          value={data.country || ''}
          onChange={handleChange}
          placeholder="Poland"
        />

        <Select
          label="Preferred work setup"
          id="preferredWorkSetup"
          name="preferredWorkSetup"
          value={data.preferredWorkSetup || 'any'}
          onChange={handleChange}
          options={WORK_SETUP_OPTIONS}
        />

        <Input
          label="Notice period / availability"
          id="noticePeriod"
          name="noticePeriod"
          value={data.noticePeriod || ''}
          onChange={handleChange}
          placeholder="Two weeks notice"
        />

        <Input
          label="Salary expectation"
          id="salaryExpectation"
          name="salaryExpectation"
          value={data.salaryExpectation || ''}
          onChange={handleChange}
          placeholder="$80,000 - $100,000"
        />

        <Input
          label="Years of experience"
          id="yearsOfExperience"
          name="yearsOfExperience"
          value={data.yearsOfExperience || ''}
          onChange={handleChange}
          placeholder="5"
        />

        <Input
          label="Highest degree"
          id="highestEducation"
          name="highestEducation"
          value={data.highestEducation || ''}
          onChange={handleChange}
          placeholder="Bachelor's in Computer Science"
        />

        <Input
          label="School / university"
          id="school"
          name="school"
          value={data.school || ''}
          onChange={handleChange}
          placeholder="University name"
        />

        <Input
          label="Degree currently pursuing"
          id="degreePursuing"
          name="degreePursuing"
          value={data.degreePursuing || ''}
          onChange={handleChange}
          placeholder="Bachelor's, Master's, none"
        />

        <Select
          label="Where did you hear about jobs?"
          id="heardAbout"
          name="heardAbout"
          value={data.heardAbout || 'LinkedIn'}
          onChange={handleChange}
          options={SOURCE_OPTIONS}
        />

        <Select
          label="Referred by employee?"
          id="referredByEmployee"
          name="referredByEmployee"
          value={data.referredByEmployee || 'No'}
          onChange={handleChange}
          options={YES_NO_OPTIONS}
        />

        <Input
          label="Referral name"
          id="referralName"
          name="referralName"
          value={data.referralName || ''}
          onChange={handleChange}
          placeholder="Employee name, if any"
        />

        <Select
          label="Current employee?"
          id="currentEmployee"
          name="currentEmployee"
          value={data.currentEmployee || 'No'}
          onChange={handleChange}
          options={YES_NO_OPTIONS}
        />

        <Select
          label="Previously employed by company?"
          id="previousEmployee"
          name="previousEmployee"
          value={data.previousEmployee || 'No'}
          onChange={handleChange}
          options={YES_NO_OPTIONS}
        />

        <Input
          label="Previous employment details"
          id="previousEmploymentDetails"
          name="previousEmploymentDetails"
          value={data.previousEmploymentDetails || ''}
          onChange={handleChange}
          placeholder="Company and dates, if applicable"
        />

        <Select
          label="Background check consent"
          id="backgroundCheckConsent"
          name="backgroundCheckConsent"
          value={data.backgroundCheckConsent || 'Yes'}
          onChange={handleChange}
          options={YES_NO_OPTIONS}
        />

        <Select
          label="Privacy / recruiting consent"
          id="privacyConsent"
          name="privacyConsent"
          value={data.privacyConsent || 'Yes'}
          onChange={handleChange}
          options={YES_NO_OPTIONS}
        />

        <Select
          label="Gender default"
          id="gender"
          name="gender"
          value={data.gender || 'Prefer not to answer'}
          onChange={handleChange}
          options={EEO_OPTIONS}
        />

        <Select
          label="Hispanic / Latino default"
          id="hispanicLatino"
          name="hispanicLatino"
          value={data.hispanicLatino || 'Prefer not to answer'}
          onChange={handleChange}
          options={YES_NO_OPTIONS}
        />

        <Select
          label="Veteran status default"
          id="veteranStatus"
          name="veteranStatus"
          value={data.veteranStatus || 'Prefer not to answer'}
          onChange={handleChange}
          options={VETERAN_OPTIONS}
        />

        <Select
          label="Disability status default"
          id="disabilityStatus"
          name="disabilityStatus"
          value={data.disabilityStatus || 'Prefer not to answer'}
          onChange={handleChange}
          options={DISABILITY_OPTIONS}
        />
      </div>

      <Textarea
        label="Relevant courses / certifications"
        id="relevantCourses"
        name="relevantCourses"
        value={data.relevantCourses || ''}
        onChange={handleChange}
        rows={3}
        placeholder="UI/UX Design, Human-Computer Interaction, React, Accessibility..."
      />

      <Textarea
        label="Accommodation request"
        id="accommodationRequest"
        name="accommodationRequest"
        value={data.accommodationRequest || ''}
        onChange={handleChange}
        rows={3}
        placeholder="Leave blank unless you want the extension to fill an accommodation request."
      />

      <div className="mt-6 rounded-md bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        The extension will still stop before submitting. Review sensitive answers like EEO, disability, veteran status, consent, and sponsorship before you submit.
      </div>
    </div>
  );
};

export default ApplicationProfileSection;
