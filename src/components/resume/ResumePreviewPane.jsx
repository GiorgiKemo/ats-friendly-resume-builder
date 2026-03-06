import React, { useRef, useState } from 'react';
import { useResume } from '../../context/ResumeContext';
import MobileResumePreview from './MobileResumePreview';
import DesktopResumePreview from './DesktopResumePreview';
import Button from '../ui/Button';
import toast from 'react-hot-toast';
import { downloadResumePdf } from '../../services/pdfService';
import { downloadResumeDocx } from '../../services/docxService';

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
        await downloadResumePdf(resumeRef.current, completeResume, filename);
        toast.success('ATS-friendly resume exported as PDF');
      } else if (exportFormat === 'docx') {
        // Use docx library to generate a DOCX file
        try {
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
      {/* Export Controls - Only visible on mobile */}
      <div className="md:hidden flex items-center justify-end mb-2 gap-2">
        <div className="flex items-center space-x-2">
          <label htmlFor="exportFormat" className="text-sm font-medium text-gray-700">
            Export as:
          </label>
          <select
            id="exportFormat"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="pdf">PDF</option>
            <option value="docx">DOCX</option>
          </select>
        </div>
        <Button
          onClick={handleExport}
          disabled={isExporting}
          size="sm"
          className="flex items-center"
        >
          {isExporting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Exporting...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </>
          )}
        </Button>
      </div>

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
