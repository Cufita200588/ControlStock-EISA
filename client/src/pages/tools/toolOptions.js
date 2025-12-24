import { sanitizeText } from "../../lib/text";

export const ESTADOS = ["Operativo","En reparacion","Danado","Baja"];

export const normalizeEstado = (value) => {
  const clean = sanitizeText(value);
  if (!clean) return ESTADOS[0];
  return ESTADOS.includes(clean) ? clean : clean;
};
