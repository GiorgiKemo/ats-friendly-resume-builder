import React, { useState, useEffect, useRef, useCallback } from 'react'; // Added useCallback
import Button from '../ui/Button';

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
  className = ''
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const contentRef = useRef(null);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const lastPositionRef = useRef({ x: 0, y: 0 });

  // Handle fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prevIsFullscreen => {
      if (!prevIsFullscreen) {
        document.body.style.overflow = 'hidden';
        setScale(1); // Reset scale when entering fullscreen
      } else {
        document.body.style.overflow = '';
      }
      return !prevIsFullscreen;
    });
  }, [setIsFullscreen, setScale]);

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleEscKey);
    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [isFullscreen, toggleFullscreen]);

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
      <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col">
        <div className="flex justify-between items-center p-4 bg-white shadow-md">
          <h3 className="text-lg font-medium">Resume Preview</h3>
          <div className="flex items-center space-x-4">
            {onExport && (
              <div className="flex items-center space-x-2">
                <select
                  id="fullscreenExportFormat"
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              onClick={toggleFullscreen}
              className="p-2 text-blue-600 flex items-center"
              aria-label="Exit fullscreen"
            >
              <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
        <div className="absolute top-20 right-4 bg-white shadow-lg rounded-lg p-2 flex flex-col">
          <button
            onClick={() => setScale(Math.min(2, scale + 0.1))}
            className="p-2 text-gray-700 hover:bg-gray-100 rounded"
            aria-label="Zoom in"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
          <button
            onClick={() => setScale(1)}
            className="p-2 text-gray-700 hover:bg-gray-100 rounded text-xs font-medium"
            aria-label="Reset zoom"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={() => setScale(Math.max(0.5, scale - 0.1))}
            className="p-2 text-gray-700 hover:bg-gray-100 rounded"
            aria-label="Zoom out"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
            </svg>
          </button>
        </div>

        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
          <div className="bg-gray-800 text-white px-4 py-2 rounded-full text-sm">
            Use mouse wheel to zoom • Drag to pan
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`hidden md:block ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-medium">Resume Preview</h3>
        <button
          onClick={toggleFullscreen}
          className="p-2 text-blue-600 flex items-center"
          aria-label="View fullscreen"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
          </svg>
          <span className="text-sm">Fullscreen</span>
        </button>
      </div>

      <div className="bg-gray-100 p-4 rounded-lg shadow-inner flex justify-center">
        <div className="bg-white shadow-lg w-full overflow-hidden" style={{
          height: 'auto',
          minHeight: '500px',
          maxHeight: 'calc(100vh - 200px)',
          transform: 'scale(0.9)',
          transformOrigin: 'top center'
        }}>
          <div className="overflow-auto h-full">
            <div style={{ padding: '0.5rem' }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesktopResumePreview;
