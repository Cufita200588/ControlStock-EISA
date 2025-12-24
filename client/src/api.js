const normalizeBaseUrl = (value = "") => value.toString().trim().replace(/\/+$/, "");
const DEFAULT_API_BASE = normalizeBaseUrl(import.meta.env.VITE_API_URL || "http://localhost:8081");
const API_STORAGE_KEY = "api:url";

const readStoredApiBase = () => {
  try {
    const persisted = localStorage.getItem(API_STORAGE_KEY);
    return normalizeBaseUrl(persisted || "");
  } catch {
    return "";
  }
};

let apiBase = normalizeBaseUrl(readStoredApiBase() || DEFAULT_API_BASE);

const STORAGE_KEYS = ["token", "eisa_token"];

const readStoredToken = () => {
  try {
    for (const key of STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return value;
    }
  } catch {
    return "";
  }
  return "";
};

let token = readStoredToken();
let handlingUnauthorized = false;

const rememberAuthError = (message) => {
  try {
    sessionStorage.setItem("auth:error", message || "Sesion expirada. Volve a ingresar.");
  } catch {
    // ignored on environments without sessionStorage
  }
};

const redirectToLogin = () => {
  if (typeof window !== "undefined") {
    window.location.replace("/");
  }
};

const handleUnauthorized = (message) => {
  if (handlingUnauthorized) return;
  handlingUnauthorized = true;
  setToken("");
  rememberAuthError(message);
  setTimeout(redirectToLogin, 50);
};

export function setToken(t) {
  token = t || "";
  STORAGE_KEYS.forEach((key) => {
    try {
      if (token) localStorage.setItem(key, token);
      else localStorage.removeItem(key);
    } catch {
      // ignore storage errors (private mode, etc)
    }
  });
}

export const getApiBase = () => apiBase || DEFAULT_API_BASE;

export function setApiBase(url) {
  apiBase = normalizeBaseUrl(url);
  try {
    if (apiBase) localStorage.setItem(API_STORAGE_KEY, apiBase);
    else localStorage.removeItem(API_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
  return getApiBase();
}

export function resetApiBase() {
  apiBase = DEFAULT_API_BASE;
  try {
    localStorage.removeItem(API_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
  return apiBase;
}

export async function request(path, { method = "GET", body, headers } = {}) {
  const base = getApiBase();
  if (!base) throw new Error("No hay URL de servidor configurada");

  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (networkError) {
    throw new Error(networkError?.message || "No se pudo conectar con el servidor");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error" }));
    if (res.status === 401) handleUnauthorized(err.error);
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json().catch(() => ({}));
}
