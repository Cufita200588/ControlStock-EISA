import { request } from "../api";
import { getUserFromToken } from "../auth";

const MOVEMENT_ENTITY_GROUPS = [
  { value: "materials", label: "Materiales", aliases: ["material"] },
  { value: "tools", label: "Herramientas", aliases: ["tool"] },
  { value: "timesheets", label: "Horas", aliases: ["hours", "timesheet", "horas"] },
  { value: "workorders", label: "Gestion OT", aliases: ["workorder", "work-orders", "ot"] }
];

export const MOVEMENT_FILTERS = MOVEMENT_ENTITY_GROUPS.map(({ value, label }) => ({
  value,
  label
}));

export const MOVEMENT_FILTER_ALIASES = MOVEMENT_ENTITY_GROUPS.reduce((acc, { value, aliases = [] }) => {
  acc[value] = [value, ...aliases];
  return acc;
}, {});

export const MOVEMENT_ENTITY_LABELS = MOVEMENT_ENTITY_GROUPS.reduce((acc, { value, label, aliases = [] }) => {
  acc[value] = label;
  aliases.forEach((alias) => {
    acc[alias] = label;
  });
  return acc;
}, {});

const noop = () => {};

export const logMovement = async ({
  entity,
  action,
  summary,
  payload,
  metadata
}) => {
  const user = getUserFromToken();
  const body = {
    entity,
    type: action,
    summary: summary || "",
    payload: payload || {},
    metadata: metadata || {},
    by: user?.displayName || user?.username || "Usuario",
    userId: user?.uid || null
  };

  try {
    await request("/movements", { method: "POST", body });
  } catch (err) {
    if (import.meta.env?.MODE === "development") {
      console.warn("No se pudo registrar el movimiento", err);
    }
  }
};

export const withMovementLog = (fn, movement) => async (...args) => {
  const result = await fn(...args);
  if (movement) {
    logMovement(movement).catch(noop);
  }
  return result;
};
