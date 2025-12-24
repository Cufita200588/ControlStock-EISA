const STORAGE_KEY = 'userAvatars';

const readStore = () => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeStore = (data) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
};

const notify = (userId) => {
  if (typeof window === 'undefined') return;
  const event = new CustomEvent('avatars-updated', { detail: { userId } });
  window.dispatchEvent(event);
};

export const getAvatarStore = () => readStore();

export const getAvatarForUser = (userId) => {
  if (!userId) return "";
  const store = readStore();
  return store[userId] || "";
};

export const saveAvatarForUser = (userId, dataUrl) => {
  if (!userId) return;
  const store = readStore();
  if (dataUrl) {
    store[userId] = dataUrl;
  } else {
    delete store[userId];
  }
  writeStore(store);
  notify(userId);
  return store;
};

export const removeAvatarForUser = (userId) => saveAvatarForUser(userId, "");

export const mergeUsersWithAvatars = (users = []) => {
  const store = readStore();
  return users.map((user) => ({
    ...user,
    avatarUrl: user.avatarUrl || store[user.id] || ""
  }));
};
