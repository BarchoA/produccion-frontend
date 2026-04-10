import { useAuth } from "../context/AuthContext";

const MENU_ITEMS = [
  { key: "dashboard",  label: "Dashboard",     icon: "📊", visible: (isAdmin) => isAdmin },
  { key: "kanban",     label: "Producción",    icon: "🏭", visible: () => true           },
  { key: "create",     label: "Crear orden",   icon: "➕", visible: (isAdmin) => isAdmin },
  { key: "envios",     label: "Envíos",        icon: "🚚", visible: (isAdmin) => isAdmin },
  { key: "clientes",   label: "Clientes",      icon: "👥", visible: (isAdmin) => isAdmin },
  { key: "inventario", label: "Inventario",    icon: "📦", visible: (isAdmin) => isAdmin },
  { key: "finanzas",   label: "Finanzas",      icon: "💰", visible: (isAdmin) => isAdmin },
  
];

const VIEW_TITLES = {
  dashboard:  { title: "Dashboard",    sub: "Resumen operativo y financiero"           },
  kanban:     { title: "Producción",   sub: "Tablero de órdenes en producción"         },
  create:     { title: "Nueva orden",  sub: "Crear orden desde PDF de cotización"      },
  envios:     { title: "Envíos",       sub: "Tracking y estado de envíos"             },
  clientes:   { title: "Clientes",     sub: "Base de clientes e historial"            },
  inventario: { title: "Inventario",   sub: "Stock, costos e historial por variante"  },
  finanzas:   { title: "Finanzas",     sub: "Rentabilidad, costos y exportación"      },
};

function getRoleLabel(rol) {
  return { admin: "Administrador", operario: "Operario", lectura: "Solo lectura" }[rol] || "Usuario";
}

function getRoleColor(rol) {
  return { admin: "#10b981", operario: "#f59e0b", lectura: "#6366f1" }[rol] || "#94a3b8";
}

export default function Layout({ currentView, setCurrentView, children }) {
  const { profile, signOut } = useAuth();
  const isAdmin    = profile?.rol === "admin";
  const isOperario = profile?.rol === "operario";

  const visibleItems = MENU_ITEMS.filter(item => item.visible(isAdmin, isOperario));
  const viewInfo     = VIEW_TITLES[currentView] || { title: "Sistema", sub: "Panel operativo" };
  const roleColor    = getRoleColor(profile?.rol);
  const roleLabel    = getRoleLabel(profile?.rol);

  return (
    <div style={S.shell}>

      {/* ── Sidebar ── */}
      <aside style={S.sidebar}>

        {/* Logo */}
        <div style={S.logo}>
          <div style={S.logoIcon}>⚙️</div>
          <div>
            <h1 style={S.logoTitle}>Producción</h1>
            <p style={S.logoSub}>Panel operativo</p>
          </div>
        </div>

        {/* Nav */}
        <nav style={S.nav}>
          <p style={S.navSectionLabel}>MÓDULOS</p>
          {visibleItems.map(item => {
            const active = currentView === item.key;
            return (
              <button key={item.key} onClick={() => setCurrentView(item.key)}
                style={{ ...S.navItem, ...(active ? S.navItemActive : {}) }}>
                <span style={S.navIcon}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {active && <span style={S.navActiveDot} />}
              </button>
            );
          })}
        </nav>

        {/* User card */}
        <div style={S.userCard}>
          <div style={S.userAvatar}>
            {(profile?.nombre || "U").charAt(0).toUpperCase()}
          </div>
          <div style={S.userInfo}>
            <p style={S.userName}>{profile?.nombre || "Usuario"}</p>
            <span style={{ ...S.userRole, background: roleColor + "20", color: roleColor }}>
              {roleLabel}
            </span>
          </div>
          <button onClick={signOut} style={S.signOutBtn} title="Cerrar sesión">⇠</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={S.main}>
        <header style={S.header}>
          <div>
            <h2 style={S.headerTitle}>{viewInfo.title}</h2>
            <p style={S.headerSub}>{viewInfo.sub}</p>
          </div>
          <div style={{ ...S.rolePill, background: roleColor + "15", color: roleColor, border: `1px solid ${roleColor}33` }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: roleColor, flexShrink: 0 }} />
            {roleLabel}
          </div>
        </header>

        <main style={S.content}>{children}</main>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        body { margin: 0; }
        button { cursor: pointer; }
        a { text-decoration: none; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 40px; }
      `}</style>
    </div>
  );
}

const S = {
  shell:        { display: "flex", minHeight: "100vh", background: "#f8fafc", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#1e293b" },
  sidebar:      { width: "240px", flexShrink: 0, background: "#0f172a", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflowY: "auto" },
  logo:         { display: "flex", alignItems: "center", gap: "12px", padding: "24px 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  logoIcon:     { width: "36px", height: "36px", background: "rgba(99,102,241,0.2)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" },
  logoTitle:    { fontSize: "16px", fontWeight: 800, color: "white", margin: 0, letterSpacing: "-0.3px" },
  logoSub:      { fontSize: "11px", color: "#475569", margin: "2px 0 0" },
  nav:          { flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: "2px" },
  navSectionLabel: { fontSize: "9px", fontWeight: 700, color: "#475569", letterSpacing: "1.5px", padding: "0 8px", margin: "0 0 8px" },
  navItem:      { display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", border: "none", background: "transparent", color: "#64748b", fontSize: "13px", fontWeight: 500, fontFamily: "inherit", textAlign: "left", width: "100%", transition: "all 0.15s", position: "relative" },
  navItemActive:{ background: "rgba(99,102,241,0.15)", color: "white", fontWeight: 700 },
  navIcon:      { fontSize: "16px", flexShrink: 0, width: "20px", textAlign: "center" },
  navActiveDot: { width: "6px", height: "6px", borderRadius: "50%", background: "#6366f1", flexShrink: 0 },
  userCard:     { display: "flex", alignItems: "center", gap: "10px", padding: "16px 16px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" },
  userAvatar:   { width: "34px", height: "34px", borderRadius: "10px", background: "rgba(99,102,241,0.25)", color: "#a5b4fc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 800, flexShrink: 0 },
  userInfo:     { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" },
  userName:     { fontSize: "13px", fontWeight: 700, color: "white", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  userRole:     { fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "40px", display: "inline-block" },
  signOutBtn:   { width: "30px", height: "30px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748b", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "inherit" },
  main:         { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  header:       { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 32px", background: "white", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 10 },
  headerTitle:  { fontSize: "22px", fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.5px" },
  headerSub:    { fontSize: "13px", color: "#94a3b8", margin: "3px 0 0" },
  rolePill:     { display: "flex", alignItems: "center", gap: "7px", padding: "7px 14px", borderRadius: "40px", fontSize: "12px", fontWeight: 700 },
  content:      { flex: 1, padding: "28px 32px", overflowY: "auto" },
};
