import React, { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const SEVERITY_COLORS = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-blue-50 text-blue-700 border-blue-200'
};

const STATUS_COLORS = {
  SUBMITTED: 'bg-neutral-100 text-neutral-800 border-neutral-200',
  UNDER_REVIEW: 'bg-sky-50 text-sky-800 border-sky-200',
  VERIFIED: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  ASSIGNED: 'bg-purple-50 text-purple-800 border-purple-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-800 border-blue-200',
  RESOLVED: 'bg-green-150 text-green-800 border-green-200',
  CLOSED: 'bg-neutral-200 text-neutral-800 border-neutral-300',
  REOPENED: 'bg-rose-50 text-rose-800 border-rose-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200'
};

export default function IssueCard({ issue }) {
  const [expanded, setExpanded] = useState(false);

  const getImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${API_URL}${path}`;
  };

  const getEvidenceImage = () => {
    if (issue.evidence && issue.evidence.length > 0) {
      return getImageUrl(issue.evidence[0].file_path);
    }
    return null;
  };

  const formattedDate = new Date(issue.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const displayCategory = issue.category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const imageSrc = getEvidenceImage();

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden hover:shadow-md transition duration-200">
      <div className="p-5 flex flex-col md:flex-row gap-5">
        
        {/* Left: Image Thumbnail (if available) */}
        {imageSrc && (
          <div className="w-full md:w-32 h-32 rounded-lg bg-neutral-100 border border-neutral-150 overflow-hidden flex-shrink-0 relative">
            <img 
              src={imageSrc} 
              alt={displayCategory} 
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Right: Content details */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${SEVERITY_COLORS[issue.severity.toUpperCase()] || 'bg-neutral-50 border-neutral-200 text-neutral-600'}`}>
              {issue.severity.toUpperCase()}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[issue.status.toUpperCase()] || 'bg-neutral-50 border-neutral-200 text-neutral-600'}`}>
              {issue.status.replace('_', ' ').toUpperCase()}
            </span>
            <span className="text-xs text-neutral-400 ml-auto">{formattedDate}</span>
          </div>

          <h4 className="text-lg font-bold text-neutral-900 leading-tight mb-1">
            {displayCategory}
          </h4>
          
          <p className="text-sm text-neutral-500 line-clamp-2 mb-2">
            {issue.description || 'No description provided.'}
          </p>

          <div className="flex items-center text-xs text-neutral-400 space-x-3 mt-3">
            <span>📍 {issue.address || `${issue.latitude.toFixed(4)}, ${issue.longitude.toFixed(4)}`}</span>
          </div>
        </div>
      </div>

      {/* Accordion expand button */}
      <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-2.5 flex items-center justify-between">
        <button 
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-semibold text-teal-600 hover:text-teal-700 transition flex items-center space-x-1"
        >
          <span>{expanded ? 'Hide Timeline & Details' : 'View Timeline & Details'}</span>
          <span>{expanded ? '▲' : '▼'}</span>
        </button>
        <span className="text-xs text-neutral-400 font-mono">Report ID: CF-{String(issue.id).padStart(6, '0')}</span>
      </div>

      {/* Expanded status details */}
      {expanded && (
        <div className="p-5 border-t border-neutral-100 bg-neutral-50/50 space-y-4">
          {issue.description && (
            <div>
              <h5 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Citizen Notes</h5>
              <p className="text-sm text-neutral-700 leading-relaxed bg-white p-3 rounded-lg border border-neutral-150">
                {issue.description}
              </p>
            </div>
          )}

          <div>
            <h5 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Status Timeline</h5>
            <div className="relative pl-6 border-l border-neutral-200 ml-3 space-y-4 py-1">
              {issue.history && issue.history.length > 0 ? (
                issue.history.map((hist, idx) => (
                  <div key={idx} className="relative">
                    <span className="absolute -left-[30px] top-1.5 w-2 h-2 rounded-full bg-teal-600 border border-white"></span>
                    <div className="flex flex-col md:flex-row md:justify-between gap-1">
                      <span className="text-sm font-semibold text-neutral-800">
                        {hist.status.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="text-xs text-neutral-400">
                        {new Date(hist.created_at).toLocaleString()}
                      </span>
                    </div>
                    {hist.comment && (
                      <p className="text-xs text-neutral-500 mt-0.5">{hist.comment}</p>
                    )}
                  </div>
                ))
              ) : (
                <div className="relative">
                  <span className="absolute -left-[30px] top-1.5 w-2 h-2 rounded-full bg-teal-600 border border-white"></span>
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold text-neutral-800">SUBMITTED</span>
                    <span className="text-xs text-neutral-400">{formattedDate}</span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">Report submitted successfully</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
