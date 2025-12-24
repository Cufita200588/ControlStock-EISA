import { NavLink } from "react-router-dom";
import { getUserFromToken, userHasPermission, userIsAdmin } from "../auth";
import { hasHoursManagerRole } from "../lib/roles";

export default function Sidebar(){
  const user = getUserFromToken();
  const roles = user?.roles || [];
  const canCreateMaterials = userHasPermission('materials.create', user);
  const canReadMaterials = userHasPermission('materials.read', user);
  const canUpdateMaterials = userHasPermission('materials.update', user);
  const canCreateTools = userHasPermission('tools.create', user);
  const canReadTools = userHasPermission('tools.read', user);
  const canSubmitHours = userHasPermission('timesheets.submit', user);
  const canReadHours = userHasPermission('timesheets.read', user);
  const canManageTimesheets = userHasPermission('timesheets.manage', user);
  const canManageHourWorkOrders = userHasPermission('hours.workorders', user);
  const canManageUsers = userHasPermission('users.manage', user);
  const canManageRoles = userHasPermission('roles.manage', user);
  const isAdmin = userIsAdmin(user);
  const canManageWorkOrders = isAdmin || canManageTimesheets || canManageHourWorkOrders || hasHoursManagerRole(roles);
  const showAdmin = canManageUsers || canManageRoles || isAdmin;

  const logoSrc = `${import.meta.env.BASE_URL || "/"}logo.JPG`;
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={logoSrc} alt="logo" />
        <div>Echevarria S.A</div>
      </div>

      <div className="sidegroup">
        <div className="sidegroup-title">General</div>
        <NavLink to="/" className={({isActive})=>`navlink ${isActive?'active':''}`}>Inicio</NavLink>
        {isAdmin && (
          <NavLink to="/movimientos" className={({isActive})=>`navlink ${isActive?'active':''}`}>Movimientos</NavLink>
        )}
      </div>

      {(canCreateMaterials || canReadMaterials) && (
      <div className="sidegroup">
        <div className="sidegroup-title">Stock</div>
        {canCreateMaterials && (
          <NavLink to="/stock/nuevo" className={({isActive})=>`navlink ${isActive?'active':''}`}>Ingresar material</NavLink>
        )}
        {canReadMaterials && (
          <NavLink to="/stock/egreso" className={({isActive})=>`navlink ${isActive?'active':''}`}>Egreso de material</NavLink>
        )}
        {canReadMaterials && (
          <NavLink to="/stock/inventario" className={({isActive})=>`navlink ${isActive?'active':''}`}>Inventario materiales</NavLink>
        )}
      </div>
      )}

      {(canCreateTools || canReadTools) && (
        <div className="sidegroup">
          <div className="sidegroup-title">Herramientas</div>
          {canCreateTools && (
            <NavLink to="/tools/nueva" className={({isActive})=>`navlink ${isActive?'active':''}`}>Ingresar herramienta</NavLink>
          )}
          {canReadTools && (
            <NavLink to="/tools/movimiento" className={({isActive})=>`navlink ${isActive?'active':''}`}>Movimiento de herramienta</NavLink>
          )}
          {canReadTools && (
            <NavLink to="/tools/lista" className={({isActive})=>`navlink ${isActive?'active':''}`}>Inventario herramientas</NavLink>
          )}
        </div>
      )}

      {(canSubmitHours || canReadHours) && (
        <div className="sidegroup">
          <div className="sidegroup-title">Horas</div>
          {canSubmitHours && (
            <NavLink to="/horas/carga" className={({isActive})=>`navlink ${isActive?'active':''}`}>
              Carga Horaria
            </NavLink>
          )}
          {canManageWorkOrders && (
            <NavLink to="/horas/ordenes" className={({isActive})=>`navlink ${isActive?'active':''}`}>
              Gestionar OT
            </NavLink>
          )}
          {canReadHours && (
            <>
              <NavLink to="/horas/inventario" className={({isActive})=>`navlink ${isActive?'active':''}`}>
                Inventario General horas
              </NavLink>
              <NavLink to="/horas/usuarios" className={({isActive})=>`navlink ${isActive?'active':''}`}>
                Horas Trabajadas
              </NavLink>
            </>
          )}
        </div>
      )}

      {showAdmin && (
        <div className="sidegroup">
          <div className="sidegroup-title">Admin</div>
          {canManageUsers && (
            <NavLink to="/admin/usuarios" className={({isActive})=>`navlink ${isActive?'active':''}`}>Gestion usuarios</NavLink>
          )}
          {canManageRoles && (
            <NavLink to="/admin/roles" className={({isActive})=>`navlink ${isActive?'active':''}`}>Gestion roles</NavLink>
          )}
        </div>
      )}
    </aside>
  );
}
