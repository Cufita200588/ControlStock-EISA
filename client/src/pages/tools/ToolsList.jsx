import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../../api";
import { sanitizeText } from "../../lib/text";
import { logMovement } from "../../lib/movements";

export default function ToolsList(){
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try{
      const search = q ? `?q=${encodeURIComponent(q)}` : "";
      const data = await request(`/tools${search}`);
      setItems(data);
    }catch(e){
      setError(e.message);
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{ load(); },[]);

  const handleDelete = async (tool) => {
    if (!window.confirm(`Eliminar herramienta "${tool.Nombre}"?`)) return;
    setError("");
    try{
      await request(`/tools/${tool.id}`, { method:"DELETE" });
      setItems((prev)=>prev.filter((it)=>it.id !== tool.id));
      logMovement({
        entity: "tools",
        action: "delete",
        summary: `Eliminaste la herramienta "${tool.Nombre || ""}"`,
        payload: { id: tool.id, Nombre: tool.Nombre, NumeroInterno: tool["Numero Interno"] }
      });
    }catch(e){
      setError(e.message);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!loading) load();
  };

  return (
    <>
      <h2 style={{margin:"0 0 12px"}}>Inventario herramientas</h2>
      <div className="card">
        <form onSubmit={handleSubmit} style={{display:"flex",gap:10,marginBottom:12}}>
          <input className="input" placeholder="Buscar..." value={q} onChange={e=>setQ(e.target.value)} />
          <button type="submit" className="btn btn-ghost" disabled={loading}>Buscar</button>
        </form>
        {error && <div style={{color:"#b91c1c", marginBottom:12}}>{error}</div>}
        {loading ? (
          <div>Cargando...</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Numero Interno</th>
                <th>Ubicacion</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map(it=>(
                <tr key={it.id}>
                  <td>{sanitizeText(it.Nombre)}</td>
                  <td>{sanitizeText(it["Numero Interno"])}</td>
                  <td>{sanitizeText(it["Ubicacion / Coordenada"])}</td>
                  <td>{sanitizeText(it.Estado)}</td>
                  <td style={{textAlign:"right", minWidth: 160}}>
                    <Link className="btn btn-xs" to={`/tools/${it.id}`}>Ver</Link>
                    <Link className="btn btn-xs" style={{marginLeft:6}} to={`/tools/${it.id}?edit=1`}>Editar</Link>
                    <button className="btn btn-xs btn-danger" style={{marginLeft:6}} onClick={()=>handleDelete(it)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
