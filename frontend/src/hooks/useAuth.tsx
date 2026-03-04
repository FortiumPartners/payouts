/**
 * Hook for authentication state.
 */

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { api, User } from '../lib/api';
import { init as initIdeas, destroy as destroyIdeas } from '@fortium/ideas-widget';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function getIdToken(): Promise<string> {
  const response = await fetch('/auth/token', { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to get token');
  const data = await response.json();
  return data.token;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      const currentUser = await api.getCurrentUser();
      setUser(currentUser);
      if (currentUser?.email) {
        localStorage.setItem('lastIdentityEmail', currentUser.email);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (user) {
      initIdeas({
        appId: 'payouts',
        repo: 'FortiumPartners/payouts',
        apiUrl: 'https://ideas.fortiumsoftware.com',
        getToken: getIdToken,
        captureErrors: true,
      });
    }
    return () => { destroyIdeas(); };
  }, [user]);

  const logout = useCallback(async () => {
    setUser(null);
    await api.logout();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refresh: checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
