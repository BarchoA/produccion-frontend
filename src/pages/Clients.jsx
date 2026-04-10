import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const fmt     = v  => `$${Number(v || 0).toFixed(2)}`;
const fmtDate = d  => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtDateTime = d => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const ESTADO_COLOR = {
  "Entregado":   { color: "#16a34a", bg: "#dcfce7", border: "#86efac", icon: "🎉" },
  "En reparto":  { color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", icon: "🚛" },
  "En bodega":   { color: "#0ea5e9", bg: "#f0f9ff", border: "#bae6fd", icon: "🏭" },
  "En tránsito": { color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", icon: "📦" },
};

function initials(nombre) {
  return (nombre || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function Clients() {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === "admin";

  const [clients,        setClients]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDetail,   setClientDetail]   = useState(null);
  const [loadingDetail,  setLoadingDetail]  = useState(false);
  const [view,           setView]           = useState("lista"); // "lista" | "detalle"
  const [filterEstado,   setFilterEstado]   = useState("Todos");
  const [dateFrom,       setDateFrom]       = useState("");
  const [dateTo,         setDateTo]         = useState("");
  const [sortBy,         setSortBy]         = useState("nombre"); // "nombre" | "reciente" | "venta"

  // Para la vista lista completa
  const [allShipments,   setAllShipments]   = useState([]);
  const [loadingAll,     setLoadingAll]     = useState(false);

  useEffect(() => { fetchClients(); }, []);
  useEffect(() => { if (view === "lista") fetchAllShipments(); }, [view]);

  async function fetchClients() {
    try {
      setLoading(true);
      const { data, error } = await supabase.from("clients").select("*").order("nombre");
      if (error) throw error;
      setClients(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function fetchAllShipments() {
    try {
      setLoadingAll(true);
      const { data, error } = await supabase
        .from("shipments")
        .select("*, clients(id, nombre, telefono), orders(id, data_json, pdf_url, total_venta, estado)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAllShipments(data || []);
    } catch (e) { console.error(e); }
    finally { setLoadingAll(false); }
  }

  async function fetchClientDetail(clientId) {
    try {
      setLoadingDetail(true);
      setClientDetail(null);
      const { data, error } = await supabase
        .from("shipments")
        .select("*, orders(id, data_json, pdf_url, estado, prioridad, total_venta, fecha_creacion)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const shipments = data || [];
      const totalVenta   = shipments.reduce((acc, s) => acc + Number(s.orders?.total_venta || 0), 0);
      const entregadas   = shipments.filter(s => s.estado === "Entregado").length;
      setClientDetail({ shipments, totalVenta, ordenes: shipments.length, entregadas });
    } catch (e) { console.error(e); }
    finally { setLoadingDetail(false); }
  }

  function openClient(client) {
    setSelectedClient(client);
    fetchClientDetail(client.id);
  }

  // Clientes filtrados para el panel izquierdo
  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = clients.filter(c =>
      !term || c.nombre?.toLowerCase().includes(term) || c.telefono?.toLowerCase().includes(term)
    );
    if (sortBy === "nombre")   list = [...list].sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    if (sortBy === "reciente") list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }, [clients, search, sortBy]);

  // Envíos filtrados para vista lista
  const filteredShipments = useMemo(() => {
    return allShipments.filter(s => {
      if (filterEstado !== "Todos" && s.estado !== filterEstado) return false;
      if (dateFrom && s.entrega_fecha && s.entrega_fecha < `${dateFrom}T00:00:00`) return false;
      if (dateTo   && s.entrega_fecha && s.entrega_fecha > `${dateTo}T23:59:59`)   return false;
      if (dateFrom && !s.entrega_fecha && filterEstado === "Entregado") return false;
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return (
        s.destinatario?.toLowerCase().includes(term)    ||
        s.guia_numero?.toLowerCase().includes(term)     ||
        s.ciudad_destino?.toLowerCase().includes(term)  ||
        s.clients?.nombre?.toLowerCase().includes(term) ||
        s.orders?.data_json?.order_number?.toLowerCase().includes(term)
      );
    });
  }, [allShipments, filterEstado, dateFrom, dateTo, search]);

  // Stats generales
  const stats = useMemo(() => ({
    total:      clients.length,
    entregados: allShipments.filter(s => s.estado === "Entregado").length,
    enCamino:   allShipments.filter(s => s.estado !== "Entregado").length,
    ventaTotal: allShipments.reduce((acc, s) => acc + Number(s.orders?.total_venta || 0), 0),
  }), [clients, allShipments]);

  if (!isAdmin) return (
    <div style={S.restricted}>
      <span style={{ fontSize: "48px" }}>🔒</span>
      <h3 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Acceso restringido</h3>
    </div>
  );

  return (
    <div style={S.page}>

      {/* Hero */}
      <div style={S.hero}>
        <div>
          <div style={S.heroLabel}>MÓDULO DE CLIENTES</div>
          <h2 style={S.heroTitle}>Clientes</h2>
          <p style={S.heroSub}>Historial de envíos · Tracking · Relación con órdenes y finanzas</p>
        </div>
        <div style={S.heroStats}>
          <HeroStat num={stats.total}                    label="Clientes"     color="#a5b4fc" />
          <HeroStat num={stats.entregados}               label="Entregados"   color="#34d399" />
          <HeroStat num={stats.enCamino}                 label="En camino"    color="#fbbf24" />
          <HeroStat num={fmt(stats.ventaTotal)}          label="Venta total"  color="#94a3b8" />
        </div>
      </div>

      {/* Tabs de vista */}
      <div style={S.viewTabs}>
        <button onClick={() => setView("clientes")} style={{ ...S.viewTab, ...(view === "clientes" ? S.viewTabOn : {}) }}>
          👥 Por cliente
        </button>
        <button onClick={() => setView("lista")} style={{ ...S.viewTab, ...(view === "lista" ? S.viewTabOn : {}) }}>
          📋 Lista completa
        </button>
      </div>

      {/* ── VISTA: POR CLIENTE ── */}
      {view === "clientes" && (
        <div style={S.clientLayout}>

          {/* Panel izquierdo: lista de clientes */}
          <div style={S.leftPanel}>
            {/* Búsqueda y ordenamiento */}
            <div style={S.leftControls}>
              <div style={S.searchWrap}>
                <span style={S.searchIcon}>⌕</span>
                <input type="text" placeholder="Buscar cliente..." value={search}
                  onChange={e => setSearch(e.target.value)} style={S.searchInput} />
              </div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={S.sortSelect}>
                <option value="nombre">A → Z</option>
                <option value="reciente">Más reciente</option>
              </select>
            </div>

            <div style={S.clientCount}>{filteredClients.length} cliente{filteredClients.length !== 1 ? "s" : ""}</div>

            {loading ? (
              <Loading />
            ) : filteredClients.length === 0 ? (
              <div style={S.emptySmall}>
                <span style={{ fontSize: "32px" }}>👥</span>
                <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0, textAlign: "center" }}>
                  {clients.length === 0 ? "Sin clientes aún" : "Sin resultados"}
                </p>
              </div>
            ) : (
              <div style={S.clientList}>
                {filteredClients.map(client => {
                  const isSelected = selectedClient?.id === client.id;
                  return (
                    <button key={client.id} onClick={() => openClient(client)}
                      style={{ ...S.clientItem, ...(isSelected ? S.clientItemOn : {}) }}>
                      <div style={{ ...S.clientAvatar, background: isSelected ? "#6366f1" : "#eef2ff", color: isSelected ? "white" : "#4f46e5" }}>
                        {initials(client.nombre)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "13px", fontWeight: 700, color: isSelected ? "#0f172a" : "#1e293b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {client.nombre}
                        </p>
                        {client.telefono && <p style={{ fontSize: "11px", color: "#94a3b8", margin: "2px 0 0" }}>{client.telefono}</p>}
                      </div>
                      <span style={{ fontSize: "12px", color: "#cbd5e1" }}>›</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Panel derecho: detalle */}
          <div style={S.rightPanel}>
            {!selectedClient ? (
              <div style={S.emptyDetail}>
                <span style={{ fontSize: "56px" }}>👈</span>
                <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>Selecciona un cliente</p>
              </div>
            ) : loadingDetail ? (
              <Loading />
            ) : (
              <ClientDetailPanel client={selectedClient} detail={clientDetail} />
            )}
          </div>
        </div>
      )}

      {/* ── VISTA: LISTA COMPLETA ── */}
      {view === "lista" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Filtros */}
          <div style={S.filtersBar}>
            <div style={S.searchWrap}>
              <span style={S.searchIcon}>⌕</span>
              <input type="text" placeholder="Buscar cliente, guía, ciudad, # orden..."
                value={search} onChange={e => setSearch(e.target.value)} style={S.searchInput} />
            </div>

            <div style={S.filterGroup}>
              <label style={S.filterLabel}>Estado:</label>
              <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={S.filterSelect}>
                {["Todos", "Entregado", "En reparto", "En bodega", "En tránsito"].map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>

            <div style={S.filterGroup}>
              <label style={S.filterLabel}>Entrega desde:</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={S.dateInput} />
            </div>

            <div style={S.filterGroup}>
              <label style={S.filterLabel}>Hasta:</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={S.dateInput} />
            </div>

            {(dateFrom || dateTo || filterEstado !== "Todos" || search) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); setFilterEstado("Todos"); setSearch(""); }} style={S.clearBtn}>
                ✕ Limpiar
              </button>
            )}

            <span style={{ fontSize: "12px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>
              {filteredShipments.length} registro{filteredShipments.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Tabla lista */}
          {loadingAll ? <Loading /> : (
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {["# Orden","Cliente","Destinatario","Ciudad","Guía","Estado envío","Admisión bodega","Reparto","Entrega","Persona recibe","Total orden","Links"].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredShipments.map((s, i) => {
                    const orderNum  = s.orders?.data_json?.order_number || "—";
                    const cfg       = ESTADO_COLOR[s.estado] || ESTADO_COLOR["En tránsito"];
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                        <td style={S.td}><span style={{ fontWeight: 800, color: "#0f172a" }}>#{orderNum}</span></td>
                        <td style={S.td}>
                          <p style={{ fontSize: "13px", fontWeight: 700, margin: 0 }}>{s.clients?.nombre || "—"}</p>
                          {s.clients?.telefono && <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>{s.clients.telefono}</p>}
                        </td>
                        <td style={S.td}>{s.destinatario || "—"}</td>
                        <td style={S.td}>{s.ciudad_destino || "—"}</td>
                        <td style={{ ...S.td, fontFamily: "monospace", fontSize: "11px" }}>{s.guia_numero || "—"}</td>
                        <td style={S.td}>
                          <span style={{ ...S.estadoBadge, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                            {cfg.icon} {s.estado}
                          </span>
                        </td>
                        <td style={S.td}>{fmtDate(s.admision_fecha)}</td>
                        <td style={S.td}>{s.reparto_fecha ? <><span>{fmtDate(s.reparto_fecha)}</span><br/><span style={{ fontSize: "10px", color: "#94a3b8" }}>{s.reparto_lugar}</span></> : "—"}</td>
                        <td style={{ ...S.td, color: s.entrega_fecha ? "#16a34a" : "#94a3b8", fontWeight: s.entrega_fecha ? 700 : 400 }}>
                          {fmtDateTime(s.entrega_fecha)}
                        </td>
                        <td style={S.td}>{s.entrega_persona || "—"}</td>
                        <td style={{ ...S.td, color: "#10b981", fontWeight: 700 }}>{fmt(s.orders?.total_venta)}</td>
                        <td style={S.td}>
                          <div style={{ display: "flex", gap: "4px" }}>
                            {s.tracking_url && <a href={s.tracking_url} target="_blank" rel="noreferrer" style={S.miniLink}>🔗</a>}
                            {s.guia_url     && <a href={s.guia_url}     target="_blank" rel="noreferrer" style={{ ...S.miniLink, background: "#f0f9ff", color: "#0284c7" }}>📄</a>}
                            {s.orders?.pdf_url && <a href={s.orders.pdf_url} target="_blank" rel="noreferrer" style={{ ...S.miniLink, background: "#f8fafc", color: "#475569" }}>📋</a>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredShipments.length === 0 && (
                    <tr><td colSpan={12} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: "40px" }}>Sin registros para estos filtros</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Panel de detalle del cliente ───────────────────────────────────────────────
function ClientDetailPanel({ client, detail }) {
  if (!detail) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={S.detailHeader}>
        <div style={S.detailAvatar}>{initials(client.nombre)}</div>
        <div style={{ flex: 1 }}>
          <h3 style={S.detailName}>{client.nombre}</h3>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
            {client.telefono    && <span style={S.contactChip}>📞 {client.telefono}</span>}
            {client.email       && <span style={S.contactChip}>✉️ {client.email}</span>}
            {client.cedula_ruc  && <span style={S.contactChip}>🪪 {client.cedula_ruc}</span>}
          </div>
          <p style={{ fontSize: "11px", color: "#94a3b8", margin: "6px 0 0" }}>
            Cliente desde {detail.shipments[detail.shipments.length - 1]
              ? new Date(detail.shipments[detail.shipments.length - 1].created_at).toLocaleDateString("es-EC", { month: "long", year: "numeric" })
              : "—"
            }
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: "10px", padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
        <ClientStat label="Órdenes"    value={detail.ordenes}         color="#6366f1" />
        <ClientStat label="Entregadas" value={detail.entregadas}      color="#10b981" />
        <ClientStat label="Venta"      value={fmt(detail.totalVenta)} color="#f59e0b" />
      </div>

      {/* Historial */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        <p style={{ fontSize: "12px", fontWeight: 800, color: "#475569", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Historial de envíos
        </p>
        {detail.shipments.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: "32px", fontSize: "13px" }}>
            Sin envíos registrados
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {detail.shipments.map((s, i) => {
              const cfg      = ESTADO_COLOR[s.estado] || ESTADO_COLOR["En tránsito"];
              const orderNum = s.orders?.data_json?.order_number || "—";
              return (
                <div key={i} style={S.shipmentCard}>
                  <div style={S.shipmentCardHeader}>
                    <span style={S.shipmentOrderNum}>#{orderNum}</span>
                    <span style={{ ...S.estadoBadge, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                      {cfg.icon} {s.estado}
                    </span>
                  </div>

                  <div style={S.shipmentGrid}>
                    <InfoItem label="Destinatario"   value={s.destinatario || "—"} />
                    <InfoItem label="Ciudad"          value={s.ciudad_destino || "—"} />
                    <InfoItem label="Guía"            value={s.guia_numero || "—"} mono />
                    <InfoItem label="Fecha emisión"   value={fmtDate(s.fecha_emision)} />
                    {s.direccion_entrega && (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <InfoItem label="Dirección" value={s.direccion_entrega} />
                      </div>
                    )}
                  </div>

                  {/* Timeline compacto */}
                  <div style={S.timeline}>
                    <TStep done={!!s.admision_fecha} label="Bodega"    date={s.admision_fecha} place={s.admision_bodega} />
                    <TLine done={!!s.reparto_fecha} />
                    <TStep done={!!s.reparto_fecha}  label="Reparto"   date={s.reparto_fecha}  place={s.reparto_lugar} />
                    <TLine done={!!s.entrega_fecha} />
                    <TStep done={!!s.entrega_fecha}  label="Entregado" date={s.entrega_fecha}  place={s.entrega_persona ? `Recibió: ${s.entrega_persona}` : null} isLast />
                  </div>

                  {/* Fotos de entrega */}
                  {s.entrega_foto && (
                    <div style={{ marginTop: "8px" }}>
                      <p style={{ fontSize: "10px", fontWeight: 700, color: "#16a34a", margin: "0 0 6px", letterSpacing: "0.5px" }}>FOTOS DE ENTREGA</p>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {s.entrega_foto.split(",").map((f, fi) => (
                          <a key={fi} href={f.trim()} target="_blank" rel="noreferrer">
                            <img src={f.trim()} alt="" style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", border: "1px solid #86efac" }} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Total + Links */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
                    <div style={{ display: "flex", gap: "5px" }}>
                      {s.tracking_url && <a href={s.tracking_url} target="_blank" rel="noreferrer" style={S.linkBtn}>🔗 Tracking</a>}
                      {s.guia_url     && <a href={s.guia_url}     target="_blank" rel="noreferrer" style={{ ...S.linkBtn, background: "#f0f9ff", color: "#0284c7" }}>📄 Guía</a>}
                      {s.orders?.pdf_url && <a href={s.orders.pdf_url} target="_blank" rel="noreferrer" style={{ ...S.linkBtn, background: "#f8fafc", color: "#475569" }}>📋 Orden</a>}
                    </div>
                    {s.orders?.total_venta && (
                      <span style={{ fontSize: "15px", fontWeight: 800, color: "#10b981" }}>{fmt(s.orders.total_venta)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mini componentes ───────────────────────────────────────────────────────────
function HeroStat({ num, label, color }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${color}33`, borderRadius: "14px", padding: "12px 18px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ fontSize: "20px", fontWeight: 800, color, lineHeight: 1 }}>{num}</span>
      <span style={{ fontSize: "10px", color: "#94a3b8", marginTop: "3px" }}>{label}</span>
    </div>
  );
}

function ClientStat({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: "#f8fafc", borderRadius: "12px", padding: "12px", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", border: "1px solid #e2e8f0" }}>
      <span style={{ fontSize: "18px", fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: "10px", color: "#94a3b8" }}>{label}</span>
    </div>
  );
}

function InfoItem({ label, value, mono }) {
  return (
    <div>
      <p style={{ fontSize: "9px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.5px", margin: "0 0 2px", textTransform: "uppercase" }}>{label}</p>
      <p style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", margin: 0, fontFamily: mono ? "monospace" : "inherit", wordBreak: "break-word" }}>{value}</p>
    </div>
  );
}

function TStep({ done, label, date, place, isLast }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
      <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: done ? "#dcfce7" : "#f1f5f9", border: `2px solid ${done ? "#16a34a" : "#e2e8f0"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: done ? "#16a34a" : "#94a3b8", fontWeight: 700 }}>
        {done ? "✓" : "○"}
      </div>
      <span style={{ fontSize: "9px", color: done ? "#16a34a" : "#94a3b8", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>{label}</span>
      {done && date && <span style={{ fontSize: "9px", color: "#64748b", textAlign: "center" }}>{new Date(date).toLocaleDateString("es-EC", { day: "2-digit", month: "short" })}</span>}
      {done && place && <span style={{ fontSize: "9px", color: "#94a3b8", textAlign: "center", maxWidth: "70px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{place}</span>}
    </div>
  );
}

function TLine({ done }) {
  return <div style={{ flex: 1, height: "2px", background: done ? "#86efac" : "#e2e8f0", alignSelf: "flex-start", marginTop: "10px" }} />;
}

function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px", gap: "12px" }}>
      <div style={{ width: "24px", height: "24px", border: "3px solid #e2e8f0", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "#94a3b8", margin: 0, fontSize: "13px" }}>Cargando...</p>
    </div>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────────
const S = {
  page:           { display: "flex", flexDirection: "column", gap: "20px", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#1e293b" },
  restricted:     { display: "flex", flexDirection: "column", alignItems: "center", padding: "80px", gap: "12px", background: "white", borderRadius: "20px", border: "1px solid #e2e8f0" },
  hero:           { background: "linear-gradient(135deg,#0f172a 0%,#312e81 100%)", borderRadius: "20px", padding: "28px 32px", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" },
  heroLabel:      { fontSize: "10px", fontWeight: 700, letterSpacing: "3px", color: "#a5b4fc", marginBottom: "6px" },
  heroTitle:      { fontSize: "32px", fontWeight: 800, margin: 0, letterSpacing: "-1px" },
  heroSub:        { fontSize: "13px", color: "#64748b", marginTop: "6px" },
  heroStats:      { display: "flex", gap: "8px", flexWrap: "wrap" },
  viewTabs:       { display: "flex", gap: "4px", background: "white", borderRadius: "14px", padding: "6px", border: "1px solid #e2e8f0" },
  viewTab:        { flex: 1, padding: "9px 20px", borderRadius: "10px", border: "none", background: "transparent", fontSize: "13px", fontWeight: 600, color: "#64748b", cursor: "pointer", fontFamily: "inherit" },
  viewTabOn:      { background: "#0f172a", color: "white" },
  clientLayout:   { display: "grid", gridTemplateColumns: "300px 1fr", gap: "16px", minHeight: "600px" },
  leftPanel:      { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", overflow: "hidden" },
  leftControls:   { display: "flex", gap: "8px", padding: "14px 14px 8px", borderBottom: "1px solid #f1f5f9" },
  searchWrap:     { position: "relative", flex: 1 },
  searchIcon:     { position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "16px", color: "#94a3b8", pointerEvents: "none" },
  searchInput:    { width: "100%", paddingLeft: "32px", paddingRight: "10px", paddingTop: "8px", paddingBottom: "8px", borderRadius: "9px", border: "1.5px solid #e2e8f0", fontSize: "12px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  sortSelect:     { padding: "7px 10px", borderRadius: "9px", border: "1.5px solid #e2e8f0", fontSize: "12px", fontFamily: "inherit", outline: "none", background: "white", flexShrink: 0 },
  clientCount:    { padding: "6px 14px", fontSize: "11px", color: "#94a3b8", fontWeight: 600 },
  clientList:     { flex: 1, overflowY: "auto" },
  clientItem:     { display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", borderBottom: "1px solid #f8fafc", textAlign: "left", width: "100%", transition: "background 0.1s" },
  clientItemOn:   { background: "#f5f3ff" },
  clientAvatar:   { width: "34px", height: "34px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 800, flexShrink: 0 },
  rightPanel:     { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden", display: "flex", flexDirection: "column" },
  emptyDetail:    { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: "12px", padding: "60px", color: "#94a3b8" },
  emptySmall:     { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: "10px", padding: "32px" },
  detailHeader:   { display: "flex", alignItems: "flex-start", gap: "14px", padding: "20px", borderBottom: "1px solid #e2e8f0" },
  detailAvatar:   { width: "52px", height: "52px", borderRadius: "14px", background: "linear-gradient(135deg,#6366f1,#818cf8)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: 800, flexShrink: 0 },
  detailName:     { fontSize: "18px", fontWeight: 800, color: "#0f172a", margin: 0 },
  contactChip:    { fontSize: "11px", fontWeight: 600, padding: "4px 10px", borderRadius: "8px", background: "#f1f5f9", color: "#475569" },
  shipmentCard:   { background: "#f8fafc", borderRadius: "14px", padding: "14px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "10px" },
  shipmentCardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  shipmentOrderNum:{ fontSize: "14px", fontWeight: 800, color: "#0f172a" },
  shipmentGrid:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" },
  estadoBadge:    { padding: "3px 10px", borderRadius: "40px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" },
  timeline:       { display: "flex", alignItems: "flex-start", gap: "4px", padding: "8px 0" },
  linkBtn:        { padding: "5px 10px", borderRadius: "8px", background: "#0f172a", color: "white", fontSize: "11px", fontWeight: 700, textDecoration: "none" },
  // Lista
  filtersBar:     { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", background: "white", borderRadius: "16px", padding: "14px 20px", border: "1px solid #e2e8f0" },
  filterGroup:    { display: "flex", alignItems: "center", gap: "6px" },
  filterLabel:    { fontSize: "12px", fontWeight: 600, color: "#64748b", whiteSpace: "nowrap" },
  filterSelect:   { padding: "8px 10px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "12px", fontFamily: "inherit", outline: "none", background: "white" },
  dateInput:      { padding: "8px 10px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "12px", fontFamily: "inherit", outline: "none", background: "white" },
  clearBtn:       { padding: "8px 14px", borderRadius: "10px", background: "#fff1f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  tableWrap:      { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", overflowX: "auto" },
  table:          { width: "100%", borderCollapse: "separate", borderSpacing: "0 2px", minWidth: "1100px" },
  th:             { padding: "10px 14px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap", background: "#f8fafc" },
  td:             { padding: "12px 14px", fontSize: "12px", color: "#1e293b", verticalAlign: "top" },
  miniLink:       { padding: "4px 8px", borderRadius: "6px", background: "#0f172a", color: "white", fontSize: "12px", textDecoration: "none" },
};
