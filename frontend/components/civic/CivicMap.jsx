'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export default function CivicMap({
  issues = [],
  center = [72.5714, 23.0225], // Default to Ahmedabad coordinates
  zoom = 12,
  onMarkerClick = () => {},
  filters = {},
  showClustering = true,
  interactive = true
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [error, setError] = useState(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!token) {
      setError('Mapbox Access Token is missing. Please configure NEXT_PUBLIC_MAPBOX_TOKEN in your environment variables.');
      return;
    }
    setError(null);
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11', // Neutral, low-contrast base map
      center: center,
      zoom: zoom,
      interactive: interactive
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      // Map loaded successfully. Ready to bind sources, markers, clustering, and filters.
      updateMarkers();
    });

    return () => {
      map.remove();
    };
  }, [token]);

  // Keep marker rendering up-to-date with incoming issues list
  const updateMarkers = () => {
    if (!mapRef.current) return;

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    issues.forEach(issue => {
      if (!issue.latitude || !issue.longitude) return;

      // Color coding markers based on severity
      let color = '#3b82f6'; // Low (Blue)
      if (issue.severity === 'CRITICAL') color = '#ef4444'; // Red
      else if (issue.severity === 'HIGH') color = '#f97316'; // Orange
      else if (issue.severity === 'MEDIUM') color = '#eab308'; // Amber

      const marker = new mapboxgl.Marker({ color })
        .setLngLat([issue.longitude, issue.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(
            `<strong>${issue.category}</strong><br/>Severity: ${issue.severity}<br/>Status: ${issue.status}`
          )
        )
        .addTo(mapRef.current);

      marker.getElement().addEventListener('click', () => {
        onMarkerClick(issue);
      });

      markersRef.current.push(marker);
    });
  };

  useEffect(() => {
    updateMarkers();
  }, [issues]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[350px] bg-neutral-50 border border-dashed border-red-200 rounded-xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 flex items-center justify-center bg-red-50 text-red-500 rounded-full mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-neutral-800 mb-2">Mapbox Configuration Missing</h3>
        <p className="text-sm text-neutral-500 max-w-sm mb-4">
          Please add <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to your local environment file to activate the map.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[350px] rounded-xl overflow-hidden border border-neutral-200 shadow-sm">
      <div ref={mapContainerRef} className="w-full h-full absolute inset-0" />
    </div>
  );
}
