import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, type User } from './api';

interface AuthContextType {
  user: User | null;
  credits: number;
  loading: boolean;
  signIn: (username: string, password: string, remember?: boolean) => Promise<void>;
  signUp: (data: { username: string; email: string; password: string; invite_code?: string; email_code?: string }) => Promise<void>;
  signOut: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    try {
      const data = await api.getMe();
      setUser(data.user);
      setCredits(data.user.credits || 0);
    } catch {
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oidcToken = params.get('token');
    if (oidcToken) {
      localStorage.setItem('token', oidcToken);
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
      refreshUser();
    }
  }, [refreshUser]);

  const signIn = async (username: string, password: string, remember?: boolean) => {
    const data = await api.signIn({ username, password, remember });
    localStorage.setItem('token', data.token);
    setUser(data.user);
    setCredits(data.user.credits || 0);
  };

  const signUp = async (d: { username: string; email: string; password: string; invite_code?: string; email_code?: string }) => {
    const data = await api.signUp(d);
    localStorage.setItem('token', data.token);
    setUser(data.user);
    setCredits(data.user.credits || 0);
  };

  const signOut = () => {
    localStorage.removeItem('token');
    setUser(null);
    setCredits(0);
  };

  return (
    <AuthContext.Provider value={{ user, credits, loading, signIn, signUp, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
