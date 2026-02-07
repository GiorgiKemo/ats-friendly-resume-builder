import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { lazy, Suspense } from 'react';
import './styles/error-boundary.css';

// Context Providers - Stable version (Reverted animations)
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
const AboutUs = lazy(() => import('./pages/AboutUs'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const FAQ = lazy(() => import('./pages/FAQ'));
const Contact = lazy(() => import('./pages/Contact'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
// const StripeReturnPage = lazy(() => import('./pages/StripeReturnPage')); // No longer lazy
const ForgotPassword = lazy(() => import('./components/auth/ForgotPassword'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy')); // Import the Privacy Policy page

// Loading spinner component for lazy-loaded routes
const LoadingSpinner = () => (
  <div className="flex items-center justify-center w-full h-64">
    <div className="w-12 h-12 border-t-4 border-b-4 border-indigo-600 rounded-full animate-spin"></div>
  </div>
);

function App() {
  return (
    <Router>
      <AuthProvider>
        <SubscriptionProvider>
          <ResumeProvider>
            <ErrorBoundary showReset={true} showDetails={!import.meta.env.PROD}>
              <div className="min-h-screen flex flex-col bg-gray-50">
                <Header />

                <main className="flex-grow">
                  <Suspense fallback={<LoadingSpinner />}>
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/signin" element={<SignInPage />} />
                      <Route path="/signup" element={<SignUpPage />} />
                      <Route path="/forgot-password" element={<ForgotPassword />} />
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
                      background: '#363636',
                      color: '#fff',
                    },
                    success: {
                      duration: 3000,
                      style: {
                        background: '#1E3A8A',
                      },
                    },
                    error: {
                      duration: 5000,
                      style: {
                        background: '#991B1B',
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

export default App;
