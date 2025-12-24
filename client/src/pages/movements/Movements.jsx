import { useEffect, useMemo, useState } from "react";
import { request } from "../../api";
import { sanitizeText } from "../../lib/text";
import { MOVEMENT_ENTITY_LABELS, MOVEMENT_FILTERS, MOVEMENT_FILTER_ALIASES } from "../../lib/movements";
import { userIsAdmin } from "../../auth";

const formatTimestamp = (ts) => {
  if (!ts) return "";
  if (typeof ts === "string") return new Date(ts).toLocaleString();
  if (ts._seconds) return new Date(ts._seconds * 1000).toLocaleString();
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
  return new Date(ts).toLocaleString();
};

const ACTION_LABELS = {
  create: "Alta",
  update: "Actualizacion",
  delete: "Eliminacion",
  movement: "Movimiento",
  loan: "Prestamo",
  return: "Devolucion"
};

const filterOptions = [{ value: "all", label: "Todos" }, ...MOVEMENT_FILTERS];

const parseTimestamp = (value) => {
  if (!value) return 0;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (value._seconds) return value._seconds * 1000;
  if (value.seconds) return value.seconds * 1000;
  return Number(value) || 0;
};

const formatValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "[Objeto]";
    }
  }
  return String(value);
};

export default function Movements(){
  const [rows,setRows]=useState([]);
  const [error,setError]=useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const isAdmin = userIsAdmin();

  useEffect(()=>{
    request("/movements")
      .then((data)=>setRows(Array.isArray(data)?data:[]))
      .catch((err)=>setError(err.message || "No se pudo cargar el historial"));
  },[]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => parseTimestamp(b.at || b.timestamp) - parseTimestamp(a.at || a.timestamp));
  }, [rows]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    let dataset = sortedRows;

    if (filter !== "all") {
      const aliases = MOVEMENT_FILTER_ALIASES[filter];
      if (aliases?.length) {
        const allowed = new Set(aliases);
        dataset = dataset.filter((row) => allowed.has(row.entity));
      } else {
        dataset = [];
      }
    }

    if (!normalizedSearch) return dataset;

    return dataset.filter((row) => {
      const haystack = [
        row.summary,
        row.by,
        row.entity,
        JSON.stringify(row.payload || {}),
        JSON.stringify(row.metadata || {})
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [sortedRows, filter, normalizedSearch]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE)), [filteredRows.length]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [filter, normalizedSearch]);

  const displayedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  const handleDelete = async (row) => {
    if (!row?.id || String(row.id).startsWith("ts-fallback-")) return;
    if (!isAdmin) return;
    if (!window.confirm("Eliminar este movimiento?")) return;
    setDeletingId(row.id);
    setError("");
    try {
      await request(`/movements/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      setRows((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId("");
    }
  };

  return (
    <>
      <h2 style={{margin:"0 0 12px"}}>Movimientos</h2>
      <div className="card">
        <div className="movement-filters">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`movement-filter ${filter === option.value ? "active" : ""}`}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
          <input
            className="input"
            placeholder="Buscar por usuario, detalle o datos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setSearch("")}
            disabled={!search}
          >
            Limpiar
          </button>
        </div>
        {error && <div style={{color:"#b91c1c", marginBottom:12}}>{error}</div>}
        <table className="table movements-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Movimiento</th>
              <th>Usuario</th>
              <th>Detalle</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((r)=> {
              const entityLabel = MOVEMENT_ENTITY_LABELS[r.entity] || sanitizeText(r.entity);
              const actionLabel = ACTION_LABELS[r.type] || sanitizeText(r.type);
              const payloadEntries = r.payload && typeof r.payload === "object"
                ? Object.entries(r.payload).filter(([_, value]) => {
                    if (value === null || value === undefined) return false;
                    if (typeof value === "string" && value.trim() === "") return false;
                    return true;
                  })
                : [];
              const canDelete = isAdmin && r.id && !String(r.id).startsWith("ts-fallback-");
              return (
                <tr key={r.id}>
                  <td>{formatTimestamp(r.at || r.timestamp)}</td>
                  <td>
                    <div className="movement-meta">
                      <span className="movement-entity">{entityLabel}</span>
                      <span className="movement-type-badge">{actionLabel}</span>
                    </div>
                    <div className="movement-title">{sanitizeText(r.summary) || "Sin detalle adicional"}</div>
                  </td>
                  <td>{sanitizeText(r.by) || "sistema"}</td>
                  <td>
                    {payloadEntries.length ? (
                      <div className="movement-payload movement-payload-grid">
                        {payloadEntries.map(([key, value]) => (
                          <div key={key} className="movement-payload-row">
                            <span className="movement-payload-key">{key}</span>
                            <span className="movement-payload-value">{formatValue(value)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: "#6b7280" }}>Sin especificaciones adicionales</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td style={{ textAlign: "right" }}>
                      {canDelete ? (
                        <button
                          type="button"
                          className="btn btn-xs btn-danger"
                          onClick={() => handleDelete(r)}
                          disabled={deletingId === r.id}
                        >
                          {deletingId === r.id ? "Eliminando..." : "Eliminar"}
                        </button>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: 12 }}>No editable</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {!filteredRows.length && !error && (
              <tr>
                <td colSpan={5} style={{textAlign:"center", padding:18, color:"#6b7280"}}>
                  No hay movimientos registrados para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filteredRows.length > 0 && (
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:12}}>
            <span style={{color:"#6b7280", fontSize:13}}>
              Página {page} de {totalPages}
            </span>
            <div style={{display:"flex", gap:8}}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Anterior
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
