'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { useReports } from '../../hooks/useReports';
import ProtectedRoute from '../../components/civic/ProtectedRoute';
import CivicMap from '../../components/civic/CivicMap';
import IssueCard from '../../components/civic/IssueCard';
import NotificationCenter from '../../components/civic/NotificationCenter';

function CitizenDashboardContent() {
  const { user, logout } = useAuth();
  const { reports, loading, error, fetchMyReports } = useReports();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportId = searchParams.get('reportId');

  useEffect(() => {
    fetchMyReports();
  }, []);

  useEffect(() => {
    if (reportId && !loading) {
      setTimeout(() => {
        const element = document.getElementById(`issue-card-${reportId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('ring-4', 'ring-teal-500', 'ring-opacity-50', 'bg-teal-50/10');
          setTimeout(() => {
            element.classList.remove('ring-4', 'ring-teal-500', 'ring-opacity-50', 'bg-teal-50/10');
          }, 4000);
        }
      }, 600);
    }
  }, [reportId, loading]);

  const totalReports = reports.length;
  const pendingReports = reports.filter(r => r.status.toUpperCase() !== 'RESOLVED' && r.status.toUpperCase() !== 'CLOSED').length;
  const resolvedReports = reports.filter(r => r.status.toUpperCase() === 'RESOLVED' || r.status.toUpperCase() === 'CLOSED').length;

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-800 font-sans">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white sticky top-0 z-10 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              CF
            </div>
            <span className="text-xl font-bold tracking-tight text-neutral-900">
              Civic<span className="text-teal-600">Fix</span>
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <NotificationCenter />
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-neutral-900">{user?.email}</p>
              <p className="text-xs text-neutral-400 font-medium">Role: {user?.role}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="px-3 py-1.5 border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Summary Metrics & CTA */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Welcome Card & Create Report CTA */}
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <h2 className="text-2xl font-extrabold text-neutral-900 tracking-tight leading-tight">
              Hello, Citizen
            </h2>
            <p className="mt-2 text-neutral-500 text-sm leading-relaxed">
              Help keep our neighborhoods safe, clean, and functional. Take a photo, mark the location, and report civic problems in seconds.
            </p>
            
            <Link href="/report" className="mt-6 w-full py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 shadow-sm transition flex items-center justify-center space-x-2">
              <span>📷</span>
              <span>Report a Problem</span>
            </Link>
          </div>

          {/* Metrics summary card */}
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4">
              My Reports Summary
            </h3>
            
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-neutral-50 border border-neutral-150 rounded-lg">
                <span className="block text-xl font-bold text-neutral-900">{totalReports}</span>
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total</span>
              </div>
              <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-lg">
                <span className="block text-xl font-bold text-amber-700">{pendingReports}</span>
                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Pending</span>
              </div>
              <div className="p-3 bg-green-50/50 border border-green-100 rounded-lg">
                <span className="block text-xl font-bold text-green-700">{resolvedReports}</span>
                <span className="text-[10px] font-bold text-green-500 uppercase tracking-wider">Resolved</span>
              </div>
            </div>
          </div>
          
        </div>

        {/* Right Side: Map & Feed grid */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Geolocation Map */}
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm flex flex-col h-[350px]">
            <h3 className="text-base font-bold text-neutral-900 mb-4">Nearby Issues</h3>
            <div className="flex-1">
              <CivicMap issues={reports} />
            </div>
          </div>

          {/* User's Reports Feed */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-neutral-900">My Reports List</h3>
            
            {loading && (
              <div className="text-center py-10 bg-white rounded-xl border border-neutral-200 shadow-sm">
                <div className="animate-pulse flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-neutral-200 mb-2"></div>
                  <div className="h-4 bg-neutral-200 rounded w-1/3 mb-1"></div>
                  <div className="h-3 bg-neutral-200 rounded w-1/4"></div>
                </div>
              </div>
            )}

            {!loading && reports.length === 0 && (
              <div className="text-center py-12 bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
                <span className="text-3xl block mb-2">📋</span>
                <h4 className="text-sm font-bold text-neutral-800">No Reports Submitted</h4>
                <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto">
                  You haven't filed any complaints yet. Help us fix things by reporting your first problem!
                </p>
              </div>
            )}

            {!loading && reports.length > 0 && (
              <div className="space-y-4">
                {reports.map((report) => (
                  <div key={report.id} id={`issue-card-${report.id}`} className="transition duration-300 rounded-xl p-1">
                    <IssueCard issue={report} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}

export default function CitizenDashboard() {
  return (
    <ProtectedRoute allowedRoles={['CITIZEN']}>
      <CitizenDashboardContent />
    </ProtectedRoute>
  );
}
