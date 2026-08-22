import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { InvestigationsPage } from './pages/InvestigationsPage';
import { InvestigationDetailPage } from './pages/InvestigationDetailPage';
import { NewInvestigationPage } from './pages/NewInvestigationPage';
import { ToastContainer } from './components/Toast';
import { Loader2 } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, initialized } = useAuthStore();

  if (!initialized || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-app">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-text-secondary text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { initialize, initialized } = useAuthStore();

  useEffect(() => {
    if (!initialized) {
      initialize();
    }
  }, [initialize, initialized]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/investigations"
            element={
              <ProtectedRoute>
                <InvestigationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/investigations/new"
            element={
              <ProtectedRoute>
                <NewInvestigationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/investigations/:id"
            element={
              <ProtectedRoute>
                <InvestigationDetailPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="*"
            element={
              <div className="flex items-center justify-center min-h-screen bg-app">
                <div className="text-center">
                  <h1 className="text-4xl font-bold text-text mb-2">404</h1>
                  <p className="text-text-secondary">Page not found</p>
                </div>
              </div>
            }
          />
        </Routes>
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
