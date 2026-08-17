const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/api/ws';

export async function fetchAPI(endpoint, { method = 'GET', body, headers = {}, isFormData = false } = {}) {
  const options = {
    method,
    headers: {
      ...headers
    },
    credentials: 'include' // Instruct browser to include HttpOnly session cookies
  };
  
  if (body) {
    if (isFormData) {
      options.body = body;
      // Do not set Content-Type header; browser will auto-fill boundary
    } else {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, options);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'API request failed');
  }
  
  // Return JSON or resolve as empty/null if no content returned
  if (response.status === 204) return null;
  return response.json();
}

export function getWebSocketURL(token) {
  const url = new URL(WS_URL);
  if (token) {
    url.searchParams.append('token', token);
  }
  return url.toString();
}
