import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../../api";
import { sanitizeText } from "../../lib/text";
import { fetchClientList, fetchWorkOrdersByClient } from "../../lib/workOrders";

const normalize = (value = "") => value.toString().trim();

const initialForm = {
  cantidad: "",
  destino: "",
  entregadoA: "",
  motivo: "",
  detalle: ""
};

export default function MaterialEgress() {
  const [materials, setMaterials] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientError, setClientError] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [workOrders, setWorkOrders] = useState([]);
  const [workOrdersLoading, setWorkOrdersLoading] = useState(false);
  const [workOrdersError, setWorkOrdersError] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");

  const selectedMaterial = useMemo(
    () => materials.find((m) => m.id === selectedId),
    [materials, selectedId]
  );

  const fetchMaterials = async (term = "") => {
    setLoading(true);
    setError("");
    try {
      const qs = term ? `?q=${encodeURIComponent(term)}` : "?paginated=1&limit=80";
      const data = await request(`/materials${qs}`);
      const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setMaterials(list);
    } catch (err) {
      setError(err.message);
      setMaterials([]);
    } finally {
      setLoading(false);
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

  useEffect(() => {
    fetchMaterials();
    refreshClients();
    refreshUsers();
  }, []);

  const handleSelect = (mat) => {
    setSelectedId(mat.id);
    setMessage("");
    setError("");
    const obra = sanitizeText(mat.Obra) || "";
    setForm((prev) => ({ ...prev, destino: obra || prev.destino }));
  };

  const handleSelectClient = (value) => {
    setSelectedClient(value);
    refreshWorkOrders(value);
  };

  const handleSelectWorkOrder = (value) => {
    setSelectedWorkOrderId(value);
    const found = workOrders.find((ot) => ot.id === value);
    setForm((prev) => ({ ...prev, destino: found?.label || "" }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedMaterial) {
      setError("Selecciona un material");
      return;
    }
    const cantidad = Number(form.cantidad);
    if (!cantidad || cantidad <= 0) {
      setError("Cantidad invalida");
      return;
    }
    if (cantidad > selectedMaterial.Cantidad) {
      setError("No hay stock suficiente");
      return;
    }
    const destino = normalize(form.destino);
    const entregadoA = normalize(form.entregadoA);
    const motivo = normalize(form.motivo);
    const detalle = normalize(form.detalle);
    if (!destino || !entregadoA) {
      setError("Destino y responsable son obligatorios");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await request(`/materials/${selectedMaterial.id}/stock`, {
        method: "POST",
        body: {
          action: "out",
          cantidad,
          destino,
          entregadoA,
          motivo,
          detalle
        }
      });
      setMaterials((prev) =>
        prev.map((item) =>
          item.id === selectedMaterial.id
            ? { ...item, Cantidad: Math.max(0, (item.Cantidad || 0) - cantidad) }
            : item
        )
      );
      setForm(initialForm);
      setMessage("Egreso registrado y movimiento guardado");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2 style={{ margin: "0 0 12px" }}>Egreso de material</h2>
      <div className="card" style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ flex: "1 1 260px", minWidth: 200 }}
            placeholder="Buscar por descripcion, rubro, ubicacion..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                fetchMaterials(search.trim());
              }
            }}
          />
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => fetchMaterials(search.trim())}
            disabled={loading}
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setSearch("");
              fetchMaterials();
            }}
            disabled={loading}
          >
            Limpiar
          </button>
        </div>
        {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
        {message && <div style={{ color: "#059669" }}>{message}</div>}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(260px, 420px) 1fr",
            gap: 20,
            alignItems: "start"
          }}
        >
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, maxHeight: 420, overflowY: "auto" }}>
            {materials.length === 0 && !loading && (
              <div style={{ padding: 12, color: "#6b7280" }}>No hay materiales para mostrar.</div>
            )}
            {materials.map((mat) => (
              <div
                key={mat.id}
                role="button"
                tabIndex={0}
                className="btn btn-ghost"
                style={{
                  justifyContent: "flex-start",
                  width: "100%",
                  padding: "10px 12px",
                  borderBottom: "1px solid #e5e7eb",
                  borderRadius: 0,
                  background: mat.id === selectedId ? "#f1f5f9" : "#fff"
                }}
                onClick={() => handleSelect(mat)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelect(mat);
                  }
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 10, width: "100%" }}>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600 }}>{sanitizeText(mat.Descripcion)}</div>
                    <small style={{ color: "#6b7280" }}>
                      {sanitizeText(mat.Rubro)} - {sanitizeText(mat.Unidad)}
                    </small>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700 }}>{mat.Cantidad} {sanitizeText(mat.Unidad)}</div>
                    <small style={{ color: "#6b7280" }}>Obra: {sanitizeText(mat.Obra) || "-"}</small>
                  </div>
                  <Link
                    to={`/stock/materiales/${mat.id}`}
                    className="btn btn-xs"
                    style={{
                      background: "#e0f2fe",
                      color: "#0f172a",
                      border: "1px solid #0ea5e9",
                      fontWeight: 600,
                      whiteSpace: "nowrap"
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Ver detalles →
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="grid" style={{ gap: 14 }}>
            <h3 style={{ margin: "0 0 4px" }}>Registrar egreso</h3>
            {!selectedMaterial && (
              <div style={{ color: "#6b7280" }}>Selecciona un material para descontar stock.</div>
            )}
            {selectedMaterial && (
              <>
                <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{sanitizeText(selectedMaterial.Descripcion)}</div>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                    Rubro: {sanitizeText(selectedMaterial.Rubro)} - Unidad: {sanitizeText(selectedMaterial.Unidad)}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                    Obra: {sanitizeText(selectedMaterial.Obra) || "-"} - Condicion: {sanitizeText(selectedMaterial.Condicion)}
                  </div>
                  <div style={{ marginTop: 8, fontWeight: 600 }}>
                    Stock disponible: {selectedMaterial.Cantidad} {sanitizeText(selectedMaterial.Unidad)}
                  </div>
                </div>

                <div>
                  <label>Cantidad a egresar</label>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    step="any"
                    value={form.cantidad}
                    onChange={(e) => setForm((prev) => ({ ...prev, cantidad: e.target.value }))}
                    required
                  />
                </div>
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
                <div>
                  <label>Responsable / quien retira</label>
                  <input
                    className="input"
                    value={form.entregadoA}
                    list="responsable-options"
                    onChange={(e) => setForm((prev) => ({ ...prev, entregadoA: e.target.value }))}
                    placeholder="Selecciona o escribe el responsable"
                    required
                  />
                  <datalist id="responsable-options">
                    {users.map((u) => (
                      <option key={u.id} value={u.label}>{u.label}</option>
                    ))}
                  </datalist>
                  {usersLoading && <small style={{ color: "#6b7280" }}>Cargando responsables...</small>}
                  {usersError && <small style={{ color: "#b91c1c" }}>{usersError}</small>}
                </div>
                <div>
                  <label>Motivo</label>
                  <input
                    className="input"
                    value={form.motivo}
                    onChange={(e) => setForm((prev) => ({ ...prev, motivo: e.target.value }))}
                    placeholder="Uso previsto"
                  />
                </div>
                <div>
                  <label>Detalle adicional</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={form.detalle}
                    onChange={(e) => setForm((prev) => ({ ...prev, detalle: e.target.value }))}
                    placeholder="Observaciones adicionales"
                  />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-primary" disabled={saving}>
                    {saving ? "Guardando..." : "Registrar egreso"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setForm(initialForm);
                      setSelectedId("");
                      setSelectedClient("");
                      setSelectedWorkOrderId("");
                      setWorkOrders([]);
                      setMessage("");
                      setError("");
                    }}
                  >
                    Limpiar
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
