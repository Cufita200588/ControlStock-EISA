import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import NewMaterial from "./pages/stock/NewMaterial.jsx";
import Inventory from "./pages/stock/Inventory.jsx";
import MaterialDetail from "./pages/stock/MaterialDetail.jsx";
import MaterialEgress from "./pages/stock/MaterialEgress.jsx";
import NewTool from "./pages/tools/NewTool.jsx";
import ToolsList from "./pages/tools/ToolsList.jsx";
import ToolDetail from "./pages/tools/ToolDetail.jsx";
import ToolMovement from "./pages/tools/ToolMovement.jsx";
import Movements from "./pages/movements/Movements.jsx";
import Users from "./pages/admin/Users.jsx";
import Roles from "./pages/admin/Roles.jsx";
import HoursEntry from "./pages/timesheets/HoursEntry.jsx";
import HoursInventory from "./pages/timesheets/HoursInventory.jsx";
import HoursSummary from "./pages/timesheets/HoursSummary.jsx";
import ManageWorkOrders from "./pages/timesheets/ManageWorkOrders.jsx";
import { useEffect, useState } from "react";
import { getUserFromToken, userHasPermission, userIsAdmin } from "./auth";
import { hasHoursManagerRole } from "./lib/roles";

export default function App(){
  const [authed, setAuthed] = useState(!!localStorage.getItem('token'));

  useEffect(()=>{
    const handler = () => setAuthed(!!localStorage.getItem('token'));
    window.addEventListener('storage', handler);
    return ()=>window.removeEventListener('storage', handler);
  },[]);

  if (!authed) return <Login onLogin={()=>setAuthed(true)} />;

  const currentUser = getUserFromToken();
  const currentRoles = Array.isArray(currentUser?.roles) ? currentUser.roles : [];

  const requirePerm = (perm, element) =>
    userHasPermission(perm) ? element : <Navigate to="/" replace />;
  const requireAdmin = (element) =>
    userIsAdmin() ? element : <Navigate to="/" replace />;
  const requireWorkOrderManager = (element) => {
    const canManageTimesheets = userHasPermission('timesheets.manage', currentUser);
    const canManageHourWorkOrders = userHasPermission('hours.workorders', currentUser);
    const isAdminUser = userIsAdmin(currentUser);
    if (isAdminUser || canManageTimesheets || canManageHourWorkOrders || hasHoursManagerRole(currentRoles)) {
      return element;
    }
    return <Navigate to="/" replace />;
  };

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard/>} />
        <Route path="/stock/nuevo" element={requirePerm('materials.create', <NewMaterial/>)} />
        <Route path="/stock/inventario" element={requirePerm('materials.read', <Inventory/>)} />
        <Route path="/stock/egreso" element={requirePerm('materials.update', <MaterialEgress/>)} />
        <Route path="/stock/materiales/:id" element={requirePerm('materials.read', <MaterialDetail/>)} />
        <Route path="/tools/nueva" element={requirePerm('tools.create', <NewTool/>)} />
        <Route path="/tools/lista" element={requirePerm('tools.read', <ToolsList/>)} />
        <Route path="/tools/movimiento" element={requirePerm('tools.read', <ToolMovement/>)} />
        <Route path="/tools/:id" element={requirePerm('tools.read', <ToolDetail/>)} />
        <Route path="/movimientos" element={requireAdmin(<Movements/>)} />
        <Route path="/admin/usuarios" element={requirePerm('users.manage', <Users/>)} />
        <Route path="/admin/roles" element={requirePerm('roles.manage', <Roles/>)} />
        <Route path="/horas/carga" element={requirePerm('timesheets.submit', <HoursEntry/>)} />
        <Route path="/horas/inventario" element={requirePerm('timesheets.read', <HoursInventory/>)} />
        <Route path="/horas/usuarios" element={requirePerm('timesheets.read', <HoursSummary/>)} />
        <Route path="/horas/ordenes" element={requireWorkOrderManager(<ManageWorkOrders />)} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
