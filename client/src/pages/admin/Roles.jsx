import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { request } from "../../api";
import { getUserFromToken } from "../../auth";
import { sanitizeText } from "../../lib/text";

const PERMISSION_GROUPS = {
  users: {
    manage: "Gestionar usuarios"
  },
  roles: {
    manage: "Gestionar roles"
  },
  materials: {
    read: "Ver materiales",
    create: "Crear materiales",
    update: "Editar materiales",
    delete: "Eliminar materiales"
  },
  tools: {
    read: "Ver herramientas",
    create: "Crear herramientas",
    update: "Editar herramientas",
    delete: "Eliminar herramientas"
  },
  timesheets: {
    submit: "Carga de horas propia",
    read: "Ver inventario de horas",
    viewAll: "Ver registros del dia de todos",
    manage: "Editar horas de todos"
  },
  hours: {
    workorders: "Gestionar OT",
    clients: "Gestionar clientes"
  },
};


const createEmptyPermissions = () => {
  const base = {};
  Object.entries(PERMISSION_GROUPS).forEach(([group, perms]) => {
    base[group] = Object.keys(perms).reduce((acc, key) => ({ ...acc, [key]: false }), {});
  });
  return base;
};

const mergePermissions = (perm) => {
  const base = createEmptyPermissions();
  Object.entries(perm || {}).forEach(([group, perms]) => {
    Object.entries(perms || {}).forEach(([key, value]) => {
      if (!base[group]) base[group] = {};
      base[group][key] = Boolean(value);
    });
  });
  return base;
};

export default function Roles(){
  const currentUser = getUserFromToken();
  const isAdmin = useMemo(() => (currentUser?.roles || []).includes("admin"), [currentUser]);

  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [formName, setFormName] = useState("");
  const [permissions, setPermissions] = useState(createEmptyPermissions());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadRoles = async () => {
    setLoading(true);
    setError("");
    try{
      const data = await request("/roles");
      setRoles(Array.isArray(data) ? data : []);
    }catch(e){
      setError(e.message);
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{
    if (!isAdmin) return;
    loadRoles();
  },[isAdmin]);

  useEffect(()=>{
    if (!isAdmin) {
      setRoles([]);
    }
  },[isAdmin]);

  const onSelectRole = (role) => {
    setSelectedRole(role);
    setFormName(role?.name || "");
    setPermissions(mergePermissions(role?.permissions));
    setMessage("");
    setError("");
  };

  const onToggle = (group, key) => {
    setPermissions((prev)=>({
      ...prev,
      [group]: {
        ...prev[group],
        [key]: !prev[group][key]
      }
    }));
  };

  const onNewRole = () => {
    setSelectedRole(null);
    setFormName("");
    setPermissions(createEmptyPermissions());
    setMessage("");
    setError("");
  };

  const payload = useMemo(()=>{
    const clean = {};
    Object.entries(permissions).forEach(([group, perms])=>{
      const enabled = Object.entries(perms || {}).reduce((acc, [key, value])=>{
        if (value) acc[key] = true;
        return acc;
      }, {});
      if (Object.keys(enabled).length) clean[group] = enabled;
    });
    return clean;
  },[permissions]);

  const onSave = async (event) => {
    event.preventDefault();
    if (!formName.trim()) {
      setError("Indica un nombre para el rol");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try{
      await request("/roles", {
        method: "POST",
        body: { name: formName.trim(), permissions: payload }
      });
      setMessage("Rol guardado.");
      await loadRoles();
      setSelectedRole({ name: formName.trim(), permissions: payload });
    }catch(e){
      setError(e.message);
    }finally{
      setSaving(false);
    }
  };

  const onDelete = async (role) => {
    if (!window.confirm(`Eliminar rol "${role.name}"?`)) return;
    setError("");
    setMessage("");
    try{
      await request(`/roles/${encodeURIComponent(role.name)}`, { method: "DELETE" });
      await loadRoles();
      if (selectedRole?.name === role.name) {
        onNewRole();
      }
    }catch(e){
      setError(e.message);
    }
  };

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <>
      <h2 style={{margin:"0 0 12px"}}>Gestion de roles</h2>
      <div className="card" style={{display:"flex", gap:24, flexWrap:"wrap"}}>
        <div style={{flex:"1 1 280px", minWidth:260}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap"}}>
            <h3 style={{margin:0}}>Roles existentes</h3>
            <div style={{display:"flex", gap:8}}>
              <button className="btn btn-ghost" onClick={onNewRole}>Nuevo</button>
            </div>
          </div>
          {loading ? (
            <div style={{padding:"16px 0"}}>Cargando...</div>
          ) : (
            <table className="table" style={{marginTop:12}}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Permisos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role)=>(
                  <tr key={role.name} style={{cursor:"pointer"}} onClick={()=>onSelectRole(role)}>
                    <td>{sanitizeText(role.name)}</td>
                    <td>
                      <small style={{color:"#6b7280"}}>
                        {Object.keys(role.permissions || {}).length || 0} grupos
                      </small>
                    </td>
                    <td style={{textAlign:"right"}}>
                      <button
                        className="btn btn-xs btn-danger"
                        type="button"
                        onClick={(event)=>{ event.stopPropagation(); onDelete(role); }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {!roles.length && (
                  <tr>
                    <td colSpan={3} style={{textAlign:"center", color:"#6b7280", padding:18}}>
                      No hay roles configurados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div style={{flex:"2 1 360px", minWidth:320}}>
          <h3 style={{margin:"0 0 12px"}}>{selectedRole ? `Editar rol "${selectedRole.name}"` : "Nuevo rol"}</h3>
          <form onSubmit={onSave} className="grid" style={{gap:14}}>
            <div>
              <label>Nombre del rol</label>
              <input
                className="input"
                value={formName}
                onChange={(e)=>setFormName(e.target.value)}
                placeholder="Ej. supervisor"
                required
              />
            </div>
            <div>
              <label>Permisos</label>
              <div style={{display:"grid", gap:12}}>
                {Object.entries(PERMISSION_GROUPS).map(([group, perms])=>(
                  <div key={group} style={{border:"1px solid #e5e7eb", borderRadius:10, padding:12}}>
                    <div style={{fontWeight:600, fontSize:14, marginBottom:8, textTransform:"capitalize"}}>
                      {group}
                    </div>
                    <div style={{display:"flex", flexWrap:"wrap", gap:10}}>
                      {Object.entries(perms).map(([key, label])=>(
                        <label key={key} style={{display:"inline-flex", alignItems:"center", gap:6, fontSize:13}}>
                          <input
                            type="checkbox"
                            checked={Boolean(permissions[group]?.[key])}
                            onChange={()=>onToggle(group, key)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {error && <div style={{color:"#b91c1c", fontSize:13}}>{error}</div>}
            {message && <div style={{color:"#16a34a", fontSize:13}}>{message}</div>}
            <div style={{display:"flex", gap:10}}>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? "Guardando..." : "Guardar rol"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={onNewRole}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
