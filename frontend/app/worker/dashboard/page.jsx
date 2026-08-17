'use client';

import React, { useState, useEffect } from 'react';
import { fetchAPI } from '../../../lib/api';
import CivicMap from '../../../components/civic/CivicMap';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_URL = API_URL.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/live';

export default function WorkerDashboard() {
  const [tasks, setTasks] = useState([]);
  const [activeTab, setActiveTab] = useState('active'); // 'active', 'completed', 'all'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected task in detail bottom sheet
  const [selectedTask, setSelectedTask] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form inputs for resolution
  const [resolutionComment, setResolutionComment] = useState('');
  const [resolutionImage, setResolutionImage] = useState(null);
  const [resolutionImagePreview, setResolutionImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [activeTab]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAPI(`/api/worker/tasks?status=${activeTab}`);
      setTasks(data || []);
    } catch (err) {
      setError(err.message || 'Failed to retrieve assigned tasks');
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
          
          if (['report_created', 'report_status_changed', 'report_assigned', 'report_corrected', 'task_assigned', 'task_reassigned', 'task_status_changed', 'task_resolved'].includes(payload.event)) {
            // Re-fetch complete task list to capture current assignments or status updates
            fetchTasks();
            
            // If the currently viewed details report was changed, refresh details
            const updatedReport = payload.report;
            if (updatedReport && selectedTask && selectedTask.id === updatedReport.id) {
              fetchTaskDetails(selectedTask.id);
            }
          }
        } catch (e) {
          console.error('Error parsing live WS payload:', e);
        }
      };

      ws.onclose = () => {
        reconnectTimeout = setTimeout(connectWS, 3000);
      };
    };

    connectWS();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [activeTab, selectedTask]);

  const fetchTaskDetails = async (taskId) => {
    try {
      setDetailLoading(true);
      const data = await fetchAPI(`/api/worker/tasks/${taskId}`);
      setSelectedTask(data);
      // Reset resolve form
      setResolutionComment('');
      setResolutionImage(null);
      setResolutionImagePreview(null);
    } catch (err) {
      alert(err.message || 'Failed to load task details');
      setSelectedTask(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStartWork = async () => {
    if (!selectedTask) return;
    try {
      setSubmitting(true);
      const res = await fetch(`${API_URL}/api/worker/tasks/${selectedTask.id}/start`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: 'Worker started progress in field.' }),
        credentials: 'include'
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to start progress');
      }

      await fetchTaskDetails(selectedTask.id);
      fetchTasks();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTask) return;
    if (!resolutionImage) {
      alert('Resolution evidence image is required');
      return;
    }
    if (!resolutionComment || resolutionComment.trim() === '') {
      alert('Closure note is required');
      return;
    }

    try {
      setSubmitting(true);
      
      const formData = new FormData();
      formData.append('image', resolutionImage);
      formData.append('comment', resolutionComment);

      const res = await fetch(`${API_URL}/api/worker/tasks/${selectedTask.id}/resolve`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to resolve task');
      }

      alert('Task resolved successfully');
      setSelectedTask(null);
      fetchTasks();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds the 5MB limit');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file format. Allowed formats: JPG, PNG, WEBP.');
      return;
    }

    setResolutionImage(file);
    setResolutionImagePreview(URL.createObjectURL(file));
  };

  const getImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${API_URL}${path}`;
  };

  const getSeverityBadgeClass = (severity) => {
    const s = severity.toUpperCase();
    if (s === 'CRITICAL') return 'bg-red-100 text-red-700 border border-red-200';
    if (s === 'HIGH') return 'bg-orange-100 text-orange-700 border border-orange-200';
    if (s === 'MEDIUM') return 'bg-amber-100 text-amber-700 border border-amber-200';
    return 'bg-blue-100 text-blue-700 border border-blue-200';
  };

  return (
    <div className="flex flex-col flex-1 h-[calc(100vh-52px)] overflow-hidden relative">
      
      {/* Filters bar */}
      <div className="bg-white border-b border-neutral-200 grid grid-cols-3 text-xs font-bold text-center">
        <button 
          onClick={() => setActiveTab('active')}
          className={`py-3.5 transition ${activeTab === 'active' ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50/10' : 'text-neutral-500 hover:bg-neutral-50'}`}
        >
          Active Tasks
        </button>
        <button 
          onClick={() => setActiveTab('completed')}
          className={`py-3.5 transition ${activeTab === 'completed' ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50/10' : 'text-neutral-500 hover:bg-neutral-50'}`}
        >
          Completed
        </button>
        <button 
          onClick={() => setActiveTab('all')}
          className={`py-3.5 transition ${activeTab === 'all' ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50/10' : 'text-neutral-500 hover:bg-neutral-50'}`}
        >
          All Assignments
        </button>
      </div>

      {/* Task Queue List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center py-10 text-xs text-neutral-400">Loading task sheet...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-neutral-200 p-6">
            <span className="text-3xl block mb-2">🎉</span>
            <h4 className="text-sm font-bold text-neutral-800">Clear queue</h4>
            <p className="text-xs text-neutral-400 mt-1">No tasks assigned to you in this filter category.</p>
          </div>
        ) : (
          tasks.map((task) => (
            <div 
              key={task.id} 
              onClick={() => fetchTaskDetails(task.id)}
              className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 hover:shadow-md transition duration-150 cursor-pointer flex gap-4 items-center"
            >
              {task.before_image && (
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-neutral-100 flex-shrink-0 border border-neutral-150">
                  <img src={getImageUrl(task.before_image)} alt="Evidence" className="w-full h-full object-cover" />
                </div>
              )}
              
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getSeverityBadgeClass(task.severity)}`}>
                    {task.severity}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold bg-neutral-100 text-neutral-600`}>
                    {task.status.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono ml-auto">{task.report_number}</span>
                </div>
                <h4 className="text-sm font-bold text-neutral-900 capitalize leading-tight">
                  {task.category.replace('_', ' ')}
                </h4>
                <p className="text-xs text-neutral-400 truncate">📍 {task.address || 'Ahmedabad, India'}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Task Details slide-up bottom sheet */}
      {selectedTask && (
        <div className="absolute inset-0 bg-black/60 z-30 flex flex-col justify-end">
          <div className="bg-white rounded-t-2xl shadow-2xl max-h-[85%] flex flex-col overflow-hidden animate-slide-up">
            
            {/* Sheet Handle / Close Header */}
            <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between bg-neutral-900 text-white">
              <div>
                <h4 className="font-extrabold text-sm capitalize">{selectedTask.category.replace('_', ' ')}</h4>
                <p className="text-[9px] text-neutral-400 font-mono mt-0.5">ID: {selectedTask.report_number}</p>
              </div>
              <button 
                onClick={() => setSelectedTask(null)}
                className="w-6 h-6 rounded-full bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {/* Scrollable details */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-neutral-800">
              {detailLoading ? (
                <div className="text-center py-6 text-neutral-400">Loading detail sheet...</div>
              ) : (
                <>
                  {/* Before/After Evidence Row */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Before Image */}
                    {selectedTask.evidence?.find(e => e.type === 'BEFORE') && (
                      <div className="space-y-1">
                        <span className="font-bold text-[9px] text-neutral-400 uppercase tracking-wider">Before Evidence</span>
                        <div className="h-28 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 relative">
                          <img 
                            src={getImageUrl(selectedTask.evidence.find(e => e.type === 'BEFORE').file_path)} 
                            alt="Before" 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                      </div>
                    )}
                    {/* After Image */}
                    {selectedTask.evidence?.find(e => e.type === 'AFTER') ? (
                      <div className="space-y-1">
                        <span className="font-bold text-[9px] text-neutral-400 uppercase tracking-wider">After Resolution</span>
                        <div className="h-28 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 relative">
                          <img 
                            src={getImageUrl(selectedTask.evidence.find(e => e.type === 'AFTER').file_path)} 
                            alt="After" 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center border border-dashed border-neutral-300 rounded-lg p-2 h-28 text-center text-[10px] text-neutral-400">
                        <span>📷</span>
                        <span>Resolution photo pending</span>
                      </div>
                    )}
                  </div>

                  {/* Urgency indicators */}
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded font-bold ${getSeverityBadgeClass(selectedTask.severity)}`}>
                      Severity: {selectedTask.severity}
                    </span>
                    <span className="px-2 py-0.5 rounded font-bold bg-neutral-100 text-neutral-700">
                      Status: {selectedTask.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Location & Directions */}
                  <div className="space-y-2 bg-neutral-50 p-3 rounded-lg border border-neutral-150">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[9px] text-neutral-400 uppercase">Location details</span>
                      <a 
                        href={`https://www.google.com/maps/dir/?api=1&destination=${selectedTask.latitude},${selectedTask.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 hover:text-teal-700 font-bold text-[10px] flex items-center space-x-0.5"
                      >
                        <span>🧭</span>
                        <span>Navigate / Directions</span>
                      </a>
                    </div>
                    <p className="text-neutral-700 font-medium">📍 {selectedTask.address || `${selectedTask.latitude.toFixed(5)}, ${selectedTask.longitude.toFixed(5)}`}</p>
                    
                    {/* Small map view */}
                    <div className="h-[120px] rounded overflow-hidden mt-2">
                      <CivicMap 
                        issues={[{ latitude: selectedTask.latitude, longitude: selectedTask.longitude, category: selectedTask.category, severity: selectedTask.severity, status: selectedTask.status }]} 
                        center={[selectedTask.longitude, selectedTask.latitude]}
                        zoom={15}
                        interactive={false}
                      />
                    </div>
                  </div>

                  {selectedTask.description && (
                    <div className="space-y-1">
                      <span className="font-bold text-[9px] text-neutral-400 uppercase">Citizen Description</span>
                      <p className="p-3 bg-neutral-50 border border-neutral-150 rounded-lg text-neutral-700 leading-relaxed">
                        {selectedTask.description}
                      </p>
                    </div>
                  )}

                  {/* Actions buttons */}
                  {selectedTask.status.toUpperCase() === 'ASSIGNED' && (
                    <button
                      onClick={handleStartWork}
                      disabled={submitting}
                      className="w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-neutral-200 text-white font-bold rounded-lg text-xs shadow-sm transition"
                    >
                      {submitting ? 'Starting progress...' : 'Start Progress / Work'}
                    </button>
                  )}

                  {selectedTask.status.toUpperCase() === 'IN_PROGRESS' && (
                    <form onSubmit={handleResolveSubmit} className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 space-y-4">
                      <h5 className="font-bold text-[10px] text-neutral-400 uppercase tracking-wider">Close Report / File Resolution</h5>
                      
                      {/* Photo evidence upload */}
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-neutral-500">Resolution Evidence Photo (Mandatory)</label>
                        <div className="flex flex-col items-center justify-center border-2 border-dashed border-neutral-250 rounded-lg p-4 bg-white relative hover:bg-neutral-50/50 cursor-pointer min-h-[100px]">
                          <input 
                            type="file" 
                            accept="image/*"
                            onChange={handleImageChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            required
                          />
                          {!resolutionImagePreview ? (
                            <div className="text-center text-[10px] text-neutral-400">
                              <span>📸</span>
                              <span className="block font-semibold">Tap to capture or upload after photo</span>
                            </div>
                          ) : (
                            <div className="w-24 h-24 rounded border overflow-hidden">
                              <img src={resolutionImagePreview} alt="Preview" className="w-full h-full object-cover" />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Closure note */}
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-neutral-500">Closure notes (Mandatory)</label>
                        <textarea
                          rows="2"
                          value={resolutionComment}
                          onChange={(e) => setResolutionComment(e.target.value)}
                          placeholder="Describe how the problem was resolved (e.g. pothole filled with asphalt...)"
                          className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:bg-neutral-50 bg-white transition"
                          required
                        ></textarea>
                      </div>

                      <button
                        type="submit"
                        disabled={submitting || !resolutionImage}
                        className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-neutral-250 text-white font-bold rounded-lg text-xs shadow-sm transition"
                      >
                        {submitting ? 'Submitting resolution...' : 'Complete Task / Resolve'}
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
