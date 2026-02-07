import React from 'react';
import Input from '../ui/Input';
import PhoneInputWithCountry from '../ui/PhoneInputWithCountry';

const PersonalDetailsSection = ({ data = {}, onChange }) => {
  const handleChange = (e) => {
    const { name, value } = e.target;

    // Handle nested fields like professionalLinks
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      onChange({
        ...data,
        [parent]: {
          ...data[parent] || {},
          [child]: value
        }
      });
    } else {
      onChange({
        ...data,
        [name]: value
      });
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Your Contact & Online Presence</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Full Name"
          id="fullName"
          name="fullName"
          value={data.fullName || ''}
          onChange={handleChange}
          required
          tooltip="Your full legal name, as you'd like it to appear on your resume."
          placeholder="John Doe"
        />

        <Input
          label="Email Address"
          id="email"
          name="email"
          type="email"
          value={data.email || ''}
          onChange={handleChange}
          required
          tooltip="A professional-sounding email address is recommended for job applications."
          placeholder="john.doe@example.com"
        />

        <PhoneInputWithCountry
          label="Phone Number"
          id="phone"
          name="phone"
          value={data.phone || ''}
          onChange={handleChange}
          tooltip="Your primary contact phone number. Select your country code first."
          placeholder="Phone number"
        />

        <Input
          label="Location"
          id="location"
          name="location"
          value={data.location || ''}
          onChange={handleChange}
          tooltip={'E.g., "City, State, Country" or "City, Country". This helps with location-based job matching.'}
          placeholder="New York, NY, USA"
        />

        <Input
          label="LinkedIn Profile"
          id="professionalLinks.linkedin"
          name="professionalLinks.linkedin"
          value={data.professionalLinks?.linkedin || ''}
          onChange={handleChange}
          tooltip="Your complete LinkedIn profile URL (e.g., https://www.linkedin.com/in/yourname)."
          placeholder="https://linkedin.com/in/johndoe"
        />

        <Input
          label="GitHub Profile"
          id="professionalLinks.github"
          name="professionalLinks.github"
          value={data.professionalLinks?.github || ''}
          onChange={handleChange}
          tooltip="For technical roles, share your GitHub profile URL (e.g., https://github.com/yourusername)."
          placeholder="https://github.com/johndoe"
        />

        <Input
          label="Portfolio Website"
          id="professionalLinks.portfolio"
          name="professionalLinks.portfolio"
          value={data.professionalLinks?.portfolio || ''}
          onChange={handleChange}
          tooltip="Link to your online portfolio or personal website showcasing your work."
          placeholder="https://johndoe.com"
        />

        <Input
          label="Other Professional Link"
          id="professionalLinks.other"
          name="professionalLinks.other"
          value={data.professionalLinks?.other || ''}
          onChange={handleChange}
          tooltip="Link to another relevant online profile (e.g., Behance, Dribbble, Medium)."
          placeholder="https://medium.com/@johndoe"
        />
      </div>

      <div className="mt-8 p-4 bg-yellow-50 rounded-md">
        <h3 className="font-medium text-yellow-800 mb-2">Make Yourself Reachable & Credible</h3>
        <p className="text-sm text-yellow-700">
          Accurate contact information ensures employers can reach you. Professional links (like LinkedIn or a portfolio) significantly boost your credibility and provide a fuller picture of your capabilities.
        </p>
      </div>
    </div>
  );
};

export default PersonalDetailsSection;
