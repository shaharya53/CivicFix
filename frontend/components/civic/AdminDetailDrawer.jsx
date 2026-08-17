import React, { useState, useEffect } from 'react';
import { fetchAPI } from '../../lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function AdminDetailDrawer({ reportId, onClose, onUpdate }) {
  const [report, setReport] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [workers, setWorkers] = useState([]);
  
  // Input fields state
  const [statusComment, setStatusComment] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedWorker, setSelectedWorker] = useState('');
  const [correctCategory, setCorrectCategory] = useState('');
  const [correctSeverity, setCorrectSeverity] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  // UI state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'ai', 'timeline'

  // Fetch complete details on open
  useEffect(() => {
    if (reportId) {
      fetchDetails();
    }
  }, [reportId]);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [reportData, deptList, workerList] = await Promise.all([
        fetchAPI(`/api/admin/reports/${reportId}`),
        fetchAPI('/api/admin/departments'),
        fetchAPI('/api/admin/workers')
      ]);

      setReport(reportData);
      setDepartments(deptList || []);
      setWorkers(workerList || []);
      
      // Initialize inputs
      setSelectedDept(reportData.department_id || '');
      setSelectedWorker(reportData.assigned_worker_id || '');
      setCorrectCategory(reportData.category || '');
      setCorrectSeverity(reportData.severity || '');
    } catch (err) {
      setError(err.message || 'Failed to fetch details');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (nextStatus) => {
    try {
      setSubmitting(true);
      const res = await fetch(`${API_URL}/api/admin/reports/${reportId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          comment: statusComment || `Changed status to ${nextStatus}`
        }),
        credentials: 'include'
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to update status');
      }

      setStatusComment('');
      await fetchDetails();
      if (onUpdate) onUpdate();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await fetch(`${API_URL}/api/admin/reports/${reportId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department_id: selectedDept ? parseInt(selectedDept) : null,
          assigned_worker_id: selectedWorker ? parseInt(selectedWorker) : null
        }),
        credentials: 'include'
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to assign');
      }

      alert('Assignment updated successfully');
      await fetchDetails();
      if (onUpdate) onUpdate();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCorrect = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await fetch(`${API_URL}/api/admin/reports/${reportId}/correct`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: correctCategory,
          severity: correctSeverity,
          reason: correctionReason
        }),
        credentials: 'include'
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to log correction');
      }

      alert('Override logged and report values corrected');
      setCorrectionReason('');
      await fetchDetails();
      if (onUpdate) onUpdate();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${API_URL}${path}`;
  };

  // Enforce workflow logic buttons
  const renderActionButtons = () => {
    if (!report) return null;
    const current = report.status.toUpperCase();
    
    return (
      <div className="space-y-4 bg-neutral-50 p-4 rounded-xl border border-neutral-200">
        <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Enforced Action Controls</h4>
        
        <div>
          <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Transition Note / Comment</label>
          <input 
            type="text" 
            placeholder="e.g. Issue verified or photo is blurry..."
            value={statusComment}
            onChange={(e) => setStatusComment(e.target.value)}
            className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg text-xs bg-white focus:bg-neutral-50 transition mb-3"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {current === 'SUBMITTED' && (
            <>
              <button onClick={() => handleStatusChange('UNDER_REVIEW')} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition">Start Review</button>
              <button onClick={() => handleStatusChange('REJECTED')} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold shadow-sm transition">Reject</button>
              <button onClick={() => handleStatusChange('DUPLICATE')} className="px-3 py-1.5 bg-neutral-600 hover:bg-neutral-700 text-white rounded text-xs font-semibold shadow-sm transition">Duplicate</button>
            </>
          )}

          {current === 'UNDER_REVIEW' && (
            <>
              <button onClick={() => handleStatusChange('VERIFIED')} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold shadow-sm transition">Verify Issue</button>
              <button onClick={() => handleStatusChange('REJECTED')} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold shadow-sm transition">Reject</button>
            </>
          )}

          {current === 'VERIFIED' && (
            <>
              <button onClick={() => handleStatusChange('ASSIGNED')} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-semibold shadow-sm transition">Mark Assigned</button>
              <button onClick={() => handleStatusChange('IN_PROGRESS')} className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-semibold shadow-sm transition">Start Work</button>
            </>
          )}

          {current === 'ASSIGNED' && (
            <button onClick={() => handleStatusChange('IN_PROGRESS')} className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-semibold shadow-sm transition">Start Work</button>
          )}

          {current === 'IN_PROGRESS' && (
            <>
              <button onClick={() => handleStatusChange('RESOLVED')} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-semibold shadow-sm transition">Resolve Issue</button>
              <button onClick={() => handleStatusChange('REOPENED')} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs font-semibold shadow-sm transition">Reopen</button>
            </>
          )}

          {current === 'RESOLVED' && (
            <>
              <button onClick={() => handleStatusChange('CLOSED')} className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-900 text-white rounded text-xs font-semibold shadow-sm transition">Close Issue</button>
              <button onClick={() => handleStatusChange('REOPENED')} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs font-semibold shadow-sm transition">Reopen</button>
            </>
          )}

          {['REJECTED', 'DUPLICATE', 'CANCELLED', 'CLOSED'].includes(current) && (
            <button onClick={() => handleStatusChange('REOPENED')} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs font-semibold shadow-sm transition">Reopen Report</button>
          )}
        </div>
      </div>
    );
  };

  if (!reportId) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-white shadow-2xl border-l border-neutral-200 z-50 flex flex-col">
      {/* Drawer Header */}
      <div className="px-6 py-5 border-b border-neutral-200 flex items-center justify-between bg-neutral-900 text-white">
        <div>
          <h3 className="font-extrabold text-base tracking-tight">Report Review Panel</h3>
          <p className="text-[10px] text-neutral-400 font-mono mt-0.5">ID: {report?.report_number || 'Loading...'}</p>
        </div>
        <button 
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700 transition"
        >
          ✕
        </button>
      </div>

      {/* Loading States */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-2 p-6">
          <span className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></span>
          <span className="text-xs text-neutral-400">Loading details...</span>
        </div>
      ) : error ? (
        <div className="flex-1 p-6 text-center text-xs text-red-600">
          Error loading report: {error}
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex border-b border-neutral-200 text-xs font-semibold">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`flex-1 py-3 text-center border-b-2 transition ${activeTab === 'overview' ? 'border-teal-600 text-teal-600 bg-teal-50/10' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
            >
              Overview
            </button>
            <button 
              onClick={() => setActiveTab('ai')}
              className={`flex-1 py-3 text-center border-b-2 transition ${activeTab === 'ai' ? 'border-teal-600 text-teal-600 bg-teal-50/10' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
            >
              AI Auditing
            </button>
            <button 
              onClick={() => setActiveTab('timeline')}
              className={`flex-1 py-3 text-center border-b-2 transition ${activeTab === 'timeline' ? 'border-teal-600 text-teal-600 bg-teal-50/10' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
            >
              History Timeline
            </button>
          </div>

          {/* Drawer Body Scroll */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {activeTab === 'overview' && (
              <>
                {/* Image Gallery */}
                {report.evidence && report.evidence.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Uploaded Evidence</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {report.evidence.map((ev) => (
                        <div key={ev.id} className="relative rounded-lg overflow-hidden border border-neutral-200 h-28 bg-neutral-100">
                          <img 
                            src={getImageUrl(ev.file_path)} 
                            alt={ev.type} 
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-bold bg-black/60 text-white uppercase">
                            {ev.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Info Fields */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-150">
                    <span className="block text-neutral-400 font-medium">Category</span>
                    <span className="font-bold text-neutral-800 capitalize">{report.category}</span>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-150">
                    <span className="block text-neutral-400 font-medium">Severity</span>
                    <span className="font-bold text-neutral-800">{report.severity}</span>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-150">
                    <span className="block text-neutral-400 font-medium">Status</span>
                    <span className="font-bold text-neutral-800">{report.status.replace('_', ' ')}</span>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-150">
                    <span className="block text-neutral-400 font-medium">Created Date</span>
                    <span className="font-bold text-neutral-800">{new Date(report.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Location Description</h4>
                  <p className="text-sm text-neutral-700 bg-neutral-50 p-3 rounded-lg border border-neutral-150">
                    📍 {report.address || `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`}
                  </p>
                </div>

                {report.description && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Citizen description</h4>
                    <p className="text-sm text-neutral-700 bg-neutral-50 p-3 rounded-lg border border-neutral-150 whitespace-pre-wrap">
                      {report.description}
                    </p>
                  </div>
                )}

                {/* Workflow Transitions */}
                {renderActionButtons()}

                {/* Department / Worker Assignments */}
                <form onSubmit={handleAssign} className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 space-y-4">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Routing & Assignments</h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Department</label>
                      <select
                        value={selectedDept}
                        onChange={(e) => setSelectedDept(e.target.value)}
                        className="w-full px-2 py-1.5 border border-neutral-200 rounded text-xs bg-white focus:bg-neutral-50 transition"
                      >
                        <option value="">-- Unassigned --</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Worker</label>
                      <select
                        value={selectedWorker}
                        onChange={(e) => setSelectedWorker(e.target.value)}
                        className="w-full px-2 py-1.5 border border-neutral-200 rounded text-xs bg-white focus:bg-neutral-50 transition"
                      >
                        <option value="">-- Unassigned --</option>
                        {workers.map((w) => (
                          <option key={w.id} value={w.id}>{w.email}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded text-xs transition shadow-sm"
                  >
                    Save Assignments
                  </button>
                </form>
              </>
            )}

            {activeTab === 'ai' && (
              <>
                {/* AI Auditing list */}
                {report.ai_predictions && report.ai_predictions.length > 0 ? (
                  report.ai_predictions.map((pred, idx) => (
                    <div key={idx} className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden text-xs">
                      <div className="bg-neutral-900 text-white px-4 py-2 flex items-center justify-between font-mono text-[10px]">
                        <span>Model: {pred.model_name} v{pred.model_version}</span>
                        <span>{(pred.confidence * 100).toFixed(0)}% Conf</span>
                      </div>
                      
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="block text-neutral-400 font-medium">Predicted Category</span>
                            <span className="font-bold text-neutral-800 uppercase">{pred.output_json.category}</span>
                          </div>
                          <div>
                            <span className="block text-neutral-400 font-medium">Predicted Severity</span>
                            <span className="font-bold text-neutral-800 uppercase">{pred.output_json.severity}</span>
                          </div>
                        </div>

                        {pred.corrections && pred.corrections.length > 0 && (
                          <div className="border-t border-neutral-200 pt-3 space-y-2">
                            <span className="font-bold text-neutral-400 uppercase tracking-wider block text-[9px]">Correction Override Audits</span>
                            <div className="space-y-1.5">
                              {pred.corrections.map((corr, cIdx) => (
                                <div key={cIdx} className="bg-white p-2 rounded border border-neutral-150 relative">
                                  <div className="flex justify-between font-mono text-[9px] text-neutral-400 mb-1">
                                    <span>User: #{corr.corrected_by_id}</span>
                                    <span>{new Date(corr.created_at).toLocaleString()}</span>
                                  </div>
                                  <p className="text-[11px] text-neutral-700">
                                    Corrected <span className="line-through text-neutral-400">{corr.original_value}</span> to <strong className="text-teal-600">{corr.corrected_value}</strong>
                                  </p>
                                  {corr.reason && (
                                    <p className="text-[10px] text-neutral-400 italic mt-0.5">"{corr.reason}"</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-xs text-neutral-400 italic py-6">
                    No AI model logs recorded for this report.
                  </div>
                )}

                {/* Prediction Override Form */}
                <form onSubmit={handleCorrect} className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 space-y-4">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Log Manual Prediction Override</h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Corrected Category</label>
                      <select
                        value={correctCategory}
                        onChange={(e) => setCorrectCategory(e.target.value)}
                        className="w-full px-2 py-1.5 border border-neutral-200 rounded text-xs bg-white focus:bg-neutral-50 transition"
                        required
                      >
                        <option value="pothole">Pothole</option>
                        <option value="garbage">Garbage / Waste</option>
                        <option value="streetlight">Broken Streetlight</option>
                        <option value="water_leakage">Water Leakage</option>
                        <option value="drainage">Drainage Problem</option>
                        <option value="road_damage">Road Damage</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Corrected Severity</label>
                      <select
                        value={correctSeverity}
                        onChange={(e) => setCorrectSeverity(e.target.value)}
                        className="w-full px-2 py-1.5 border border-neutral-200 rounded text-xs bg-white focus:bg-neutral-50 transition"
                        required
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="CRITICAL">Critical</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Reason for override</label>
                    <textarea
                      rows="2"
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      placeholder="e.g. AI misidentified waste bin as pothole..."
                      className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs bg-white focus:bg-neutral-50 transition"
                      required
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded text-xs transition shadow-sm"
                  >
                    Submit Prediction Correction
                  </button>
                </form>
              </>
            )}

            {activeTab === 'timeline' && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Status History Log</h4>
                <div className="relative pl-6 border-l border-neutral-200 ml-3 space-y-4 py-1">
                  {report.history && report.history.length > 0 ? (
                    report.history.map((hist, idx) => (
                      <div key={idx} className="relative text-xs">
                        <span className="absolute -left-[30px] top-1 w-2 h-2 rounded-full bg-teal-600 border border-white"></span>
                        <div className="flex flex-col md:flex-row md:justify-between gap-1">
                          <span className="font-semibold text-neutral-800 uppercase">
                            {hist.status.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-neutral-400">
                            {new Date(hist.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-[10px] text-neutral-400 font-mono mt-0.5">Author ID: #{hist.changed_by_id}</p>
                        {hist.comment && (
                          <p className="text-neutral-500 italic mt-1 bg-white p-2 rounded border border-neutral-150">"{hist.comment}"</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="relative text-xs text-neutral-400">
                      No transition history logs found.
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </>
      )}
    </div>
  );
}
