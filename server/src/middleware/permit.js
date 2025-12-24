import { collectPermissions, hasPermission } from '../utils/permissions.js';

// permissionPath ejemplos: "users.manage", "roles.manage", "materials.create", "materials.read", "tools.update", etc.
export const permit = (...permissionPaths) => {
  const required = permissionPaths.flat().filter(Boolean);
  return async (req, res, next) => {
    const roles = req.user?.roles || [];
    if (!roles.length) return res.status(403).json({ error: 'Sin rol' });
    if (!required.length) return next();

    if (!req.user.permissions) {
      req.user.permissions = await collectPermissions(roles);
    }

    const allowed = required.some((path) => hasPermission(req.user.permissions, path));
    if (!allowed) return res.status(403).json({ error: 'Permiso denegado' });
    next();
  };
};
