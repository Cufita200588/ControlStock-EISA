import { useMemo } from "react";
import { Link } from "react-router-dom";
import { getUserFromToken, userHasPermission, userIsAdmin } from "../auth";

const actions = [
  {
    key: "materials.new",
    label: "Ingresar material",
    description: "Registra un ingreso de stock",
    path: "/stock/nuevo",
    perm: "materials.create",
    section: "Stock"
  },
  {
    key: "materials.egress",
    label: "Egreso de material",
    description: "Registra salidas y devoluciones de stock",
    path: "/stock/egreso",
    perm: "materials.update",
    section: "Stock"
  },
  {
    key: "tools.new",
    label: "Ingresar herramienta",
    description: "Carga herramientas nuevas",
    path: "/tools/nueva",
    perm: "tools.create",
    section: "Herramientas"
  },
  {
    key: "tools.movement",
    label: "Movimiento de herramienta",
    description: "Gestiona prestamos y devoluciones",
    path: "/tools/movimiento",
    perm: "tools.read",
    section: "Herramientas"
  },
  {
    key: "hours.entry",
    label: "Carga Horaria",
    description: "Registra horas trabajadas",
    path: "/horas/carga",
    perm: "timesheets.submit",
    section: "Horas"
  },
  {
    key: "hours.inventory",
    label: "Inventario General horas",
    description: "Revisa las horas de los equipos",
    path: "/horas/inventario",
    perm: "timesheets.read",
    section: "Horas"
  },
  {
    key: "hours.summary",
    label: "Horas Trabajadas",
    description: "Consulta el resumen por usuario",
    path: "/horas/usuarios",
    perm: "timesheets.read",
    section: "Horas"
  },
  {
    key: "admin.users",
    label: "Gestion usuarios",
    description: "Crea o edita perfiles",
    path: "/admin/usuarios",
    perm: "users.manage",
    section: "Administracion"
  },
  {
    key: "admin.roles",
    label: "Gestion roles",
    description: "Configura permisos y roles",
    path: "/admin/roles",
    perm: "roles.manage",
    section: "Administracion"
  },
  {
    key: "movements",
    label: "Movimientos",
    description: "Audita movimientos criticos",
    path: "/movimientos",
    perm: "admin",
    section: "Administracion"
  }
];

const sectionOrder = ["Stock", "Herramientas", "Horas", "Administracion"];
const sectionItemOrder = {
  Stock: ["materials.new", "materials.egress"],
  Herramientas: ["tools.new", "tools.movement"]
};

export default function Dashboard(){
  const user = getUserFromToken();
  const { sections, displayName } = useMemo(() => {
    const hasMaterialsRead = userHasPermission("materials.read", user);
    const hasMaterialsCreate = userHasPermission("materials.create", user);
    const hasMaterialsUpdate = userHasPermission("materials.update", user);
    const hasToolsRead = userHasPermission("tools.read", user);
    const hasToolsCreate = userHasPermission("tools.create", user);
    const baseKeys = new Set([
      "materials.egress",
      "tools.movement",
      "hours.inventory",
      "hours.summary",
      "hours.entry"
    ]);
    const allowed = actions
      .filter(({ perm }) => (perm === "admin" ? userIsAdmin(user) : userHasPermission(perm, user)))
      .filter((action) => {
        if (baseKeys.has(action.key)) return true;
        if (action.key === "materials.new") return hasMaterialsCreate && !hasMaterialsRead;
        if (action.key === "materials.egress") return hasMaterialsUpdate || hasMaterialsRead;
        if (action.key === "tools.new") return hasToolsCreate && !hasToolsRead;
        return false;
      });

    const grouped = allowed.reduce((acc, action) => {
      const key = action.section || "General";
      acc[key] = acc[key] || [];
      acc[key].push(action);
      return acc;
    }, {});

    const orderedSections = Object.entries(grouped)
      .sort((a, b) => {
        const ai = sectionOrder.indexOf(a[0]);
        const bi = sectionOrder.indexOf(b[0]);
        if (ai === -1 && bi === -1) return a[0].localeCompare(b[0]);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
      .map(([name, items]) => {
        const order = sectionItemOrder[name];
        const sortedItems = order
          ? [...items].sort((a, b) => {
              const ai = order.indexOf(a.key);
              const bi = order.indexOf(b.key);
              const safeAi = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
              const safeBi = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
              return safeAi - safeBi || a.label.localeCompare(b.label);
            })
          : [...items].sort((a, b) => a.label.localeCompare(b.label));
        return { name, items: sortedItems };
      });

    return {
      sections: orderedSections,
      displayName: user?.displayName || user?.username || "Usuario"
    };
  }, [user]);

  const firstName = displayName.split(" ")[0];

  return (
    <div className="dashboard">
      <section className="dashboard-hero card">
        <div className="hero-greeting">
          <p className="eyebrow">Inicio</p>
          <h1>Hola {firstName || "bienvenido"}</h1>
        </div>
      </section>

      {sections.length ? (
        <div className="dashboard-sections">
          {sections.map((section) => (
            <section key={section.name} className="dashboard-section">
              <h2 className="section-title">{section.name}</h2>
              <div className="action-grid">
                {section.items.map((item) => (
                  <Link key={item.key} to={item.path} className="action-card">
                    <div className="action-card-body">
                      <h3>{item.label}</h3>
                    </div>
                    <span aria-hidden="true" className="action-arrow">&gt;</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="card empty-state">
          No tenes permisos asignados. Contacta al administrador.
        </div>
      )}
    </div>
  );
}
