'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import ProtectedRoute from '../../components/civic/ProtectedRoute';

export default function WorkerLayout({ children }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['WORKER']}>
      <div className="min-h-screen bg-neutral-50 flex flex-col font-sans">
        {/* Mobile Friendly Header */}
        <header className="bg-neutral-900 text-white px-4 py-3 flex items-center justify-between shadow sticky top-0 z-20">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded bg-teal-600 flex items-center justify-center text-white font-extrabold text-sm">
              CF
            </div>
            <span className="font-bold text-sm tracking-wide">CivicFix Worker Portal</span>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <span className="hidden sm:inline-block text-neutral-400 font-mono truncate max-w-[120px]">{user?.email}</span>
            <button 
              onClick={handleLogout}
              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded font-bold transition"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 flex flex-col min-w-0">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  );
}
