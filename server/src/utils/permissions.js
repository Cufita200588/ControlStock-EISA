import { db } from '../config/firebase.js';

const mergeObjects = (target = {}, source = {}) => {
  Object.entries(source).forEach(([group, perms]) => {
    if (!group) return;
    if (!target[group]) target[group] = {};
    Object.entries(perms || {}).forEach(([key, value]) => {
      if (value) target[group][key] = true;
    });
  });
  return target;
};

export const mergePermissions = (...permissionGroups) => {
  return permissionGroups.reduce((acc, group) => mergeObjects(acc, group), {});
};

export const hasPermission = (permissions = {}, path = '') => {
  if (!path) return false;
  return path.split('.').reduce((acc, segment) => acc?.[segment], permissions) === true;
};

export const collectPermissions = async (roleNames = []) => {
  if (!Array.isArray(roleNames) || !roleNames.length) return {};
  const docs = await Promise.all(
    roleNames.map((role) => db.collection('roles').doc(role).get())
  );
  const permissionSets = docs
    .filter((snap) => snap.exists)
    .map((snap) => snap.data()?.permissions || {});
  return mergePermissions(...permissionSets);
};
