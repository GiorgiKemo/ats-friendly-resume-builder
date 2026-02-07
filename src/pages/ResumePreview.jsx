import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useResume } from '../context/ResumeContext';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import { downloadResumePdf } from '../services/pdfService';
import { downloadResumeDocx } from '../services/docxService';
import { motion } from 'framer-motion';
// import { fadeIn, fadeInUp } from '../utils/animationVariants'; // Unused imports

// Resume Templates
import BasicTemplate from '../components/templates/BasicTemplate';
import MinimalistTemplate from '../components/templates/MinimalistTemplate';
import TraditionalTemplate from '../components/templates/TraditionalTemplate';
import ModernTemplate from '../components/templates/ModernTemplate';
import ATSFriendlyTemplate from '../components/templates/ATSFriendlyTemplate';

const ResumePreview = () => {
  const { resumeId } = useParams();
  const { currentResume, loading, error, loadResume } = useResume();
  const navigate = useNavigate();
  const resumeRef = useRef(null);
  const [exportFormat, setExportFormat] = useState('pdf');
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
        // Use pdfmake to generate a true text-based PDF (not an image)
        // This creates a much smaller file and is more ATS-friendly
        downloadResumePdf(completeResume, filename);
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
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
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
            className="flex items-center space-x-2 mr-2"
            whileHover={{ scale: 1.05 }}
          >
            <label htmlFor="exportFormat" className="text-sm font-medium text-gray-700">
              Export as:
            </label>
            <motion.select
              id="exportFormat"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              whileHover={{ borderColor: "#3b82f6" }}
              transition={{ duration: 0.2 }}
            >
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
            </motion.select>
          </motion.div>
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
        className="bg-gray-100 p-3 md:p-6 rounded-lg shadow-inner flex justify-center"
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
          className="bg-white shadow-lg max-w-[21cm] w-full overflow-hidden"
          style={{
            height: 'auto',
            minHeight: '500px',
            maxHeight: 'calc(100vh - 200px)',
            aspectRatio: '1 / 1.414' // A4 aspect ratio
          }}
          initial={{ scale: 0.95, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          whileHover={{
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
          }}
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
        className="mt-8 p-4 bg-blue-50 rounded-md"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.2 }}
        whileHover={{
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
          y: -5
        }}
      >
        <motion.h3
          className="font-medium text-blue-800 mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.4 }}
        >
          ATS Export Tips
        </motion.h3>
        <motion.ul
          className="list-disc list-inside text-sm text-blue-700 space-y-2"
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
            "Our PDF export creates true text-based PDFs (not images) for maximum ATS compatibility",
            "Our DOCX export creates Microsoft Word documents that are fully editable and ATS-friendly",
            "PDF format is generally preferred for ATS compatibility unless the job posting specifically requests a different format",
            "DOCX format is ideal when you need to make last-minute edits or when a job posting specifically requests Word format",
            "Ensure your file name is professional (e.g., \"FirstName_LastName_Resume.pdf\" or \"FirstName_LastName_Resume.docx\")",
            "After downloading, open the file to verify all content is correctly displayed",
            "Some ATS systems may have trouble with headers and footers, so keep all important information in the main body",
            "Our export process creates small file sizes while maintaining quality",
            "Avoid adding images or graphics to your resume as they can confuse ATS systems and increase file size",
            "Both our PDF and DOCX exports allow ATS systems to properly extract and index all your information"
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
