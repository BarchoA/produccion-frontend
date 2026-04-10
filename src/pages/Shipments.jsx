import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const SUPABASE_URL      = "https://ibjtjtmakpdulkraiaca.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlianRqdG1ha3BkdWxrcmFpYWNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2Nzg2NTEsImV4cCI6MjA5MTI1NDY1MX0.vMAFzvDZ-4R8Sn38kTG01a2e5JOWPoO2LAV-WYmUIY8";

const fmt     = v => `$${Number(v || 0).toFixed(2)}`;
const fmtDate = d => { if (!d) return "—"; return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" }); };
const fmtDT   = d => { if (!d) return "—"; return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

const ESTADO_CONFIG = {
  "Entregado":   { color: "#16a34a", bg: "#dcfce7", border: "#86efac", icon: "🎉" },
  "En reparto":  { color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", icon: "🚛" },
  "En bodega":   { color: "#0ea5e9", bg: "#f0f9ff", border: "#bae6fd", icon: "🏭" },
  "En tránsito": { color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", icon: "📦" },
};

const TRANSPORTISTAS = ["Todos", "Yobel", "Servientrega", "Uber", "Indrive", "Didi", "Otro"];

export default function Shipments() {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === "admin";

  const [shipments,   setShipments]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [search,      setSearch]      = useState("");
  const [filterState, setFilterState] = useState("Todos");
  const [filterTrans, setFilterTrans] = useState("Todos");
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [activeTab,   setActiveTab]   = useState("envios"); // envios | costos

  useEffect(() => { fetchShipments(); }, []);

  async function fetchShipments() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("shipments")
        .select(`*, orders(id, data_json, pdf_url, estado, prioridad, total_venta, costo_transporte, transportista), clients(id, nombre, telefono)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setShipments(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function refreshTracking() {
    try {
      setRefreshing(true);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/clever-worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      await fetchShipments();
      const entregadas = data?.entregadas || 0;
      alert(`✅ Actualizado. ${data?.revisadas || 0} revisadas. ${entregadas > 0 ? `${entregadas} nueva(s) entrega(s).` : "Sin nuevas entregas."}`);
    } catch (e) { alert("Error: " + e.message); }
    finally { setRefreshing(false); }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return shipments.filter(s => {
      if (filterState !== "Todos" && s.estado !== filterState) return false;
      if (filterTrans !== "Todos" && s.orders?.transportista !== filterTrans) return false;
      if (dateFrom && s.entrega_fecha && s.entrega_fecha < `${dateFrom}T00:00:00`) return false;
      if (dateTo   && s.entrega_fecha && s.entrega_fecha > `${dateTo}T23:59:59`)   return false;
      if (!term) return true;
      return (
        s.destinatario?.toLowerCase().includes(term)    ||
        s.guia_numero?.toLowerCase().includes(term)     ||
        s.ciudad_destino?.toLowerCase().includes(term)  ||
        s.clients?.nombre?.toLowerCase().includes(term) ||
        s.orders?.data_json?.order_number?.toLowerCase().includes(term)
      );
    });
  }, [shipments, search, filterState, filterTrans, dateFrom, dateTo]);

  const stats = useMemo(() => ({
    total:         shipments.length,
    entregados:    shipments.filter(s => s.estado === "Entregado").length,
    enCamino:      shipments.filter(s => s.estado !== "Entregado").length,
    enReparto:     shipments.filter(s => s.estado === "En reparto").length,
    costoTotal:    shipments.reduce((acc, s) => acc + Number(s.orders?.costo_transporte || 0), 0),
    ventaTotal:    shipments.reduce((acc, s) => acc + Number(s.orders?.total_venta || 0), 0),
  }), [shipments]);

  // Stats por transportista para tab costos
  const byTransportista = useMemo(() => {
    const g = {};
    shipments.forEach(s => {
      const t = s.orders?.transportista || "Sin registrar";
      if (!g[t]) g[t] = { transportista: t, count: 0, costo: 0 };
      g[t].count++;
      g[t].costo += Number(s.orders?.costo_transporte || 0);
    });
    return Object.values(g).sort((a, b) => b.costo - a.costo);
  }, [shipments]);

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
          <div style={S.heroLabel}>MÓDULO DE ENVÍOS</div>
          <h2 style={S.heroTitle}>Envíos</h2>
          <p style={S.heroSub}>Tracking Yobel · Costos de transporte · Historial completo</p>
        </div>
        <div style={S.heroRight}>
          <div style={S.heroStats}>
            <HeroStat num={stats.total}           label="Total"       color="#fff"    />
            <HeroStat num={stats.enCamino}        label="En camino"   color="#fbbf24" />
            <HeroStat num={stats.enReparto}       label="En reparto"  color="#f87171" />
            <HeroStat num={stats.entregados}      label="Entregados"  color="#34d399" />
            <HeroStat num={fmt(stats.costoTotal)} label="Costo envío" color="#a5b4fc" />
          </div>
          <button onClick={refreshTracking} disabled={refreshing}
            style={{ ...S.refreshBtn, opacity: refreshing ? 0.6 : 1 }}>
            {refreshing ? "⏳ Actualizando..." : "🔄 Actualizar tracking"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        <button onClick={() => setActiveTab("envios")} style={{ ...S.tab, ...(activeTab === "envios" ? S.tabOn : {}) }}>🚚 Envíos</button>
        <button onClick={() => setActiveTab("costos")} style={{ ...S.tab, ...(activeTab === "costos" ? S.tabOn : {}) }}>💰 Costos de transporte</button>
      </div>

      {/* ── TAB: ENVÍOS ── */}
      {activeTab === "envios" && (
        <>
          {/* Filtros */}
          <div style={S.filterBar}>
            <div style={S.searchWrap}>
              <span style={S.searchIcon}>⌕</span>
              <input type="text" placeholder="Buscar destinatario, guía, ciudad, # orden..."
                value={search} onChange={e => setSearch(e.target.value)} style={S.searchInput} />
            </div>
            <div style={S.filterGroup}>
              <label style={S.filterLabel}>Estado:</label>
              <select value={filterState} onChange={e => setFilterState(e.target.value)} style={S.filterSelect}>
                {["Todos", "Entregado", "En reparto", "En bodega", "En tránsito"].map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div style={S.filterGroup}>
              <label style={S.filterLabel}>Transportista:</label>
              <select value={filterTrans} onChange={e => setFilterTrans(e.target.value)} style={S.filterSelect}>
                {TRANSPORTISTAS.map(t => <option key={t} value={t}>{t}</option>)}
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
            {(search || filterState !== "Todos" || filterTrans !== "Todos" || dateFrom || dateTo) && (
              <button onClick={() => { setSearch(""); setFilterState("Todos"); setFilterTrans("Todos"); setDateFrom(""); setDateTo(""); }}
                style={S.clearBtn}>✕ Limpiar</button>
            )}
            <span style={{ fontSize: "12px", color: "#94a3b8", marginLeft: "auto" }}>{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Lista */}
          {loading ? (
            <div style={S.loadingWrap}><div style={S.spinner} /><p style={{ color: "#94a3b8", margin: 0 }}>Cargando...</p></div>
          ) : filtered.length === 0 ? (
            <div style={S.emptyState}>
              <span style={{ fontSize: "48px" }}>📭</span>
              <p style={{ color: "#94a3b8", margin: 0, fontSize: "14px", textAlign: "center", maxWidth: "360px" }}>
                {shipments.length === 0 ? "Sin envíos aún. Aparecen automáticamente cuando registras una guía en una orden Enviada." : "Sin resultados."}
              </p>
            </div>
          ) : (
            <div style={S.list}>
              {filtered.map(shipment => {
                const cfg      = ESTADO_CONFIG[shipment.estado] || ESTADO_CONFIG["En tránsito"];
                const orderNum = shipment.orders?.data_json?.order_number || "—";
                const fotos    = shipment.entrega_foto ? shipment.entrega_foto.split(",").map(f => f.trim()).filter(Boolean) : [];
                const isOpen   = selected?.id === shipment.id;
                const costoEnvio = Number(shipment.orders?.costo_transporte || 0);
                const ventaOrden = Number(shipment.orders?.total_venta || 0);

                return (
                  <div key={shipment.id} style={S.card}>
                    <div style={{ height: "4px", background: cfg.color }} />
                    <div style={S.cardBody}>
                      <button style={S.cardHeaderBtn} onClick={() => setSelected(isOpen ? null : shipment)}>
                        <div style={S.cardHeaderLeft}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                            <span style={S.orderNum}>#{orderNum}</span>
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>·</span>
                            <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600 }}>Guía: {shipment.guia_numero}</span>
                          </div>
                          <p style={S.destinatario}>{shipment.destinatario || "—"}</p>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                            <p style={S.ciudad}>📍 {shipment.ciudad_destino || "—"}</p>
                            {shipment.orders?.transportista && (
                              <span style={S.transChip}>🚚 {shipment.orders.transportista}</span>
                            )}
                            {costoEnvio > 0 && (
                              <span style={S.costoChip}>💰 {fmt(costoEnvio)}</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                          <span style={{ ...S.estadoBadge, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                            {cfg.icon} {shipment.estado}
                          </span>
                          <span style={{ fontSize: "11px", color: "#6366f1", fontWeight: 600 }}>{isOpen ? "▲ Cerrar" : "▼ Detalle"}</span>
                        </div>
                      </button>

                      {/* Timeline */}
                      <div style={S.timeline}>
                        <TStep done={!!shipment.admision_fecha} icon="🏭" label="Bodega"    date={shipment.admision_fecha} place={shipment.admision_bodega} />
                        <TLine done={!!shipment.reparto_fecha} />
                        <TStep done={!!shipment.reparto_fecha}  icon="🚛" label="Reparto"   date={shipment.reparto_fecha}  place={shipment.reparto_lugar} />
                        <TLine done={!!shipment.entrega_fecha} />
                        <TStep done={!!shipment.entrega_fecha}  icon="🎉" label="Entregado" date={shipment.entrega_fecha}  place={shipment.entrega_persona ? `Recibió: ${shipment.entrega_persona}` : null} isLast />
                      </div>

                      {/* Detalle expandible */}
                      {isOpen && (
                        <div style={S.detail}>
                          {/* Datos guía */}
                          <div style={S.detailSection}>
                            <p style={S.detailTitle}>📄 Datos de la guía</p>
                            <div style={S.detailGrid}>
                              <DetailItem label="Número de guía"  value={shipment.guia_numero || "—"} mono />
                              <DetailItem label="Fecha emisión"   value={fmtDate(shipment.fecha_emision)} />
                              <DetailItem label="# Orden cliente" value={shipment.numero_orden_cliente || "—"} />
                              <DetailItem label="Ciudad destino"  value={shipment.ciudad_destino || "—"} />
                              <DetailItem label="Destinatario"    value={shipment.destinatario || "—"} />
                              <DetailItem label="Compañía origen" value={shipment.compania_origen || "—"} />
                              <div style={{ gridColumn: "1 / -1" }}>
                                <DetailItem label="Dirección de entrega" value={shipment.direccion_entrega || "—"} />
                              </div>
                            </div>
                          </div>

                          {/* Costos */}
                          <div style={{ ...S.detailSection, background: "#f8fafc", borderRadius: "12px", padding: "14px" }}>
                            <p style={S.detailTitle}>💰 Costos de esta orden</p>
                            <div style={S.detailGrid}>
                              <DetailItem label="Venta total"       value={<span style={{ color: "#10b981", fontWeight: 800 }}>{fmt(ventaOrden)}</span>} />
                              <DetailItem label="Costo transporte"  value={<span style={{ color: "#f59e0b", fontWeight: 700 }}>{fmt(costoEnvio)}</span>} />
                              <DetailItem label="Transportista"     value={shipment.orders?.transportista || "—"} />
                              {ventaOrden > 0 && costoEnvio > 0 && (
                                <DetailItem label="% Costo envío/Venta" value={`${((costoEnvio / ventaOrden) * 100).toFixed(1)}%`} />
                              )}
                            </div>
                          </div>

                          {/* Entrega confirmada */}
                          {shipment.entrega_fecha && (
                            <div style={{ ...S.detailSection, background: "#f0fdf4", borderRadius: "12px", padding: "14px" }}>
                              <p style={{ ...S.detailTitle, color: "#16a34a" }}>🎉 Confirmación de entrega</p>
                              <div style={S.detailGrid}>
                                <DetailItem label="Fecha de entrega"    value={fmtDT(shipment.entrega_fecha)} />
                                <DetailItem label="Persona que recibió" value={shipment.entrega_persona || "—"} />
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <DetailItem label="Comentario" value={shipment.entrega_comentario || "—"} />
                                </div>
                              </div>
                              {fotos.length > 0 && (
                                <div style={{ marginTop: "10px" }}>
                                  <p style={{ fontSize: "10px", fontWeight: 700, color: "#16a34a", margin: "0 0 6px" }}>FOTOS DE ENTREGA</p>
                                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                    {fotos.map((f, fi) => (
                                      <a key={fi} href={f} target="_blank" rel="noreferrer">
                                        <img src={f} alt="" style={{ width: "72px", height: "72px", objectFit: "cover", borderRadius: "10px", border: "2px solid #86efac" }} />
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Links */}
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {shipment.tracking_url   && <a href={shipment.tracking_url}   target="_blank" rel="noreferrer" style={S.linkBtn}>🔗 Tracking Yobel</a>}
                            {shipment.guia_url        && <a href={shipment.guia_url}        target="_blank" rel="noreferrer" style={{ ...S.linkBtn, background: "#f0f9ff", color: "#0284c7" }}>📄 Guía PDF</a>}
                            {shipment.orders?.pdf_url && <a href={shipment.orders.pdf_url} target="_blank" rel="noreferrer" style={{ ...S.linkBtn, background: "#f8fafc", color: "#475569" }}>📋 Orden PDF</a>}
                          </div>
                        </div>
                      )}

                      <div style={S.cardFooter}>
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>Emitido: {fmtDate(shipment.fecha_emision)}</span>
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>Actualizado: {fmtDate(shipment.updated_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── TAB: COSTOS ── */}
      {activeTab === "costos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Resumen */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
            <CostoCard label="Costo total transporte" value={fmt(stats.costoTotal)} icon="💰" color="#f59e0b" />
            <CostoCard label="Envíos registrados"     value={stats.total}           icon="📦" color="#6366f1" />
            <CostoCard label="Costo promedio/envío"   value={stats.total > 0 ? fmt(stats.costoTotal / stats.total) : "$0.00"} icon="📊" color="#0ea5e9" />
            <CostoCard label="% Transporte/Venta"     value={stats.ventaTotal > 0 ? `${((stats.costoTotal / stats.ventaTotal) * 100).toFixed(1)}%` : "—"} icon="📈" color="#10b981" />
          </div>

          {/* Por transportista */}
          <div style={S.costoTable}>
            <p style={S.costoTableTitle}>Desglose por transportista</p>
            <table style={S.table}>
              <thead>
                <tr>
                  {["Transportista", "# Envíos", "Costo total", "Costo promedio"].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {byTransportista.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                    <td style={{ ...S.td, fontWeight: 700 }}>🚚 {row.transportista}</td>
                    <td style={S.td}>{row.count}</td>
                    <td style={{ ...S.td, color: "#f59e0b", fontWeight: 700 }}>{fmt(row.costo)}</td>
                    <td style={S.td}>{row.count > 0 ? fmt(row.costo / row.count) : "—"}</td>
                  </tr>
                ))}
                {byTransportista.length === 0 && (
                  <tr><td colSpan={4} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: "32px" }}>Sin datos de costos registrados</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Lista con costos */}
          <div style={S.costoTable}>
            <p style={S.costoTableTitle}>Detalle por envío</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ ...S.table, minWidth: "700px" }}>
                <thead>
                  <tr>
                    {["# Orden", "Cliente", "Transportista", "Guía", "Estado", "Venta", "Costo envío", "% / Venta"].map(h => <th key={h} style={S.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((s, i) => {
                    const cfg       = ESTADO_CONFIG[s.estado] || ESTADO_CONFIG["En tránsito"];
                    const orderNum  = s.orders?.data_json?.order_number || "—";
                    const venta     = Number(s.orders?.total_venta || 0);
                    const costo     = Number(s.orders?.costo_transporte || 0);
                    const pct       = venta > 0 && costo > 0 ? ((costo / venta) * 100).toFixed(1) : "—";
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                        <td style={{ ...S.td, fontWeight: 800 }}>#{orderNum}</td>
                        <td style={S.td}>{s.clients?.nombre || "—"}</td>
                        <td style={S.td}>{s.orders?.transportista || <span style={{ color: "#94a3b8" }}>Sin registrar</span>}</td>
                        <td style={{ ...S.td, fontFamily: "monospace", fontSize: "11px" }}>{s.guia_numero || "—"}</td>
                        <td style={S.td}>
                          <span style={{ ...S.estadoBadge, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, padding: "2px 8px" }}>
                            {cfg.icon} {s.estado}
                          </span>
                        </td>
                        <td style={{ ...S.td, color: "#10b981", fontWeight: 700 }}>{fmt(venta)}</td>
                        <td style={{ ...S.td, color: costo > 0 ? "#f59e0b" : "#94a3b8", fontWeight: costo > 0 ? 700 : 400 }}>
                          {costo > 0 ? fmt(costo) : "—"}
                        </td>
                        <td style={S.td}>{pct !== "—" ? `${pct}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────
function HeroStat({ num, label, color }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: "14px", padding: "10px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
      <span style={{ fontSize: "18px", fontWeight: 800, color, lineHeight: 1 }}>{num}</span>
      <span style={{ fontSize: "9px", color: "#64748b", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

function CostoCard({ label, value, icon, color }) {
  return (
    <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px", borderTop: `3px solid ${color}` }}>
      <span style={{ fontSize: "20px" }}>{icon}</span>
      <p style={{ fontSize: "26px", fontWeight: 900, color, margin: "8px 0 4px", letterSpacing: "-0.5px" }}>{value}</p>
      <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>{label}</p>
    </div>
  );
}

function TStep({ done, icon, label, date, place, isLast }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
      <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: done ? "#dcfce7" : "#f1f5f9", border: `2px solid ${done ? "#16a34a" : "#e2e8f0"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: done ? "#16a34a" : "#94a3b8", fontWeight: 700 }}>
        {done ? "✓" : icon}
      </div>
      <span style={{ fontSize: "9px", color: done ? "#16a34a" : "#94a3b8", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>{label}</span>
      {done && date && <span style={{ fontSize: "9px", color: "#64748b", textAlign: "center" }}>{new Date(date).toLocaleDateString("es-EC", { day: "2-digit", month: "short" })}</span>}
      {done && place && <span style={{ fontSize: "9px", color: "#94a3b8", textAlign: "center", maxWidth: "70px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{place}</span>}
    </div>
  );
}

function TLine({ done }) {
  return <div style={{ flex: 1, height: "2px", background: done ? "#86efac" : "#e2e8f0", alignSelf: "flex-start", marginTop: "12px" }} />;
}

function DetailItem({ label, value, mono }) {
  return (
    <div>
      <p style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.5px", margin: "0 0 3px", textTransform: "uppercase" }}>{label}</p>
      <p style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", margin: 0, fontFamily: mono ? "monospace" : "inherit", wordBreak: "break-word" }}>{value}</p>
    </div>
  );
}

const S = {
  page:          { display: "flex", flexDirection: "column", gap: "20px", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#1e293b" },
  restricted:    { display: "flex", flexDirection: "column", alignItems: "center", padding: "80px", gap: "12px", background: "white", borderRadius: "20px", border: "1px solid #e2e8f0" },
  hero:          { background: "linear-gradient(135deg,#0f172a 0%,#064e3b 100%)", borderRadius: "20px", padding: "28px 32px", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" },
  heroLabel:     { fontSize: "10px", fontWeight: 700, letterSpacing: "3px", color: "#6ee7b7", marginBottom: "6px" },
  heroTitle:     { fontSize: "32px", fontWeight: 800, margin: 0, letterSpacing: "-1px" },
  heroSub:       { fontSize: "13px", color: "#64748b", marginTop: "6px" },
  heroRight:     { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "12px" },
  heroStats:     { display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" },
  refreshBtn:    { padding: "11px 20px", borderRadius: "12px", background: "#10b981", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  tabs:          { display: "flex", gap: "4px", background: "white", borderRadius: "14px", padding: "6px", border: "1px solid #e2e8f0" },
  tab:           { flex: 1, padding: "9px 20px", borderRadius: "10px", border: "none", background: "transparent", fontSize: "13px", fontWeight: 600, color: "#64748b", cursor: "pointer", fontFamily: "inherit" },
  tabOn:         { background: "#0f172a", color: "white" },
  filterBar:     { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", background: "white", borderRadius: "16px", padding: "14px 20px", border: "1px solid #e2e8f0" },
  searchWrap:    { position: "relative", flex: 1, minWidth: "200px" },
  searchIcon:    { position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "16px", color: "#94a3b8", pointerEvents: "none" },
  searchInput:   { width: "100%", paddingLeft: "36px", paddingRight: "12px", paddingTop: "9px", paddingBottom: "9px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  filterGroup:   { display: "flex", alignItems: "center", gap: "6px" },
  filterLabel:   { fontSize: "12px", fontWeight: 600, color: "#64748b", whiteSpace: "nowrap" },
  filterSelect:  { padding: "8px 10px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "12px", fontFamily: "inherit", outline: "none", background: "white" },
  dateInput:     { padding: "8px 10px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "12px", fontFamily: "inherit", outline: "none", background: "white" },
  clearBtn:      { padding: "8px 12px", borderRadius: "10px", background: "#fff1f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  loadingWrap:   { display: "flex", flexDirection: "column", alignItems: "center", padding: "60px", gap: "12px" },
  spinner:       { width: "28px", height: "28px", border: "3px solid #e2e8f0", borderTop: "3px solid #10b981", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  emptyState:    { display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "60px", background: "white", borderRadius: "16px", border: "1px solid #e2e8f0" },
  list:          { display: "flex", flexDirection: "column", gap: "10px" },
  card:          { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden" },
  cardBody:      { padding: "14px 18px", display: "flex", flexDirection: "column", gap: "12px" },
  cardHeaderBtn: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", background: "transparent", border: "none", width: "100%", cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0 },
  cardHeaderLeft:{ display: "flex", flexDirection: "column" },
  orderNum:      { fontSize: "15px", fontWeight: 800, color: "#0f172a" },
  destinatario:  { fontSize: "14px", fontWeight: 700, color: "#1e293b", margin: "0 0 2px" },
  ciudad:        { fontSize: "11px", color: "#94a3b8", margin: 0 },
  transChip:     { fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "40px", background: "#f5f3ff", color: "#7c3aed" },
  costoChip:     { fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "40px", background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a" },
  estadoBadge:   { padding: "4px 10px", borderRadius: "40px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" },
  timeline:      { display: "flex", alignItems: "flex-start", gap: "4px", background: "#f8fafc", borderRadius: "10px", padding: "10px 12px" },
  detail:        { display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid #f1f5f9", paddingTop: "12px" },
  detailSection: { display: "flex", flexDirection: "column", gap: "10px" },
  detailTitle:   { fontSize: "11px", fontWeight: 800, color: "#475569", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.5px" },
  detailGrid:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  linkBtn:       { padding: "7px 14px", borderRadius: "10px", background: "#0f172a", color: "white", fontSize: "12px", fontWeight: 700, textDecoration: "none" },
  cardFooter:    { display: "flex", justifyContent: "space-between", borderTop: "1px solid #f1f5f9", paddingTop: "8px" },
  costoTable:    { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px" },
  costoTableTitle:{ fontSize: "14px", fontWeight: 700, color: "#1e293b", margin: "0 0 14px" },
  table:         { width: "100%", borderCollapse: "separate", borderSpacing: "0 3px" },
  th:            { padding: "10px 14px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap" },
  td:            { padding: "12px 14px", fontSize: "13px", color: "#1e293b" },
};
