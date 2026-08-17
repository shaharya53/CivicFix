'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../hooks/useAuth';
import { useReports } from '../../hooks/useReports';
import ProtectedRoute from '../../components/civic/ProtectedRoute';
import CivicMap from '../../components/civic/CivicMap';

function ReportProblemContent() {
  const { user } = useAuth();
  const { analyzeImage, createReport } = useReports();
  const router = useRouter();

  // Wizard state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [latitude, setLatitude] = useState(23.0225); // Default to Ahmedabad
  const [longitude, setLongitude] = useState(72.5714);
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  
  // AI analysis predictions state
  const [analysisId, setAnalysisId] = useState(null);
  const [predictedCategory, setPredictedCategory] = useState('');
  const [predictedSeverity, setPredictedSeverity] = useState('');
  const [categoryConfidence, setCategoryConfidence] = useState(0.0);
  const [severityConfidence, setSeverityConfidence] = useState(0.0);
  const [recommendedDept, setRecommendedDept] = useState('');
  const [possibleDuplicates, setPossibleDuplicates] = useState([]);
  
  // Custom manual choices (linked to AI prediction values originally, editable by user)
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('');

  // UI state
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [submissionError, setSubmissionError] = useState(null);
  const [mapboxError, setMapboxError] = useState(false);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Auto-detect geolocation on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude);
          setLongitude(position.coords.longitude);
        },
        (err) => {
          console.log('Geolocation retrieval rejected or failed:', err.message);
        }
      );
    }
    // Check if Mapbox token is missing to flag coordinate entry fallback
    if (!mapboxToken) {
      setMapboxError(true);
    }
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds the 5MB limit. Please choose a smaller image.');
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file format. Allowed formats: JPG, JPEG, PNG, WEBP.');
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));

    // Clear previous prediction results
    setAnalysisId(null);
    setPredictedCategory('');
    setPredictedSeverity('');
    setAiUnavailable(false);
    setSubmissionError(null);
  };

  const triggerAIAnalysis = async () => {
    if (!imageFile) return;

    try {
      setAnalyzing(true);
      setAiUnavailable(false);
      setSubmissionError(null);

      const data = await analyzeImage(imageFile);

      if (data.ai_unavailable) {
        setAiUnavailable(true);
        setAnalysisId(data.analysis_id);
        setSelectedCategory('other');
        setSelectedSeverity('medium');
      } else {
        setAnalysisId(data.analysis_id);
        setPredictedCategory(data.category);
        setPredictedSeverity(data.severity.toUpperCase());
        setCategoryConfidence(data.category_confidence);
        setSeverityConfidence(data.severity_confidence || 0.9);
        setRecommendedDept(data.recommended_department);
        setPossibleDuplicates(data.possible_duplicates || []);

        // Pre-fill user inputs with AI suggestions
        setSelectedCategory(data.category);
        setSelectedSeverity(data.severity.toUpperCase());
      }
    } catch (err) {
      console.error('AI Analysis request failed:', err);
      setAiUnavailable(true);
      setSelectedCategory('other');
      setSelectedSeverity('medium');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!imageFile) {
      alert('Please upload an image showing the issue first.');
      return;
    }
    if (!selectedCategory || !selectedSeverity) {
      alert('Please select a category and severity level.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmissionError(null);

      await createReport({
        category: selectedCategory,
        severity: selectedSeverity,
        description,
        latitude,
        longitude,
        address,
        analysis_id: analysisId,
        image: imageFile
      });

      router.push('/dashboard');
    } catch (err) {
      setSubmissionError(err.message || 'Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-800 font-sans">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white sticky top-0 z-10 px-6 py-4 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center space-x-1.5 text-sm font-semibold text-neutral-600 hover:text-teal-600 transition">
            <span>←</span>
            <span>Back to Dashboard</span>
          </Link>
          <span className="text-sm font-bold text-neutral-900">Report a Problem</span>
        </div>
      </header>

      {/* Main content container */}
      <div className="max-w-3xl mx-auto px-6 py-10">
        <form onSubmit={handleSubmit} className="space-y-8 bg-white border border-neutral-200 rounded-xl p-6 md:p-8 shadow-sm">
          
          <div>
            <h2 className="text-xl font-bold text-neutral-900 leading-tight">Create Civic Report</h2>
            <p className="text-xs text-neutral-400 mt-1">Provide evidence, describe the problem, verify AI inputs, and submit.</p>
          </div>

          {/* Step 1: Upload evidence */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-neutral-700">Step 1: Upload Photo Evidence</label>
            
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 rounded-xl p-6 bg-neutral-50 hover:bg-neutral-100/50 transition cursor-pointer relative min-h-[160px]">
              <input 
                type="file" 
                accept="image/*"
                onChange={handleImageChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              
              {!imagePreview ? (
                <div className="text-center space-y-2">
                  <span className="text-3xl block">📷</span>
                  <span className="text-sm font-semibold text-neutral-600 block">Click or Drag Image Here</span>
                  <span className="text-[10px] text-neutral-400">JPG, PNG or WEBP (Max 5MB)</span>
                </div>
              ) : (
                <div className="w-full max-w-[280px] h-[160px] rounded-lg overflow-hidden border border-neutral-200 shadow-sm relative">
                  <img 
                    src={imagePreview} 
                    alt="Upload Preview" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition duration-200">
                    <span className="text-white text-xs font-bold">Replace Image</span>
                  </div>
                </div>
              )}
            </div>
            
            {imageFile && !analysisId && !analyzing && (
              <button
                type="button"
                onClick={triggerAIAnalysis}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-sm transition shadow-sm"
              >
                Trigger AI Analysis
              </button>
            )}
          </div>

          {/* Step 2: Location Map / Fallback Coordinates panel */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-neutral-700">Step 2: Geolocation & Address</label>
            
            {/* Map Container */}
            <div className="h-[220px] rounded-lg overflow-hidden border border-neutral-200 relative">
              {!mapboxError ? (
                <CivicMap 
                  issues={[{ latitude, longitude, category: 'My Location', severity: 'LOW', status: 'SUBMITTED' }]} 
                  center={[longitude, latitude]}
                  zoom={14}
                  interactive={false}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full bg-amber-50/20 border border-dashed border-amber-200 p-4 text-center">
                  <span className="text-2xl mb-1">🗺️</span>
                  <h4 className="text-xs font-bold text-amber-800">Map Interface Disabled</h4>
                  <p className="text-[11px] text-neutral-500 max-w-xs mt-0.5">
                    Mapbox token is missing. Please type the coordinates and address in the input fields below.
                  </p>
                </div>
              )}
            </div>

            {/* Coordinates Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Latitude</label>
                <input 
                  type="number" 
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-neutral-50 focus:bg-white transition"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Longitude</label>
                <input 
                  type="number" 
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-neutral-50 focus:bg-white transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Street Address / Landmark</label>
              <input 
                type="text" 
                placeholder="e.g. 123 Main Street or Near Metro Station"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-neutral-50 focus:bg-white transition"
              />
            </div>
          </div>

          {/* AI Analysis Panel */}
          {analyzing && (
            <div className="p-6 bg-teal-50/20 border border-teal-100 rounded-xl flex flex-col items-center justify-center text-center space-y-2 animate-pulse">
              <span className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></span>
              <span className="text-sm font-semibold text-teal-800">CivicFix AI is analyzing the image...</span>
            </div>
          )}

          {aiUnavailable && (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-amber-800 font-bold text-sm">
                <span>⚠️</span>
                <span>AI Service Currently Offline</span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                The auto-classification models are currently unavailable. You can still file the report manually by picking the category and severity below.
              </p>
            </div>
          )}

          {analysisId && !analyzing && (
            <div className="border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-neutral-50 px-5 py-3 border-b border-neutral-200 flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">CivicFix AI analysis</span>
                <span className="px-2 py-0.5 text-[10px] bg-teal-100 text-teal-800 rounded font-semibold">ACTIVE</span>
              </div>
              
              <div className="p-5 space-y-4">
                
                {!aiUnavailable ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-150">
                        <span className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Detected Category</span>
                        <span className="text-base font-bold text-neutral-900">
                          {predictedCategory.replace('_', ' ').toUpperCase()}
                        </span>
                        <span className="text-xs text-teal-600 block mt-0.5">Confidence: {(categoryConfidence * 100).toFixed(0)}%</span>
                      </div>
                      
                      <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-150">
                        <span className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Predicted Severity</span>
                        <span className="text-base font-bold text-neutral-900">
                          {predictedSeverity}
                        </span>
                        <span className="text-xs text-teal-600 block mt-0.5">Confidence: {(severityConfidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>

                    <div className="text-xs text-neutral-500 bg-neutral-50 p-3 rounded-lg border border-neutral-150">
                      🏢 <strong>Recommended Routing Department:</strong> {recommendedDept.replace('_', ' ').toUpperCase()}
                    </div>

                    {possibleDuplicates.length > 0 && (
                      <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg text-xs space-y-2">
                        <span className="font-bold text-orange-800 block">⚠️ Possible duplicates detected nearby</span>
                        <ul className="space-y-1 pl-4 list-disc text-neutral-600">
                          {possibleDuplicates.map((dup, idx) => (
                            <li key={idx}>
                              Report #{dup.id}: {dup.category} (Distance: {dup.distance_meters ? `${dup.distance_meters.toFixed(0)}m` : 'nearby'})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-neutral-500 italic text-center">
                    Proceeding with manual entries...
                  </div>
                )}
                
              </div>
            </div>
          )}

          {/* Step 3: Description, Category & Severity Selectors */}
          <div className="space-y-4">
            <label className="block text-sm font-bold text-neutral-700">Step 3: Review Details & Submit</label>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-neutral-50 focus:bg-white transition"
                  required
                >
                  <option value="">-- Select Category --</option>
                  <option value="pothole">Pothole</option>
                  <option value="garbage">Garbage / Waste</option>
                  <option value="streetlight">Broken Streetlight</option>
                  <option value="water_leakage">Water Leakage</option>
                  <option value="drainage">Drainage Problem</option>
                  <option value="road_damage">Road Damage</option>
                  <option value="other">Other / General</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Severity</label>
                <select
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-neutral-50 focus:bg-white transition"
                  required
                >
                  <option value="">-- Select Severity --</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Description / Notes</label>
              <textarea 
                rows="3"
                placeholder="Describe the issue, size, hazards, etc..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-neutral-50 focus:bg-white transition"
              ></textarea>
            </div>
          </div>

          {submissionError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
              <strong>Error:</strong> {submissionError}
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-neutral-100">
            <Link 
              href="/dashboard"
              className="px-4 py-2 border border-neutral-200 rounded-lg text-sm font-semibold text-neutral-600 hover:bg-neutral-100 transition"
            >
              Cancel
            </Link>
            
            <button
              type="submit"
              disabled={submitting || analyzing || !imageFile}
              className="px-6 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-neutral-200 text-white font-bold rounded-lg text-sm transition shadow-sm flex items-center space-x-2"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit Report</span>
              )}
            </button>
          </div>

        </form>
      </div>
    </main>
  );
}

export default function ReportProblem() {
  return (
    <ProtectedRoute allowedRoles={['CITIZEN']}>
      <ReportProblemContent />
    </ProtectedRoute>
  );
}
