import { useState } from 'react';
import { fetchAPI } from '../lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function useReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMyReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAPI('/api/reports/my-reports');
      setReports(data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch your reports');
    } finally {
      setLoading(false);
    }
  };

  const analyzeImage = async (imageFile) => {
    try {
      setLoading(true);
      setError(null);
      
      const formData = new FormData();
      formData.append('image', imageFile);

      // Perform direct multipart upload to backend orchestrator
      const response = await fetch(`${API_URL}/api/reports/analyze`, {
        method: 'POST',
        body: formData,
        credentials: 'include' // Send session cookies
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Image analysis failed');
      }

      return await response.json();
    } catch (err) {
      setError(err.message || 'Image analysis service error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const createReport = async (reportData) => {
    try {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append('category', reportData.category);
      formData.append('severity', reportData.severity);
      formData.append('latitude', reportData.latitude);
      formData.append('longitude', reportData.longitude);
      formData.append('image', reportData.image);

      if (reportData.description) {
        formData.append('description', reportData.description);
      }
      if (reportData.address) {
        formData.append('address', reportData.address);
      }
      if (reportData.analysis_id) {
        formData.append('analysis_id', reportData.analysis_id);
      }

      const response = await fetch(`${API_URL}/api/reports/create`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to submit report');
      }

      const newReport = await response.json();
      setReports((prev) => [newReport, ...prev]);
      return newReport;
    } catch (err) {
      setError(err.message || 'Failed to submit report');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    reports,
    loading,
    error,
    fetchMyReports,
    analyzeImage,
    createReport
  };
}
