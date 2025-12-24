import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../../api";
import { sanitizeText } from "../../lib/text";
import { toDateInputValue } from "../../lib/dates";
import { ESTADOS, normalizeEstado } from "./toolOptions";
import { logMovement } from "../../lib/movements";
import { fetchClientList, fetchWorkOrdersByClient } from "../../lib/workOrders";
import { userIsAdmin } from "../../auth";

const LOCAL_MOVEMENTS_KEY = "tools:movements:local";

const initialForm = {
  toolId: "",
  responsable: "",
  motivo: "",
  dias: "",
  cliente: "",
  workOrderId: ""
};

const formatDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return toDateInputValue(d);
};

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const normalizeMovementList = (list = []) => {
  return (Array.isArray(list) ? list : [])
    .map((item) => {
      if (!item) return null;
      const toolId = sanitizeText(item.toolId) || "";
      const toolName = sanitizeText(item.toolName) || "";
      const responsable = sanitizeText(item.responsable) || "";
      const motivo = sanitizeText(item.motivo) || "";
      const estado = normalizeEstado(item.estado);
      const fecha = formatDate(item.fecha) || formatDate(item.createdAt) || "";
      const devuelve = formatDate(item.devuelve) || "";
      const cliente = sanitizeText(item.cliente) || "";
      const workOrder = sanitizeText(item.workOrder) || "";
      const devuelto = Boolean(item.devuelto);
      const devueltoEstado = normalizeEstado(item.devueltoEstado);
      if (!toolId || !responsable) return null;
      const keyBase = `${toolId}-${responsable}-${fecha || "nf"}-${devuelve || "nf"}-${workOrder}`;
      const id = item.id || item.localId || keyBase;
      return {
        id,
        toolId,
        toolName: toolName || toolId,
        responsable,
        motivo,
        estado,
        fecha,
        devuelve,
        cliente,
        workOrder,
        devuelto,
        devueltoEstado
      };
    })
    .filter(Boolean);
};

const readLocalMovements = () => {
  try {
    const raw = localStorage.getItem(LOCAL_MOVEMENTS_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistLocalMovements = (items) => {
  try {
    localStorage.setItem(LOCAL_MOVEMENTS_KEY, JSON.stringify(items || []));
  } catch {
    // ignore persistence errors
  }
};

export default function ToolMovement() {
  const [tools, setTools] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState("");
  const [movements, setMovements] = useState([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsError, setMovementsError] = useState("");
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientError, setClientError] = useState("");
  const [workOrders, setWorkOrders] = useState([]);
  const [workOrdersLoading, setWorkOrdersLoading] = useState(false);
  const [workOrdersError, setWorkOrdersError] = useState("");
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showReturned, setShowReturned] = useState(false);
  const [borrowedSearch, setBorrowedSearch] = useState("");
  const [returnedSearch, setReturnedSearch] = useState("");
  const isAdmin = userIsAdmin();

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.id === form.toolId),
    [tools, form.toolId]
  );

  const visibleMovements = useMemo(() => movements.filter((mov) => !mov.devuelto), [movements]);
  const returnedMovements = useMemo(() => movements.filter((mov) => mov.devuelto), [movements]);

  const matchesSearch = (mov, term) => {
    if (!term) return true;
    const haystack = [
      mov.toolName,
      mov.toolId,
      mov.responsable,
      mov.motivo,
      mov.cliente,
      mov.workOrder,
      mov.devueltoEstado
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term.toLowerCase());
  };

  const filteredBorrowed = useMemo(
    () => visibleMovements.filter((mov) => matchesSearch(mov, borrowedSearch)),
    [visibleMovements, borrowedSearch]
  );
  const filteredReturned = useMemo(
    () => returnedMovements.filter((mov) => matchesSearch(mov, returnedSearch)),
    [returnedMovements, returnedSearch]
  );

  const expiredIds = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const set = new Set();
    filteredBorrowed.forEach((mov) => {
      const devDate = parseDate(mov.devuelve);
      if (!devDate) return;
      if (devDate < today) set.add(mov.id);
    });
    return set;
  }, [filteredBorrowed]);

  const filteredTools = useMemo(() => {
    const term = toolSearch.trim().toLowerCase();
    // calcular herramientas en uso según movimientos vigentes
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const available = tools.filter((tool) => normalizeEstado(tool.Estado) === "Operativo");
    const activeIds = new Set(
      visibleMovements
        .map((mov) => {
          const devDate = parseDate(mov.devuelve);
          if (devDate && devDate < today) return null;
          return mov.toolId;
        })
        .filter(Boolean)
    );
    const pool = available.filter((tool) => !activeIds.has(tool.id));
    if (!term) return pool;
    return pool.filter((tool) => {
      const name = (tool.Nombre || "").toLowerCase();
      const number = (tool["Numero Interno"] || "").toLowerCase();
      return name.includes(term) || number.includes(term);
    });
  }, [tools, toolSearch, movements]);

  const loadTools = async () => {
    setToolsLoading(true);
    setToolsError("");
    try {
      const data = await request("/tools");
      setTools(Array.isArray(data) ? data : []);
    } catch (err) {
      setToolsError(err.message);
      setTools([]);
    } finally {
      setToolsLoading(false);
    }
  };

  const loadMovements = async () => {
    setMovementsLoading(true);
    setMovementsError("");
    try {
      const data = await request("/tools/movements");
      const list = Array.isArray(data) ? data : [];
      const serverMovs = normalizeMovementList(list);
      const localMovs = normalizeMovementList(readLocalMovements());
      const seen = new Set();
      const combined = [];
      [...serverMovs, ...localMovs].forEach((item) => {
        const key = `${item.toolId}-${item.responsable}-${item.fecha}-${item.devuelve}-${item.workOrder}`;
        if (seen.has(key)) return;
        seen.add(key);
        combined.push(item);
      });
      combined.sort((a, b) => (a.devuelve || "").localeCompare(b.devuelve || ""));
      setMovements(combined);
      persistLocalMovements(combined);
    } catch (err) {
      const msg = err.message || "";
      const notFound = msg.toLowerCase().includes("no encontrada");
      const localMovs = normalizeMovementList(readLocalMovements());
      if (localMovs.length) {
        setMovements(localMovs);
      } else {
        setMovements([]);
      }
      setMovementsError(notFound ? "" : msg);
    } finally {
      setMovementsLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const data = await request("/users/minimal");
      if (Array.isArray(data)) {
        const mapped = data
          .map((u) => ({ id: u.id, label: u.displayName || u.username || u.id }))
          .filter((u) => u.label)
          .sort((a, b) => a.label.localeCompare(b.label));
        setUsers(mapped);
      } else {
        setUsers([]);
      }
    } catch (err) {
      setUsers([]);
      setUsersError(err.message);
    } finally {
      setUsersLoading(false);
    }
  };

  const refreshClients = async () => {
    setClientsLoading(true);
    setClientError("");
    try {
      const list = await fetchClientList();
      setClients(list);
    } catch (err) {
      setClientError(err.message || "No se pudieron cargar los clientes");
      setClients([]);
    } finally {
      setClientsLoading(false);
    }
  };

  const refreshWorkOrders = async (clientName) => {
    const target = (clientName || "").trim();
    setWorkOrders([]);
    setWorkOrdersError("");
    if (!target) return;
    setWorkOrdersLoading(true);
    try {
      const list = await fetchWorkOrdersByClient(target);
      setWorkOrders(list);
    } catch (err) {
      setWorkOrdersError(err.message || "No se pudieron cargar las OT");
      setWorkOrders([]);
    } finally {
      setWorkOrdersLoading(false);
    }
  };

  useEffect(() => {
    loadTools();
    loadMovements();
    loadUsers();
    refreshClients();
  }, []);

  const handleDeleteMovement = async (movementId) => {
    setMovementsError("");
    const target = movements.find((m) => m.id === movementId);
    if (!target) return;
    const options = ESTADOS.join(", ");
    const estadoDevuelto =
      window.prompt(`Estado al devolver la herramienta (${options}):`, target.estado || "Operativo") || "Operativo";
    const returnDate = toDateInputValue(new Date());
    const updated = {
      ...target,
      devuelto: true,
      devuelve: target.devuelve || returnDate,
      devueltoEstado: normalizeEstado(estadoDevuelto)
    };
    // intento de marcar devuelto en servidor; si falla, igual lo guardamos local
    try {
      await request(`/tools/movements/${movementId}`, { method: "PATCH", body: { devuelto: true, devuelve: updated.devuelve, returnDate, devueltoEstado: updated.devueltoEstado } });
      await request(`/tools/${target.toolId}`, { method: "PATCH", body: { Estado: updated.devueltoEstado } });
    } catch {
      // ignore server error to allow local removal
    }
    const next = movements.map((m) => (m.id === movementId ? updated : m));
    setMovements(next);
    persistLocalMovements(normalizeMovementList(next));
    setTools((prev) =>
      prev.map((tool) =>
        tool.id === target.toolId ? { ...tool, Estado: updated.devueltoEstado } : tool
      )
    );
    setMessage("Movimiento marcado como devuelto");
    setError("");
    logMovement({
      entity: "tools",
      action: "movement",
      summary: `Devolvieron la herramienta "${updated.toolName || updated.toolId}" de ${updated.responsable}`,
      payload: updated,
      metadata: { kind: "return" }
    });
  };

  const handleDeleteReturnRecord = async (movementId) => {
    if (!isAdmin) return;
    setMovementsError("");
    const target = movements.find((m) => m.id === movementId);
    if (!target) return;
    try {
      await request(`/tools/movements/${movementId}`, { method: "DELETE" });
    } catch {
      // ignore
    }
    const next = movements.filter((m) => m.id !== movementId);
    setMovements(next);
    persistLocalMovements(normalizeMovementList(next));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!form.toolId) {
      setError("Selecciona una herramienta");
      return;
    }
    const responsable = form.responsable.trim();
    const motivo = form.motivo.trim();
    const dias = Number(form.dias) || 0;
    const estado = "Operativo";
    if (!responsable) {
      setError("Responsable es obligatorio");
      return;
    }
    if (dias < 0) {
      setError("El tiempo acordado debe ser mayor o igual a 0");
      return;
    }
    const cliente = form.cliente.trim();
    const workOrderId = form.workOrderId;
    const workOrderLabel = workOrders.find((ot) => ot.id === workOrderId)?.label || "";
    const today = new Date();
    const devuelve = new Date(today);
    devuelve.setDate(today.getDate() + dias);
    const payload = {
      toolId: form.toolId,
      responsable,
      motivo,
      dias,
      estado,
      fecha: toDateInputValue(today),
      devuelve: toDateInputValue(devuelve),
      cliente,
      workOrderId,
      workOrder: workOrderLabel
    };

    setSaving(true);
    try {
      await request(`/tools/${form.toolId}/movements`, { method: "POST", body: payload });
      setMessage("Movimiento registrado");
      const localMovement = {
        id: `${payload.toolId}-${Date.now()}`,
        toolId: payload.toolId,
        toolName: sanitizeText(selectedTool?.Nombre) || payload.toolId,
        responsable: payload.responsable,
        motivo: payload.motivo,
        estado: payload.estado,
        fecha: payload.fecha,
        devuelve: payload.devuelve,
        cliente: payload.cliente,
        workOrder: payload.workOrder,
        devuelto: false,
        devueltoEstado: ""
      };
      setMovements((prev) => {
        const next = [localMovement, ...prev];
        return next.sort((a, b) => (a.devuelve || "").localeCompare(b.devuelve || ""));
      });
      persistLocalMovements(normalizeMovementList([localMovement, ...readLocalMovements()]));
      logMovement({
        entity: "tools",
        action: "movement",
        summary: `Prestaste la herramienta "${selectedTool?.Nombre || form.toolId}" a ${payload.responsable}`,
        payload,
        metadata: { kind: "loan" }
      });
      setForm(initialForm);
      await loadMovements();
    } catch (err) {
      const msg = err.message || "";
      const localMovement = {
        id: `${payload.toolId}-${Date.now()}`,
        toolId: payload.toolId,
        toolName: sanitizeText(selectedTool?.Nombre) || payload.toolId,
        responsable: payload.responsable,
        motivo: payload.motivo,
        estado: payload.estado,
        fecha: payload.fecha,
        devuelve: payload.devuelve,
        cliente: payload.cliente,
        workOrder: payload.workOrder,
        devuelto: false,
        devueltoEstado: ""
      };
      setMovements((prev) => [localMovement, ...prev]);
      setForm(initialForm);
      setMessage("Movimiento guardado localmente. El servidor no aceptó el registro.");
      setError(msg);
      persistLocalMovements(normalizeMovementList([localMovement, ...readLocalMovements()]));
      logMovement({
        entity: "tools",
        action: "movement",
        summary: `Prestaste la herramienta "${selectedTool?.Nombre || form.toolId}" (local) a ${payload.responsable}`,
        payload,
        metadata: { localOnly: true, error: msg, kind: "loan" }
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2 style={{ margin: "0 0 12px" }}>Movimiento de herramienta</h2>
      <div className="card" style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 440px) 1fr", gap: 20, alignItems: "start" }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, maxHeight: 420, overflowY: "auto", display: "grid", gap: 10, padding: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="input"
                style={{ flex: "1 1 260px" }}
                placeholder="Buscar herramienta por nombre o numero"
                value={toolSearch}
                onChange={(e) => setToolSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setToolSearch("");
                }}
                disabled={toolsLoading}
              >
                Limpiar
              </button>
            </div>
            {toolsLoading && <div style={{ padding: 8, color: "#6b7280" }}>Cargando herramientas...</div>}
            {!toolsLoading && filteredTools.length === 0 && (
              <div style={{ padding: 8, color: "#6b7280" }}>No hay herramientas para mostrar.</div>
            )}
            {filteredTools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className="btn btn-ghost"
                style={{
                  justifyContent: "flex-start",
                  width: "100%",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  background: tool.id === form.toolId ? "#f1f5f9" : "#fff",
                  textAlign: "left",
                  padding: "10px 12px"
                }}
                onClick={() => {
                  setForm((prev) => ({ ...prev, toolId: tool.id }));
                  setToolSearch("");
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, width: "100%", alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontWeight: 700 }}>{sanitizeText(tool.Nombre)}</div>
                    <small style={{ color: "#6b7280" }}>Ubicacion: {sanitizeText(tool["Ubicacion / Coordenada"]) || "-"}</small>
                  </div>
                  <div style={{ fontWeight: 700, color: "#0f172a", minWidth: 40, textAlign: "right" }}>
                    {sanitizeText(tool["Numero Interno"]) || "-"}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, width: "100%", alignItems: "center", marginTop: 4 }}>
                  <small style={{ color: "#6b7280" }}>Estado: {sanitizeText(tool.Estado)}</small>
                  <Link
                    className="btn btn-xs"
                    to={`/tools/${tool.id}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ background: "#e0f2fe", border: "1px solid #0ea5e9", color: "#0f172a", fontWeight: 600, whiteSpace: "nowrap" }}
                  >
                    Ver detalles →
                  </Link>
                </div>
              </button>
            ))}
            {toolsError && <small style={{ color: "#b91c1c" }}>{toolsError}</small>}
          </div>

          <form onSubmit={handleSubmit} className="grid" style={{ gap: 12 }}>
            <h3 style={{ margin: "0 0 4px" }}>Registrar movimiento</h3>
            {!selectedTool && <div style={{ color: "#6b7280" }}>Selecciona una herramienta para continuar.</div>}
            {selectedTool && (
              <>
                <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{sanitizeText(selectedTool.Nombre)}</div>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>N° interno: {sanitizeText(selectedTool["Numero Interno"]) || "-"}</div>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>Estado actual: {sanitizeText(selectedTool.Estado)}</div>
                </div>

                <div>
                  <label>Quien la lleva</label>
                  <input
                    className="input"
                    value={form.responsable}
                    list="tool-responsable-options"
                    onChange={(e) => setForm((prev) => ({ ...prev, responsable: e.target.value }))}
                    placeholder="Nombre y apellido"
                    required
                  />
                  <datalist id="tool-responsable-options">
                    {users.map((u) => (
                      <option key={u.id} value={u.label}>{u.label}</option>
                    ))}
                  </datalist>
                  {usersLoading && <small style={{ color: "#6b7280" }}>Cargando usuarios...</small>}
                  {usersError && <small style={{ color: "#b91c1c" }}>{usersError}</small>}
                </div>

                <div>
                  <label>Cliente</label>
                  <select
                    className="input"
                    value={form.cliente}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((prev) => ({ ...prev, cliente: value, workOrderId: "" }));
                      refreshWorkOrders(value);
                    }}
                  >
                    <option value="">Seleccionar cliente</option>
                    {clients.map((client) => (
                      <option key={client} value={client}>{client}</option>
                    ))}
                  </select>
                  {clientsLoading && <small style={{ color: "#6b7280" }}>Cargando clientes...</small>}
                  {clientError && <small style={{ color: "#b91c1c" }}>{clientError}</small>}
                </div>
                <div>
                  <label>Obra / OT</label>
                  <select
                    className="input"
                    value={form.workOrderId}
                    onChange={(e) => setForm((prev) => ({ ...prev, workOrderId: e.target.value }))}
                    disabled={!form.cliente || workOrdersLoading}
                  >
                    <option value="">{form.cliente ? "Seleccionar OT" : "Selecciona un cliente"}</option>
                    {workOrders.map((ot) => (
                      <option key={ot.id} value={ot.id}>{ot.label}</option>
                    ))}
                  </select>
                  {workOrdersLoading && <small style={{ color: "#6b7280" }}>Cargando OT...</small>}
                  {workOrdersError && <small style={{ color: "#b91c1c" }}>{workOrdersError}</small>}
                </div>

                <div>
                  <label>Tiempo acordado (dias desde hoy)</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={form.dias}
                    onChange={(e) => setForm((prev) => ({ ...prev, dias: e.target.value }))}
                    placeholder="Ej. 3"
                  />
                </div>
                {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
                {message && <div style={{ color: "#059669" }}>{message}</div>}
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-primary" disabled={saving}>{saving ? "Guardando..." : "Registrar movimiento"}</button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setForm(initialForm);
                      setError("");
                      setMessage("");
                      setWorkOrders([]);
                      refreshClients();
                    }}
                  >
                    Limpiar
                  </button>
                </div>
              </>
            )}
          </form>
        </div>

        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0" }}>
            <h3 style={{ margin: 0, padding: "6px 10px", background: "#f0f9ff", borderRadius: 10, border: "1px solid #bae6fd", color: "#0f172a" }}>
              Calendario de devolucion
            </h3>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowReturned((v) => !v)}>
              Devueltos
            </button>
          </div>
          <input
            className="input"
            style={{ margin: "8px 0" }}
            placeholder="Buscar prestados..."
            value={borrowedSearch}
            onChange={(e) => setBorrowedSearch(e.target.value)}
          />
          {movementsLoading && <small style={{ color: "#6b7280" }}>Cargando movimientos...</small>}
          {movementsError && <div style={{ color: "#b91c1c" }}>{movementsError}</div>}
          {!movementsError && !movementsLoading && !filteredBorrowed.length && (
            <div style={{ color: "#6b7280" }}>No hay movimientos registrados o el servidor no expone historial.</div>
          )}
          {Boolean(filteredBorrowed.length) && (
            <div style={{ display: "grid", gap: 8 }}>
              {filteredBorrowed.map((mov) => (
                <div
                  key={mov.id}
                  style={{
                    border: `1px solid ${expiredIds.has(mov.id) ? "#ef4444" : "#e5e7eb"}`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1fr 1.2fr",
                    gap: 8,
                    background: expiredIds.has(mov.id) ? "#fef2f2" : "#fff"
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{mov.toolName || mov.toolId}</div>
                    <small style={{ color: "#6b7280" }}>Estado: {mov.estado}</small>
                    {mov.devuelto && <small style={{ color: "#059669", fontWeight: 600 }}>Devuelto</small>}
                    {!mov.devuelto && expiredIds.has(mov.id) && <small style={{ color: "#b91c1c", fontWeight: 600 }}>Vencido / no devuelto</small>}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{mov.responsable}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700 }}>Devuelve: {mov.devuelve || "Sin fecha"}</div>
                    <small style={{ color: "#6b7280" }}>Salida: {mov.fecha || "-"}</small>
                    {mov.cliente && (
                      <div style={{ color: "#6b7280" }}>
                        Cliente: {mov.cliente} {mov.workOrder ? `· OT: ${mov.workOrder}` : ""}
                      </div>
                    )}
                    {!mov.devuelto && (
                      <button
                        type="button"
                        className="btn btn-xs btn-danger"
                        style={{ marginTop: 6 }}
                        onClick={() => handleDeleteMovement(mov.id)}
                      >
                        Marcar devuelto
                      </button>
                    )}
                    {mov.devuelto && mov.devueltoEstado && (
                      <div style={{ color: "#059669", fontWeight: 600 }}>
                        Estado devuelto: {mov.devueltoEstado}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {showReturned && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: 0, padding: "6px 10px", background: "#ecfdf3", borderRadius: 10, border: "1px solid #bbf7d0", color: "#14532d", display: "inline-block" }}>
                Devueltos
              </h4>
              <input
                className="input"
                style={{ margin: "6px 0" }}
                placeholder="Buscar devueltos..."
                value={returnedSearch}
                onChange={(e) => setReturnedSearch(e.target.value)}
              />
              {!filteredReturned.length && <small style={{ color: "#6b7280" }}>No hay devoluciones registradas.</small>}
              {filteredReturned.length > 0 && (
                <div style={{ display: "grid", gap: 8 }}>
                  {filteredReturned.map((mov) => (
                    <div
                      key={mov.id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: "8px 10px",
                        display: "grid",
                        gridTemplateColumns: "1.2fr 1fr 1.2fr",
                        gap: 8,
                        background: "#f8fafc"
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{mov.toolName || mov.toolId}</div>
                        <small style={{ color: "#6b7280" }}>Estado al devolver: {mov.devueltoEstado || "N/D"}</small>
                      </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{mov.responsable}</div>
                  </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700 }}>Devuelto: {mov.devuelve || "-"}</div>
                        <small style={{ color: "#6b7280" }}>Salida: {mov.fecha || "-"}</small>
                        {mov.cliente && (
                      <div style={{ color: "#6b7280" }}>
                        Cliente: {mov.cliente} {mov.workOrder ? `· OT: ${mov.workOrder}` : ""}
                      </div>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn btn-xs btn-danger"
                        style={{ marginTop: 6 }}
                        onClick={() => handleDeleteReturnRecord(mov.id)}
                      >
                        Eliminar registro
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}


