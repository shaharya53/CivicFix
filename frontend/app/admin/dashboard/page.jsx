'use client';

import React, { useState, useEffect } from 'react';
import { fetchAPI } from '../../../lib/api';
import CivicMap from '../../../components/civic/CivicMap';
import AdminDetailDrawer from '../../../components/civic/AdminDetailDrawer';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_URL = API_URL.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/live';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    total_issues: 0,
    pending: 0,
    in_progress: 0,
    resolved: 0,
    critical: 0,
    ai_review: 0
  });

  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter and pagination states
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [aiReviewFilter, setAiReviewFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Selected report in drawer
  const [selectedReportId, setSelectedReportId] = useState(null);

  // Fetch stats and reports list
  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchReportsList();
  }, [statusFilter, severityFilter, categoryFilter, aiReviewFilter, sortField, sortDir, page]);

  const fetchStats = async () => {
    try {
      const statsData = await fetchAPI('/api/admin/reports/stats');
      if (statsData) setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch KPI stats:', err);
    }
  };

  const fetchReportsList = async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query parameters
      let params = `?page=${page}&limit=${limit}&sort_by=${sortField}&sort_dir=${sortDir}`;
      if (statusFilter) params += `&status=${statusFilter}`;
      if (severityFilter) params += `&severity=${severityFilter}`;
      if (categoryFilter) params += `&category=${categoryFilter}`;
      if (aiReviewFilter) params += `&ai_review_only=true`;
      if (searchQuery) params += `&search=${encodeURIComponent(searchQuery)}`;

      const data = await fetchAPI(`/api/admin/reports${params}`);
      if (data) {
        setReports(data.reports || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      setError(err.message || 'Failed to retrieve reports list');
    } finally {
      setLoading(false);
    }
  };

  // WebSocket Live Updates Connection
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    const connectWS = () => {
      ws = new WebSocket(WS_URL);

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          
          // Trigger updates on creations, assignments, status changes, corrections
          if (['report_created', 'report_status_changed', 'report_assigned', 'report_corrected'].includes(payload.event)) {
            // 1. Refresh KPI aggregate counts from DB
            fetchStats();

            // 2. Safely merge report updates in client reports array to prevent duplication
            const updatedReport = payload.report;
            if (updatedReport) {
              setReports((prev) => {
                const index = prev.findIndex((r) => r.id === updatedReport.id);
                if (index !== -1) {
                  // Update existing item fields
                  const nextReports = [...prev];
                  nextReports[index] = { ...nextReports[index], ...updatedReport };
                  return nextReports;
                } else {
                  // Prepend new report to the queue if filters allow or search is empty
                  if (!statusFilter && !severityFilter && !categoryFilter && !searchQuery) {
                    return [updatedReport, ...prev].slice(0, limit);
                  }
                  return prev;
                }
              });
            }
          }
        } catch (e) {
          console.error('Error parsing live WS payload:', e);
        }
      };

      ws.onclose = () => {
        console.log('WS Connection closed. Attempting reconnect in 3s...');
        reconnectTimeout = setTimeout(connectWS, 3000);
      };

      ws.onerror = (err) => {
        console.error('WS Error:', err);
        ws.close();
      };
    };

    connectWS();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [statusFilter, severityFilter, categoryFilter, searchQuery]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchReportsList();
  };

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  const handleReportUpdate = () => {
    fetchStats();
    fetchReportsList();
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <main className="p-6 md:p-8 space-y-6 flex-1 flex flex-col min-h-screen max-w-7xl mx-auto">
      
      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
          <span className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total Reports</span>
          <span className="text-2xl font-black text-neutral-900 mt-1 block">{stats.total_issues}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
          <span className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Pending Action</span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">{stats.pending}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
          <span className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">In Progress</span>
          <span className="text-2xl font-black text-blue-600 mt-1 block">{stats.in_progress}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
          <span className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Resolved</span>
          <span className="text-2xl font-black text-green-700 mt-1 block">{stats.resolved}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
          <span className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Critical</span>
          <span className="text-2xl font-black text-red-600 mt-1 block">{stats.critical}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm cursor-pointer hover:bg-neutral-50 transition" onClick={() => setAiReviewFilter(!aiReviewFilter)}>
          <span className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
            <span>AI Review Queue</span>
            {aiReviewFilter && <span className="text-teal-600 font-bold text-[8px] border border-teal-200 px-1 rounded bg-teal-50">ACTIVE</span>}
          </span>
          <span className="text-2xl font-black text-purple-700 mt-1 block">{stats.ai_review}</span>
        </div>
      </div>

      {/* Split layout: Reports Grid & Mapbox */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-stretch">
        
        {/* Left Side: Priority Queue list (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl shadow-sm p-5 flex flex-col space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-base font-bold text-neutral-900">Issues Operations Queue</h3>
            
            {/* Search form */}
            <form onSubmit={handleSearchSubmit} className="flex items-center space-x-1.5">
              <input 
                type="text" 
                placeholder="Search description, address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-2.5 py-1.5 border border-neutral-200 rounded-lg text-xs bg-neutral-50 focus:bg-white transition w-44"
              />
              <button type="submit" className="px-2.5 py-1.5 bg-neutral-900 text-white text-xs font-bold rounded-lg hover:bg-neutral-800 transition">Search</button>
            </form>
          </div>

          {/* Filtering row */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <select 
              value={statusFilter} 
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-2 py-1.5 border border-neutral-200 rounded-lg bg-neutral-50 font-medium"
            >
              <option value="">Status: All</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="VERIFIED">Verified</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <select 
              value={severityFilter} 
              onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
              className="px-2 py-1.5 border border-neutral-200 rounded-lg bg-neutral-50 font-medium"
            >
              <option value="">Severity: All</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>

            <select 
              value={categoryFilter} 
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="px-2 py-1.5 border border-neutral-200 rounded-lg bg-neutral-50 font-medium"
            >
              <option value="">Category: All</option>
              <option value="pothole">Pothole</option>
              <option value="garbage">Garbage</option>
              <option value="streetlight">Streetlight</option>
              <option value="water_leakage">Water Leakage</option>
              <option value="drainage">Drainage</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Data Queue Table */}
          <div className="flex-1 overflow-x-auto min-h-[300px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-400 font-bold">
                  <th className="py-2.5 cursor-pointer hover:text-neutral-700" onClick={() => toggleSort('id')}>ID</th>
                  <th className="py-2.5 cursor-pointer hover:text-neutral-700" onClick={() => toggleSort('category')}>Category</th>
                  <th className="py-2.5 cursor-pointer hover:text-neutral-700" onClick={() => toggleSort('severity')}>Severity</th>
                  <th className="py-2.5 cursor-pointer hover:text-neutral-700" onClick={() => toggleSort('status')}>Status</th>
                  <th className="py-2.5">Address</th>
                  <th className="py-2.5 text-right cursor-pointer hover:text-neutral-700" onClick={() => toggleSort('created_at')}>Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="text-center py-10 text-neutral-400">Loading complaints...</td>
                  </tr>
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-10 text-neutral-400">No reports found matching filters.</td>
                  </tr>
                ) : (
                  reports.map((r) => (
                    <tr 
                      key={r.id} 
                      onClick={() => setSelectedReportId(r.id)}
                      className={`border-b border-neutral-100 hover:bg-neutral-50/80 transition duration-150 cursor-pointer ${selectedReportId === r.id ? 'bg-teal-50/20' : ''}`}
                    >
                      <td className="py-3 font-mono font-bold text-neutral-500">{r.report_number}</td>
                      <td className="py-3 font-semibold text-neutral-800 capitalize">{r.category.replace('_', ' ')}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.severity === 'CRITICAL' ? 'bg-red-50 text-red-600 border border-red-100' : r.severity === 'HIGH' ? 'bg-orange-50 text-orange-600 border border-orange-100' : r.severity === 'MEDIUM' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
                          {r.severity}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${r.status === 'SUBMITTED' ? 'bg-neutral-100 text-neutral-700' : r.status === 'RESOLVED' ? 'bg-green-100 text-green-700' : 'bg-sky-50 text-sky-700'}`}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 text-neutral-500 max-w-[140px] truncate">{r.address || 'Ahmedabad, India'}</td>
                      <td className="py-3 text-right text-neutral-400">{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          <div className="flex items-center justify-between border-t border-neutral-150 pt-4 text-xs">
            <span className="text-neutral-400">Showing {reports.length} of {total} items</span>
            <div className="flex items-center space-x-1">
              <button 
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="px-2.5 py-1 border border-neutral-200 rounded hover:bg-neutral-50 disabled:opacity-40 transition font-bold"
              >
                Previous
              </button>
              <span className="px-3 text-neutral-500 font-semibold">Page {page} of {totalPages}</span>
              <button 
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
                className="px-2.5 py-1 border border-neutral-200 rounded hover:bg-neutral-50 disabled:opacity-40 transition font-bold"
              >
                Next
              </button>
            </div>
          </div>

        </div>

        {/* Right Side: Mapbox clusters (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-neutral-200 rounded-xl shadow-sm p-5 flex flex-col h-[500px] lg:h-auto">
          <h3 className="text-base font-bold text-neutral-900 mb-4">Complaint Map Clusters</h3>
          <div className="flex-1">
            <CivicMap 
              issues={reports} 
              onMarkerClick={(report) => setSelectedReportId(report.id)}
            />
          </div>
        </div>

      </div>

      {/* Details drawer panel */}
      {selectedReportId && (
        <AdminDetailDrawer 
          reportId={selectedReportId} 
          onClose={() => setSelectedReportId(null)}
          onUpdate={handleReportUpdate}
        />
      )}

    </main>
  );
}
