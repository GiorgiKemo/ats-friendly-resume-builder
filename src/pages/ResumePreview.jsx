import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useResume } from '../context/ResumeContext';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { exportFormatOptions, getResumeExportReadiness } from '../utils/resumeExportReadiness';
// import { fadeIn, fadeInUp } from '../utils/animationVariants'; // Unused imports

// Resume Templates
import BasicTemplate from '../components/templates/BasicTemplate';
import MinimalistTemplate from '../components/templates/MinimalistTemplate';
import TraditionalTemplate from '../components/templates/TraditionalTemplate';
import ModernTemplate from '../components/templates/ModernTemplate';
import ATSFriendlyTemplate from '../components/templates/ATSFriendlyTemplate';

const ResumePreview = () => {
  const { resumeId } = useParams();
  const { currentResume, loading, error, getResumeById: loadResume } = useResume();
  const navigate = useNavigate();
  const resumeRef = useRef(null);
  const [exportFormat, setExportFormat] = useState('docx');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (resumeId) {
      loadResume(resumeId).catch(_err => { // err parameter was unused
        toast.error('Failed to load resume');
        navigate('/dashboard');
      });
    }
  }, [resumeId, loadResume, navigate]); // Added loadResume and navigate

  const handleEdit = () => {
    navigate(`/builder/${resumeId}`);
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      // Use the current resume directly
      const completeResume = currentResume || {};
      const filename = `${completeResume.personalInfo?.fullName || 'Resume'}_ATS_Friendly_Resume`;

      if (exportFormat === 'pdf') {
        const { downloadResumePdf } = await import('../services/pdfService');
        await downloadResumePdf(resumeRef.current, completeResume, filename);
        toast.success('ATS-friendly resume exported as PDF');
      } else if (exportFormat === 'docx') {
        // Use docx library to generate a DOCX file
        try {
          const { downloadResumeDocx } = await import('../services/docxService');
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
    }
  };

  const renderTemplate = () => {
    // Use the current resume directly
    const completeResume = currentResume || {};

    const templateProps = {
      resume: completeResume,
      ref: resumeRef,
    };

    switch (completeResume.selectedTemplate) {
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

  const exportReadiness = getResumeExportReadiness(currentResume || {});
  const selectedExportOption = exportFormatOptions.find((option) => option.id === exportFormat) || exportFormatOptions[0];

  if (loading) {
    return (
      <motion.div
        className="flex justify-center items-center min-h-screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        ></motion.div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        className="container mx-auto px-4 py-8 max-w-6xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          className="bg-red-100 dark:bg-red-900/20 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {error}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Button onClick={() => navigate('/dashboard')} animate={false}>Back to Dashboard</Button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="container mx-auto px-4 py-8 max-w-6xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <motion.h1
          className="text-2xl md:text-3xl font-bold"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          Resume Preview
        </motion.h1>
        <motion.div
          className="flex flex-wrap gap-2 w-full md:w-auto"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button
              variant="outline"
              onClick={handleEdit}
              className="flex-1 md:flex-none"
              animate={false}
            >
              Edit Resume
            </Button>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="flex-1 md:flex-none"
              animate={false}
            >
              {isExporting ? 'Exporting...' : `Export as ${exportFormat.toUpperCase()}`}
            </Button>
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.div
        className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.55 }}
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">
            Choose Export Format
          </p>
          <h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-slate-100">
            Pick the file type based on the outcome you need, not the extension name.
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {exportFormatOptions.map((option) => {
              const isSelected = exportFormat === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setExportFormat(option.id)}
                  className={`rounded-2xl border p-4 text-left transition ${isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-500/10'
                    : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/60 dark:border-slate-700 dark:bg-slate-900/80 dark:hover:border-blue-400/40 dark:hover:bg-blue-500/5'
                    }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-gray-900 dark:text-slate-100">{option.label}</p>
                      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-blue-600 dark:text-blue-300">
                        {option.badge}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-gray-600 dark:text-slate-400">{option.description}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/80">
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
              Current recommendation: {selectedExportOption.badge}
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
              {selectedExportOption.description}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">
            Export Readiness
          </p>
          <h3 className="mt-2 text-xl font-semibold text-gray-900 dark:text-slate-100">
            {exportReadiness.completedCount}/{exportReadiness.totalCount} checks ready
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            {exportReadiness.readyToExport
              ? 'This resume has the essentials needed for a confident export.'
              : 'Tighten the missing basics before you send this version out.'}
          </p>
          <div className="mt-4 space-y-3">
            {exportReadiness.checks.map((check) => (
              <div key={check.id} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/80">
                <span className={`mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${check.complete
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                  }`}>
                  {check.complete ? (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{check.label}</p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">{check.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div
        className="bg-gray-100 dark:bg-slate-800 p-3 md:p-6 rounded-lg shadow-inner flex justify-center"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          type: "spring",
          stiffness: 100,
          damping: 15,
          delay: 0.6
        }}
      >
        <motion.div
        className="bg-white text-gray-900 shadow-lg max-w-[21cm] w-full overflow-hidden transition-shadow duration-200 ease-out hover:shadow-xl"
          style={{
            height: 'auto',
            minHeight: '500px',
            maxHeight: 'calc(100vh - 200px)',
            aspectRatio: '1 / 1.414' // A4 aspect ratio
          }}
          initial={{ scale: 0.95, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <motion.div
            className="overflow-auto h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1 }}
          >
            {renderTemplate()}
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.div
        className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md transition-shadow duration-200 ease-out hover:shadow-lg will-change-transform"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.2 }}
        whileHover={{ y: -4 }}
      >
        <motion.h3
          className="font-medium text-blue-800 dark:text-blue-300 mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.4 }}
        >
          ATS Export Tips
        </motion.h3>
        <motion.ul
          className="list-disc list-inside text-sm text-blue-700 dark:text-blue-400 space-y-2"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.1,
                delayChildren: 1.5
              }
            }
          }}
        >
          {[
            "Choose DOCX when accurate ATS parsing matters most or when the employer asks for a Word file",
            "Choose PDF when you want a fixed, presentation-stable layout and the employer accepts PDFs",
            "Open the downloaded file once before applying to verify spacing, dates, and bullet formatting",
            "Keep the file name simple and professional, such as FirstName_LastName_Resume",
            "Avoid images or decorative graphics because they increase file size and can reduce parser accuracy",
            "Keep all critical information inside the main document body rather than headers or footers"
          ].map((tip, index) => (
            <motion.li
              key={index}
              variants={{
                hidden: { opacity: 0, x: -10 },
                visible: { opacity: 1, x: 0 }
              }}
            >
              {tip}
            </motion.li>
          ))}
        </motion.ul>
      </motion.div>
    </motion.div>
  );
};

export default ResumePreview;
