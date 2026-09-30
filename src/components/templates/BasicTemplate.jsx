import React, { forwardRef } from 'react';
import ResumeDocument from './ResumeDocument';

// Visual design lives in the shared resume design system (template id "basic").
const BasicTemplate = forwardRef(({ resume }, ref) => (
  <ResumeDocument ref={ref} resume={resume} templateId="basic" />
));

BasicTemplate.displayName = 'BasicTemplate';

export default BasicTemplate;
