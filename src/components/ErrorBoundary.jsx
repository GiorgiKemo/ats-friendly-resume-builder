import React from 'react';
import { useNavigate } from 'react-router-dom';
import { logError } from '../services/monitoringService';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to the console
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });

    // Log the error to our monitoring service
    logError(error, 'error.boundary', {
      componentStack: errorInfo?.componentStack || '',
      location: window.location.href,
      userAgent: navigator.userAgent
    }).catch(logError => {
      console.error('Failed to log error:', logError);
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-container">
          <div className="error-boundary-content">
            <h2>Something went wrong</h2>
            <p>We're sorry, but there was an error loading this page.</p>

            {this.props.showReset && (
              <ErrorBoundaryReset onReset={() => this.setState({ hasError: false, error: null, errorInfo: null })} />
            )}

            {this.props.showDetails && this.state.error && (
              <details className="error-details">
                <summary>Error Details</summary>
                <p>{this.state.error.toString()}</p>
                <pre>{this.state.errorInfo?.componentStack || 'No component stack available'}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// A component to reset the error boundary
function ErrorBoundaryReset({ onReset }) {
  const navigate = useNavigate();

  const handleReset = () => {
    onReset();
    navigate(0); // Refresh the current page
  };

  return (
    <div className="error-boundary-actions">
      <button
        className="btn btn-primary"
        onClick={handleReset}
      >
        Try Again
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => navigate('/')}
      >
        Go to Home Page
      </button>
    </div>
  );
}

export default ErrorBoundary;
