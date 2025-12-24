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

const minutesToHours = (minutes = 0) => `${(minutes / 60).toFixed(2)} h`;
const minutesToCommonHours = (minutes = 0) => {
  const safeMinutes = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (mins === 0) return `${hours} hs`;
  return `${hours} hs ${mins} min`;
};
const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
];

const getQuincenaRange = (year, monthIndex, half) => {
  const monthEnd = new Date(year, monthIndex + 1, 0).getDate();
  const startDay = half === "2" ? 16 : 1;
  const endDay = half === "1" ? 15 : monthEnd;
  const from = toDateInputValue(new Date(year, monthIndex, startDay));
  const to = toDateInputValue(new Date(year, monthIndex, endDay));
  return { from, to };
};

const createDefaultFilters = () => {
  const now = new Date();
  const half = "all";
  const { from, to } = getQuincenaRange(now.getFullYear(), now.getMonth(), half);
  return {
    from,
    to,
    monthIndex: now.getMonth(),
    year: now.getFullYear(),
    half,
    user: "",
    client: "",
    task: "",
    workOrder: "",
    q: "",
    isHoliday: "",
  };
};

const buildQuery = (filters) => {
  const params = new URLSearchParams();
  if (filters.from) params.append("from", filters.from);
  if (filters.to) params.append("to", filters.to);
  if (filters.user) params.append("user", filters.user);
  if (filters.client) params.append("client", filters.client);
  if (filters.task) params.append("task", filters.task);
  if (filters.workOrder) params.append("workOrder", filters.workOrder);
  if (filters.q) params.append("q", filters.q);
  if (filters.isHoliday === "true") params.append("isHoliday", "true");
  if (filters.isHoliday === "false") params.append("isHoliday", "false");
  if (filters.isHoliday === "night") params.append("nightOnly", "true");
  return params.toString();
};

export default function HoursSummary(){
  const user = getUserFromToken();
  const canRead = Boolean(user?.permissions?.timesheets?.read);
  const initialFilters = useMemo(() => createDefaultFilters(), []);
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientOptions, setClientOptions] = useState([]);
  const [clientOptionsError, setClientOptionsError] = useState("");
  const [workOrderMap, setWorkOrderMap] = useState({});
  const [workOrdersLoading, setWorkOrdersLoading] = useState(false);
  const [workOrdersError, setWorkOrdersError] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const selectedClientKey = useMemo(() => normalizeClientKey(filters.client), [filters.client]);
  const clientOrders = workOrderMap[selectedClientKey]?.orders || [];
  const selectedOrder = clientOrders.find((order) => order.id === selectedWorkOrderId);
  const taskOptions = selectedOrder?.tasks || [];

  useEffect(() => {
    if (!canRead) return;
    generateReport(initialFilters);
  }, [canRead, initialFilters]);

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

  const updateQuincena = (updates = {}) => {
    setFilters((prev) => {
      const next = { ...prev, ...updates };
      const rawYear = Number(next.year);
      const baseYear = Number.isNaN(rawYear) ? prev.year : rawYear;
      const safeYear = Math.min(2100, Math.max(2000, baseYear || new Date().getFullYear()));
      const candidateMonth = Number(next.monthIndex);
      const normalizedMonth = Number.isNaN(candidateMonth) ? prev.monthIndex : candidateMonth;
      const safeMonth = Math.min(11, Math.max(0, normalizedMonth ?? 0));
      const allowed = ["1", "2", "all"];
      const nextHalf = allowed.includes(next.half) ? next.half : "all";
      const { from, to } = getQuincenaRange(safeYear, safeMonth, nextHalf);
      return { ...next, year: safeYear, monthIndex: safeMonth, half: nextHalf, from, to };
    });
  };

  const generateReport = async (criteria = filters) => {
    setLoading(true);
    setError("");
    try {
      const qs = buildQuery(criteria);
      const response = await request(`/timesheets/summary${qs ? `?${qs}` : ""}`);
      setData(Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (event) => {
    event.preventDefault();
    generateReport(filters);
  };

  const onReset = () => {
    const defaults = createDefaultFilters();
    setFilters(defaults);
    setSelectedWorkOrderId("");
    setSelectedTaskId("");
    generateReport(defaults);
  };

  const totals = useMemo(() => {
    return data.reduce(
      (acc, item) => ({
        normalMinutes: acc.normalMinutes + (item.normalMinutes || 0),
        holidayMinutes: acc.holidayMinutes + (item.holidayMinutes || 0),
        nightMinutes: acc.nightMinutes + (item.nightMinutes || 0)
      }),
      { normalMinutes: 0, holidayMinutes: 0, nightMinutes: 0 }
    );
  }, [data]);
  const nightOnlyMode = filters.isHoliday === "night";

  if (!canRead) return <Navigate to="/" replace />;

  return (
    <>
      <h2 style={{ margin: "0 0 12px" }}>Horas Trabajadas</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        <form className="grid g-3" onSubmit={onSubmit}>
          <div>
            <label>Mes</label>
            <select
              className="input"
              value={filters.monthIndex}
              onChange={(e) => updateQuincena({ monthIndex: Number(e.target.value) })}
            >
              {MONTHS.map((month, idx) => (
                <option key={month} value={idx}>{month}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Quincena</label>
            <select
              className="input"
              value={filters.half}
              onChange={(e) => updateQuincena({ half: e.target.value })}
            >
              <option value="all">Mes completo</option>
              <option value="1">Primera (1 al 15)</option>
              <option value="2">Segunda (16 al fin)</option>
            </select>
          </div>
          <div>
            <label>Año</label>
            <input
              type="number"
              className="input"
              min="2000"
              max="2100"
              value={filters.year}
              onChange={(e) => updateQuincena({ year: Number(e.target.value) })}
            />
          </div>
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
              Generar
            </button>
            <button type="button" className="btn btn-ghost" onClick={onReset}>
              Limpiar
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Horas acumuladas</h3>
          {loading && <span style={{ fontSize: 13, color: "#6b7280" }}>Calculando...</span>}
        </div>
        {error && <div style={{ color: "#b91c1c", marginBottom: 12 }}>{error}</div>}
        {data.length === 0 ? (
          <div style={{ padding: "16px 0", color: "#6b7280" }}>Sin resultados para los filtros seleccionados.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Horas normales</th>
                <th>Horas feriado</th>
                <th>Horas nocturnas</th>
                <th>Horas total</th>
                <th>Horas totales decimal</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const normal = minutesToHours(row.normalMinutes || 0);
                const holiday = minutesToHours(row.holidayMinutes || 0);
                const night = minutesToHours(row.nightMinutes || 0);
                const totalMinutes = nightOnlyMode
                  ? (row.nightMinutes || 0)
                  : (row.normalMinutes || 0) + (row.holidayMinutes || 0) + (row.nightMinutes || 0);
                const totalCommon = minutesToCommonHours(totalMinutes);
                return (
                  <tr key={row.userId}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.displayName || row.username}</div>
                      <small style={{ color: "#6b7280" }}>{row.username}</small>
                    </td>
                    <td>{normal}</td>
                    <td>{holiday}</td>
                    <td>{night}</td>
                    <td>{totalCommon}</td>
                    <td>{minutesToHours(totalMinutes)}</td>
                  </tr>
                );
              })}
              {(() => {
                const aggregateTotalMinutes = nightOnlyMode
                  ? totals.nightMinutes
                  : totals.normalMinutes + totals.holidayMinutes + totals.nightMinutes;
                return (
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total</td>
                    <td>{minutesToHours(nightOnlyMode ? 0 : totals.normalMinutes)}</td>
                    <td>{minutesToHours(nightOnlyMode ? 0 : totals.holidayMinutes)}</td>
                    <td>{minutesToHours(totals.nightMinutes)}</td>
                    <td>{minutesToCommonHours(aggregateTotalMinutes)}</td>
                    <td>{minutesToHours(aggregateTotalMinutes)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
