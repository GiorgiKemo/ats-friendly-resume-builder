import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { lazy, Suspense, useEffect } from 'react';
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
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import MobileBottomNav from './components/layout/MobileBottomNav';
import OfflineNotification from './components/ui/OfflineNotification';
import { supabase } from './services/supabase';
import { initializeBrowserAgentAppBridge } from './services/browserAgentAppBridge';
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
  <div className="flex items-center justify-center w-full h-64">
    <div className="w-12 h-12 border-t-4 border-b-4 border-indigo-600 dark:border-indigo-400 rounded-full animate-spin"></div>
  </div>
);

const AuthRecoveryBridge = () => {
  useEffect(() => {
    let cancelled = false;
    const recoverySession = extractRecoverySessionFromUrl();

    if (recoverySession) {
      const establishRecoverySession = async () => {
        const { error } = await supabase.auth.setSession({
          access_token: recoverySession.accessToken,
          refresh_token: recoverySession.refreshToken,
        });

        if (cancelled) {
          return;
        }

        if (error) {
          console.error('Failed to establish password recovery session:', error);
          window.location.replace(`${window.location.origin}/#/forgot-password`);
          return;
        }

        window.location.replace(`${window.location.origin}/#/update-password`);
      };

      establishRecoverySession();
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
};

function AppShell() {
  const { isDark } = useTheme();

  useEffect(() => {
    const cleanup = initializeBrowserAgentAppBridge();
    return cleanup;
  }, []);

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <SubscriptionProvider>
          <ResumeProvider>
            <ErrorBoundary showReset={true} showDetails={!import.meta.env.PROD}>
              <AuthRecoveryBridge />
              <div className="min-h-screen flex flex-col bg-gray-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100 transition-colors duration-200">
                <Header />

                <main className="flex-grow">
                  <Suspense fallback={<LoadingSpinner />}>
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
                </main>

                <Footer />

                {/* Mobile Bottom Navigation */}
                <MobileBottomNav />

                {/* Offline Notification */}
                <OfflineNotification />

                {/* Add padding to the bottom on mobile to account for the bottom nav */}
                <div className="md:hidden h-16"></div>

                {/* Toast notification system */}
                <Toaster
                  position="bottom-right"
                  toastOptions={{
                    duration: 3000,
                    style: {
                      background: isDark ? '#1e293b' : '#ffffff',
                      color: isDark ? '#e2e8f0' : '#0f172a',
                      border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                      boxShadow: isDark
                        ? '0 10px 30px rgba(15, 23, 42, 0.35)'
                        : '0 10px 30px rgba(15, 23, 42, 0.08)',
                    },
                    success: {
                      duration: 3000,
                      style: {
                        background: isDark ? '#172554' : '#eff6ff',
                        color: isDark ? '#dbeafe' : '#1d4ed8',
                        border: `1px solid ${isDark ? '#1d4ed8' : '#bfdbfe'}`,
                      },
                    },
                    error: {
                      duration: 5000,
                      style: {
                        background: isDark ? '#450a0a' : '#fef2f2',
                        color: isDark ? '#fecaca' : '#b91c1c',
                        border: `1px solid ${isDark ? '#7f1d1d' : '#fecaca'}`,
                      },
                    },
                  }}
                />
              </div>
            </ErrorBoundary>
          </ResumeProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </Router>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

export default App;
