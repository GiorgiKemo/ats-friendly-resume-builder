import React, { forwardRef } from 'react';
import ResumeDocument from './ResumeDocument';

// Visual design lives in the shared resume design system (template id "traditional").
const TraditionalTemplate = forwardRef(({ resume }, ref) => (
  <ResumeDocument ref={ref} resume={resume} templateId="traditional" />
));

TraditionalTemplate.displayName = 'TraditionalTemplate';

export default TraditionalTemplate;
