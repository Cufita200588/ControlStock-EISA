const normalizeRoleName = (value = "") => value.toString().trim().toLowerCase();

export const HOURS_MANAGER_ROLES = [
  "gestor de horas",
  "gestor-horas",
  "gestor_de_horas",
  "gestor horas",
  "gestorhoras"
];

export const hasHoursManagerRole = (roles = []) => {
  if (!Array.isArray(roles)) return false;
  return roles.some((role) => HOURS_MANAGER_ROLES.includes(normalizeRoleName(role)));
};

export default hasHoursManagerRole;
