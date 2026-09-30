import React, { forwardRef } from 'react';
import ResumeDocument from './ResumeDocument';

// Visual design lives in the shared resume design system (template id "minimalist").
const MinimalistTemplate = forwardRef(({ resume }, ref) => (
  <ResumeDocument ref={ref} resume={resume} templateId="minimalist" />
));

MinimalistTemplate.displayName = 'MinimalistTemplate';

export default MinimalistTemplate;
