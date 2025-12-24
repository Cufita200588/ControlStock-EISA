import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { request } from "../../api";
import { getUserFromToken } from "../../auth";
import { hasHoursManagerRole } from "../../lib/roles";
import DEFAULT_CLIENTS from "../../lib/hourClients";

const normalizeText = (value = "") => value.toString().trim();
const normalizeTaskLabel = (value = "") => value.toString().trim();
const generateTempId = () => `task-${Math.random().toString(36).slice(2)}${Date.now()}`;

const sanitizeTasks = (tasks = []) =>
  (Array.isArray(tasks) ? tasks : [])
    .map((task) => {
      if (!task) return null;
      const label = normalizeTaskLabel(task.label || task.name || task.task);
      if (!label) return null;
      return {
        id: task.id || generateTempId(),
        label
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));

const sanitizeWorkOrders = (items = [], client) =>
  (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!item) return null;
      const name = normalizeText(item.name);
      if (!name) return null;
      const code = normalizeText(item.code);
      const clientName = item.client || client;
      const tasks =
        item.tasks && item.tasks.length
          ? sanitizeTasks(item.tasks)
          : item.task
            ? sanitizeTasks([{ label: item.task }])
            : [];
      return {
        id: item.id || `${normalizeText(clientName)}-${name}`,
        name,
        code,
        client: clientName,
        tasks
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

export default function ManageWorkOrders() {
  const user = getUserFromToken();
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const canManageTimesheets = Boolean(user?.permissions?.timesheets?.manage);
  const canManageHourWorkOrders = Boolean(user?.permissions?.hours?.workorders);
  const isAdmin = roles.includes("admin");
  const canManageWorkOrders =
    isAdmin || canManageTimesheets || canManageHourWorkOrders || hasHoursManagerRole(roles);

  const [clients, setClients] = useState(DEFAULT_CLIENTS);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientError, setClientError] = useState("");
  const [selectedClient, setSelectedClient] = useState("");

  const [workOrders, setWorkOrders] = useState([]);
  const [workOrdersLoading, setWorkOrdersLoading] = useState(false);
  const [workOrdersError, setWorkOrdersError] = useState("");

  const [selectedOtId, setSelectedOtId] = useState("");
  const [otName, setOtName] = useState("");
  const [otCode, setOtCode] = useState("");
  const [otSearch, setOtSearch] = useState("");

  const [taskList, setTaskList] = useState([]);
  const [taskDraft, setTaskDraft] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);

  const [savingOt, setSavingOt] = useState(false);
  const [removingOt, setRemovingOt] = useState(false);

  const clientList = useMemo(() => clients.slice().sort((a, b) => a.localeCompare(b)), [clients]);
  const filteredWorkOrders = useMemo(() => {
    const term = normalizeText(otSearch).toLowerCase();
    if (!term) return workOrders;
    return workOrders.filter((ot) => {
      const name = (ot.name || "").toLowerCase();
      const code = (ot.code || "").toLowerCase();
      return name.includes(term) || code.includes(term);
    });
  }, [otSearch, workOrders]);
  const sortedTasks = useMemo(
    () => taskList.slice().sort((a, b) => a.label.localeCompare(b.label)),
    [taskList]
  );

  const refreshClients = useCallback(async () => {
    setLoadingClients(true);
    setClientError("");
    try {
      const response = await request("/hours/clients");
      if (Array.isArray(response) && response.length) {
        setClients(response);
      } else {
        setClients(DEFAULT_CLIENTS);
      }
    } catch (err) {
      setClientError(err.message);
      setClients(DEFAULT_CLIENTS);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  const refreshWorkOrders = useCallback(
    async (clientName) => {
      const targetClient = normalizeText(clientName);
      if (!targetClient) {
        setWorkOrders([]);
        return;
      }
      setWorkOrdersLoading(true);
      setWorkOrdersError("");
      try {
        const response = await request(`/work-orders?client=${encodeURIComponent(targetClient)}`);
        setWorkOrders(sanitizeWorkOrders(response, targetClient));
      } catch (err) {
        setWorkOrdersError(err.message);
        setWorkOrders([]);
      } finally {
        setWorkOrdersLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    refreshClients();
  }, [refreshClients]);

  useEffect(() => {
    refreshWorkOrders(selectedClient);
    setSelectedOtId("");
    setOtName("");
    setOtCode("");
    setTaskList([]);
    setTaskDraft("");
    setEditingTaskId(null);
    setOtSearch("");
  }, [selectedClient, refreshWorkOrders]);

  const handleSelectOt = (ot) => {
    if (!ot) return;
    setSelectedOtId(ot.id);
    setOtName(ot.name || "");
    setOtCode(ot.code || "");
    setTaskList(ot.tasks || []);
    setTaskDraft("");
    setEditingTaskId(null);
  };

  const handleNewOt = () => {
    setSelectedOtId("");
    setOtName("");
    setOtCode("");
    setTaskList([]);
    setTaskDraft("");
    setEditingTaskId(null);
  };

  const handleAddTask = () => {
    const label = normalizeTaskLabel(taskDraft);
    if (!label) return;
    setTaskList((prev) => {
      if (editingTaskId) {
        return prev.map((task) => (task.id === editingTaskId ? { ...task, label } : task));
      }
      return prev.concat({ id: generateTempId(), label });
    });
    setTaskDraft("");
    setEditingTaskId(null);
  };

  const handleEditTask = (task) => {
    if (!task) return;
    setTaskDraft(task.label || "");
    setEditingTaskId(task.id);
  };

  const handleCancelTaskEdit = () => {
    setTaskDraft("");
    setEditingTaskId(null);
  };

  const handleDeleteTask = (taskId) => {
    setTaskList((prev) => prev.filter((task) => task.id !== taskId));
    if (editingTaskId === taskId) {
      setEditingTaskId(null);
      setTaskDraft("");
    }
  };

  const handleSaveOt = async (event) => {
    event.preventDefault();
    const clientName = normalizeText(selectedClient);
    const name = normalizeText(otName);
    const code = normalizeText(otCode);
    const tasks = sortedTasks.filter((task) => task && task.label);
    if (!clientName || !name || !code) return;
    setSavingOt(true);
    setWorkOrdersError("");
    try {
      const payload = {
        client: clientName,
        name,
        code,
        tasks: tasks.map((task) => ({ id: task.id, label: task.label }))
      };
      if (selectedOtId) {
        await request(`/work-orders/${selectedOtId}`, { method: "PATCH", body: payload });
      } else {
        await request("/work-orders", { method: "POST", body: payload });
      }
      await refreshWorkOrders(clientName);
      handleNewOt();
    } catch (err) {
      setWorkOrdersError(err.message);
    } finally {
      setSavingOt(false);
    }
  };

  const handleDeleteOt = async () => {
    if (!selectedOtId) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm("Eliminar esta OT y todas sus tareas?")) return;
    setRemovingOt(true);
    setWorkOrdersError("");
    try {
      await request(`/work-orders/${selectedOtId}`, { method: "DELETE" });
      await refreshWorkOrders(selectedClient);
      handleNewOt();
    } catch (err) {
      setWorkOrdersError(err.message);
    } finally {
      setRemovingOt(false);
    }
  };

  if (!canManageWorkOrders) return <Navigate to="/" replace />;

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 12px" }}>Gestionar OT y tareas</h2>
      <p style={{ margin: "0 0 16px", color: "#4b5563" }}>
        Selecciona un cliente para administrar sus ordenes de trabajo (OT), codigos internos y el listado de
        tareas que veran los usuarios al cargar horas.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Cliente
          <select
            className="input"
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
          >
            <option value="">Seleccionar cliente</option>
            {clientList.map((client) => (
              <option key={client} value={client}>{client}</option>
            ))}
          </select>
        </label>
        {loadingClients && <small style={{ color: "#6b7280" }}>Cargando clientes...</small>}
        {clientError && <small style={{ color: "#b91c1c" }}>{clientError}</small>}
      </div>

      {!selectedClient ? (
        <p style={{ marginTop: 20, color: "#6b7280" }}>Selecciona un cliente para comenzar.</p>
      ) : (
        <div style={{ marginTop: 24, borderTop: "1px solid #e5e7eb", paddingTop: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          <form onSubmit={handleSaveOt} className="grid" style={{ gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Crear / editar OT</h3>
              <button type="button" className="btn btn-ghost" onClick={handleNewOt}>
                Limpiar
              </button>
            </div>
            <div>
              <label>Nombre de OT</label>
              <input
                className="input"
                value={otName}
                onChange={(e) => setOtName(e.target.value)}
                placeholder="Ej. Mantenimiento planta norte"
              />
            </div>
            <div>
              <label>Codigo interno</label>
              <input
                className="input"
                value={otCode}
                onChange={(e) => setOtCode(e.target.value)}
                placeholder="Ej. OT-001"
              />
            </div>

            <div>
              <label>Tareas asociadas</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <input
                  className="input"
                  style={{ flex: "1 1 240px" }}
                  value={taskDraft}
                  onChange={(e) => setTaskDraft(e.target.value)}
                  placeholder="Descripcion de la tarea"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTask();
                    }
                  }}
                />
                <button type="button" className="btn btn-secondary" onClick={handleAddTask} disabled={!taskDraft.trim()}>
                  {editingTaskId ? "Actualizar tarea" : "Agregar tarea"}
                </button>
                {editingTaskId && (
                  <button type="button" className="btn btn-ghost" onClick={handleCancelTaskEdit}>
                    Cancelar
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sortedTasks.map((task) => (
                  <div
                    key={task.id}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px" }}
                  >
                    <span>{task.label}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="btn btn-xs" onClick={() => handleEditTask(task)}>
                        Editar
                      </button>
                      <button type="button" className="btn btn-xs btn-danger" onClick={() => handleDeleteTask(task.id)}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
                {!sortedTasks.length && (
                  <small style={{ color: "#6b7280" }}>Agrega las tareas que veran los usuarios al cargar horas.</small>
                )}
              </div>
            </div>

            {workOrdersError && <div style={{ color: "#b91c1c" }}>{workOrdersError}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" disabled={savingOt || !selectedClient}>
                {savingOt ? "Guardando..." : selectedOtId ? "Actualizar OT" : "Crear OT"}
              </button>
              {selectedOtId && (
                <button type="button" className="btn btn-danger" onClick={handleDeleteOt} disabled={removingOt}>
                  {removingOt ? "Eliminando..." : "Eliminar OT"}
                </button>
              )}
            </div>
          </form>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Ordenes de trabajo</h3>
            </div>
            <input
              className="input"
              style={{ marginTop: 12 }}
              placeholder="Buscar por nombre o codigo"
              value={otSearch}
              onChange={(e) => setOtSearch(e.target.value)}
            />
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
              {workOrdersLoading && <small style={{ color: "#6b7280" }}>Cargando OT...</small>}
              {!workOrdersLoading && !filteredWorkOrders.length && (
                <small style={{ color: "#6b7280" }}>No hay OT para este cliente.</small>
              )}
              {filteredWorkOrders.map((ot) => (
                <button
                  key={ot.id}
                  type="button"
                  className="btn btn-ghost"
                  style={{
                    justifyContent: "space-between",
                    border: ot.id === selectedOtId ? "1px solid #2563eb" : "1px solid #e5e7eb"
                  }}
                  onClick={() => handleSelectOt(ot)}
                >
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600 }}>{ot.name}</div>
                    <small style={{ color: "#4b5563" }}>{ot.code || "Sin codigo"}</small>
                  </div>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{ot.tasks.length} tareas</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
