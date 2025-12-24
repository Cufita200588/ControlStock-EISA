import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { request } from "../../api";
import { sanitizeText } from "../../lib/text";
import { toDateInputValue } from "../../lib/dates";
import { RUBROS, CONDICION, normalizeRubro, normalizeCondicion } from "./materialOptions";
import { logMovement } from "../../lib/movements";
import { fetchClientList, fetchWorkOrdersByClient } from "../../lib/workOrders";

const FIELD_LABELS = {
  Descripcion: "Descripcion",
  Cantidad: "Cantidad",
  Unidad: "Unidad",
  Rubro: "Rubro",
  Marca: "Marca",
  Material: "Material",
  "Ubicacion Fisica / Coordenadas": "Ubicacion / Coordenadas",
  Proveedor: "Proveedor",
  Comprador: "Comprador",
  Observaciones: "Observaciones",
  Condicion: "Condicion",
  Obra: "Obra",
  Fecha: "Fecha"
};

const toNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const makeFormState = (data = {}) => ({
  Descripcion: sanitizeText(data.Descripcion) || "",
  Cantidad: toNumber(data.Cantidad),
  Unidad: sanitizeText(data.Unidad) || "",
  Rubro: normalizeRubro(data.Rubro),
  Marca: sanitizeText(data.Marca) || "",
  Material: sanitizeText(data.Material) || "",
  "Ubicacion Fisica / Coordenadas": sanitizeText(data["Ubicacion Fisica / Coordenadas"]) || "",
  Proveedor: sanitizeText(data.Proveedor) || "",
  Comprador: sanitizeText(data.Comprador) || "",
  Observaciones: sanitizeText(data.Observaciones) || "",
  Condicion: normalizeCondicion(data.Condicion),
  Obra: sanitizeText(data.Obra) || "",
  Fecha: toDateInputValue(data.Fecha)
});

export default function MaterialDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [material, setMaterial] = useState(null);
  const [form, setForm] = useState(makeFormState());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientError, setClientError] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [workOrders, setWorkOrders] = useState([]);
  const [workOrdersLoading, setWorkOrdersLoading] = useState(false);
  const [workOrdersError, setWorkOrdersError] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [isStock, setIsStock] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");

  const editing = searchParams.get("edit") === "1";

  const enableEditing = () => {
    setMessage("");
    setError("");
    const next = new URLSearchParams(searchParams);
    next.set("edit", "1");
    setSearchParams(next, { replace: true });
  };

  const disableEditing = () => {
    setError("");
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await request(`/materials/${id}`);
        setMaterial(data);
        setForm(makeFormState(data));
        const obraValue = (data?.Obra || "").trim();
        const defaultStock = obraValue.toLowerCase() === "stock";
        setIsStock(defaultStock);
        if (defaultStock) setForm((prev) => ({ ...prev, Obra: "Stock" }));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  useEffect(() => {
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

    const refreshUsers = async () => {
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

    refreshClients();
    refreshUsers();
  }, []);

  const detailRows = useMemo(() => {
    if (!material) return [];
    return Object.entries(FIELD_LABELS).map(([key, label]) => {
      const raw = material[key];
      let value;
      if (key === "Fecha") {
        value = toDateInputValue(raw);
      } else {
        const sanitized = sanitizeText(raw);
        value = sanitized ?? "";
      }
      return { label, value };
    });
  }, [material]);

  const refreshWorkOrders = async (clientName) => {
    const target = (clientName || "").trim();
    setSelectedWorkOrderId("");
    setWorkOrders([]);
    if (!target) return;
    setWorkOrdersLoading(true);
    setWorkOrdersError("");
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

  const handleSelectClient = (value) => {
    setIsStock(false);
    setSelectedClient(value);
    setField("Obra", "");
    refreshWorkOrders(value);
  };

  const handleSelectWorkOrder = (value) => {
    setIsStock(false);
    setSelectedWorkOrderId(value);
    const found = workOrders.find((ot) => ot.id === value);
    setField("Obra", found?.label || "");
  };

  const handleModeChange = (mode) => {
    const toStock = mode === "stock";
    setIsStock(toStock);
    if (toStock) {
      setSelectedClient("");
      setSelectedWorkOrderId("");
      setWorkOrders([]);
      setField("Obra", "Stock");
    } else {
      setField("Obra", "");
    }
  };

  const setField = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: key === "Cantidad" ? toNumber(value) : value
    }));
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const payload = {
        ...form,
        Obra: isStock ? "Stock" : form.Obra,
        Cantidad: toNumber(form.Cantidad),
        Fecha: toDateInputValue(form.Fecha)
      };
      await request(`/materials/${id}`, { method: "PATCH", body: payload });
      setMaterial((prev) => ({ ...(prev || {}), ...payload }));
      logMovement({
        entity: "materials",
        action: "update",
        summary: `Actualizaste el material "${payload.Descripcion || material?.Descripcion || ""}"`,
        payload: { id, cambios: payload }
      });
      setMessage("Material actualizado.");
      disableEditing();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Eliminar este material?")) return;
    setError("");
    try {
      await request(`/materials/${id}`, { method: "DELETE" });
      logMovement({
        entity: "materials",
        action: "delete",
        summary: `Eliminaste el material "${material?.Descripcion || ""}"`,
        payload: { id, nombre: material?.Descripcion }
      });
      navigate("/stock/inventario");
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) return <div>Cargando material...</div>;
  if (error && !material) return <div>Error: {error}</div>;
  if (!material) return <div>No se encontro el material solicitado.</div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: "0 0 12px" }}>{material.Descripcion || "Material"}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => navigate("/stock/inventario")}>
            Volver
          </button>
          <button className="btn btn-secondary" onClick={editing ? disableEditing : enableEditing}>
            {editing ? "Cancelar edicion" : "Editar"}
          </button>
          <button className="btn btn-danger" onClick={handleDelete}>
            Eliminar
          </button>
        </div>
      </div>
      <div className="card">
        {editing ? (
          <form onSubmit={handleUpdate} className="grid g-3">
            <div><label>Descripcion</label><input className="input" value={form.Descripcion} onChange={(e)=>setField("Descripcion", e.target.value)} required/></div>
            <div><label>Cantidad</label><input className="input" type="number" value={form.Cantidad} onChange={(e)=>setField("Cantidad", e.target.value)} required/></div>
            <div><label>Unidad (opcional)</label><input className="input" value={form.Unidad} onChange={(e)=>setField("Unidad", e.target.value)} /></div>
            <div>
              <label>Rubro</label>
              <select className="input" value={form.Rubro} onChange={(e)=>setField("Rubro", e.target.value)}>
                {[form.Rubro, ...RUBROS].filter((value, index, arr) => arr.indexOf(value) === index).map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div><label>Marca</label><input className="input" value={form.Marca} onChange={(e)=>setField("Marca", e.target.value)} /></div>
            <div><label>Material</label><input className="input" value={form.Material} onChange={(e)=>setField("Material", e.target.value)} /></div>
            <div><label>Ubicacion / Coordenadas</label><input className="input" value={form["Ubicacion Fisica / Coordenadas"]} onChange={(e)=>setField("Ubicacion Fisica / Coordenadas", e.target.value)} /></div>
            <div><label>Proveedor</label><input className="input" value={form.Proveedor} onChange={(e)=>setField("Proveedor", e.target.value)} /></div>
            <div>
              <label>Comprador</label>
              <input
                className="input"
                value={form.Comprador}
                list="comprador-options"
                onChange={(e)=>setField("Comprador", e.target.value)}
                placeholder="Selecciona o escribe"
              />
              <datalist id="comprador-options">
                {users.map((u) => (
                  <option key={u.id} value={u.label}>{u.label}</option>
                ))}
              </datalist>
              {usersLoading && <small style={{ color: "#6b7280" }}>Cargando usuarios...</small>}
              {usersError && <small style={{ color: "#b91c1c" }}>{usersError}</small>}
            </div>
            <div>
              <label>Condicion</label>
              <select className="input" value={form.Condicion} onChange={(e)=>setField("Condicion", e.target.value)}>
                {[form.Condicion, ...CONDICION].filter((value, index, arr) => arr.indexOf(value) === index).map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>Destino</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`btn btn-xs ${isStock ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => handleModeChange("stock")}
                >
                  Stock
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${!isStock ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => handleModeChange("cliente")}
                >
                  Cliente / OT
                </button>
                {isStock && <span style={{ alignSelf: "center", color: "#0f172a", fontWeight: 600 }}>Destino: Stock</span>}
              </div>
            </div>
            {!isStock && (
              <>
                <div>
                  <label>Cliente</label>
                  <select
                    className="input"
                    value={selectedClient}
                    onChange={(e) => handleSelectClient(e.target.value)}
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
                    value={selectedWorkOrderId}
                    onChange={(e) => handleSelectWorkOrder(e.target.value)}
                    disabled={!selectedClient || workOrdersLoading}
                  >
                    <option value="">{selectedClient ? "Seleccionar OT" : "Selecciona un cliente"}</option>
                    {workOrders.map((ot) => (
                      <option key={ot.id} value={ot.id}>{ot.label}</option>
                    ))}
                  </select>
                  {workOrdersLoading && <small style={{ color: "#6b7280" }}>Cargando OT...</small>}
                  {workOrdersError && <small style={{ color: "#b91c1c" }}>{workOrdersError}</small>}
                </div>
              </>
            )}
            <div><label>Fecha</label><input className="input" type="date" value={form.Fecha} onChange={(e)=>setField("Fecha", e.target.value)} /></div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Observaciones</label>
              <textarea className="input" value={form.Observaciones} onChange={(e)=>setField("Observaciones", e.target.value)} />
            </div>
            {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
            {message && <div style={{ color: "#16a34a" }}>{message}</div>}
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={disableEditing}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="grid" style={{ gap: 12 }}>
            {message && <div style={{ color: "#16a34a" }}>{message}</div>}
            {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
            <table className="table">
              <tbody>
                {detailRows.map((row) => (
                  <tr key={row.label}>
                    <th style={{ textAlign: "left", width: 220 }}>{row.label}</th>
                    <td>{String(row.value || "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
