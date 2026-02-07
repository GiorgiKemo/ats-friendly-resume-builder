import React, { useState } from 'react';
import Button from '../ui/Button';

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
  className = ''
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);

    // When entering fullscreen, prevent body scrolling
    if (!isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  };

  return (
    <div className={`md:hidden ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''} ${className}`}>
      <div className="flex flex-col mb-2 p-2">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Resume Preview</h3>
          <button
            onClick={toggleFullscreen}
            className="p-2 text-blue-600 flex items-center"
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
          <div className="flex items-center justify-between mt-2 border-t pt-2">
            <div className="flex items-center">
              <label htmlFor="mobileExportFormat" className="text-sm font-medium text-gray-700 mr-2">
                Export as:
              </label>
              <select
                id="mobileExportFormat"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      <div className={`overflow-hidden border border-gray-200 rounded-lg ${isFullscreen ? 'h-[calc(100%-60px)]' : 'max-h-[70vh]'}`}>
        <div className="overflow-auto h-full pinch-zoom-container">
          {children}
        </div>
      </div>

      {isFullscreen && (
        <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center">
          {onExport && (
            <div className="bg-white shadow-lg rounded-lg p-2 mb-3 flex items-center">
              <select
                id="fullscreenExportFormat"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            Pinch to zoom • Drag to pan
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileResumePreview;
