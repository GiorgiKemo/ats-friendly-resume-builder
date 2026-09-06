import React, { useEffect, useRef, useState } from 'react';
import { useResume } from '../../context/ResumeContext';
import { useAuth } from '../../context/AuthContext';
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
  const { user } = useAuth();
  const resumeRef = useRef(null);
  const exportRequestRef = useRef(null);
  const resumeKey = `${user?.id || ''}:${currentResume?.id || ''}`;
  const activeResumeKeyRef = useRef(resumeKey);
  activeResumeKeyRef.current = resumeKey;
  const [exportFormat, setExportFormat] = useState('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState(null);

  useEffect(() => {
    setIsExporting(false);
    setExportFeedback(null);
    return () => {
      const request = exportRequestRef.current;
      if (request) {
        exportRequestRef.current = null;
        if (document.body.style.overflow === 'hidden') document.body.style.overflow = request.originalOverflow;
      }
    };
  }, [resumeKey]);

  const handleExport = async () => {
    if (!currentResume || !user?.id || exportRequestRef.current || activeResumeKeyRef.current !== resumeKey) return;
    const request = { originalOverflow: document.body.style.overflow };
    exportRequestRef.current = request;
    const isCurrent = () => exportRequestRef.current === request && activeResumeKeyRef.current === resumeKey;
    setIsExporting(true);
    setExportFeedback(null);
    // Always restore scroll after export (for mobile)
    document.body.style.overflow = 'hidden';

    try {
      // Use the current resume directly
      const completeResume = currentResume || {};
      const filename = `${completeResume.personalInfo?.fullName || 'Resume'}_ATS_Friendly_Resume`;

      if (exportFormat === 'pdf') {
        const { downloadResumePdf } = await import('../../services/pdfService');
        if (!isCurrent()) return;
        await downloadResumePdf(resumeRef.current, completeResume, filename);
      } else if (exportFormat === 'docx') {
        // Use docx library to generate a DOCX file
        const { downloadResumeDocx } = await import('../../services/docxService');
        if (!isCurrent()) return;
        await downloadResumeDocx(completeResume, filename);
      } else {
        throw new Error(`Unsupported export format: ${exportFormat}`);
      }
      if (isCurrent()) {
        const message = `${exportFormat.toUpperCase()} download requested. Check your downloads.`;
        setExportFeedback({ kind: 'success', message, key: resumeKey });
        toast.success(message);
      }
    } catch (error) {
      if (isCurrent()) {
        console.error('Error exporting resume:', error);
        const message = `Failed to export resume: ${error.message}`;
        setExportFeedback({ kind: 'error', message, key: resumeKey });
        toast.error(message);
      }
    } finally {
      if (isCurrent()) {
        exportRequestRef.current = null;
        setIsExporting(false);
        if (document.body.style.overflow === 'hidden') document.body.style.overflow = request.originalOverflow;
      }
    }
  };

  const visibleExportFeedback = exportFeedback?.key === resumeKey ? exportFeedback : null;

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
      <MobileResumePreview resume={currentResume} onExport={handleExport} exportFormat={exportFormat} setExportFormat={setExportFormat} isExporting={isExporting} exportFeedback={visibleExportFeedback}>
        {renderTemplate()}
      </MobileResumePreview>

      {/* Desktop Resume Preview */}
      <DesktopResumePreview
        resume={currentResume}
        onExport={handleExport}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        isExporting={isExporting}
        exportFeedback={visibleExportFeedback}
      >
        {renderTemplate()}
      </DesktopResumePreview>
    </>
  );
};

export default ResumePreviewPane;
