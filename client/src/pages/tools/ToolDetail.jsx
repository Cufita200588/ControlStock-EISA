import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { request } from "../../api";
import { sanitizeText } from "../../lib/text";
import { toDateInputValue } from "../../lib/dates";
import { ESTADOS, normalizeEstado } from "./toolOptions";
import { logMovement } from "../../lib/movements";

const FIELD_LABELS = {
  Nombre: "Nombre",
  "Fecha de compra": "Fecha de compra",
  "Numero Interno": "Numero Interno",
  "Ubicacion / Coordenada": "Ubicacion / Coordenada",
  "Designacion Generica": "Designacion Generica",
  Descripcion: "Descripcion",
  Marca: "Marca",
  Modelo: "Modelo",
  Proveedor: "Proveedor",
  Estado: "Estado",
  Observaciones: "Observaciones"
};

const makeFormState = (data = {}) => ({
  Nombre: sanitizeText(data.Nombre) || "",
  "Fecha de compra": toDateInputValue(data["Fecha de compra"]),
  "Numero Interno": sanitizeText(data["Numero Interno"]) || "",
  "Ubicacion / Coordenada": sanitizeText(data["Ubicacion / Coordenada"]) || "",
  "Designacion Generica": sanitizeText(data["Designacion Generica"]) || "",
  Descripcion: sanitizeText(data.Descripcion) || "",
  Marca: sanitizeText(data.Marca) || "",
  Modelo: sanitizeText(data.Modelo) || "",
  Proveedor: sanitizeText(data.Proveedor) || "",
  Estado: normalizeEstado(data.Estado),
  Observaciones: sanitizeText(data.Observaciones) || ""
});

export default function ToolDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState(null);
  const [form, setForm] = useState(makeFormState());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

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
        const data = await request(`/tools/${id}`);
        setTool(data);
        setForm(makeFormState(data));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const detailRows = useMemo(() => {
    if (!tool) return [];
    return Object.entries(FIELD_LABELS).map(([key, label]) => {
      const raw = tool[key];
      let value;
      if (key === "Fecha de compra") {
        value = toDateInputValue(raw);
      } else {
        const sanitized = sanitizeText(raw);
        value = sanitized ?? "";
      }
      return { label, value };
    });
  }, [tool]);

  const setField = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const payload = { ...form, "Fecha de compra": toDateInputValue(form["Fecha de compra"]) };
      await request(`/tools/${id}`, { method: "PATCH", body: payload });
      setTool((prev) => ({ ...(prev || {}), ...payload }));
      logMovement({
        entity: "tools",
        action: "update",
        summary: `Actualizaste la herramienta "${payload.Nombre || tool?.Nombre || ""}"`,
        payload: { id, cambios: payload }
      });
      setMessage("Herramienta actualizada.");
      disableEditing();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Eliminar esta herramienta?")) return;
    setError("");
    try {
      await request(`/tools/${id}`, { method: "DELETE" });
      logMovement({
        entity: "tools",
        action: "delete",
        summary: `Eliminaste la herramienta "${tool?.Nombre || ""}"`,
        payload: { id, nombre: tool?.Nombre }
      });
      navigate("/tools/lista");
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) return <div>Cargando herramienta...</div>;
  if (error && !tool) return <div>Error: {error}</div>;
  if (!tool) return <div>No se encontro la herramienta solicitada.</div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: "0 0 12px" }}>{tool.Nombre || "Herramienta"}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => navigate("/tools/lista")}>
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
            <div><label>Nombre</label><input className="input" value={form.Nombre} onChange={(e)=>setField("Nombre", e.target.value)} required/></div>
            <div><label>Fecha de compra</label><input className="input" type="date" value={form["Fecha de compra"]} onChange={(e)=>setField("Fecha de compra", e.target.value)} /></div>
            <div><label>Numero Interno</label><input className="input" value={form["Numero Interno"]} onChange={(e)=>setField("Numero Interno", e.target.value)} /></div>
            <div><label>Ubicacion / Coordenada</label><input className="input" value={form["Ubicacion / Coordenada"]} onChange={(e)=>setField("Ubicacion / Coordenada", e.target.value)} /></div>
            <div><label>Designacion Generica</label><input className="input" value={form["Designacion Generica"]} onChange={(e)=>setField("Designacion Generica", e.target.value)} /></div>
            <div><label>Proveedor</label><input className="input" value={form.Proveedor} onChange={(e)=>setField("Proveedor", e.target.value)} /></div>
            <div><label>Marca</label><input className="input" value={form.Marca} onChange={(e)=>setField("Marca", e.target.value)} /></div>
            <div><label>Modelo</label><input className="input" value={form.Modelo} onChange={(e)=>setField("Modelo", e.target.value)} /></div>
            <div>
              <label>Estado</label>
              <select className="input" value={form.Estado} onChange={(e)=>setField("Estado", e.target.value)}>
                {[form.Estado, ...ESTADOS].filter((value, index, arr) => arr.indexOf(value) === index).map((estado) => <option key={estado}>{estado}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Descripcion</label>
              <textarea className="input" value={form.Descripcion} onChange={(e)=>setField("Descripcion", e.target.value)} />
            </div>
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
