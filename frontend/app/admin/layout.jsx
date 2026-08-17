'use client';

import React from 'react';
import ProtectedRoute from '../../components/civic/ProtectedRoute';
import NotificationCenter from '../../components/civic/NotificationCenter';

export default function AdminLayout({ children }) {
  return (
    <ProtectedRoute allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <div className="min-h-screen bg-neutral-50 flex">
        {/* Admin Sidebar */}
        <aside className="w-64 bg-neutral-900 text-neutral-300 p-6 flex flex-col justify-between shadow-md">
          <div className="space-y-6">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded bg-teal-600 flex items-center justify-center text-white font-extrabold text-sm shadow">
                CF
              </div>
              <span className="text-lg font-bold text-white tracking-wide">CivicFix Admin</span>
            </div>
            
            <nav className="space-y-1 text-sm font-medium">
              <a href="/admin/dashboard" className="flex items-center space-x-2.5 py-2 px-3 rounded-lg hover:bg-neutral-800/50 hover:text-white transition">
                <span>📊</span>
                <span>Dashboard</span>
              </a>
              <a href="/admin/map" className="flex items-center space-x-2.5 py-2 px-3 rounded-lg hover:bg-neutral-800/50 hover:text-white transition">
                <span>🗺️</span>
                <span>Interactive Map</span>
              </a>
              <a href="/dashboard" className="flex items-center space-x-2.5 py-2 px-3 rounded-lg hover:bg-neutral-800/50 hover:text-white transition">
                <span>👤</span>
                <span>Citizen View</span>
              </a>
            </nav>
          </div>
          
          <div className="text-xs text-neutral-500 border-t border-neutral-800 pt-4">
            System Admin Panel v1.0
          </div>
        </aside>
        
        {/* Admin Main Body */}
        <main className="flex-1 flex flex-col overflow-y-auto">
          {/* Top Admin Header with Notification Bell */}
          <header className="bg-white border-b border-neutral-200 px-6 py-3.5 flex items-center justify-between sticky top-0 z-20 shadow-sm">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">CivicFix Control Panel</span>
            <div className="flex items-center space-x-4">
              <NotificationCenter />
              <span className="text-xs font-semibold text-neutral-600">Admin Mode</span>
            </div>
          </header>
          
          <div className="flex-1">
            {children}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
