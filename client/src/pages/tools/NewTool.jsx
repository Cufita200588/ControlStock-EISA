import { useState } from "react";
import { request } from "../../api";
import { ESTADOS } from "./toolOptions";
import { logMovement } from "../../lib/movements";

const buildInitialForm = () => ({
  Nombre:'', 'Fecha de compra':'', 'Numero Interno':'',
  'Ubicacion / Coordenada':'', 'Designacion Generica':'',
  Descripcion:'', Marca:'', Modelo:'', Proveedor:'',
  Estado: ESTADOS[0], Observaciones:''
});

export default function NewTool(){
  const [form, setForm] = useState(buildInitialForm());
  const [msg,setMsg]=useState('');
  const set=(k,v)=>setForm(s=>({...s,[k]:v}));

  const submit=async(e)=>{
    e.preventDefault(); setMsg('');
    try{
      const created = await request('/tools',{ method:'POST', body: form });
      setMsg('Guardado con exito.');
      setForm(buildInitialForm());
      logMovement({
        entity: "tools",
        action: "create",
        summary: `Ingresaste la herramienta "${form.Nombre || 'Sin nombre'}"`,
        payload: { ...form, id: created?.id },
        metadata: { entityId: created?.id }
      });
    }
    catch(e){ setMsg('Error: '+e.message); }
  };

  return (
    <>
      <h2 style={{margin:'0 0 12px'}}>Ingresar herramienta</h2>
      <div className="card">
        <form onSubmit={submit} className="grid g-3">
          <div><label>Nombre</label><input className="input" value={form.Nombre} onChange={e=>set('Nombre',e.target.value)} required/></div>
          <div><label>Fecha de compra</label><input className="input" type="date" value={form['Fecha de compra']} onChange={e=>set('Fecha de compra',e.target.value)}/></div>
          <div><label>Numero Interno</label><input className="input" value={form['Numero Interno']} onChange={e=>set('Numero Interno',e.target.value)}/></div>
          <div><label>Ubicacion / Coordenada</label><input className="input" value={form['Ubicacion / Coordenada']} onChange={e=>set('Ubicacion / Coordenada',e.target.value)}/></div>
          <div><label>Designacion Generica</label><input className="input" value={form['Designacion Generica']} onChange={e=>set('Designacion Generica',e.target.value)}/></div>
          <div><label>Proveedor</label><input className="input" value={form.Proveedor} onChange={e=>set('Proveedor',e.target.value)}/></div>
          <div><label>Marca</label><input className="input" value={form.Marca} onChange={e=>set('Marca',e.target.value)}/></div>
          <div><label>Modelo</label><input className="input" value={form.Modelo} onChange={e=>set('Modelo',e.target.value)}/></div>
          <div><label>Estado</label><select className="input" value={form.Estado} onChange={e=>set('Estado', e.target.value)}>{ESTADOS.map(s=><option key={s}>{s}</option>)}</select></div>
          <div style={{gridColumn:'1 / -1'}}><label>Descripcion</label><textarea className="input" value={form.Descripcion} onChange={e=>set('Descripcion',e.target.value)}/></div>
          <div style={{gridColumn:'1 / -1',display:'flex',gap:10}}>
            <button className="btn btn-primary">Guardar</button>{msg && <div style={{alignSelf:'center'}}>{msg}</div>}
          </div>
        </form>
      </div>
    </>
  );
}
