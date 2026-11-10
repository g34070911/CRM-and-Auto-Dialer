import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api, setToken, getStoredToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('crm_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [company, setCompany] = useState(() => {
    const raw = localStorage.getItem('crm_company');
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setTok] = useState(getStoredToken());
  const [team, setTeam] = useState([]);

  const persist = useCallback((result) => {
    setToken(result.token);
    localStorage.setItem('crm_user', JSON.stringify(result.user));
    localStorage.setItem('crm_company', JSON.stringify(result.company));
    setTok(result.token);
    setUser(result.user);
    setCompany(result.company);
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await api.login({ email, password });
    persist(result);
  }, [persist]);

  const signup = useCallback(async (payload) => {
    const result = await api.signup(payload);
    persist(result);
  }, [persist]);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem('crm_user');
    localStorage.removeItem('crm_company');
    setTok(null);
    setUser(null);
    setCompany(null);
    setTeam([]);
  }, []);

  // Fetch team members when logged in
  const refreshTeam = useCallback(async () => {
    if (!token) return;
    try {
      const teamList = await api.getTeam();
      setTeam(teamList);
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      refreshTeam();
    }
    const handleUnauth = () => logout();
    window.addEventListener('auth-unauthorized', handleUnauth);
    return () => window.removeEventListener('auth-unauthorized', handleUnauth);
  }, [token, logout, refreshTeam]);

  return (
    <AuthContext.Provider value={{ user, company, token, team, login, signup, logout, refreshTeam }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
