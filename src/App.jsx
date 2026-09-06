import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { lazy, Suspense, useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import './styles/error-boundary.css';

// Context Providers
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ResumeProvider } from './context/ResumeContext';
import { SubscriptionProvider } from './context/SubscriptionContext';

// Error Handling
import ErrorBoundary from './components/ErrorBoundary';

// Auth Components
import ProtectedRoute from './components/auth/ProtectedRoute';

// Layout Components
import AppShellFrame from './components/layout/AppShellFrame';
import Seo from './components/Seo';
import GoogleAnalytics from './components/GoogleAnalytics';
import RouteAccessibility from './components/RouteAccessibility';
import AccountSessionBoundary from './components/AccountSessionBoundary';
import { ProfileDraftProvider } from './context/ProfileDraftContext';
import { TailoringDraftProvider } from './context/TailoringDraftContext';
import { supabase } from './services/supabase';
import { extractRecoverySessionFromUrl } from './utils/authRecovery';

// Only import the Home page eagerly as it's the landing page
import Home from './pages/Home';
import StripeReturnPage from './pages/StripeReturnPage'; // Eagerly load StripeReturnPage

// Lazy load all other pages to reduce initial bundle size
const SignInPage = lazy(() => import('./pages/SignInPage'));
const SignUpPage = lazy(() => import('./pages/SignUpPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ResumeBuilder = lazy(() => import('./pages/ResumeBuilder'));
const ResumePreview = lazy(() => import('./pages/ResumePreview'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const Learn = lazy(() => import('./pages/Learn'));
const Pricing = lazy(() => import('./pages/Pricing'));
const SubscriptionSuccess = lazy(() => import('./pages/SubscriptionSuccess'));
const SubscriptionManage = lazy(() => import('./pages/SubscriptionManage'));
const AIGeneratorPage = lazy(() => import('./pages/AIGeneratorPage'));
const SimpleResumeFlow = lazy(() => import('./pages/SimpleResumeFlow'));
const NewResume = lazy(() => import('./pages/NewResume'));
const ApplicationTracker = lazy(() => import('./pages/ApplicationTracker'));
const AutoApply = lazy(() => import('./pages/AutoApply'));
const Analytics = lazy(() => import('./pages/Analytics'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AboutUs = lazy(() => import('./pages/AboutUs'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const FAQ = lazy(() => import('./pages/FAQ'));
const Contact = lazy(() => import('./pages/Contact'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
// const StripeReturnPage = lazy(() => import('./pages/StripeReturnPage')); // No longer lazy
const ForgotPassword = lazy(() => import('./components/auth/ForgotPassword'));
const UpdatePassword = lazy(() => import('./pages/UpdatePassword'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy')); // Import the Privacy Policy page

// Loading spinner component for lazy-loaded routes
const LoadingSpinner = () => (
  <div
    className="app-loading-viewport"
    role="status"
    aria-live="polite"
    aria-label="Loading page"
  >
    <div className="w-12 h-12 border-t-4 border-b-4 border-indigo-600 dark:border-indigo-400 rounded-full animate-spin"></div>
    <span className="sr-only">Loading page</span>
  </div>
);

const AGENT_SOURCE = 'resumeats-browser-agent';
const APP_SOURCE = 'resumeats-web';
const BRIDGE_REQUEST_TYPES = new Set([
  'BRIDGE_READY',
  'APP_AUTOFILL_AI_REQUEST',
  'APP_SYNC_PROFILE_REQUEST',
  'APP_AUTH_STATE_REQUEST',
  'APP_PREPARE_RESUME_REQUEST',
  'APP_PREPARE_SAVED_RESUME_REQUEST',
  'APP_VALIDATE_SAVED_RESUME_REQUEST',
]);

const AuthRecoveryBridge = () => {
  useEffect(() => {
    let cancelled = false;
    const recoverySession = extractRecoverySessionFromUrl();

    if (recoverySession) {
      const establishRecoverySession = async () => {
        try {
          const { error } = await supabase.auth.setSession({
            access_token: recoverySession.accessToken,
            refresh_token: recoverySession.refreshToken,
          });
          if (cancelled) return;
          if (error) throw error;
          window.location.replace(`${window.location.origin}/#/update-password`);
        } catch {
          if (cancelled) return;
          console.error('Failed to establish password recovery session.');
          window.location.replace(`${window.location.origin}/#/forgot-password`);
        }
      };

      establishRecoverySession();
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
};

const FOCUS_ROUTE_PATTERN = /^\/(builder|preview|quick-resume)(\/|$)/;
const AUTH_ROUTE_PATTERN = /^\/(signin|signup|forgot-password|update-password|auth\/callback)(\/|$)/;

function AppLayout() {
  const { isDark } = useTheme();
  const location = useLocation();
  const hideMobileBottomNav = FOCUS_ROUTE_PATTERN.test(location.pathname);

  return (
    <>
      <Seo />
      <GoogleAnalytics />
      <AuthProvider>
        <AuthRecoveryBridge />
        <AccountSessionBoundary>
        <ProfileDraftProvider>
        <TailoringDraftProvider>
        <SubscriptionProvider>
          <ResumeProvider>
            <ErrorBoundary showReset={true} showDetails={!import.meta.env.PROD}>
              <AppShellFrame
                hideMobileBottomNav={hideMobileBottomNav}
                footerCompact={hideMobileBottomNav || AUTH_ROUTE_PATTERN.test(location.pathname)}
                isDark={isDark}
                toaster={(
                  <Toaster
                    position="bottom-right"
                    gutter={12}
                    containerStyle={{
                      zIndex: 60,
                      bottom: 'var(--app-toast-offset)',
                      right: 'max(1rem, var(--safe-right))',
                    }}
                    toastOptions={{
                      duration: 3000,
                      className: 'text-sm',
                      style: {
                        background: isDark ? '#1e293b' : '#ffffff',
                        color: isDark ? '#e2e8f0' : '#0f172a',
                        border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                        borderRadius: '12px',
                        padding: '14px 16px',
                        maxWidth: 'min(420px, calc(100vw - 32px - var(--safe-left) - var(--safe-right)))',
                        boxShadow: isDark
                          ? '0 10px 30px rgba(15, 23, 42, 0.35)'
                          : '0 10px 30px rgba(15, 23, 42, 0.08)',
                      },
                      iconTheme: {
                        primary: isDark ? '#60a5fa' : '#2563eb',
                        secondary: isDark ? '#0f172a' : '#ffffff',
                      },
                      success: {
                        duration: 3000,
                        style: {
                          background: isDark ? '#052e16' : '#f0fdf4',
                          color: isDark ? '#bbf7d0' : '#166534',
                          border: `1px solid ${isDark ? '#15803d' : '#bbf7d0'}`,
                        },
                        iconTheme: {
                          primary: isDark ? '#4ade80' : '#16a34a',
                          secondary: isDark ? '#052e16' : '#ffffff',
                        },
                      },
                      error: {
                        duration: 5000,
                        style: {
                          background: isDark ? '#450a0a' : '#fef2f2',
                          color: isDark ? '#fecaca' : '#b91c1c',
                          border: `1px solid ${isDark ? '#7f1d1d' : '#fecaca'}`,
                        },
                        iconTheme: {
                          primary: isDark ? '#f87171' : '#dc2626',
                          secondary: isDark ? '#450a0a' : '#ffffff',
                        },
                      },
                    }}
                  />
                )}
              >
                  <Suspense fallback={<LoadingSpinner />}>
                    <RouteAccessibility />
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/signin" element={<SignInPage />} />
                      <Route path="/signup" element={<SignUpPage />} />
                      <Route path="/forgot-password" element={<ForgotPassword />} />
                      <Route path="/update-password" element={<UpdatePassword />} />
                      <Route path="/learn" element={<Learn />} />
                      <Route path="/pricing" element={<Pricing />} />
                      <Route path="/about" element={<AboutUs />} />
                      <Route path="/terms" element={<TermsOfService />} />
                      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                      <Route path="/faq" element={<FAQ />} />
                      <Route path="/contact" element={<Contact />} />
                      <Route path="/welcome" element={<AuthCallbackPage />} />
                      {/* Stripe return (with or without sessionId, depending on checkout path) */}
                      <Route path="/return-from-stripe" element={<StripeReturnPage />} />
                      <Route path="/return-from-stripe/:sessionId" element={<StripeReturnPage />} />

                      {/* Subscription Routes */}
                      <Route
                        path="/subscription/success"
                        element={
                          <ProtectedRoute>
                            <SubscriptionSuccess />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/subscription/manage"
                        element={
                          <ProtectedRoute>
                            <SubscriptionManage />
                          </ProtectedRoute>
                        }
                      />

                      {/* Protected Routes */}
                      <Route
                        path="/dashboard"
                        element={
                          <ProtectedRoute>
                            <Dashboard />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/builder"
                        element={
                          <ProtectedRoute>
                            <ResumeBuilder />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/builder/:resumeId"
                        element={
                          <ProtectedRoute>
                            <ResumeBuilder />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/preview/:resumeId"
                        element={
                          <ProtectedRoute>
                            <ResumePreview />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/profile"
                        element={
                          <ProtectedRoute>
                            <UserProfile />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/ai-generator"
                        element={
                          <ProtectedRoute>
                            <AIGeneratorPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/new"
                        element={
                          <ProtectedRoute>
                            <NewResume />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/quick-resume"
                        element={
                          <ProtectedRoute>
                            <SimpleResumeFlow />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/applications"
                        element={
                          <ProtectedRoute>
                            <ApplicationTracker />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/auto-apply"
                        element={
                          <ProtectedRoute>
                            <AutoApply />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/analytics"
                        element={
                          <ProtectedRoute>
                            <Analytics />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin"
                        element={
                          <ProtectedRoute>
                            <AdminDashboard />
                          </ProtectedRoute>
                        }
                      />

                      {/* 404 Route */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
              </AppShellFrame>
            </ErrorBoundary>
          </ResumeProvider>
        </SubscriptionProvider>
        </TailoringDraftProvider>
        </ProfileDraftProvider>
        </AccountSessionBoundary>
      </AuthProvider>
    </>
  );
}

function AppShell() {
  useEffect(() => {
    let cleanupBridge = null;
    let bridgeLoading = false;
    let cancelled = false;

    const loadBridge = async () => {
      if (cleanupBridge || bridgeLoading) return;
      bridgeLoading = true;

      try {
        const module = await import('./services/browserAgentAppBridge');
        if (cancelled) return;
        cleanupBridge = module.initializeBrowserAgentAppBridge();
      } finally {
        bridgeLoading = false;
      }
    };

    const handleExtensionBridgeMessage = (event) => {
      const message = event.data;
      if (
        event.source !== window || event.origin !== window.origin ||
        !message ||
        message.source !== AGENT_SOURCE ||
        message.target !== APP_SOURCE ||
        !BRIDGE_REQUEST_TYPES.has(message.type)
      ) {
        return;
      }

      const bridgeToken = message.bridgeToken || message.payload?.bridgeToken;
      if (
        message.type === 'BRIDGE_READY' &&
        typeof bridgeToken === 'string' &&
        bridgeToken.length >= 24
      ) {
        window.__resumeatsExtensionBridgeToken = bridgeToken;
      }

      if (!cleanupBridge) {
        window.__resumeatsPendingBridgeMessages = window.__resumeatsPendingBridgeMessages || [];
        window.__resumeatsPendingBridgeMessages.push(message);
      }

      void loadBridge();
    };

    window.addEventListener('message', handleExtensionBridgeMessage);

    return () => {
      cancelled = true;
      window.removeEventListener('message', handleExtensionBridgeMessage);
      if (cleanupBridge) cleanupBridge();
    };
  }, []);

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppLayout />
    </Router>
  );
}

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </MotionConfig>
  );
}

export default App;
