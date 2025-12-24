import { useEffect, useState } from "react";
import { request, setToken } from "../api";

export default function Login({ onLogin }){
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [err,setErr] = useState("");

  useEffect(() => {
    try{
      const message = sessionStorage.getItem("auth:error");
      if (message) {
        setErr(message);
        sessionStorage.removeItem("auth:error");
      }
    }catch{
      // ignore session storage errors
    }
  }, []);

  const submit = async (e)=>{
    e.preventDefault(); setErr("");
    try{
      const { token } = await request("/auth/login",{ method:"POST", body:{ username, password }});
      setToken(token);
      onLogin?.();
    }catch(error){
      setErr(error.message);
    }
  };

  return (
    <div className="center-page">
      <div className="card login-card">
        <div style={{textAlign:'center', marginBottom:12}}>
          <img src={`${import.meta.env.BASE_URL || "/"}logo.JPG`} alt="logo" style={{height:40}}/>
          <h2 style={{margin:'8px 0'}}>Echevarria S.A</h2>
        </div>
        <form onSubmit={submit} className="grid">
          <div>
            <label>Usuario</label>
            <input
              className="input"
              value={username}
              onChange={e=>setU(e.target.value)}
              placeholder="Ingresa tu usuario"
              autoComplete="username"
            />
          </div>
          <div className="mt-16">
            <label>Contrasena</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e=>setP(e.target.value)}
              placeholder="Ingresa tu contraseña"
              autoComplete="current-password"
            />
          </div>
          {err && <div style={{color:'#b91c1c',marginTop:8}}>{err}</div>}
          <button className="btn btn-primary mt-16">Ingresar</button>
        </form>
      </div>
    </div>
  );
}
