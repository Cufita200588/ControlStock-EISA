import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../../api";
import { sanitizeText } from "../../lib/text";
import { logMovement } from "../../lib/movements";

const PAGE_LIMIT = 120;

export default function Inventory(){
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const fetchPaginated = async ({ cursor: cursorValue, append = false } = {}) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try{
      const params = new URLSearchParams({
        paginated: "1",
        limit: String(PAGE_LIMIT)
      });
      if (cursorValue) params.set("cursor", cursorValue);
      const data = await request(`/materials?${params.toString()}`);
      const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setItems((prev)=> append ? [...prev, ...list] : list);
      setNextCursor(data?.nextCursor || null);
      if (!append) setActiveSearch("");
    }catch(e){
      setError(e.message);
    }finally{
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  const fetchSearch = async (term) => {
    setLoading(true);
    setError("");
    try{
      const data = await request(`/materials?q=${encodeURIComponent(term)}`);
      const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setItems(list);
      setNextCursor(null);
      setActiveSearch(term);
    }catch(e){
      setError(e.message);
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{ fetchPaginated(); },[]);

  const handleDelete = async (item) => {
    if (!window.confirm(`Eliminar material "${item.Descripcion}"?`)) return;
    setError("");
    try{
      await request(`/materials/${item.id}`, { method:"DELETE" });
      setItems((prev)=>prev.filter((it)=>it.id !== item.id));
      logMovement({
        entity: "materials",
        action: "delete",
        summary: `Eliminaste el material "${item.Descripcion || ''}"`,
        payload: { id: item.id, Descripcion: item.Descripcion, Cantidad: item.Cantidad }
      });
    }catch(e){
      setError(e.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || loadingMore) return;
    const term = q.trim();
    if (term) await fetchSearch(term);
    else await fetchPaginated();
  };

  const handleClearSearch = async () => {
    if (!activeSearch && !q) return;
    setQ("");
    setActiveSearch("");
    await fetchPaginated();
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    await fetchPaginated({ cursor: nextCursor, append: true });
  };

  const isFiltering = Boolean(activeSearch);

  return (
    <>
      <h2 style={{margin:"0 0 12px"}}>Inventario materiales</h2>
      <div className="card">
        <form onSubmit={handleSubmit} style={{display:"flex",gap:10,marginBottom:12, flexWrap:"wrap"}}>
          <input
            className="input"
            style={{flex:"1 1 220px", minWidth: 160}}
            placeholder="Buscar..."
            value={q}
            onChange={e=>setQ(e.target.value)}
          />
          <div style={{display:"flex", gap:8}}>
            <button type="submit" className="btn btn-ghost" disabled={loading || loadingMore}>
              {loading && q.trim() ? "Buscando..." : "Buscar"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleClearSearch} disabled={loading || loadingMore}>
              Limpiar
            </button>
          </div>
        </form>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 12, fontSize: 13, color:"#6b7280"}}>
          <span>
            {isFiltering ? `Resultados para "${activeSearch}"` : "Ultimos materiales actualizados"}
          </span>
          <span>{items.length} registros</span>
        </div>
        {error && <div style={{color:"#b91c1c", marginBottom:12}}>{error}</div>}
        {loading ? (
          <div>Cargando...</div>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Descripcion</th>
                  <th>Cantidad</th>
                  <th>Unidad</th>
                  <th>Rubro</th>
                  <th>Ubicacion</th>
                  <th>Condicion</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(it=>(
                  <tr key={it.id}>
                    <td>{sanitizeText(it.Descripcion)}</td>
                    <td>{it.Cantidad}</td>
                    <td>{sanitizeText(it.Unidad)}</td>
                    <td>{sanitizeText(it.Rubro)}</td>
                    <td>{sanitizeText(it["Ubicacion Fisica / Coordenadas"])}</td>
                    <td>{sanitizeText(it.Condicion)}</td>
                    <td style={{textAlign:"right", minWidth: 160}}>
                      <Link className="btn btn-xs" to={`/stock/materiales/${it.id}`}>Ver</Link>
                      <Link className="btn btn-xs" style={{marginLeft:6}} to={`/stock/materiales/${it.id}?edit=1`}>Editar</Link>
                      <button className="btn btn-xs btn-danger" style={{marginLeft:6}} onClick={()=>handleDelete(it)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
                {!items.length && (
                  <tr>
                    <td colSpan={7} style={{textAlign:"center", padding:20, color:"#6b7280"}}>
                      No hay materiales para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {!isFiltering && nextCursor && (
              <div style={{display:"flex", justifyContent:"center", marginTop:12}}>
                <button className="btn btn-secondary" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? "Cargando..." : "Cargar mas"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
