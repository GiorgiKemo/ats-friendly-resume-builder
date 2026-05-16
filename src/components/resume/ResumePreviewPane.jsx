import React, { useRef, useState } from 'react';
import { useResume } from '../../context/ResumeContext';
import MobileResumePreview from './MobileResumePreview';
import DesktopResumePreview from './DesktopResumePreview';
import toast from 'react-hot-toast';

// Resume Templates
import BasicTemplate from '../templates/BasicTemplate';
import MinimalistTemplate from '../templates/MinimalistTemplate';
import TraditionalTemplate from '../templates/TraditionalTemplate';
import ModernTemplate from '../templates/ModernTemplate';
import ATSFriendlyTemplate from '../templates/ATSFriendlyTemplate';

const ResumePreviewPane = () => {
  const { currentResume } = useResume();
  const resumeRef = useRef(null);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    // Always restore scroll after export (for mobile)
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    try {
      // Use the current resume directly
      const completeResume = currentResume || {};
      const filename = `${completeResume.personalInfo?.fullName || 'Resume'}_ATS_Friendly_Resume`;

      if (exportFormat === 'pdf') {
        const { downloadResumePdf } = await import('../../services/pdfService');
        await downloadResumePdf(resumeRef.current, completeResume, filename);
        toast.success('ATS-friendly resume exported as PDF');
      } else if (exportFormat === 'docx') {
        // Use docx library to generate a DOCX file
        try {
          const { downloadResumeDocx } = await import('../../services/docxService');
          await downloadResumeDocx(completeResume, filename);
          toast.success('ATS-friendly resume exported as DOCX');
        } catch (docxError) {
          toast.error(`Failed to export as DOCX: ${docxError.message}`);
          throw docxError;
        }
      } else {
        throw new Error(`Unsupported export format: ${exportFormat}`);
      }
    } catch (error) {
      console.error('Error exporting resume:', error);
      toast.error(`Failed to export resume: ${error.message}`);
    } finally {
      setIsExporting(false);
      document.body.style.overflow = originalOverflow || '';
    }
  };

  const renderTemplate = () => {
    const templateProps = {
      resume: currentResume,
      ref: resumeRef,
    };

    switch (currentResume.selectedTemplate) {
      case 'ats-friendly':
        return <ATSFriendlyTemplate {...templateProps} />;
      case 'minimalist':
        return <MinimalistTemplate {...templateProps} />;
      case 'traditional':
        return <TraditionalTemplate {...templateProps} />;
      case 'modern':
        return <ModernTemplate {...templateProps} />;
      case 'basic':
      default:
        return <BasicTemplate {...templateProps} />;
    }
  };

  return (
    <>
      {/* Mobile Resume Preview */}
      <MobileResumePreview resume={currentResume} onExport={handleExport} exportFormat={exportFormat} setExportFormat={setExportFormat} isExporting={isExporting}>
        {renderTemplate()}
      </MobileResumePreview>

      {/* Desktop Resume Preview */}
      <DesktopResumePreview
        resume={currentResume}
        onExport={handleExport}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        isExporting={isExporting}
      >
        {renderTemplate()}
      </DesktopResumePreview>
    </>
  );
};

export default ResumePreviewPane;
