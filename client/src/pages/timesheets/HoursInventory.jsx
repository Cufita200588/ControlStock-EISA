import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { request } from "../../api";
import { getUserFromToken } from "../../auth";
import { toDateInputValue } from "../../lib/dates";

const normalizeClientKey = (value = "") => value.toString().trim().toLowerCase();
const normalizeTaskLabel = (value = "") => value.toString().trim();
const buildWorkOrderLookup = (items = []) => {
  const lookup = (Array.isArray(items) ? items : []).reduce((acc, entry) => {
    if (!entry) return acc;
    const client = (entry.client || "").trim();
    const name = (entry.name || "").trim();
    if (!client || !name) return acc;
    const key = normalizeClientKey(client);
    if (!acc[key]) acc[key] = { client, orders: [] };
    const tasks = Array.isArray(entry.tasks) ? entry.tasks : [];
    const normalizedTasks = tasks
      .map((task) => {
        if (!task) return null;
        const label = normalizeTaskLabel(task.label || task.name || task.task);
        if (!label) return null;
        const id = task.id || `${entry.id || `${key}-${name}`}-${label}`;
        return { id, label };
      })
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));
    acc[key].orders.push({
      id: entry.id || `${key}-${name}`,
      name,
      code: entry.code || "",
      tasks: normalizedTasks
    });
    return acc;
  }, {});
  Object.values(lookup).forEach((group) => {
    group.orders.sort((a, b) => a.name.localeCompare(b.name));
  });
  return lookup;
};

const minutesToHours = (minutes) => `${((minutes || 0) / 60).toFixed(2)} h`;

const createDefaultFilters = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: toDateInputValue(start),
    to: toDateInputValue(endOfMonth),
    client: "",
    task: "",
    workOrder: "",
    user: "",
    q: "",
    isHoliday: ""
  };
};

const buildQueryString = (filters) => {
  const params = new URLSearchParams();
  if (filters.from) params.append("from", filters.from);
  if (filters.to) params.append("to", filters.to);
  if (filters.client) params.append("client", filters.client);
  if (filters.task) params.append("task", filters.task);
  if (filters.workOrder) params.append("workOrder", filters.workOrder);
  if (filters.user) params.append("user", filters.user);
  if (filters.q) params.append("q", filters.q);
  if (filters.isHoliday === "true") params.append("isHoliday", "true");
  if (filters.isHoliday === "false") params.append("isHoliday", "false");
  if (filters.isHoliday === "night") params.append("nightOnly", "true");
  return params.toString();
};

export default function HoursInventory(){
  const user = getUserFromToken();
  const canRead = Boolean(user?.permissions?.timesheets?.read);
  const canManage = Boolean(user?.permissions?.timesheets?.manage);
  const [filters, setFilters] = useState(() => createDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => createDefaultFilters());
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editError, setEditError] = useState("");
  const [clientOptions, setClientOptions] = useState([]);
  const [clientOptionsError, setClientOptionsError] = useState("");
  const [workOrderMap, setWorkOrderMap] = useState({});
  const [workOrdersLoading, setWorkOrdersLoading] = useState(false);
  const [workOrdersError, setWorkOrdersError] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [editWorkOrderId, setEditWorkOrderId] = useState("");
  const [editTaskId, setEditTaskId] = useState("");
  const selectedClientKey = useMemo(() => normalizeClientKey(filters.client), [filters.client]);
  const clientOrders = workOrderMap[selectedClientKey]?.orders || [];
  const selectedOrder = clientOrders.find((order) => order.id === selectedWorkOrderId);
  const taskOptions = selectedOrder?.tasks || [];
  const editClientKey = useMemo(
    () => normalizeClientKey(editForm?.client || ""),
    [editForm?.client]
  );
  const editClientOrders = workOrderMap[editClientKey]?.orders || [];
  const editSelectedOrder = editClientOrders.find((order) => order.id === editWorkOrderId);
  const editTaskOptions = editSelectedOrder?.tasks || [];

  useEffect(() => {
    if (!canRead) return;
    const fetchEntries = async () => {
      setLoading(true);
      setError("");
      try {
        const qs = buildQueryString(appliedFilters);
        const data = await request(`/timesheets${qs ? `?${qs}` : ""}`);
        setEntries(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchEntries();
    setEditForm(null);
  }, [appliedFilters, canRead]);

  useEffect(() => {
    let active = true;
    const loadClients = async () => {
      setClientOptionsError("");
      try {
        const list = await request("/hours/clients");
        if (!active) return;
        setClientOptions(Array.isArray(list) ? list : []);
      } catch (err) {
        if (!active) return;
        setClientOptionsError(err.message);
      }
    };
    loadClients();
    return () => {
      active = false;
    };
  }, []);

  const refreshWorkOrders = useCallback(async () => {
    setWorkOrdersLoading(true);
    setWorkOrdersError("");
    try {
      const response = await request("/work-orders");
      setWorkOrderMap(buildWorkOrderLookup(response));
    } catch (err) {
      setWorkOrderMap({});
      setWorkOrdersError(err.message);
    } finally {
      setWorkOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWorkOrders();
  }, [refreshWorkOrders]);

  useEffect(() => {
    if (!selectedWorkOrderId) return;
    if (!clientOrders.some((order) => order.id === selectedWorkOrderId)) {
      setSelectedWorkOrderId("");
      setSelectedTaskId("");
      setFilters((prev) => ({ ...prev, workOrder: "", task: "" }));
    }
  }, [clientOrders, selectedWorkOrderId]);

  useEffect(() => {
    if (!selectedTaskId) return;
    if (!taskOptions.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId("");
      setFilters((prev) => ({ ...prev, task: "" }));
    }
  }, [taskOptions, selectedTaskId]);

  useEffect(() => {
    if (!editForm?.client) {
      if (editWorkOrderId || editTaskId) {
        setEditWorkOrderId("");
        setEditTaskId("");
      }
      return;
    }
    const key = normalizeClientKey(editForm.client);
    const orders = workOrderMap[key]?.orders || [];
    if (editForm.workOrder) {
      const matchOrder = orders.find((order) => order.name === editForm.workOrder);
      if (matchOrder) {
        if (editWorkOrderId !== matchOrder.id) setEditWorkOrderId(matchOrder.id);
        if (editForm.task) {
          const matchTask = matchOrder.tasks.find((task) => task.label === editForm.task);
          if (matchTask) {
            if (editTaskId !== matchTask.id) setEditTaskId(matchTask.id);
          } else if (editTaskId) {
            setEditTaskId("");
          }
        } else if (editTaskId) {
          setEditTaskId("");
        }
      } else if (editWorkOrderId) {
        setEditWorkOrderId("");
        setEditTaskId("");
      }
    } else if (editWorkOrderId || editTaskId) {
      setEditWorkOrderId("");
      setEditTaskId("");
    }
  }, [editForm?.client, editForm?.workOrder, editForm?.task, workOrderMap, editWorkOrderId, editTaskId]);

  useEffect(() => {
    if (!filters.client) {
      if (selectedWorkOrderId || selectedTaskId) {
        setSelectedWorkOrderId("");
        setSelectedTaskId("");
      }
      return;
    }
    if (filters.workOrder) {
      const matchOrder = clientOrders.find((order) => order.name === filters.workOrder);
      if (matchOrder) {
        if (selectedWorkOrderId !== matchOrder.id) setSelectedWorkOrderId(matchOrder.id);
        if (filters.task) {
          const matchTask = matchOrder.tasks.find((task) => task.label === filters.task);
          if (matchTask) {
            if (selectedTaskId !== matchTask.id) setSelectedTaskId(matchTask.id);
          } else if (selectedTaskId) {
            setSelectedTaskId("");
          }
        } else if (selectedTaskId) {
          setSelectedTaskId("");
        }
      } else if (selectedWorkOrderId) {
        setSelectedWorkOrderId("");
        setSelectedTaskId("");
      }
    } else if (selectedWorkOrderId || selectedTaskId) {
      setSelectedWorkOrderId("");
      setSelectedTaskId("");
    }
  }, [filters.client, filters.workOrder, filters.task, clientOrders, selectedWorkOrderId, selectedTaskId]);

  const onSearch = (event) => {
    event.preventDefault();
    setAppliedFilters({ ...filters });
  };

  const onReset = () => {
    const defaults = createDefaultFilters();
    setFilters(defaults);
    setAppliedFilters(defaults);
    setSelectedWorkOrderId("");
    setSelectedTaskId("");
  };

  const onSelectEntry = (entry) => {
    if (!canManage) return;
    setEditForm({
      id: entry.id,
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      client: entry.client || "",
      task: entry.task || "",
      workOrder: entry.workOrder || "",
      isHoliday: Boolean(entry.isHoliday),
      userDisplayName: entry.userDisplayName || entry.username,
      username: entry.username
    });
    setEditError("");
    setMessage("");
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!canManage || !editForm) return;
    setSaving(true);
    setEditError("");
    setMessage("");
    try {
      await request(`/timesheets/${editForm.id}`, {
        method: "PATCH",
        body: {
          date: editForm.date,
          startTime: editForm.startTime,
          endTime: editForm.endTime,
          client: editForm.client,
          task: editForm.task,
          workOrder: editForm.workOrder,
          isHoliday: editForm.isHoliday
        }
      });
      setMessage("Registro actualizado");
      setAppliedFilters({ ...appliedFilters });
      setEditForm(null);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editForm) return;
    if (!window.confirm(`Eliminar registro de ${editForm.userDisplayName || editForm.username} del ${editForm.date}?`)) {
      return;
    }
    setDeleting(true);
    setEditError("");
    setMessage("");
    try {
      await request(`/timesheets/${editForm.id}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((entry) => entry.id !== editForm.id));
      setMessage("Registro eliminado");
      setEditForm(null);
      setAppliedFilters({ ...appliedFilters });
    } catch (err) {
      setEditError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (!canRead) return <Navigate to="/" replace />;

  return (
    <>
      <h2 style={{ margin: "0 0 12px" }}>Inventario General horas</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        <form className="grid g-3" onSubmit={onSearch}>
          <div>
            <label>Desde</label>
            <input
              type="date"
              className="input"
              value={filters.from}
              onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
            />
          </div>
          <div>
            <label>Hasta</label>
            <input
              type="date"
              className="input"
              value={filters.to}
              onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
            />
          </div>
          <div>
            <label>Usuario</label>
            <input
              className="input"
              value={filters.user}
              onChange={(e) => setFilters((prev) => ({ ...prev, user: e.target.value }))}
              placeholder="Nombre o usuario"
            />
          </div>
          <div>
            <label>Cliente</label>
            <select
              className="input"
              value={filters.client}
              onChange={(e) => {
                const value = e.target.value;
                setFilters((prev) => ({ ...prev, client: value, workOrder: "", task: "" }));
                setSelectedWorkOrderId("");
                setSelectedTaskId("");
              }}
            >
              <option value="">Todos</option>
              {clientOptions.map((client) => (
                <option key={client} value={client}>{client}</option>
              ))}
            </select>
            {clientOptionsError && <small style={{ color: "#b91c1c" }}>{clientOptionsError}</small>}
          </div>
          <div>
            <label>Orden de trabajo</label>
            <select
              className="input"
              value={selectedWorkOrderId}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedWorkOrderId(value);
                const target = clientOrders.find((order) => order.id === value);
                setFilters((prev) => ({ ...prev, workOrder: target?.name || "", task: "" }));
                setSelectedTaskId("");
              }}
              disabled={!filters.client || workOrdersLoading}
            >
              <option value="">Todas</option>
              {clientOrders.map((order) => (
                <option key={order.id} value={order.id}>{order.name}</option>
              ))}
            </select>
            {workOrdersLoading && <small style={{ color: "#6b7280" }}>Actualizando ordenes...</small>}
            {workOrdersError && <small style={{ color: "#b91c1c" }}>{workOrdersError}</small>}
          </div>
          <div>
            <label>Tarea asociada</label>
            <select
              className="input"
              value={selectedTaskId}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedTaskId(value);
                if (!value) {
                  setFilters((prev) => ({ ...prev, task: "" }));
                  return;
                }
                const task = taskOptions.find((item) => item.id === value);
                setFilters((prev) => ({ ...prev, task: task?.label || "" }));
              }}
              disabled={!selectedWorkOrderId || !taskOptions.length}
            >
              <option value="">Todas</option>
              {taskOptions.map((task) => (
                <option key={task.id} value={task.id}>{task.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Buscar en todo</label>
            <input
              className="input"
              value={filters.q}
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
              placeholder="Ej. obra, cliente, observacion"
            />
          </div>
          <div>
            <label>Tipo de dia</label>
            <select
              className="input"
              value={filters.isHoliday}
              onChange={(e) => setFilters((prev) => ({ ...prev, isHoliday: e.target.value }))}
            >
              <option value="">Todos</option>
              <option value="false">Solo normales</option>
              <option value="true">Solo feriados</option>
              <option value="night">Solo nocturnas</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" disabled={loading}>
              Buscar
            </button>
            <button type="button" className="btn btn-ghost" onClick={onReset}>
              Limpiar
            </button>
          </div>
        </form>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <div className="card" style={{ flex: "3 1 720px", minWidth: 360 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: "0 0 4px" }}>Resultados</h3>
              <small style={{ color: "#6b7280" }}>
                {entries.length} registros
              </small>
            </div>
            {loading && <span style={{ fontSize: 13, color: "#6b7280" }}>Cargando...</span>}
          </div>
          {error && <div style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</div>}
          {message && <div style={{ color: "#059669", marginBottom: 12 }}>{message}</div>}
          {entries.length === 0 ? (
            <div style={{ padding: "16px 0", color: "#6b7280" }}>No hay registros para este filtro.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Usuario</th>
                    <th>Cliente</th>
                    <th>Tarea</th>
                    <th>OT</th>
                    <th>Horario</th>
                    <th>Horas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.date}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{entry.userDisplayName}</div>
                        <small style={{ color: "#6b7280" }}>{entry.username}</small>
                      </td>
                      <td>{entry.client || "-"}</td>
                      <td>{entry.task || "-"}</td>
                      <td>{entry.workOrder || "-"}</td>
                      <td>
                        {entry.startTime} - {entry.endTime}
                        <div style={{ display: "flex", gap: 6, marginTop: 4, fontSize: 12 }}>
                          {entry.isHoliday && (
                            <span style={{ padding: "2px 6px", borderRadius: 4, background: "#fee2e2", color: "#b91c1c" }}>
                              Feriado
                            </span>
                          )}
                          {(entry.nightMinutes || 0) > 0 && (
                            <span style={{ padding: "2px 6px", borderRadius: 4, background: "#e0f2fe", color: "#0369a1" }}>
                              Nocturna
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{minutesToHours(entry.durationMinutes)}</td>
                      <td style={{ textAlign: "right", minWidth: 90, paddingRight: 8 }}>
                        {canManage && (
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() => onSelectEntry(entry)}
                            style={{ whiteSpace: "nowrap", width: "100%" }}
                          >
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {canManage && (
          <div className="card" style={{ flex: "1 1 420px", minWidth: 360 }}>
            <h3 style={{ margin: "0 0 12px" }}>Editar registro</h3>
            {!editForm ? (
              <div style={{ color: "#6b7280" }}>Selecciona una fila para editar.</div>
            ) : (
              <form
                onSubmit={handleUpdate}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14
                }}
              >
                <div style={{ gridColumn: "1 / -1" }}>
                  <label>Usuario</label>
                  <div style={{ fontWeight: 600 }}>{editForm.userDisplayName}</div>
                  <small style={{ color: "#6b7280" }}>{editForm.username}</small>
                </div>
                <div>
                  <label>Fecha</label>
                  <input
                    type="date"
                    className="input"
                    value={editForm.date}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label>Hora de ingreso</label>
                  <input
                    type="time"
                    className="input"
                    value={editForm.startTime}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, startTime: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label>Hora de egreso</label>
                  <input
                    type="time"
                    className="input"
                    value={editForm.endTime}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, endTime: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label>Cliente</label>
                  <select
                    className="input"
                    value={editForm.client}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditForm((prev) => ({ ...prev, client: value, workOrder: "", task: "" }));
                      setEditWorkOrderId("");
                      setEditTaskId("");
                    }}
                  >
                    <option value="">Seleccionar cliente</option>
                    {clientOptions.map((client) => (
                      <option key={client} value={client}>{client}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Orden de trabajo</label>
                  <select
                    className="input"
                    value={editWorkOrderId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditWorkOrderId(value);
                      const target = editClientOrders.find((order) => order.id === value);
                      setEditForm((prev) => ({ ...prev, workOrder: target?.name || "", task: "" }));
                      setEditTaskId("");
                    }}
                    disabled={!editForm.client || editClientOrders.length === 0}
                  >
                    <option value="">Seleccionar OT</option>
                    {editClientOrders.map((order) => (
                      <option key={order.id} value={order.id}>{order.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Tarea asociada</label>
                  <select
                    className="input"
                    value={editTaskId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditTaskId(value);
                      if (!value) {
                        setEditForm((prev) => ({ ...prev, task: "" }));
                        return;
                      }
                      const task = editTaskOptions.find((item) => item.id === value);
                      setEditForm((prev) => ({ ...prev, task: task?.label || "" }));
                    }}
                    disabled={!editWorkOrderId || !editTaskOptions.length}
                  >
                    <option value="">Seleccionar tarea</option>
                    {editTaskOptions.map((task) => (
                      <option key={task.id} value={task.id}>{task.label}</option>
                    ))}
                  </select>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, gridColumn: "1 / -1" }}>
                  <input
                    type="checkbox"
                    checked={editForm.isHoliday}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, isHoliday: e.target.checked }))}
                  />
                  Feriado
                </label>
                {editError && <div style={{ color: "#b91c1c", gridColumn: "1 / -1" }}>{editError}</div>}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", gridColumn: "1 / -1" }}>
                  <button className="btn btn-primary" disabled={saving}>
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditForm(null)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </>
  );
}
