import React, { forwardRef } from 'react';
import ResumeDocument from './ResumeDocument';

// Visual design lives in the shared resume design system (template id "ats-friendly").
const ATSFriendlyTemplate = forwardRef(({ resume }, ref) => (
  <ResumeDocument ref={ref} resume={resume} templateId="ats-friendly" />
));

ATSFriendlyTemplate.displayName = 'ATSFriendlyTemplate';

export default ATSFriendlyTemplate;
