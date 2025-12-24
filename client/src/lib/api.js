// client/src/lib/api.js
const API = import.meta.env.VITE_API_URL?.replace(/\/+$/,'') || 'http://localhost:8080';

let token = localStorage.getItem('token') || '';

export function setToken(t){
  token = t || '';
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
}

export async function request(path, { method='GET', body, headers } = {}){
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok){
    const err = await res.json().catch(()=>({error:'Error'}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
