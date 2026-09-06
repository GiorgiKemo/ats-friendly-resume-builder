import React, { useRef, useState } from 'react';
import Button from '../ui/Button';
import FullscreenResumeDialog from './FullscreenResumeDialog';
import ResumeExportFeedback from './ResumeExportFeedback';

/**
 * MobileResumePreview - A mobile-optimized resume preview component
 *
 * @param {Object} props - Component props
 * @param {Object} props.resume - Resume data
 * @param {React.ReactNode} props.children - Preview content
 * @param {Function} props.onExport - Export function
 * @param {string} props.exportFormat - Export format (pdf or docx)
 * @param {Function} props.setExportFormat - Function to set export format
 * @param {boolean} props.isExporting - Whether export is in progress
 * @param {string} [props.className] - Additional CSS classes
 * @returns {JSX.Element} - MobileResumePreview component
 */
const MobileResumePreview = ({
  resume: _resume, // resume prop was unused
  children,
  onExport,
  exportFormat = 'pdf',
  setExportFormat,
  isExporting = false,
  exportFeedback = null,
  className = ''
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const openerRef = useRef(null);
  const exitRef = useRef(null);

  const toggleFullscreen = () => {
    if (!isFullscreen && isExporting) return;
    setIsFullscreen((current) => !current);
  };

  const content = (
    <>
      <div className="flex flex-col mb-2 p-2">
        <div className="flex justify-between items-center">
          <h3 id="mobile-resume-preview-title" className="text-lg font-medium text-gray-900 dark:text-slate-100">Resume Preview</h3>
          <button
            ref={isFullscreen ? exitRef : openerRef}
            type="button"
            onClick={toggleFullscreen}
            disabled={!isFullscreen && isExporting}
            className="p-2 text-blue-600 dark:text-blue-300 flex items-center"
            aria-label={isFullscreen ? "Exit fullscreen" : "View fullscreen"}
          >
            {isFullscreen ? (
              <>
                <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-sm">Exit</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                </svg>
                <span className="text-sm">Fullscreen</span>
              </>
            )}
          </button>
        </div>

        {/* Export controls */}
        {onExport && !isFullscreen && (
          <div className="flex items-center justify-between mt-2 border-t border-gray-200 dark:border-slate-700 pt-2">
            <div className="flex items-center">
              <label htmlFor="mobileExportFormat" className="text-sm font-medium text-gray-700 dark:text-slate-300 mr-2">
                Export as:
              </label>
              <select
                id="mobileExportFormat"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                className="select-field text-sm"
              >
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
              </select>
            </div>
            <Button
              onClick={onExport}
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
        )}
      </div>

      <div className={`overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700 ${isFullscreen ? 'h-[calc(100%-60px)] bg-white' : 'max-h-[70vh] bg-white'}`}>
        <div className="h-full overflow-auto bg-white text-gray-900 pinch-zoom-container">
          {children}
        </div>
      </div>

      {isFullscreen && (
        <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center">
          {exportFeedback && (
            <div className="w-full max-w-lg px-3 mb-2">
              <ResumeExportFeedback feedback={exportFeedback} />
            </div>
          )}
          {onExport && (
            <div className="bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 shadow-lg dark:shadow-slate-950/40 rounded-lg p-2 mb-3 flex items-center">
              <label htmlFor="mobileFullscreenExportFormat" className="sr-only">Export format</label>
              <select
                id="mobileFullscreenExportFormat"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                className="select-field text-sm mr-2"
              >
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
              </select>
              <Button
                onClick={onExport}
                disabled={isExporting}
                size="sm"
                className="flex items-center"
              >
                {isExporting ? 'Exporting...' : 'Export'}
              </Button>
            </div>
          )}
          <div className="bg-gray-800 text-white px-4 py-2 rounded-full text-sm">
            Pinch to zoom / drag to pan
          </div>
        </div>
      )}
    </>
  );

  return isFullscreen ? (
    <FullscreenResumeDialog
      className={`bg-gray-50 dark:bg-slate-900 ${className}`}
      labelledBy="mobile-resume-preview-title"
      desktop={false}
      onClose={() => setIsFullscreen(false)}
      initialFocusRef={exitRef}
      returnFocusRef={openerRef}
    >
      {content}
    </FullscreenResumeDialog>
  ) : <div className={`md:hidden ${className}`}>{content}</div>;
};

export default MobileResumePreview;
