import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import { getUserFromToken, clearToken } from "../auth";
import { setToken } from "../api";
import { sanitizeText } from "../lib/text";
import { getAvatarForUser } from "../lib/avatarStore";

export default function Layout({children}){
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    if (typeof window === "undefined") return !isHome;
    return !isHome && window.innerWidth > 1024;
  });
  const user = getUserFromToken();
  const displayName = sanitizeText(user?.displayName || user?.username || 'Usuario');
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U';
  const roleLabel = (user?.roles?.[0] || '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
  const menuRef = useRef(null);
  const [avatarUrl, setAvatarUrl] = useState(() => (user?.uid ? getAvatarForUser(user.uid) : ''));

  useEffect(() => {
    const handler = (evt) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(evt.target)) setMenuOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    if (isHome) {
      setSidebarVisible(false);
      return;
    }
    if (typeof window !== "undefined" && window.innerWidth > 1024) {
      setSidebarVisible(true);
    }
  }, [isHome]);

  useEffect(() => {
    const onResize = () => {
      if (!isHome && window.innerWidth > 1024) setSidebarVisible(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isHome]);

  useEffect(() => {
    if (!user?.uid) {
      setAvatarUrl('');
      return;
    }
    setAvatarUrl(getAvatarForUser(user.uid));
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const handler = (evt) => {
      if (!evt.detail?.userId || evt.detail.userId === user.uid) {
        setAvatarUrl(getAvatarForUser(user.uid));
      }
    };
    window.addEventListener('avatars-updated', handler);
    return () => window.removeEventListener('avatars-updated', handler);
  }, [user?.uid]);

  useEffect(() => {
    if (typeof window === "undefined" || !user?.uid) return;
    const onStorage = (evt) => {
      if (evt.key === 'userAvatars') {
        setAvatarUrl(getAvatarForUser(user.uid));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user?.uid]);

  useEffect(() => {
    const onKeyDown = (evt) => {
      if (evt.key !== "Escape") return;
      evt.preventDefault();
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      if (isHome && sidebarVisible) {
        setSidebarVisible(false);
        return;
      }
      const canGoBack = window.history?.state?.idx > 0;
      if (canGoBack) {
        navigate(-1);
      } else if (!isHome) {
        navigate('/');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, isHome, menuOpen, sidebarVisible]);

  const toggleMenu = () => setMenuOpen((prev) => !prev);

  const logout = () => {
    setToken('');
    clearToken();
    setMenuOpen(false);
    navigate('/');
    window.location.reload();
  };

  const goBack = () => {
    const canGoBack = window.history?.state?.idx > 0;
    if (canGoBack) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const appClass = [
    'app',
    sidebarVisible ? 'sidebar-open' : 'sidebar-hidden',
    isHome ? 'is-home' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={appClass}>
      {sidebarVisible && <Sidebar/>}
      <main className="main">
        <div className="topbar">
          {isHome && (
            <button className="sidebar-toggle" onClick={()=>setSidebarVisible((v)=>!v)}>
              <span className="toggle-icon" aria-hidden="true">&#9776;</span>
              Menu principal
            </button>
          )}
          <div className="user-menu" ref={menuRef}>
            <button className="user-button" onClick={toggleMenu}>
              <span className={`user-avatar${avatarUrl ? ' has-image' : ''}`} aria-hidden="true">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={`Avatar de ${displayName}`} />
                ) : (
                  initials
                )}
              </span>
              <span className="user-details">
                <span className="user-name">{displayName}</span>
                {roleLabel && <span className="user-role">{roleLabel}</span>}
              </span>
              <span className="user-caret" aria-hidden="true">v</span>
            </button>
            {menuOpen && (
              <div className="user-dropdown">
                <button onClick={logout}>Cerrar sesion</button>
              </div>
            )}
          </div>
        </div>
        {!isHome && (
          <button className="back-button" onClick={goBack}>
            <span aria-hidden="true">&#8592;</span>
            Volver
          </button>
        )}
        <div className="container">{children}</div>
      </main>
    </div>
  );
}
