import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Layout from './pages/Layout.jsx';
import Profiles from './pages/Profiles.jsx';
import ProfileView from './pages/ProfileView.jsx';

function RequireAuth({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/profiles" replace />} />
        <Route path="profiles" element={<Profiles />} />
        <Route path="profiles/:profileId" element={<ProfileView />} />
      </Route>
      <Route path="*" element={<Navigate to="/profiles" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
