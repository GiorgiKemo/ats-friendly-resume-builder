import React, { forwardRef } from 'react';
import ResumeDocument from './ResumeDocument';

// Visual design lives in the shared resume design system (template id "modern").
const ModernTemplate = forwardRef(({ resume }, ref) => (
  <ResumeDocument ref={ref} resume={resume} templateId="modern" />
));

ModernTemplate.displayName = 'ModernTemplate';

export default ModernTemplate;
