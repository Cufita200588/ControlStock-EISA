import { request } from "../api";
import DEFAULT_CLIENTS from "./hourClients";

const normalizeText = (value = "") => value.toString().trim();

export const formatWorkOrderLabel = (item = {}) => {
  const name = normalizeText(item.name);
  const code = normalizeText(item.code);
  if (name && code) return `${code} - ${name}`;
  return name || code;
};

export async function fetchClientList() {
  try {
    const response = await request("/hours/clients");
    const list = Array.isArray(response) ? response.filter(Boolean) : [];
    if (list.length) return list.slice().sort((a, b) => a.localeCompare(b));
  } catch {
    // ignore and fallback
  }
  return DEFAULT_CLIENTS.slice().sort((a, b) => a.localeCompare(b));
}

export async function fetchWorkOrdersByClient(clientName) {
  const client = normalizeText(clientName);
  if (!client) return [];
  try {
    const response = await request(`/work-orders?client=${encodeURIComponent(client)}`);
    const list = Array.isArray(response) ? response : [];
    return list
      .map((item) => {
        const name = normalizeText(item?.name);
        const code = normalizeText(item?.code);
        const label = formatWorkOrderLabel({ name, code });
        if (!label) return null;
        return {
          id: item.id || `${client}-${code || name}`,
          client,
          name,
          code,
          label
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    return [];
  }
}
