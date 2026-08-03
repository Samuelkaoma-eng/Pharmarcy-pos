// Relative by default so requests go through the Vite dev proxy (and, in a
// deployment, through whatever serves the client). That keeps the browser on
// one origin and avoids CORS entirely. Override with VITE_API_URL when the API
// genuinely lives elsewhere.
export const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const getHeaders = () => {
  const token = localStorage.getItem('pos_auth_token');
  // Tenant is carried inside the signed token, so no tenant header is sent.
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

const formatUrl = (endpoint) => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${BASE_URL}${cleanEndpoint}`;
};

export const get = async (endpoint) => {
  try {
    const res = await fetch(formatUrl(endpoint), { headers: getHeaders() });
    if (res.status === 401) { 
      localStorage.removeItem('pos_auth_token'); 
    }
    return await res.json();
  } catch (err) {
    console.warn(`API GET error for ${endpoint}:`, err);
    return null;
  }
};

export const post = async (endpoint, data) => {
  try {
    const res = await fetch(formatUrl(endpoint), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data || {})
    });
    if (res.status === 401) { 
      localStorage.removeItem('pos_auth_token'); 
    }
    return await res.json();
  } catch (err) {
    console.warn(`API POST error for ${endpoint}:`, err);
    return null;
  }
};

export const put = async (endpoint, data) => {
  try {
    const res = await fetch(formatUrl(endpoint), {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data || {})
    });
    if (res.status === 401) { 
      localStorage.removeItem('pos_auth_token'); 
    }
    return await res.json();
  } catch (err) {
    console.warn(`API PUT error for ${endpoint}:`, err);
    return null;
  }
};

export const patch = async (endpoint, data) => {
  try {
    const res = await fetch(formatUrl(endpoint), {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data || {})
    });
    if (res.status === 401) { 
      localStorage.removeItem('pos_auth_token'); 
    }
    return await res.json();
  } catch (err) {
    console.warn(`API PATCH error for ${endpoint}:`, err);
    return null;
  }
};

export const api = { get, post, put, patch };
