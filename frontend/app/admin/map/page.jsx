'use client';

import React, { useState, useEffect } from 'react';
import { fetchAPI } from '../../../lib/api';
import CivicMap from '../../../components/civic/CivicMap';
import AdminDetailDrawer from '../../../components/civic/AdminDetailDrawer';

export default function AdminMapPage() {
  const [reports, setReports] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  // Selected report in drawer
  const [selectedReportId, setSelectedReportId] = useState(null);

  // Fetch departments list on mount
  useEffect(() => {
    fetchDepartments();
  }, []);

  // Fetch all reports matching filters
  useEffect(() => {
    fetchReportsForMap();
  }, [statusFilter, severityFilter, categoryFilter, deptFilter]);

  const fetchDepartments = async () => {
    try {
      const data = await fetchAPI('/api/admin/departments');
      if (data) setDepartments(data);
    } catch (err) {
      console.error('Failed to load departments:', err);
    }
  };

  const fetchReportsForMap = async () => {
    try {
      setLoading(true);
      setError(null);

      // Request maximum allowed reports (e.g. 100) to populate the map clusters fully
      let params = `?page=1&limit=100`;
      if (statusFilter) params += `&status=${statusFilter}`;
      if (severityFilter) params += `&severity=${severityFilter}`;
      if (categoryFilter) params += `&category=${categoryFilter}`;
      if (deptFilter) params += `&department_id=${deptFilter}`;

      const data = await fetchAPI(`/api/admin/reports${params}`);
      if (data) {
        setReports(data.reports || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch map data');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = () => {
    fetchReportsForMap();
  };

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
      
      {/* Filters Overlay Row */}
      <div className="bg-white border-b border-neutral-200 px-6 py-4 flex flex-wrap items-center gap-4 z-10 shadow-sm text-xs font-semibold">
        <div className="flex items-center space-x-1">
          <span className="text-neutral-500 font-bold uppercase tracking-wider text-[10px]">Filters:</span>
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-2.5 py-1.5 border border-neutral-200 rounded bg-neutral-50 focus:bg-white transition"
        >
          <option value="">Category: All</option>
          <option value="pothole">Pothole</option>
          <option value="garbage">Garbage</option>
          <option value="streetlight">Streetlight</option>
          <option value="water_leakage">Water Leakage</option>
          <option value="drainage">Drainage</option>
          <option value="other">Other</option>
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-2.5 py-1.5 border border-neutral-200 rounded bg-neutral-50 focus:bg-white transition"
        >
          <option value="">Severity: All</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2.5 py-1.5 border border-neutral-200 rounded bg-neutral-50 focus:bg-white transition"
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
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-2.5 py-1.5 border border-neutral-200 rounded bg-neutral-50 focus:bg-white transition"
        >
          <option value="">Department: All</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        {loading && <span className="text-[10px] text-teal-600 animate-pulse font-semibold">Updating map markers...</span>}
      </div>

      {/* Map Widget (fills full height) */}
      <div className="flex-1 w-full h-full relative">
        <CivicMap 
          issues={reports} 
          onMarkerClick={(report) => setSelectedReportId(report.id)}
        />
      </div>

      {/* Details drawer overlay */}
      {selectedReportId && (
        <AdminDetailDrawer 
          reportId={selectedReportId} 
          onClose={() => setSelectedReportId(null)}
          onUpdate={handleUpdate}
        />
      )}

    </main>
  );
}
