import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import Login from '@/pages/Login';
import AcceptInvite from '@/pages/AcceptInvite';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const FullScreenSpinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const ErrorScreen = ({ title, message }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="max-w-md w-full mx-4 text-center space-y-4">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
        <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="text-muted-foreground">{message}</p>
    </div>
  </div>
);

/**
 * Gate for every application route. Unauthenticated visitors are sent to
 * /login and returned to where they were heading after signing in.
 */
const RequireAuth = ({ children }) => {
  const { isAuthenticated, isLoadingAuth, authChecked, authError } = useAuth();
  const location = useLocation();

  if (!authChecked || isLoadingAuth) return <FullScreenSpinner />;

  if (authError?.type === 'account_disabled') {
    return <ErrorScreen title="Account Disabled" message={authError.message} />;
  }
  if (authError?.type === 'backend_unreachable') {
    return <ErrorScreen title="Backend Unavailable" message={authError.message} />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
};

/** Keeps a signed-in user away from the login screen. */
const RedirectIfAuthenticated = ({ children }) => {
  const { isAuthenticated, isLoadingAuth, authChecked } = useAuth();

  if (!authChecked || isLoadingAuth) return <FullScreenSpinner />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return children;
};

const AppRoutes = () => (
  <Routes>
    <Route
      path="/login"
      element={
        <RedirectIfAuthenticated>
          <Login />
        </RedirectIfAuthenticated>
      }
    />

    {/* Public: the recipient has no account yet, and must reach this page
        even while signed out. */}
    <Route path="/invite/:token" element={<AcceptInvite />} />

    <Route
      path="/"
      element={
        <RequireAuth>
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        </RequireAuth>
      }
    />

    {Object.entries(Pages).map(([path, Page]) => (
      <Route
        key={path}
        path={`/${path}`}
        element={
          <RequireAuth>
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          </RequireAuth>
        }
      />
    ))}

    <Route
      path="*"
      element={
        <RequireAuth>
          <PageNotFound />
        </RequireAuth>
      }
    />
  </Routes>
);

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AppRoutes />
        </Router>
        <Toaster />
        <SonnerToaster position="top-right" richColors />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
