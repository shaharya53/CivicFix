'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import CivicMap from '../components/civic/CivicMap';
import { fetchAPI } from '../lib/api';

export default function Home() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [demoIssues, setDemoIssues] = useState([
    { id: 1, category: 'Pothole', severity: 'CRITICAL', status: 'SUBMITTED', latitude: 23.025, longitude: 72.573 },
    { id: 2, category: 'Broken streetlight', severity: 'MEDIUM', status: 'ASSIGNED', latitude: 23.020, longitude: 72.568 },
    { id: 3, category: 'Garbage/waste', severity: 'HIGH', status: 'IN_PROGRESS', latitude: 23.030, longitude: 72.580 }
  ]);

  useEffect(() => {
    fetchAPI('/api/health')
      .then(data => {
        setHealth(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-800 font-sans">
      {/* Top Header */}
      <header className="border-b border-neutral-200 bg-white sticky top-0 z-10 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              CF
            </div>
            <span className="text-xl font-bold tracking-tight text-neutral-900">Civic<span className="text-teal-600">Fix</span></span>
          </div>
          
          <nav className="hidden md:flex space-x-8 text-sm font-medium text-neutral-600">
            <Link href="/dashboard" className="text-teal-600 hover:text-teal-700 transition">Dashboard</Link>
            <Link href="/dashboard" className="hover:text-neutral-900 transition">Reports</Link>
            <a href="#" className="hover:text-neutral-900 transition">AI Center</a>
          </nav>

          <div className="flex items-center space-x-4">
            <Link href="/login" className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition">Log In</Link>
            <Link href="/report" className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 shadow-sm transition text-center">
              Report a Problem
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Product Intro and System Verification Status */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight leading-tight">
              Make your city better.
            </h1>
            <p className="mt-3 text-neutral-500 text-sm leading-relaxed">
              Report potholes, garbage, or broken utilities in seconds. CivicFix AI analyzes the evidence, predict severity, and routes reports to departments.
            </p>
            <Link href="/report" className="mt-6 w-full py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 shadow transition flex items-center justify-center space-x-2">
              <span>📷</span>
              <span>Report a Problem Now</span>
            </Link>
          </div>

          {/* System Health Check Container */}
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4">
              Technical Foundation Health
            </h3>
            
            {loading && (
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-neutral-200 rounded w-3/4"></div>
                <div className="h-4 bg-neutral-200 rounded w-5/6"></div>
                <div className="h-4 bg-neutral-200 rounded w-1/2"></div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <strong>Error connecting to backend:</strong> {error}
              </div>
            )}

            {health && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                  <span className="text-sm font-semibold text-neutral-600">Overall Status</span>
                  <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                    health.status === 'healthy' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {health.status.toUpperCase()}
                  </span>
                </div>

                <ul className="space-y-3 text-sm">
                  <li className="flex items-center justify-between">
                    <span className="text-neutral-500">Database</span>
                    <span className="font-medium text-neutral-800">{health.database}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-neutral-500">PostGIS</span>
                    <span className="font-medium text-neutral-800 max-w-[150px] truncate text-right" title={health.postgis}>
                      {health.postgis !== 'not available' ? 'Active' : 'Missing'}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-neutral-500">pgvector extension</span>
                    <span className="font-medium text-neutral-800">
                      {health.pgvector !== 'not available' ? `Active (v${health.pgvector})` : 'Missing'}
                    </span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-neutral-500">Redis Connection</span>
                    <span className="font-medium text-neutral-800">{health.redis}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-neutral-500">AI Service</span>
                    <span className="font-medium text-neutral-800">{health.ai_service}</span>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Map Centered Layout */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm flex flex-col h-full min-h-[500px]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-neutral-900">Nearby Issues Map</h3>
                <p className="text-xs text-neutral-400">Showing active complaints and hotspots</p>
              </div>
              <div className="flex items-center space-x-2 text-xs font-medium">
                <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 bg-red-500 rounded-full inline-block"></span><span>Critical</span></span>
                <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 bg-orange-500 rounded-full inline-block"></span><span>High</span></span>
                <span className="flex items-center space-x-1"><span className="w-2.5 h-2.5 bg-yellow-500 rounded-full inline-block"></span><span>Medium</span></span>
              </div>
            </div>
            
            <div className="flex-1 min-h-[380px]">
              <CivicMap issues={demoIssues} />
            </div>
          </div>
        </div>
        
      </div>
    </main>
  );
}
