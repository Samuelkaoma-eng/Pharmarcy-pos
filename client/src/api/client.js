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

// Called when the session cannot be recovered, so the app can clear itself and
// send the user back to sign-in. Registered by AuthContext.
let onSessionLost = () => {};
export const setSessionLostHandler = (fn) => {
  onSessionLost = typeof fn === 'function' ? fn : () => {};
};

// One refresh in flight at a time. Without this, a screen that fires five
// requests on mount would attempt five rotations, and rotation is single-use —
// four of them would present an already-spent token and look like a replay,
// killing the whole family and signing the user out.
let refreshInFlight = null;

const refreshSession = async () => {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        // The refresh token is an HttpOnly cookie; `credentials` is what sends
        // it, and it is never readable from here.
        const res = await fetch(formatUrl('/auth/refresh'), {
          method: 'POST',
          credentials: 'same-origin'
        });

        if (res.status === 409) {
          // Another tab rotated a moment ago. This caller now holds the newer
          // cookie, so a single retry is right — the session is not lost.
          const retry = await fetch(formatUrl('/auth/refresh'), {
            method: 'POST',
            credentials: 'same-origin'
          });
          if (!retry.ok) return null;
          const body = await retry.json();
          return body?.data?.token || null;
        }

        if (!res.ok) return null;
        const body = await res.json();
        return body?.data?.token || null;
      } catch {
        return null;
      } finally {
        // Cleared on the next tick so concurrent callers all observe the same
        // in-flight promise rather than starting their own.
        setTimeout(() => { refreshInFlight = null; }, 0);
      }
    })();
  }
  return refreshInFlight;
};

// Every call goes through here. A 401 is taken as "this access token has
// expired", so one rotation is attempted and the request replayed. If the
// rotation fails the session is genuinely over and the app is told, rather than
// leaving the user on a screen whose every action fails.
const request = async (endpoint, init = {}, { retried = false } = {}) => {
  const res = await fetch(formatUrl(endpoint), {
    ...init,
    headers: init.isUpload ? init.headers : { ...getHeaders(), ...(init.headers || {}) },
    credentials: 'same-origin'
  });

  if (res.status !== 401) return res;
  if (retried || endpoint.startsWith('/auth/') || endpoint.startsWith('auth/')) {
    localStorage.removeItem('pos_auth_token');
    onSessionLost();
    return res;
  }

  const token = await refreshSession();
  if (!token) {
    localStorage.removeItem('pos_auth_token');
    onSessionLost();
    return res;
  }

  localStorage.setItem('pos_auth_token', token);
  return request(endpoint, init, { retried: true });
};

const withBody = (method) => async (endpoint, data) => {
  try {
    const res = await request(endpoint, { method, body: JSON.stringify(data || {}) });
    return await res.json();
  } catch (err) {
    console.warn(`API ${method} error for ${endpoint}:`, err);
    return null;
  }
};

export const get = async (endpoint) => {
  try {
    const res = await request(endpoint, { method: 'GET' });
    return await res.json();
  } catch (err) {
    console.warn(`API GET error for ${endpoint}:`, err);
    return null;
  }
};

export const post = withBody('POST');
export const put = withBody('PUT');
export const patch = withBody('PATCH');

// Ends the session on the server as well as here, so a copied access token
// stops working at its next refresh instead of lasting its full hour.
export const logout = async () => {
  try {
    await fetch(formatUrl('/auth/logout'), { method: 'POST', credentials: 'same-origin' });
  } catch {
    // The chain is revoked on the next refresh attempt anyway.
  }
  localStorage.removeItem('pos_auth_token');
};

// Multipart upload. The Content-Type header is deliberately omitted: the
// browser has to set it itself so it can include the multipart boundary, and
// forcing application/json here produces a body the server cannot parse.
export const upload = async (endpoint, formData) => {
  try {
    const token = localStorage.getItem('pos_auth_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // isUpload keeps `request` from adding Content-Type: the browser has to set
    // it itself so it can include the multipart boundary.
    const res = await request(endpoint, { method: 'POST', headers, body: formData, isUpload: true });
    return await res.json();
  } catch (err) {
    console.warn(`API UPLOAD error for ${endpoint}:`, err);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Link-token requests
// ---------------------------------------------------------------------------
// A pharmacy applying to join has no account yet, so the two calls it makes —
// reading its own application and filing paperwork against it — carry the token
// from the link it was sent rather than a stored session. These deliberately
// bypass `request`: there is no session to refresh and nothing to sign out of,
// so a 401 here means the link has expired and must be reported as such, not
// treated as a lost session.
export const getWithToken = async (endpoint, token) => {
  try {
    const res = await fetch(formatUrl(endpoint), {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return await res.json();
  } catch (err) {
    console.warn(`API GET error for ${endpoint}:`, err);
    return null;
  }
};

// The Content-Type header is omitted on purpose, as in `upload` above.
export const uploadWithToken = async (endpoint, formData, token) => {
  try {
    const res = await fetch(formatUrl(endpoint), {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    });
    return await res.json();
  } catch (err) {
    console.warn(`API UPLOAD error for ${endpoint}:`, err);
    return null;
  }
};

// Opens an authenticated file in a new tab. A plain link cannot carry the
// bearer token, so the bytes are fetched and handed to the browser as a blob.
export const openAuthedFile = async (endpoint) => {
  const res = await request(endpoint, { method: 'GET' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.error || `Could not open the file (${res.status})` };
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // Released once the new tab has taken its own reference.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { ok: true };
};

export const api = { get, post, put, patch, upload, getWithToken, uploadWithToken, openAuthedFile, logout };
