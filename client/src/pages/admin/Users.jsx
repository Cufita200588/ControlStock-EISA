import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { request } from "../../api";
import { getUserFromToken } from "../../auth";
import { sanitizeText } from "../../lib/text";
import {
  getAvatarForUser,
  saveAvatarForUser,
  removeAvatarForUser,
  mergeUsersWithAvatars
} from "../../lib/avatarStore";

const emptyForm = {
  id: null,
  username: "",
  displayName: "",
  password: "",
  roles: [],
  avatarUrl: ""
};

const getInitials = (name = "", username = "") => {
  const source = name || username;
  return source
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "US";
};

export default function Users() {
  const currentUser = getUserFromToken();
  const isAdmin = useMemo(() => (currentUser?.roles || []).includes("admin"), [currentUser]);

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchData = async () => {
      setLoading(true);
      setError("");
      try {
        const [usersRes, rolesRes] = await Promise.all([
          request("/users"),
          request("/roles")
        ]);
        setUsers(mergeUsersWithAvatars(usersRes));
        setRoles(rolesRes || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isAdmin]);

  const resetForm = () => {
    setForm({ ...emptyForm });
  };

  const onEdit = (user) => {
    setForm({
      id: user.id,
      username: user.username,
      displayName: user.displayName || "",
      password: "",
      roles: Array.isArray(user.roles) ? user.roles : [],
      avatarUrl: user.avatarUrl || getAvatarForUser(user.id) || ""
    });
  };

  const onDelete = async (user) => {
    if (!window.confirm(`Eliminar usuario "${user.username}"?`)) return;
    setError("");
    try {
      await request(`/users/${user.id}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      removeAvatarForUser(user.id);
      if (form.id === user.id) resetForm();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleRole = (roleName) => {
    setForm((prev) => {
      const has = prev.roles.includes(roleName);
      return {
        ...prev,
        roles: has ? prev.roles.filter((r) => r !== roleName) : [...prev.roles, roleName]
      };
    });
  };

  const removeRole = (roleName) => {
    setForm((prev) => ({
      ...prev,
      roles: prev.roles.filter((r) => r !== roleName)
    }));
  };

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
      reader.readAsDataURL(file);
    });

  const handleAvatarChange = async (event) => {
    const fileInput = event.target;
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("La imagen debe pesar menos de 2 MB");
      fileInput.value = "";
      return;
    }
    try {
      setError("");
      const dataUrl = await fileToDataUrl(file);
      setForm((prev) => ({
        ...prev,
        avatarUrl: dataUrl
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      fileInput.value = "";
    }
  };

  const clearAvatar = () => {
    setForm((prev) => ({
      ...prev,
      avatarUrl: ""
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    const avatarDraft = form.avatarUrl;
    const usernameDraft = form.username;
    const editingId = form.id;
    try {
      if (editingId) {
        const payload = {
          displayName: form.displayName,
          roles: form.roles,
          avatarUrl: avatarDraft || null
        };
        if (form.password) payload.password = form.password;
        await request(`/users/${editingId}`, { method: "PATCH", body: payload });
        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingId
              ? {
                  ...u,
                  displayName: form.displayName,
                  roles: form.roles,
                  avatarUrl: avatarDraft || ""
                }
              : u
          )
        );
        if (avatarDraft) {
          saveAvatarForUser(editingId, avatarDraft);
        } else {
          removeAvatarForUser(editingId);
        }
      } else {
        await request("/users", {
          method: "POST",
          body: {
            username: form.username,
            displayName: form.displayName,
            password: form.password,
            roles: form.roles,
            avatarUrl: avatarDraft || null
          }
        });
        const freshUsers = mergeUsersWithAvatars(await request("/users"));
        if (avatarDraft) {
          const createdUser = freshUsers.find((u) => u.username === usernameDraft);
          if (createdUser?.id) {
            saveAvatarForUser(createdUser.id, avatarDraft);
            createdUser.avatarUrl = avatarDraft;
          }
        }
        setUsers(freshUsers);
      }
      resetForm();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return <Navigate to="/" replace />;

  const availableRoleNames = roles.map((r) => r.name);
  const customRoles = form.roles.filter((r) => !availableRoleNames.includes(r));

  return (
    <>
      <h2 style={{ margin: "0 0 12px" }}>Gestion de usuarios</h2>
      <div className="card" style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 380px", minWidth: 340 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Usuarios</h3>
          </div>
          {loading ? (
            <div style={{ padding: "16px 0" }}>Cargando...</div>
          ) : (
            <table className="table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th>Roles</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const username = sanitizeText(user.username);
                  const name = sanitizeText(user.displayName);
                  const initials = getInitials(name, username);
                  const rolesLabel = (user.roles || []).map(sanitizeText).join(", ");
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="user-avatar-thumb">
                          {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt={`Foto de ${name || username}`} />
                          ) : (
                            <span>{initials}</span>
                          )}
                        </div>
                      </td>
                      <td>{username}</td>
                      <td>{name}</td>
                      <td>{rolesLabel}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn btn-xs" onClick={() => onEdit(user)}>
                          Editar
                        </button>
                        <button
                          className="btn btn-xs btn-danger"
                          style={{ marginLeft: 6 }}
                          onClick={() => onDelete(user)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ flex: "1 1 420px", minWidth: 360 }}>
          <h3 style={{ margin: "0 0 12px" }}>{form.id ? "Editar usuario" : "Nuevo usuario"}</h3>
          <form
            onSubmit={handleSubmit}
            style={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
              alignItems: "start"
            }}
          >
            <div>
              <label>Usuario</label>
              <input
                className="input"
                value={form.username}
                onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                required
                disabled={!!form.id}
              />
            </div>
            <div>
              <label>Nombre completo</label>
              <input
                className="input"
                value={form.displayName}
                onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label>{form.id ? "Contrasena (opcional)" : "Contrasena"}</label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                required={!form.id}
                placeholder={form.id ? "Dejar en blanco para mantener actual" : ""}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Foto de usuario</label>
              <div className="avatar-field">
                <div className="user-avatar-thumb large">
                  {form.avatarUrl ? (
                    <img src={form.avatarUrl} alt={`Foto de ${sanitizeText(form.displayName)}`} />
                  ) : (
                    <span>{getInitials(form.displayName, form.username)}</span>
                  )}
                </div>
                <div className="avatar-actions">
                  <input type="file" accept="image/*" onChange={handleAvatarChange} />
                  {form.avatarUrl && (
                    <button className="btn btn-xs btn-ghost" type="button" onClick={clearAvatar}>
                      Quitar foto
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Roles disponibles</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {availableRoleNames.length === 0 && (
                  <span style={{ fontSize: 13, color: "#6b7280" }}>No hay roles cargados</span>
                )}
                {availableRoleNames.map((name) => {
                  const display = sanitizeText(name);
                  return (
                    <label
                      key={name}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        border: "1px solid #d1d5db",
                        borderRadius: 6,
                        padding: "4px 8px",
                        fontSize: 13
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={form.roles.includes(name)}
                        onChange={() => toggleRole(name)}
                      />
                      {display}
                    </label>
                  );
                })}
              </div>
            </div>
            {customRoles.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label>Roles adicionales</label>
                <div style={{ marginTop: 8, fontSize: 13, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {customRoles.map((roleName) => {
                    const display = sanitizeText(roleName);
                    return (
                      <span
                        key={roleName}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: "#e2e8f0",
                          color: "#1f2937",
                          borderRadius: 999,
                          padding: "4px 10px"
                        }}
                      >
                        {display}
                        <button
                          type="button"
                          onClick={() => removeRole(roleName)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#1f2937",
                            cursor: "pointer",
                            fontSize: 12
                          }}
                          aria-label={`Quitar ${display}`}
                        >
                          x
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {error && (
              <div style={{ color: "#b91c1c", fontSize: 13, gridColumn: "1 / -1" }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, gridColumn: "1 / -1" }}>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? "Guardando..." : form.id ? "Guardar cambios" : "Crear usuario"}
              </button>
              {form.id && (
                <button className="btn btn-ghost" type="button" onClick={resetForm}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
