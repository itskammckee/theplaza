import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from 'zite-auth-sdk';
import Layout from './components/Layout';
import OverviewPage from './pages/OverviewPage';
import CalendarPage from './pages/CalendarPage';
import ProspectsPage from './pages/ProspectsPage';
import HostsPage from './pages/HostsPage';
import EventsPage from './pages/EventsPage';
import OpenAccountsPage from './pages/OpenAccountsPage';
import DepositReturnsPage from './pages/DepositReturnsPage';
import ProcessDepositReturnPage from './pages/ProcessDepositReturnPage';
import UsersPage from './pages/UsersPage';
import EditProfilePage from './pages/EditProfilePage';
import RequestsBugsPage from './pages/RequestsBugsPage';
import ViewLedgerPage from './pages/ViewLedgerPage';
import ViewCheckRequestPage from './pages/ViewCheckRequestPage';
import HostPortalPage from './pages/HostPortalPage';
import HostPortalDocumentsPage from './pages/HostPortalDocumentsPage';
import VendorPortalPage from './pages/VendorPortalPage';
import DocumentsPage from './pages/DocumentsPage';
import ShowingsPage from './pages/ShowingsPage';
import { Toaster } from '@/components/ui/sonner';
import { DataRefreshProvider } from './contexts/DataRefreshContext';
import { UserProvider, useUserData } from './contexts/UserContext';
import PWAInstallPrompt from './components/PWAInstallPrompt';

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration);
      })
      .catch((error) => {
        console.log('Service Worker registration failed:', error);
      });
  });
}

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, isLoading, loginWithRedirect } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    loginWithRedirect({ redirectUrl: window.location.href });
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function RoleBasedRedirect() {
  const { userData, isLoadingUserData } = useUserData();
  
  if (isLoadingUserData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (userData?.role === 'Host') {
    return <Navigate to="/host-portal" replace />;
  }
  
  if (userData?.role === 'Vendor') {
    return <Navigate to="/vendor-portal" replace />;
  }
  
  return <Navigate to="/overview" replace />;
}

function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const { userData, isLoadingUserData } = useUserData();
  
  if (isLoadingUserData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (userData?.role === 'Host') {
    return <Navigate to="/host-portal" replace />;
  }
  
  if (userData?.role === 'Vendor') {
    return <Navigate to="/vendor-portal" replace />;
  }
  
  return <>{children}</>;
}

function ProtectedHostRoute({ children }: { children: React.ReactNode }) {
  const { userData, isLoadingUserData } = useUserData();
  
  if (isLoadingUserData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (userData?.role !== 'Host') {
    return <Navigate to="/overview" replace />;
  }
  
  return <>{children}</>;
}

function ProtectedVendorRoute({ children }: { children: React.ReactNode }) {
  const { userData, isLoadingUserData } = useUserData();
  
  if (isLoadingUserData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (userData?.role !== 'Vendor') {
    if (userData?.role === 'Host') {
      return <Navigate to="/host-portal" replace />;
    }
    return <Navigate to="/overview" replace />;
  }
  
  return <>{children}</>;
}

function VendorOrAdminRoute({ children }: { children: React.ReactNode }) {
  const { userData, isLoadingUserData } = useUserData();
  
  if (isLoadingUserData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (userData?.role === 'Host') {
    return <Navigate to="/host-portal" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  return (
    <DataRefreshProvider>
      <Router>
        <UserProvider>
          <Toaster />
          <PWAInstallPrompt />
          <Routes>
            <Route path="/view-ledger" element={<ViewLedgerPage />} />
            <Route path="/view-check-request" element={<ViewCheckRequestPage />} />
            
            <Route 
              path="/host-portal" 
              element={
                <AuthWrapper>
                  <ProtectedHostRoute>
                    <HostPortalPage />
                  </ProtectedHostRoute>
                </AuthWrapper>
              } 
            />
            
            <Route 
              path="/host-portal/documents" 
              element={
                <AuthWrapper>
                  <ProtectedHostRoute>
                    <HostPortalDocumentsPage />
                  </ProtectedHostRoute>
                </AuthWrapper>
              } 
            />
            
            <Route path="/" element={<AuthWrapper><Layout /></AuthWrapper>}>
              <Route index element={<RoleBasedRedirect />} />
              
              <Route path="vendor-portal" element={<ProtectedVendorRoute><VendorPortalPage /></ProtectedVendorRoute>} />
              <Route path="overview" element={<ProtectedAdminRoute><OverviewPage /></ProtectedAdminRoute>} />
              <Route path="calendar" element={<VendorOrAdminRoute><CalendarPage /></VendorOrAdminRoute>} />
              <Route path="prospects" element={<ProtectedAdminRoute><ProspectsPage /></ProtectedAdminRoute>} />
              <Route path="showings" element={<ProtectedAdminRoute><ShowingsPage /></ProtectedAdminRoute>} />
              <Route path="hosts" element={<ProtectedAdminRoute><HostsPage /></ProtectedAdminRoute>} />
              <Route path="events" element={<VendorOrAdminRoute><EventsPage /></VendorOrAdminRoute>} />
              <Route path="open-accounts" element={<ProtectedAdminRoute><OpenAccountsPage /></ProtectedAdminRoute>} />
              <Route path="deposit-returns" element={<ProtectedAdminRoute><DepositReturnsPage /></ProtectedAdminRoute>} />
              <Route path="deposit-returns/process" element={<ProtectedAdminRoute><ProcessDepositReturnPage /></ProtectedAdminRoute>} />
              <Route path="documents" element={<ProtectedAdminRoute><DocumentsPage /></ProtectedAdminRoute>} />
              <Route path="requests-bugs" element={<ProtectedAdminRoute><RequestsBugsPage /></ProtectedAdminRoute>} />
              <Route path="users" element={<ProtectedAdminRoute><UsersPage /></ProtectedAdminRoute>} />
              <Route path="edit-profile" element={<EditProfilePage />} />
            </Route>
          </Routes>
        </UserProvider>
      </Router>
    </DataRefreshProvider>
  );
}
