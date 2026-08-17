'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { fetchAPI } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMe = async () => {
    try {
      setLoading(true);
      const data = await fetchAPI('/api/auth/me');
      setUser(data);
      setError(null);
    } catch (err) {
      setUser(null);
      // Not authenticated is a standard guest state, not an error
      if (err.message !== 'Not authenticated') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMe();
  }, []);

  const login = async (email, password) => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAPI('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      });
      setUser(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email, password, role = 'CITIZEN') => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAPI('/api/auth/register', {
        method: 'POST',
        body: { email, password, role }
      });
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await fetchAPI('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, logout, checkAuth: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
