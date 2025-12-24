import { useEffect, useState } from "react";
import { request } from "../../api";
import { RUBROS, CONDICION } from "./materialOptions";
import { logMovement } from "../../lib/movements";
import { fetchClientList, fetchWorkOrdersByClient } from "../../lib/workOrders";

const buildInitialForm = () => ({
  Descripcion:'', Cantidad:'', Unidad:'', Rubro:'', Marca:'', Material:'',
  'Ubicacion Fisica / Coordenadas':'', Proveedor:'', Comprador:'',
  Observaciones:'', Condicion:CONDICION[0], Obra:'Stock', Fecha: new Date().toISOString().slice(0,10)
});

export default function NewMaterial(){
  const [form, setForm] = useState(buildInitialForm());
  const [msg,setMsg]=useState('');
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState("");
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientError, setClientError] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [workOrders, setWorkOrders] = useState([]);
  const [workOrdersLoading, setWorkOrdersLoading] = useState(false);
  const [workOrdersError, setWorkOrdersError] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [isStock, setIsStock] = useState(true);
  const set = (k,v)=> setForm(s=>({...s,[k]:v}));

  const fetchUsers = async () => {
    setUsersError("");
    try {
      const data = await request("/users/minimal");
      if (Array.isArray(data)) {
        const sorted = data
          .map((u) => ({
            id: u.id,
            label: u.displayName || u.username || u.id
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setUsers(sorted);
      } else {
        setUsers([]);
      }
    } catch (err) {
      setUsers([]);
      setUsersError(err.message);
    }
  };

  useEffect(() => {
    fetchUsers();
    refreshClients();
  }, []);

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

  const handleSelectClient = (value) => {
    setSelectedClient(value);
    set('Obra', "");
    refreshWorkOrders(value);
  };

  const handleSelectWorkOrder = (value) => {
    setSelectedWorkOrderId(value);
    const found = workOrders.find((ot) => ot.id === value);
    set('Obra', found?.label || "");
  };

  const handleModeChange = (mode) => {
    const toStock = mode === "stock";
    setIsStock(toStock);
    if (toStock) {
      setSelectedClient("");
      setSelectedWorkOrderId("");
      setWorkOrders([]);
      set('Obra', "Stock");
    } else {
      set('Obra', "");
    }
  };

  const submit = async (e)=>{
    e.preventDefault(); setMsg('');
    try{
      const obraValue = isStock ? "Stock" : form.Obra;
      const payload = {
        ...form,
        Obra: obraValue,
        Cantidad: form.Cantidad === '' ? 0 : Number(form.Cantidad)
      };
      const created = await request('/materials',{ method:'POST', body: payload });
      setMsg('Guardado con exito.');
      setForm(buildInitialForm());
      setSelectedClient("");
      setSelectedWorkOrderId("");
      setWorkOrders([]);
      setIsStock(true);
      set('Obra', "Stock");
      logMovement({
        entity: "materials",
        action: "create",
        summary: `Ingresaste el material "${form.Descripcion || 'Sin nombre'}"`,
        payload: { ...payload, id: created?.id },
        metadata: { entityId: created?.id }
      });
    }catch(e){ setMsg('Error: '+e.message); }
  };

  return (
    <>
      <h2 style={{margin:'0 0 12px'}}>Ingresar material</h2>
      <div className="card">
        <form onSubmit={submit} className="grid g-3">
          <div><label>Descripcion</label><input className="input" value={form.Descripcion} onChange={e=>set('Descripcion', e.target.value)} required/></div>
          <div>
            <label>Cantidad</label>
            <input
              className="input"
              type="number"
              value={form.Cantidad}
              onChange={e=>{
                const value = e.target.value;
                set('Cantidad', value === '' ? '' : Number(value));
              }}
            />
          </div>
          <div><label>Unidad (opcional)</label><input className="input" value={form.Unidad} onChange={e=>set('Unidad', e.target.value)} /></div>
          <div>
            <label>Rubro</label>
            <select
              className="input"
              value={form.Rubro}
              onChange={e=>set('Rubro', e.target.value)}
              required
            >
              <option value="">Seleccionar rubro</option>
              {RUBROS.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div><label>Marca</label><input className="input" value={form.Marca} onChange={e=>set('Marca', e.target.value)}/></div>
          <div><label>Material</label><input className="input" value={form.Material} onChange={e=>set('Material', e.target.value)}/></div>
          <div><label>Ubicacion / Coordenadas</label><input className="input" value={form['Ubicacion Fisica / Coordenadas']} onChange={e=>set('Ubicacion Fisica / Coordenadas', e.target.value)}/></div>
          <div><label>Proveedor</label><input className="input" value={form.Proveedor} onChange={e=>set('Proveedor', e.target.value)}/></div>
          <div>
            <label>Comprador</label>
            <input
              className="input"
              list="comprador-options"
              value={form.Comprador}
              onChange={e=>set('Comprador', e.target.value)}
              placeholder="Selecciona o escribe"
            />
            <datalist id="comprador-options">
              {users.map((u) => (
                <option key={u.id} value={u.label}>{u.label}</option>
              ))}
            </datalist>
            {usersError && <small style={{ color: "#b91c1c" }}>{usersError}</small>}
          </div>
          <div><label>Condicion</label><select className="input" value={form.Condicion} onChange={e=>set('Condicion', e.target.value)}>{CONDICION.map(r=><option key={r}>{r}</option>)}</select></div>
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
          <div><label>Fecha</label><input className="input" type="date" value={form.Fecha} onChange={e=>set('Fecha', e.target.value)}/></div>
          <div style={{gridColumn:'1 / -1'}}><label>Observaciones</label><textarea className="input" value={form.Observaciones} onChange={e=>set('Observaciones', e.target.value)} /></div>
          <div style={{gridColumn:'1 / -1',display:'flex',gap:10}}>
            <button className="btn btn-primary">Guardar</button>{msg && <div style={{alignSelf:'center'}}>{msg}</div>}
          </div>
        </form>
      </div>
    </>
  );
}
