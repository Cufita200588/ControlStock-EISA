import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { request } from "../../api";
import { getUserFromToken } from "../../auth";
import { toDateInputValue } from "../../lib/dates";
import { hasHoursManagerRole } from "../../lib/roles";
import DEFAULT_CLIENTS from "../../lib/hourClients";

const normalizeClientKey = (value = "") => value.toString().trim().toLowerCase();

const buildWorkOrderMap = (items = []) => {
  return (Array.isArray(items) ? items : []).reduce((acc, item) => {
    if (!item) return acc;
    const name = (item.name || "").trim();
    const client = (item.client || "").trim();
    const key = normalizeClientKey(client);
    if (!name || !client || !key) return acc;
    if (!acc[key]) acc[key] = { client, items: [] };
    acc[key].items.push({
      id: item.id || `${key}-${name}`,
      name,
      client,
      code: item.code || "",
      task: (item.task || name).trim()
    });
    return acc;
  }, {});
};

const flattenTaskEntries = (items = [], fallbackClient = "") => {
  return (Array.isArray(items) ? items : []).flatMap((entry) => {
    if (!entry) return [];
    const client = (entry.client || fallbackClient || "").trim();
    if (!client) return [];
    const name = (entry.name || "").trim();
    const code = (entry.code || "").trim();
    const baseId = entry.id || `${normalizeClientKey(client)}-${name || Date.now()}`;
    const tasks = Array.isArray(entry.tasks) ? entry.tasks : [];
    if (!tasks.length) {
      const fallbackTask = (entry.task || "").trim();
      if (!fallbackTask) return [];
      return [
        {
          id: baseId,
          name,
          client,
          code,
          task: fallbackTask
        }
      ];
    }
    return tasks
      .map((task) => {
        if (!task) return null;
        const label = (task.label || task.name || task.task || "").trim();
        if (!label) return null;
        const taskId = task.id || `${baseId}-${label}`;
        return {
          id: taskId,
          name,
          client,
          code,
          task: label
        };
      })
      .filter(Boolean);
  });
};

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const timestampToDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") {
    try {
      return value.toDate();
    } catch {
      // ignored
    }
  }
  if (typeof value === "object") {
    const seconds = value.seconds ?? value._seconds;
    const nanos = value.nanoseconds ?? value._nanoseconds ?? 0;
    if (typeof seconds === "number") {
      return new Date(seconds * 1000 + Math.round(nanos / 1e6));
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const todayValue = () => toDateInputValue(new Date());

const createEmptyForm = (date, overrides = {}) => ({
  id: null,
  date: date || todayValue(),
  startTime: "",
  endTime: "",
  client: "",
  task: "",
  workOrder: "",
  isHoliday: false,
  ...overrides
});

export default function HoursEntry(){
  const user = getUserFromToken();
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const canSubmit = Boolean(user?.permissions?.timesheets?.submit);
  const isAdmin = roles.includes("admin");
  const isHoursManager = hasHoursManagerRole(roles);
  const canManageHourClients = isAdmin || Boolean(user?.permissions?.hours?.clients);
  const initialDate = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("date") || todayValue();
    } catch {
      return todayValue();
    }
  }, []);

  const [date, setDate] = useState(initialDate);
  const [form, setForm] = useState(() => createEmptyForm(initialDate));
  const [clients, setClients] = useState(DEFAULT_CLIENTS);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientError, setClientError] = useState("");
  const [newClient, setNewClient] = useState("");
  const [addingClient, setAddingClient] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [clientToRemove, setClientToRemove] = useState("");
  const [removingClient, setRemovingClient] = useState(false);
  const [myEntries, setMyEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState("");
  const [dailyEntries, setDailyEntries] = useState([]);
  const [dailyError, setDailyError] = useState("");
  const [dailyLoading, setDailyLoading] = useState(false);
  const [workOrders, setWorkOrders] = useState([]);
  const [workOrdersLoading, setWorkOrdersLoading] = useState(false);
  const [workOrdersError, setWorkOrdersError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [workOrderMap, setWorkOrderMap] = useState({});

  const canManageTimesheets = Boolean(user?.permissions?.timesheets?.manage);
  const canOverrideEditLimit = isAdmin || canManageTimesheets;
  const canViewAllDailyEntries = Boolean(user?.permissions?.timesheets?.viewAll);
  const selectedClientKey = useMemo(() => normalizeClientKey(form.client), [form.client]);
  const selectedClientKeyRef = useRef(selectedClientKey);
  useEffect(() => {
    selectedClientKeyRef.current = selectedClientKey;
  }, [selectedClientKey]);

  const applyClientList = useCallback((list) => {
    const normalized = Array.isArray(list) ? list.filter(Boolean) : DEFAULT_CLIENTS;
    setClients(normalized);
    return normalized;
  }, []);

  const updateWorkOrdersForClient = useCallback((clientName, updater) => {
    const key = normalizeClientKey(clientName);
    if (!key) return;
    setWorkOrderMap((prev) => {
      const current = prev[key]?.items || [];
      const nextItems = (typeof updater === "function" ? updater(current) : current)
        .slice()
        .sort((a, b) => (a.task || a.name || "").localeCompare(b.task || b.name || ""));
      const nextMap = {
        ...prev,
        [key]: {
          client: clientName || prev[key]?.client || "",
          items: nextItems
        }
      };
      if (selectedClientKeyRef.current === key) {
        setWorkOrders(nextItems);
      }
      return nextMap;
    });
  }, []);

  const refreshWorkOrders = useCallback(async (clientName) => {
    const targetClient = (clientName || "").trim();
    const targetKey = normalizeClientKey(targetClient);
    setWorkOrdersLoading(true);
    setWorkOrdersError("");
    try {
      if (targetClient) {
        const response = await request(`/work-orders?client=${encodeURIComponent(targetClient)}`);
        const items = flattenTaskEntries(response, targetClient);
        updateWorkOrdersForClient(targetClient, () => items);
      } else {
        const response = await request("/work-orders");
        const flattened = flattenTaskEntries(response);
        const grouped = buildWorkOrderMap(flattened);
        Object.values(grouped).forEach((group) => {
          group.items.sort((a, b) => (a.task || a.name || "").localeCompare(b.task || b.name || ""));
        });
        setWorkOrderMap(grouped);
        const current = grouped[selectedClientKeyRef.current]?.items || [];
        setWorkOrders(current);
      }
    } catch (err) {
      setWorkOrdersError(err.message);
      if (!targetClient) {
        setWorkOrderMap({});
        setWorkOrders([]);
      }
    } finally {
      setWorkOrdersLoading(false);
    }
  }, [updateWorkOrdersForClient]);

  const refreshClientList = useCallback(async () => {
    try {
      const response = await request("/hours/clients");
      return applyClientList(response);
    } catch (err) {
      setClientError(err.message);
      return applyClientList(DEFAULT_CLIENTS);
    }
  }, [applyClientList]);

  const refreshMyEntries = useCallback(async (targetDate) => {
    if (!targetDate) return;
    setEntriesLoading(true);
    setEntriesError("");
    try {
      const response = await request(`/timesheets/mine?date=${targetDate}`);
      setMyEntries(Array.isArray(response) ? response : []);
    } catch (err) {
      setEntriesError(err.message);
      setMyEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  const refreshDailyEntries = useCallback(async (targetDate) => {
    if (!canViewAllDailyEntries || !targetDate) return;
    setDailyLoading(true);
    setDailyError("");
    try {
      const response = await request(`/timesheets?date=${targetDate}&limit=500`);
      setDailyEntries(Array.isArray(response) ? response : []);
    } catch (err) {
      setDailyError(err.message);
      setDailyEntries([]);
    } finally {
      setDailyLoading(false);
    }
  }, [canViewAllDailyEntries]);

  useEffect(() => {
    setForm((prev) => ({ ...prev, date }));
  }, [date]);

  useEffect(() => {
    let active = true;
    const loadClients = async () => {
      setClientError("");
      try {
        const response = await request("/hours/clients");
        if (!active) return;
        applyClientList(response);
      } catch (err) {
        if (!active) return;
        setClientError(err.message);
        applyClientList(DEFAULT_CLIENTS);
      } finally {
        if (active) setLoadingClients(false);
      }
    };
    loadClients();
    return () => { active = false; };
  }, [applyClientList]);

  useEffect(() => {
    if (!canSubmit) return;
    refreshMyEntries(date);
  }, [canSubmit, date, refreshMyEntries]);

  useEffect(() => {
    const key = selectedClientKey;
    if (!key) {
      setWorkOrders([]);
      return;
    }
    const list = workOrderMap[key]?.items || [];
    setWorkOrders(list);
  }, [selectedClientKey, workOrderMap]);

  useEffect(() => {
    if (!form.client) return;
    refreshWorkOrders(form.client);
  }, [form.client, refreshWorkOrders]);

  useEffect(() => {
    refreshWorkOrders();
  }, [refreshWorkOrders]);

  useEffect(() => {
    if (!form.workOrder && !form.task) {
      if (selectedTaskId) setSelectedTaskId("");
      return;
    }
    const match = workOrders.find(
      (item) => item.name === form.workOrder && item.task === form.task
    );
    if (match) {
      if (selectedTaskId !== match.id) setSelectedTaskId(match.id);
    } else if (selectedTaskId) {
      setSelectedTaskId("");
    }
  }, [form.workOrder, form.task, workOrders, selectedTaskId]);

  useEffect(() => {
    if (!canViewAllDailyEntries) return;
    refreshDailyEntries(date);
  }, [canViewAllDailyEntries, date, refreshDailyEntries]);

  useEffect(() => {
    if (canViewAllDailyEntries) return;
    setDailyEntries([]);
    setDailyError("");
    setDailyLoading(false);
  }, [canViewAllDailyEntries]);

  useEffect(() => {
    if (clientToRemove && !clients.includes(clientToRemove)) {
      setClientToRemove("");
    }
  }, [clientToRemove, clients]);

  const resetForm = (overrides = {}) => {
    setForm(createEmptyForm(date, overrides));
    setSelectedTaskId("");
  };

  const canEditEntry = (entry) => {
    if (!entry) return false;
    if (canOverrideEditLimit) return true;
    if (entry.date && entry.date === todayValue()) return true;
    const createdAt =
      timestampToDate(entry.createdAt) ||
      (entry.date ? new Date(`${entry.date}T00:00:00Z`) : null);
    if (!createdAt) return false;
    return Date.now() - createdAt.getTime() <= EDIT_WINDOW_MS;
  };

  const startEditingEntry = (entry) => {
    if (!entry) return;
    setDate(entry.date);
    setForm(createEmptyForm(entry.date, {
      id: entry.id,
      startTime: entry.startTime,
      endTime: entry.endTime,
      client: entry.client || "",
      task: entry.task || "",
      workOrder: entry.workOrder || "",
      isHoliday: Boolean(entry.isHoliday)
    }));
    setMessage("");
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const currentDate = form.date;
    try {
      const payload = {
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        client: form.client,
        task: form.task,
        workOrder: form.workOrder,
        isHoliday: form.isHoliday
      };
      if (form.id) {
        await request(`/timesheets/${form.id}`, { method: "PATCH", body: payload });
        setMessage("Registro actualizado");
      } else {
        await request("/timesheets", { method: "POST", body: payload });
        setMessage("Registro guardado");
      }
      await refreshMyEntries(currentDate);
      if (canViewAllDailyEntries) await refreshDailyEntries(currentDate);
      const nextStart = !form.id ? form.endTime : "";
      resetForm(nextStart ? { startTime: nextStart } : {});
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddClient = async () => {
    const value = newClient.trim();
    if (!value) return;
    setAddingClient(true);
    setClientError("");
    try {
      await request("/hours/clients", { method: "POST", body: { name: value } });
      setNewClient("");
      await refreshClientList();
      setForm((prev) => ({ ...prev, client: value }));
    } catch (err) {
      setClientError(err.message);
    } finally {
      setAddingClient(false);
    }
  };


  const handleRemoveClient = async () => {
    const value = clientToRemove.trim();
    if (!value) return;
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(`Eliminar "${value}" de la lista de clientes?`);
    if (!confirmed) return;
    setRemovingClient(true);
    setClientError("");
    try {
      await request(`/hours/clients/${encodeURIComponent(value)}`, { method: "DELETE" });
      const updatedList = await refreshClientList();
      if (!updatedList.includes(form.client)) {
        setForm((prev) => ({ ...prev, client: "" }));
      }
      setClientToRemove("");
    } catch (err) {
      setClientError(err.message);
    } finally {
      setRemovingClient(false);
    }
  };

  if (!canSubmit) return <Navigate to="/" replace />;


  const renderDailySection = () => {
    if (canViewAllDailyEntries) {
      const canManageDailyEntries = isAdmin || isHoursManager;
      const grouped = dailyEntries.reduce((acc, entry) => {
        const key = entry.username || entry.userId || "sin-usuario";
        if (!acc[key]) {
          acc[key] = {
            username: entry.username,
            displayName: entry.userDisplayName || entry.username || "Usuario",
            items: []
          };
        }
        acc[key].items.push(entry);
        return acc;
      }, {});
      const sections = Object.values(grouped).sort((a, b) => a.displayName.localeCompare(b.displayName));
      return (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Registros del dia</h3>
            <span style={{ fontSize: 13, color: "#6b7280" }}>{date}</span>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>
            Resumen rapido de cargas realizadas por cada usuario en la fecha seleccionada.
          </p>
          {dailyError && <div style={{ color: "#b91c1c", marginBottom: 12 }}>{dailyError}</div>}
          {dailyLoading && <div style={{ color: "#6b7280" }}>Consultando registros...</div>}
          {!dailyLoading && sections.length === 0 && (
            <div style={{ color: "#6b7280" }}>Sin registros para esta fecha.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sections.map((group) => (
              <div
                key={group.username}
                style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#f9fafb" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{group.displayName}</div>
                    <small style={{ color: "#6b7280" }}>{group.username}</small>
                  </div>
                  <span style={{ fontSize: 13, color: "#6b7280" }}>
                    {group.items.length} registro{group.items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {group.items.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        fontSize: 13,
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: 8
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{entry.startTime} - {entry.endTime}</div>
                        <div style={{ color: "#374151" }}>{entry.client || "Sin cliente"}</div>
                        {entry.task && <div style={{ color: "#6b7280" }}>{entry.task}</div>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        <div style={{ color: "#6b7280" }}>
                          {entry.durationMinutes ? `${(entry.durationMinutes / 60).toFixed(1)} h` : ""}
                          {entry.isHoliday && (
                            <div style={{ fontSize: 12, color: "#b91c1c" }}>Feriado</div>
                          )}
                        </div>
                        {canManageDailyEntries && (
                          canEditEntry(entry) ? (
                            <button type="button" className="btn btn-xs" onClick={() => startEditingEntry(entry)}>
                              Editar
                            </button>
                          ) : (
                            <small style={{ color: "#9ca3af" }}>24h vencidas</small>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Registro del dia</h3>
          <span style={{ fontSize: 13, color: "#6b7280" }}>{date}</span>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>
          Edita tus cargas tocando el boton dentro del mismo dia.
        </p>
        {entriesError && <div style={{ color: "#b91c1c", marginBottom: 8 }}>{entriesError}</div>}
        {entriesLoading && <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>Actualizando...</div>}
          {myEntries.length === 0 && !entriesLoading ? (
          <div style={{ color: "#6b7280" }}>No cargaste ninguna hora hoy.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {myEntries.map((entry) => {
              const editable = canEditEntry(entry);
              return (
                <div
                  key={entry.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{entry.startTime} - {entry.endTime}</div>
                    <div style={{ color: "#374151" }}>{entry.client || "Sin cliente"}</div>
                    {entry.task && (
                      <div style={{ color: "#6b7280", fontSize: 13 }}>{entry.task}</div>
                    )}
                  </div>
                  {editable ? (
                    <button type="button" className="btn btn-xs" onClick={() => startEditingEntry(entry)}>
                      Editar
                    </button>
                  ) : (
                    <small style={{ color: "#9ca3af" }}>24h vencidas</small>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <h2 style={{ margin: "0 0 12px" }}>Carga Horaria</h2>
      <div className="card" style={{ marginBottom: 24 }}>
        <form onSubmit={handleSubmit} className="grid g-3">
          <div>
            <label>Fecha</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="date"
                className="input"
                value={form.date}
                onChange={(e) => {
                  const value = e.target.value;
                  setDate(value);
                  setForm((prev) => ({ ...prev, date: value }));
                }}
                required
              />
              <button
                type="button"
                className="btn btn-xs"
                onClick={() => {
                  const today = todayValue();
                  setDate(today);
                  setForm((prev) => ({ ...prev, date: today }));
                }}
              >
                Hoy
              </button>
            </div>
          </div>
          <div>
            <label>Hora de ingreso</label>
            <input
              type="time"
              className="input"
              value={form.startTime}
              onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
              required
            />
          </div>
          <div>
            <label>Hora de egreso</label>
            <input
              type="time"
              className="input"
              value={form.endTime}
              onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
              required
            />
          </div>
          <div>
            <label>Cliente</label>
            <select
              className="input"
              value={form.client}
              onChange={(e) => {
                const value = e.target.value;
                setForm((prev) => ({ ...prev, client: value, workOrder: "", task: "" }));
                setSelectedTaskId("");
                if (!value) {
                  setWorkOrders([]);
                }
              }}
              required
            >
              <option value="">Seleccionar cliente</option>
              {clients.map((client) => (
                <option key={client} value={client}>{client}</option>
              ))}
            </select>
            {loadingClients && <small style={{ color: "#6b7280" }}>Cargando clientes...</small>}
            {clientError && <small style={{ color: "#b91c1c" }}>{clientError}</small>}
            {canManageHourClients && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    className="input"
                    style={{ flex: "1 1 160px" }}
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    placeholder="Nuevo cliente"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleAddClient}
                    disabled={!newClient.trim() || addingClient}
                  >
                    {addingClient ? "Agregando..." : "Agregar"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select
                    className="input"
                    style={{ flex: "1 1 160px" }}
                    value={clientToRemove}
                    onChange={(e) => setClientToRemove(e.target.value)}
                  >
                    <option value="">Seleccionar cliente a eliminar</option>
                    {clients.map((client) => (
                      <option key={client} value={client}>{client}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleRemoveClient}
                    disabled={!clientToRemove || removingClient}
                  >
                    {removingClient ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div>
            <label>Tarea</label>
            <select
              className="input"
              value={selectedTaskId}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) {
                  setSelectedTaskId("");
                  setForm((prev) => ({ ...prev, workOrder: "", task: "" }));
                  return;
                }
                setSelectedTaskId(value);
                const selected = workOrders.find((ot) => ot.id === value);
                setForm((prev) => ({
                  ...prev,
                  workOrder: selected?.name || "",
                  task: selected?.task || ""
                }));
              }}
              disabled={!form.client || workOrdersLoading}
            >
              <option value="">Seleccionar tarea</option>
              {workOrders.map((ot) => (
                <option key={ot.id} value={ot.id}>{ot.task}</option>
              ))}
            </select>
            {workOrdersLoading && <small style={{ color: "#6b7280" }}>Cargando tareas...</small>}
            {workOrdersError && <small style={{ color: "#b91c1c" }}>{workOrdersError}</small>}
            {!workOrdersLoading && form.client && !workOrders.length && (
              <small style={{ color: "#6b7280" }}>Sin tareas cargadas para este cliente.</small>
            )}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={form.isHoliday}
              onChange={(e) => setForm((prev) => ({ ...prev, isHoliday: e.target.checked }))}
            />
            Dia feriado
          </label>
          {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
          {message && <div style={{ color: "#059669" }}>{message}</div>}
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-primary" disabled={saving}>
              {saving ? "Guardando..." : form.id ? "Actualizar" : "Guardar"}
            </button>
            {form.id && (
              <button type="button" className="btn btn-ghost" onClick={() => resetForm()}>
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>
      {renderDailySection()}
    </>
  );
}
