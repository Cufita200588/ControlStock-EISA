import { sanitizeText } from "../../lib/text";

export const RUBROS = [
  "Albanileria",
  "Instalacion sanitaria",
  "Instalacion electrica",
  "Instalacion de gas",
  "Fijaciones",
  "Pinturas",
  "Herrajes",
  "Impermeabilizacion",
  "Aislaciones",
  "Placas y paneles",
  "Revestimientos",
  "Perfiles metalicos",
  "Consumibles",
  "Otros"
];

export const CONDICION = ["Nuevo", "Usado", "Danado", "En reparacion", "Saldo"];

export const normalizeRubro = (value) => {
  const clean = sanitizeText(value);
  if (!clean) return RUBROS[0];
  return RUBROS.includes(clean) ? clean : clean;
};

export const normalizeCondicion = (value) => {
  const clean = sanitizeText(value);
  if (!clean) return CONDICION[0];
  return CONDICION.includes(clean) ? clean : clean;
};
