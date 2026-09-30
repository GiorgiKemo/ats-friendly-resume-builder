import React, { useState, useEffect, useRef, useCallback } from 'react'; // Added useCallback
import Button from '../ui/Button';
import FullscreenResumeDialog from './FullscreenResumeDialog';
import ResumeExportFeedback from './ResumeExportFeedback';
import { RESUME_PAGE_WIDTH } from '../../utils/resumePageGeometry.js';

// US Letter at CSS 96 dpi. The page is rendered at true size and scaled to fit,
// so the preview keeps the real line breaks instead of reflowing to the column.
const PAGE_WIDTH_PX = 816;
const PAGE_HEIGHT_PX = 1056;
const CANVAS_PADDING_PX = 48;

/**
 * DesktopResumePreview - A desktop-optimized resume preview component with fullscreen capability
 *
 * @param {Object} props - Component props
 * @param {Object} props.resume - Resume data
 * @param {React.ReactNode} props.children - Preview content
 * @param {Function} props.onExport - Export function
 * @param {string} props.exportFormat - Export format (pdf or docx)
 * @param {Function} props.setExportFormat - Function to set export format
 * @param {boolean} props.isExporting - Whether export is in progress
 * @param {string} [props.className] - Additional CSS classes
 * @returns {JSX.Element} - DesktopResumePreview component
 */
const DesktopResumePreview = ({
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
  const [scale, setScale] = useState(1);
  const contentRef = useRef(null);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const lastPositionRef = useRef({ x: 0, y: 0 });
  const openerRef = useRef(null);
  const exitRef = useRef(null);
  const canvasRef = useRef(null);
  const paperRef = useRef(null);
  const [paperScale, setPaperScale] = useState(0.62);
  const [paperHeight, setPaperHeight] = useState(PAGE_HEIGHT_PX);

  useEffect(() => {
    if (isFullscreen) return undefined;
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const available = canvas.clientWidth - CANVAS_PADDING_PX;
      if (available > 0) setPaperScale(Math.max(0.3, Math.min(1, available / PAGE_WIDTH_PX)));
      if (paperRef.current) setPaperHeight(Math.max(PAGE_HEIGHT_PX, paperRef.current.offsetHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    if (paperRef.current) observer.observe(paperRef.current);
    return () => observer.disconnect();
  }, [isFullscreen]);

  const pageCount = Math.max(1, Math.ceil((paperHeight - 4) / PAGE_HEIGHT_PX));

  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen && isExporting) return;
    setIsFullscreen(prevIsFullscreen => {
      if (!prevIsFullscreen) {
        setScale(1); // Reset scale when entering fullscreen
      }
      return !prevIsFullscreen;
    });
  }, [isFullscreen, isExporting, setIsFullscreen, setScale]);

  // Memoize event handlers
  const handleWheel = useCallback((e) => {
    if (!isFullscreen || !containerRef.current) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setScale(prevScale => Math.max(0.5, Math.min(2, prevScale + delta)));
  }, [isFullscreen, containerRef, setScale]);

  const handleMouseDown = useCallback((e) => {
    if (!isFullscreen || !containerRef.current) return;
    isDraggingRef.current = true;
    lastPositionRef.current = { x: e.clientX, y: e.clientY };
    if (containerRef.current) {
      containerRef.current.style.cursor = 'grabbing';
    }
  }, [isFullscreen, containerRef, isDraggingRef, lastPositionRef]);

  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current || !containerRef.current || !contentRef.current) return;
    const dx = e.clientX - lastPositionRef.current.x;
    const dy = e.clientY - lastPositionRef.current.y;
    containerRef.current.scrollLeft -= dx;
    containerRef.current.scrollTop -= dy;
    lastPositionRef.current = { x: e.clientX, y: e.clientY };
  }, [isDraggingRef, containerRef, contentRef, lastPositionRef]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    if (containerRef.current) {
      containerRef.current.style.cursor = 'grab';
    }
  }, [isDraggingRef, containerRef]);

  // Add event listeners for drag and zoom
  useEffect(() => {
    if (isFullscreen && containerRef.current) {
      const container = containerRef.current;
      container.addEventListener('wheel', handleWheel, { passive: false });
      container.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      return () => {
        container.removeEventListener('wheel', handleWheel);
        container.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
    return undefined;
  }, [isFullscreen, handleWheel, handleMouseDown, handleMouseMove, handleMouseUp]);

  if (isFullscreen) {
    return (
      <FullscreenResumeDialog
        className="bg-gray-100 dark:bg-slate-900 flex flex-col"
        labelledBy="desktop-resume-preview-title"
        desktop={true}
        onClose={() => setIsFullscreen(false)}
        initialFocusRef={exitRef}
        returnFocusRef={openerRef}
      >
        <div className="flex justify-between items-center border-b border-gray-200 bg-white p-4 shadow-md dark:border-slate-700 dark:bg-slate-800">
          <h3 id="desktop-resume-preview-title" className="text-lg font-medium text-gray-900 dark:text-slate-100">Resume Preview</h3>
          <div className="flex items-center space-x-4">
            {onExport && (
              <div className="flex items-center space-x-2">
                <label htmlFor="desktopFullscreenExportFormat" className="sr-only">Export format</label>
                <select
                  id="desktopFullscreenExportFormat"
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="select-field text-sm"
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
            <button
              ref={exitRef}
              type="button"
              onClick={toggleFullscreen}
              className="p-2 text-blue-600 dark:text-blue-300 flex items-center"
              aria-label="Exit fullscreen"
            >
              <svg aria-hidden="true" className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-sm">Exit Fullscreen</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex items-center justify-center p-4">
          <div
            ref={containerRef}
            className="bg-white shadow-xl max-w-4xl w-full h-full overflow-auto cursor-grab"
            style={{
              overscrollBehavior: 'none'
            }}
          >
            <div
              ref={contentRef}
              style={{
                transform: `scale(${scale})`,
                transformOrigin: 'center center',
                transition: 'transform 0.1s ease-out'
              }}
            >
              {children}
            </div>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="absolute top-20 right-4 bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 shadow-lg dark:shadow-slate-950/40 rounded-lg p-2 flex flex-col">
          <button
            type="button"
            onClick={() => setScale(Math.min(2, scale + 0.1))}
            className="p-2 text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-700 rounded"
            aria-label="Zoom in"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setScale(1)}
            className="p-2 text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-700 rounded text-xs font-medium"
            aria-label="Reset zoom"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setScale(Math.max(0.5, scale - 0.1))}
            className="p-2 text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-700 rounded"
            aria-label="Zoom out"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
            </svg>
          </button>
        </div>

        <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center">
          {exportFeedback && (
            <div className="w-full max-w-lg px-3 mb-2">
              <ResumeExportFeedback feedback={exportFeedback} />
            </div>
          )}
          <div className="bg-gray-800 text-white px-4 py-2 rounded-full text-sm">
            Use mouse wheel to zoom / drag to pan
          </div>
        </div>
      </FullscreenResumeDialog>
    );
  }

  return (
    <div className={`builder-preview hidden md:flex ${className}`}>
      <div className="builder-preview-bar">
        <h3 className="builder-preview-title whitespace-nowrap">Resume Preview</h3>
        <div className="builder-preview-actions">
          <span className="builder-preview-meta" aria-hidden="true">
            {pageCount} {pageCount === 1 ? 'page' : 'pages'} · {Math.round(paperScale * 100)}%
          </span>
          {onExport && (
            <>
              <label htmlFor="desktopExportFormat" className="sr-only">Export format</label>
              <select
                id="desktopExportFormat"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                className="builder-preview-format"
              >
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
              </select>
              <Button
                onClick={onExport}
                disabled={isExporting}
                size="sm"
                animate={false}
                className="builder-preview-export"
              >
                {isExporting ? 'Exporting...' : 'Export'}
              </Button>
            </>
          )}
          <button
            ref={openerRef}
            type="button"
            onClick={toggleFullscreen}
            disabled={isExporting}
            className="builder-preview-icon-btn"
            aria-label="View fullscreen"
            title="Fullscreen"
          >
            <svg aria-hidden="true" className="h-[1.05rem] w-[1.05rem]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
            </svg>
          </button>
        </div>
      </div>

      {exportFeedback && (
        <div className="builder-preview-feedback">
          <ResumeExportFeedback feedback={exportFeedback} />
        </div>
      )}

      <div ref={canvasRef} className="builder-preview-canvas">
        <div
          className="builder-paper-frame"
          style={{ width: PAGE_WIDTH_PX * paperScale, height: paperHeight * paperScale }}
        >
          <div
            ref={paperRef}
            className="builder-paper"
            style={{ width: RESUME_PAGE_WIDTH, transform: `scale(${paperScale})` }}
          >
            {children}
            {Array.from({ length: pageCount - 1 }, (_, index) => (
              <span
                key={index}
                className="builder-page-break"
                style={{ top: (index + 1) * PAGE_HEIGHT_PX }}
                aria-hidden="true"
              >
                <span>Page {index + 2}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesktopResumePreview;
