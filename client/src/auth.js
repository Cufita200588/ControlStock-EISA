import { setToken as setStoredToken } from "./api";

const PRIMARY_KEY = 'token';
const LEGACY_KEY = 'eisa_token';

const getStoredToken = () => localStorage.getItem(PRIMARY_KEY) || localStorage.getItem(LEGACY_KEY);

export const saveToken = (t) => {
  if (!t) return;
  localStorage.setItem(PRIMARY_KEY, t);
  localStorage.setItem(LEGACY_KEY, t);
};

export const getToken = () => getStoredToken();

export const clearToken = () => {
  setStoredToken('');
};

export const getUserFromToken = () => {
  const t = getToken();
  if (!t) return null;
  try {
    const [, payload] = t.split('.');
    const decodedJson = (() => {
      try {
        // Decode UTF-8 safely (atob returns binary string)
        const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
      } catch {
        // Fallback for older browsers
        return decodeURIComponent(escape(atob(payload)));
      }
    })();
    const data = JSON.parse(decodedJson);
    return {
      uid: data.uid,
      username: data.username,
      displayName: data.displayName,
      roles: data.roles || [],
      permissions: data.permissions || {}
    };
  } catch {
    return null;
  }
};

const hasPermissionPath = (permissions = {}, path = '') => {
  if (!path) return false;
  return path.split('.').reduce((acc, segment) => acc?.[segment], permissions) === true;
};

export const userHasPermission = (permPath, userOverride) => {
  const user = userOverride || getUserFromToken();
  if (!user) return false;
  if ((user.roles || []).includes('admin')) return true;
  if (!permPath) return false;
  return hasPermissionPath(user.permissions || {}, permPath);
};

export const hasPerm = (permPath) => userHasPermission(permPath);

export const userIsAdmin = (userOverride) => {
  const user = userOverride || getUserFromToken();
  return Boolean(user && (user.roles || []).includes('admin'));
};
