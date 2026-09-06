import React from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';

const YES_NO_OPTIONS = [
  { value: '', label: 'Choose an answer (not provided)' },
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
  { value: '', label: 'Choose an answer (not provided)' },
  { value: 'LinkedIn', label: 'LinkedIn' },
  { value: 'Company careers page', label: 'Company careers page' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Indeed', label: 'Indeed' },
  { value: 'Google Jobs', label: 'Google Jobs' },
  { value: 'Other', label: 'Other' },
];

const EEO_OPTIONS = [
  { value: '', label: 'Choose an answer (not provided)' },
  { value: 'Prefer not to answer', label: 'Prefer not to answer' },
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Non-binary', label: 'Non-binary' },
];

const RACE_ETHNICITY_OPTIONS = [
  { value: '', label: 'Choose an answer (not provided)' },
  { value: 'Prefer not to answer', label: 'Prefer not to answer' },
  { value: 'American Indian or Alaska Native', label: 'American Indian or Alaska Native' },
  { value: 'Asian', label: 'Asian' },
  { value: 'Black or African American', label: 'Black or African American' },
  { value: 'Hispanic or Latino', label: 'Hispanic or Latino' },
  { value: 'Native Hawaiian or Other Pacific Islander', label: 'Native Hawaiian or Other Pacific Islander' },
  { value: 'Two or more races', label: 'Two or more races' },
  { value: 'White', label: 'White' },
];

const VETERAN_OPTIONS = [
  { value: '', label: 'Choose an answer (not provided)' },
  { value: 'Prefer not to answer', label: 'Prefer not to answer' },
  { value: 'I am not a protected veteran', label: 'I am not a protected veteran' },
  { value: 'I identify as one or more classifications of protected veteran', label: 'Protected veteran' },
];

const DISABILITY_OPTIONS = [
  { value: '', label: 'Choose an answer (not provided)' },
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
          value={data.workAuthorization || ''}
          onChange={handleChange}
          options={YES_NO_OPTIONS}
          tooltip="Used for work authorization dropdowns and yes/no questions."
        />

        <Select
          label="Require visa sponsorship?"
          id="requiresSponsorship"
          name="requiresSponsorship"
          value={data.requiresSponsorship || ''}
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
          value={data.heardAbout || ''}
          onChange={handleChange}
          options={SOURCE_OPTIONS}
        />

        <Select
          label="Referred by employee?"
          id="referredByEmployee"
          name="referredByEmployee"
          value={data.referredByEmployee || ''}
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
          value={data.currentEmployee || ''}
          onChange={handleChange}
          options={YES_NO_OPTIONS}
        />

        <Select
          label="Previously employed by company?"
          id="previousEmployee"
          name="previousEmployee"
          value={data.previousEmployee || ''}
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
          value={data.backgroundCheckConsent || ''}
          onChange={handleChange}
          options={YES_NO_OPTIONS}
        />

        <Select
          label="Privacy / recruiting consent"
          id="privacyConsent"
          name="privacyConsent"
          value={data.privacyConsent || ''}
          onChange={handleChange}
          options={YES_NO_OPTIONS}
        />

        <Select
          label="Gender default"
          id="gender"
          name="gender"
          value={data.gender || ''}
          onChange={handleChange}
          options={EEO_OPTIONS}
        />

        <Select
          label="Hispanic / Latino default"
          id="hispanicLatino"
          name="hispanicLatino"
          value={data.hispanicLatino || ''}
          onChange={handleChange}
          options={YES_NO_OPTIONS}
        />

        <Select
          label="Race / ethnicity default"
          id="raceEthnicity"
          name="raceEthnicity"
          value={data.raceEthnicity || ''}
          onChange={handleChange}
          options={RACE_ETHNICITY_OPTIONS}
        />

        <Select
          label="Veteran status default"
          id="veteranStatus"
          name="veteranStatus"
          value={data.veteranStatus || ''}
          onChange={handleChange}
          options={VETERAN_OPTIONS}
        />

        <Select
          label="Disability status default"
          id="disabilityStatus"
          name="disabilityStatus"
          value={data.disabilityStatus || ''}
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
      <section className="mt-8" aria-labelledby="saved-answers-title">
        <h3 id="saved-answers-title" className="text-lg font-semibold">Reusable application answers</h3>
        <p className="my-2 text-sm text-gray-600 dark:text-slate-400">Save answers once for matching questions. Use an employer hostname for company-specific answers. Sensitive questions still use the explicit profile answers above.</p>
        {(Array.isArray(data.reusableAnswers) ? data.reusableAnswers : []).map((entry, index) => (
          <div key={index} className="my-4 rounded-lg border border-gray-200 p-4 dark:border-slate-700">
            <Input label="Exact application question" id={`saved-question-${index}`} value={entry.question || ''} maxLength={500}
              onChange={event => onChange({ ...data, reusableAnswers: data.reusableAnswers.map((item, i) => i === index ? { ...item, question: event.target.value } : item) })} />
            <Textarea label="Your answer" id={`saved-answer-${index}`} value={entry.answer || ''} maxLength={4000}
              onChange={event => onChange({ ...data, reusableAnswers: data.reusableAnswers.map((item, i) => i === index ? { ...item, answer: event.target.value } : item) })} />
            <Input label="Employer hostname (optional)" id={`saved-host-${index}`} value={entry.hostname || ''} placeholder="careers.example.com"
              onChange={event => onChange({ ...data, reusableAnswers: data.reusableAnswers.map((item, i) => i === index ? { ...item, hostname: event.target.value } : item) })} />
            <button type="button" className="mt-2 min-h-10 text-sm text-red-700 dark:text-red-300" onClick={() => onChange({ ...data, reusableAnswers: data.reusableAnswers.filter((_, i) => i !== index) })}>Remove answer</button>
          </div>
        ))}
        <button type="button" className="min-h-12 rounded-lg border border-blue-600 px-4 text-sm font-medium text-blue-700 dark:text-blue-300"
          disabled={(data.reusableAnswers?.length || 0) >= 100}
          onClick={() => onChange({ ...data, reusableAnswers: [...(data.reusableAnswers || []), { question: '', answer: '', hostname: '' }] })}>Add reusable answer</button>
        <p className="mt-2 text-xs text-gray-500">Use Save Profile to save these answers with your account.</p>
      </section>
    </div>
  );
};

export default ApplicationProfileSection;
