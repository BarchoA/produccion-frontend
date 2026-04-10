import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from "recharts";

const fmt = v => `$${Number(v || 0).toFixed(2)}`;
const fmtDate = d => new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short" });

const ESTADOS = ["Nuevo", "En Producción", "Finalizado", "Empaquetado", "Enviado"];
const ESTADO_CONFIG = {
  "Nuevo":         { color: "#6366f1", bg: "#eef2ff", icon: "🆕" },
  "En Producción": { color: "#f59e0b", bg: "#fffbeb", icon: "⚙️" },
  "Finalizado":    { color: "#10b981", bg: "#f0fdf4", icon: "✅" },
  "Empaquetado":   { color: "#0ea5e9", bg: "#f0f9ff", icon: "📦" },
  "Enviado":       { color: "#8b5cf6", bg: "#f5f3ff", icon: "🚚" },
};

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
}

function getLastMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end   = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
}

function diffPct(cur, prev) {
  const c = Number(cur || 0), p = Number(prev || 0);
  if (p === 0 && c === 0) return { label: "–", positive: true };
  if (p === 0) return { label: "+∞%", positive: true };
  const d = ((c - p) / p) * 100;
  return { label: `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`, positive: d >= 0 };
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1e293b", borderRadius: "10px", padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
      <p style={{ color: "#94a3b8", fontSize: "11px", margin: "0 0 6px" }}>{label}</p>
      {payload.map((e, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "16px", fontSize: "12px" }}>
          <span style={{ color: e.color }}>{e.name}</span>
          <span style={{ color: "white", fontWeight: 700 }}>{typeof e.value === "number" && e.value > 100 ? fmt(e.value) : e.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === "admin";
  const monthRange     = getMonthRange();
  const lastMonthRange = getLastMonthRange();

  const [orders,       setOrders]       = useState([]);
  const [finCur,       setFinCur]       = useState([]);
  const [finPrev,      setFinPrev]      = useState([]);
  const [stockAlerts,  setStockAlerts]  = useState([]);
  const [entregados,   setEntregados]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [quickFilter,  setQuickFilter]  = useState("todos");

  const now = new Date();
  const mesActual = now.toLocaleDateString("es-EC", { month: "long", year: "numeric" });

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    try {
      setLoading(true);
      const [
        { data: ordersData },
        { data: finCurData },
        { data: finPrevData },
        { data: variantsData },
        { data: entregadosData },
      ] = await Promise.all([
        supabase.from("orders").select("*").in("estado", ESTADOS).order("fecha_creacion", { ascending: false }),
        supabase.from("financial_order_items").select("*").gte("fecha_creacion", `${monthRange.start}T00:00:00`).lte("fecha_creacion", `${monthRange.end}T23:59:59`),
        supabase.from("financial_order_items").select("*").gte("fecha_creacion", `${lastMonthRange.start}T00:00:00`).lte("fecha_creacion", `${lastMonthRange.end}T23:59:59`),
        supabase.from("product_variants").select("*, products(nombre, linea)").eq("is_active", true).lte("stock", 5).order("stock", { ascending: true }).limit(8),
        supabase.from("orders").select("id, estado, entregado_at, data_json, guia_numero").eq("estado", "Entregado").order("entregado_at", { ascending: false }).limit(20),
      ]);
      setOrders(ordersData || []);
      setFinCur(finCurData || []);
      setFinPrev(finPrevData || []);
      setStockAlerts(variantsData || []);
      setEntregados(entregadosData || []);
    } catch (e) {
      console.error("Error cargando dashboard:", e);
    } finally {
      setLoading(false);
    }
  }

  // KPIs operativos
  const kpiOps = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return {
      hoy:        orders.filter(o => (o.fecha_creacion || "").startsWith(today)).length,
      activas:    orders.filter(o => !["Enviado"].includes(o.estado)).length,
      enProd:     orders.filter(o => o.estado === "En Producción").length,
      sinDiseno:  orders.filter(o => !o.design_url).length,
      alta:       orders.filter(o => o.prioridad === "alta").length,
      enviadas:   orders.filter(o => o.estado === "Enviado").length,
      sinTracking:orders.filter(o => o.estado === "Enviado" && !o.tracking_url).length,
      total:      orders.length,
    };
  }, [orders]);

  // KPIs financieros
  const kpiFinCur  = useMemo(() => finCur.reduce((a, r)  => ({ venta: a.venta  + Number(r.subtotal_venta||0), margen: a.margen  + Number(r.margen||0), cantidad: a.cantidad  + Number(r.cantidad||0) }), { venta:0, margen:0, cantidad:0 }), [finCur]);
  const kpiFinPrev = useMemo(() => finPrev.reduce((a, r) => ({ venta: a.venta  + Number(r.subtotal_venta||0), margen: a.margen  + Number(r.margen||0), cantidad: a.cantidad  + Number(r.cantidad||0) }), { venta:0, margen:0, cantidad:0 }), [finPrev]);
  const margenPct  = kpiFinCur.venta > 0 ? ((kpiFinCur.margen / kpiFinCur.venta) * 100).toFixed(1) : "0.0";

  // Pipeline
  const pipeline = useMemo(() =>
    ESTADOS.map(e => ({ estado: e, count: orders.filter(o => o.estado === e).length, ...ESTADO_CONFIG[e] })),
    [orders]
  );

  // Tendencia 14 días
  const tendencia = useMemo(() => {
    const days = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      days[key] = { day: key.slice(5), venta: 0, margen: 0 };
    }
    finCur.forEach(r => {
      const day = (r.fecha_creacion || "").split("T")[0];
      if (days[day]) { days[day].venta += Number(r.subtotal_venta||0); days[day].margen += Number(r.margen||0); }
    });
    return Object.values(days).map(d => ({ day: d.day, Venta: +d.venta.toFixed(2), Margen: +d.margen.toFixed(2) }));
  }, [finCur]);

  // Por línea
  const byLine = useMemo(() => {
    const g = {};
    finCur.forEach(r => {
      const l = r.linea || "Sin línea";
      if (!g[l]) g[l] = { linea: l, venta: 0, margen: 0 };
      g[l].venta  += Number(r.subtotal_venta||0);
      g[l].margen += Number(r.margen||0);
    });
    return Object.values(g).sort((a, b) => b.venta - a.venta).map(i => ({ linea: i.linea, Venta: +i.venta.toFixed(2), Margen: +i.margen.toFixed(2) }));
  }, [finCur]);

  // Filtro rápido de órdenes
  const filteredOrders = useMemo(() => {
    const all = orders.slice(0, 10);
    if (quickFilter === "todos")       return all;
    if (quickFilter === "alta")        return orders.filter(o => o.prioridad === "alta").slice(0, 10);
    if (quickFilter === "sinDiseno")   return orders.filter(o => !o.design_url).slice(0, 10);
    if (quickFilter === "sinTracking") return orders.filter(o => o.estado === "Enviado" && !o.tracking_url).slice(0, 10);
    if (quickFilter === "hoy")         return orders.filter(o => (o.fecha_creacion||"").startsWith(new Date().toISOString().split("T")[0])).slice(0, 10);
    return all;
  }, [orders, quickFilter]);

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "100px", gap: "16px" }}>
      <div style={{ width: "32px", height: "32px", border: "3px solid #e2e8f0", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "#94a3b8", margin: 0 }}>Cargando dashboard...</p>
    </div>
  );

  return (
    <div style={S.page}>

      {/* ── Hero ── */}
      <div style={S.hero}>
        <div>
          <div style={S.heroLabel}>PANEL PRINCIPAL</div>
          <h2 style={S.heroTitle}>
            {now.getHours() < 12 ? "Buenos días" : now.getHours() < 18 ? "Buenas tardes" : "Buenas noches"},{" "}
            {profile?.nombre?.split(" ")[0] || "Admin"} 👋
          </h2>
          <p style={S.heroSub}>
            {now.toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {" · "}Cierre: <strong style={{ color: "#34d399" }}>{mesActual}</strong>
          </p>
        </div>
        {isAdmin && (
          <div style={S.heroBadge}>
            <span style={{ display: "block", fontSize: "40px", fontWeight: 900, color: "#34d399", letterSpacing: "-2px", lineHeight: 1 }}>{margenPct}%</span>
            <span style={{ display: "block", fontSize: "11px", color: "#64748b", marginTop: "4px" }}>margen del mes</span>
          </div>
        )}
      </div>

      {/* ── SECCIÓN 1: KPIs Operativos ── */}
      <SectionHeader icon="📋" title="Operaciones" subtitle="Estado actual de la producción" />
      <div style={S.kpiGrid5}>
        <KPICard icon="📬" label="Órdenes hoy"      value={kpiOps.hoy}        color="#6366f1" sub="nuevas hoy"          />
        <KPICard icon="⚙️" label="En producción"    value={kpiOps.enProd}     color="#f59e0b" sub="en proceso activo"   />
        <KPICard icon="🔴" label="Alta prioridad"   value={kpiOps.alta}       color="#ef4444" sub="requieren atención"  alert={kpiOps.alta > 0} />
        <KPICard icon="🎨" label="Sin diseño"       value={kpiOps.sinDiseno}  color="#f59e0b" sub="pendientes"          alert={kpiOps.sinDiseno > 0} />
        <KPICard icon="📍" label="Sin tracking"     value={kpiOps.sinTracking}color="#94a3b8" sub="enviadas sin guía"   alert={kpiOps.sinTracking > 0} />
      </div>

      {/* ── SECCIÓN 2: Pipeline ── */}
      <SectionHeader icon="🔄" title="Pipeline de producción" subtitle="Distribución de órdenes por estado" />
      <div style={S.pipelineRow}>
        {pipeline.map((p, i) => (
          <div key={p.estado} style={{ ...S.pipelineCard, borderTop: `3px solid ${p.color}` }}>
            <span style={{ fontSize: "22px" }}>{p.icon}</span>
            <span style={{ fontSize: "30px", fontWeight: 900, color: p.color, letterSpacing: "-1px", lineHeight: 1 }}>{p.count}</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textAlign: "center" }}>{p.estado}</span>
            <div style={{ width: "100%", height: "4px", background: "#f1f5f9", borderRadius: "40px", overflow: "hidden", marginTop: "4px" }}>
              <div style={{ height: "100%", width: `${orders.length > 0 ? (p.count / orders.length) * 100 : 0}%`, background: p.color, borderRadius: "40px", transition: "width 0.5s ease" }} />
            </div>
            <span style={{ fontSize: "11px", color: "#94a3b8" }}>
              {orders.length > 0 ? Math.round((p.count / orders.length) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>

      {/* ── SECCIÓN 3: Finanzas (solo admin) ── */}
      {isAdmin && (
        <>
          <SectionHeader icon="💰" title={`Finanzas — ${mesActual}`} subtitle="Comparado con el mes anterior" />
          <div style={S.kpiGrid4}>
            <KPIFinCard icon="💵" label="Venta del mes"  cur={kpiFinCur.venta}    prev={kpiFinPrev.venta}    format={fmt}   color="#6366f1" />
            <KPIFinCard icon="📈" label="Margen del mes" cur={kpiFinCur.margen}   prev={kpiFinPrev.margen}   format={fmt}   color="#10b981" />
            <KPIFinCard icon="🔢" label="Unidades"       cur={kpiFinCur.cantidad} prev={kpiFinPrev.cantidad} format={v => v} color="#0ea5e9" />
            <div style={{ ...S.kpiCard, background: "linear-gradient(135deg,#10b981,#059669)", color: "white", justifyContent: "center" }}>
              <span style={{ fontSize: "14px", marginBottom: "4px" }}>📊</span>
              <span style={{ fontSize: "36px", fontWeight: 900, letterSpacing: "-1px", lineHeight: 1 }}>{margenPct}%</span>
              <span style={{ fontSize: "12px", opacity: 0.8, marginTop: "4px" }}>% Margen neto</span>
            </div>
          </div>

          {/* Gráficos */}
          <div style={S.chartsRow}>
            <div style={S.chartCard}>
              <p style={S.chartTitle}>📈 Tendencia últimos 14 días</p>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={tendencia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="Venta"  stroke="#6366f1" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Margen" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={S.chartCard}>
              <p style={S.chartTitle}>🏷 Venta por línea — {mesActual}</p>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byLine} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <YAxis dataKey="linea" type="category" tick={{ fill: "#64748b", fontSize: 11 }} width={80} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Venta"  fill="#6366f1" radius={[0,6,6,0]} />
                    <Bar dataKey="Margen" fill="#10b981" radius={[0,6,6,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── SECCIÓN 4: Órdenes recientes con filtros rápidos ── */}
      <SectionHeader icon="📦" title="Órdenes activas" subtitle="Filtros rápidos por estado o prioridad" />
      <div style={S.quickFiltersRow}>
        {[
          { key: "todos",       label: "Todas",           count: kpiOps.total        },
          { key: "hoy",         label: "Hoy",             count: kpiOps.hoy          },
          { key: "alta",        label: "🔴 Alta prio.",   count: kpiOps.alta         },
          { key: "sinDiseno",   label: "🎨 Sin diseño",   count: kpiOps.sinDiseno    },
          { key: "sinTracking", label: "📍 Sin tracking", count: kpiOps.sinTracking  },
        ].map(f => (
          <button key={f.key} onClick={() => setQuickFilter(f.key)}
            style={{ ...S.quickFilterBtn, ...(quickFilter === f.key ? S.quickFilterBtnOn : {}) }}>
            {f.label}
            <span style={{ ...S.quickFilterCount, background: quickFilter === f.key ? "rgba(255,255,255,0.2)" : "#f1f5f9", color: quickFilter === f.key ? "white" : "#64748b" }}>
              {f.count}
            </span>
          </button>
        ))}
      </div>
      <div style={S.ordersTable}>
        {filteredOrders.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>Sin órdenes en este filtro</div>
        ) : (
          filteredOrders.map((o, i) => {
            const cfg    = ESTADO_CONFIG[o.estado] || {};
            const cliente = o.data_json?.cliente?.nombre || "Sin nombre";
            const num     = o.data_json?.order_number || "—";
            return (
              <div key={i} style={{ ...S.orderRow, background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: cfg.color || "#94a3b8", flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", margin: 0 }}>#{num}</p>
                    <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>{cliente}</p>
                  </div>
                </div>
                <span style={{ ...S.estadoChip, background: cfg.bg, color: cfg.color }}>{cfg.icon} {o.estado}</span>
                <span style={{ ...S.prioChip, background: o.prioridad === "alta" ? "#fee2e2" : o.prioridad === "media" ? "#fef9c3" : "#dcfce7", color: o.prioridad === "alta" ? "#dc2626" : o.prioridad === "media" ? "#ca8a04" : "#16a34a" }}>
                  {o.prioridad || "media"}
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {!o.design_url       && <span style={S.miniAlert}>Sin diseño</span>}
                  {!o.shipping_guide_url && o.estado === "Enviado" && <span style={{ ...S.miniAlert, background: "#fffbeb", color: "#d97706" }}>Sin guía</span>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── SECCIÓN 5: Entregados recientes ── */}
      <SectionHeader icon="🎉" title="Entregas recientes" subtitle="Órdenes confirmadas como entregadas por Yobel" />
      <div style={S.entregadosGrid}>
        {entregados.length === 0 ? (
          <div style={{ ...S.chartCard, textAlign: "center", color: "#94a3b8", padding: "32px" }}>
            Sin entregas registradas aún
          </div>
        ) : (
          entregados.slice(0, 6).map((o, i) => {
            const num     = o.data_json?.order_number || "—";
            const cliente = o.data_json?.cliente?.nombre || o.data_json?.entrega_info?.persona_recibe || "—";
            const entregaInfo = o.data_json?.entrega_info || {};
            return (
              <div key={i} style={S.entregadoCard}>
                <div style={S.entregadoHeader}>
                  <span style={S.entregadoNum}>#{num}</span>
                  <span style={S.entregadoBadge}>🎉 Entregado</span>
                </div>
                <p style={S.entregadoCliente}>{cliente}</p>
                {entregaInfo.fecha && (
                  <p style={S.entregadoFecha}>
                    📅 {new Date(entregaInfo.fecha).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                )}
                {entregaInfo.persona_recibe && (
                  <p style={S.entregadoPersona}>Recibió: {entregaInfo.persona_recibe}</p>
                )}
                {o.guia_numero && (
                  <p style={S.entregadoGuia}>Guía: {o.guia_numero}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── SECCIÓN 6: Alertas ── */}
      <SectionHeader icon="⚠️" title="Alertas" subtitle="Stock bajo y atención requerida" />
      <div style={S.chartsRow}>
        {/* Stock bajo */}
        <div style={S.chartCard}>
          <p style={S.chartTitle}>📦 Stock bajo</p>
          {stockAlerts.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "24px" }}>
              <span style={{ fontSize: "32px" }}>✅</span>
              <p style={{ color: "#94a3b8", margin: 0, fontSize: "13px" }}>Todo el inventario está bien</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {stockAlerts.map((v, i) => (
                <div key={i} style={{ ...S.alertRow, borderLeft: `3px solid ${v.stock === 0 ? "#ef4444" : "#f59e0b"}` }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", margin: 0 }}>
                      {v.products?.nombre || "—"} · {v.nombre}
                    </p>
                    <p style={{ fontSize: "11px", color: "#94a3b8", margin: "2px 0 0" }}>{v.products?.linea || "—"}</p>
                  </div>
                  <span style={{ ...S.stockBadge, background: v.stock === 0 ? "#fee2e2" : "#fef9c3", color: v.stock === 0 ? "#dc2626" : "#ca8a04" }}>
                    {v.stock === 0 ? "Sin stock" : `${v.stock} restantes`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Órdenes enviadas sin tracking */}
        <div style={S.chartCard}>
          <p style={S.chartTitle}>🚚 Enviadas sin tracking</p>
          {kpiOps.sinTracking === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "24px" }}>
              <span style={{ fontSize: "32px" }}>✅</span>
              <p style={{ color: "#94a3b8", margin: 0, fontSize: "13px" }}>Todas las órdenes enviadas tienen tracking</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {orders.filter(o => o.estado === "Enviado" && !o.tracking_url).slice(0, 6).map((o, i) => (
                <div key={i} style={{ ...S.alertRow, borderLeft: "3px solid #f59e0b" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", margin: 0 }}>
                      #{o.data_json?.order_number || "—"}
                    </p>
                    <p style={{ fontSize: "11px", color: "#94a3b8", margin: "2px 0 0" }}>
                      {o.data_json?.cliente?.nombre || "—"}
                    </p>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#d97706", background: "#fffbeb", padding: "3px 8px", borderRadius: "40px", border: "1px solid #fde68a" }}>
                    Sin guía
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "10px", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
      <span style={{ fontSize: "16px" }}>{icon}</span>
      <div>
        <h3 style={{ fontSize: "15px", fontWeight: 800, color: "#1e293b", margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: "12px", color: "#94a3b8", margin: "2px 0 0" }}>{subtitle}</p>}
      </div>
    </div>
  );
}

function KPICard({ icon, label, value, color, sub, alert }) {
  return (
    <div style={{ ...S.kpiCard, borderTop: `3px solid ${color}`, ...(alert ? { boxShadow: `0 0 0 2px ${color}22` } : {}) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "20px" }}>{icon}</span>
        {alert && <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color }} />}
      </div>
      <p style={{ fontSize: "34px", fontWeight: 900, color, margin: "6px 0 0", lineHeight: 1, letterSpacing: "-1px" }}>{value}</p>
      <p style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", margin: "6px 0 2px" }}>{label}</p>
      <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>{sub}</p>
    </div>
  );
}

function KPIFinCard({ icon, label, cur, prev, format, color }) {
  const { label: pctLabel, positive } = diffPct(cur, prev);
  return (
    <div style={{ ...S.kpiCard, borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "20px" }}>{icon}</span>
        <span style={{ padding: "2px 8px", borderRadius: "40px", fontSize: "11px", fontWeight: 700, background: positive ? "#dcfce7" : "#fee2e2", color: positive ? "#16a34a" : "#dc2626" }}>{pctLabel}</span>
      </div>
      <p style={{ fontSize: "28px", fontWeight: 900, color, margin: "6px 0 0", lineHeight: 1, letterSpacing: "-0.5px" }}>{format(cur)}</p>
      <p style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", margin: "6px 0 2px" }}>{label}</p>
      <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>anterior: {format(prev)}</p>
    </div>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────────
const S = {
  page:             { display: "flex", flexDirection: "column", gap: "16px", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#1e293b" },
  hero:             { background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)", borderRadius: "20px", padding: "28px 32px", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" },
  heroLabel:        { fontSize: "10px", fontWeight: 700, letterSpacing: "3px", color: "#94a3b8", marginBottom: "6px" },
  heroTitle:        { fontSize: "26px", fontWeight: 800, margin: 0, letterSpacing: "-0.5px" },
  heroSub:          { fontSize: "13px", color: "#64748b", marginTop: "6px" },
  heroBadge:        { background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "16px", padding: "16px 24px", textAlign: "center" },
  kpiGrid5:         { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px" },
  kpiGrid4:         { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" },
  kpiCard:          { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "16px", display: "flex", flexDirection: "column" },
  pipelineRow:      { display: "flex", gap: "10px", flexWrap: "wrap" },
  pipelineCard:     { flex: 1, minWidth: "130px", background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "16px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" },
  chartsRow:        { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  chartCard:        { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px" },
  chartTitle:       { fontSize: "14px", fontWeight: 700, color: "#1e293b", margin: "0 0 14px" },
  quickFiltersRow:  { display: "flex", gap: "8px", flexWrap: "wrap" },
  quickFilterBtn:   { display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "40px", border: "1px solid #e2e8f0", background: "white", fontSize: "13px", fontWeight: 600, color: "#64748b", cursor: "pointer", fontFamily: "inherit" },
  quickFilterBtnOn: { background: "#0f172a", color: "white", borderColor: "#0f172a" },
  quickFilterCount: { padding: "1px 7px", borderRadius: "40px", fontSize: "11px", fontWeight: 700 },
  ordersTable:      { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden" },
  orderRow:         { display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px" },
  estadoChip:       { padding: "3px 10px", borderRadius: "40px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" },
  prioChip:         { padding: "3px 10px", borderRadius: "40px", fontSize: "11px", fontWeight: 700 },
  miniAlert:        { fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "6px", background: "#fff1f2", color: "#dc2626", border: "1px solid #fecaca" },
  entregadosGrid:   { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" },
  entregadoCard:    { background: "white", borderRadius: "14px", border: "1px solid #86efac", padding: "14px", display: "flex", flexDirection: "column", gap: "4px" },
  entregadoHeader:  { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" },
  entregadoNum:     { fontSize: "14px", fontWeight: 800, color: "#0f172a" },
  entregadoBadge:   { fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "40px", background: "#dcfce7", color: "#16a34a" },
  entregadoCliente: { fontSize: "13px", fontWeight: 700, color: "#1e293b", margin: 0 },
  entregadoFecha:   { fontSize: "11px", color: "#64748b", margin: 0 },
  entregadoPersona: { fontSize: "11px", color: "#94a3b8", margin: 0 },
  entregadoGuia:    { fontSize: "10px", color: "#94a3b8", margin: 0, fontFamily: "monospace" },
  alertRow:         { display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", background: "#f8fafc", borderRadius: "10px" },
  stockBadge:       { padding: "4px 10px", borderRadius: "40px", fontSize: "11px", fontWeight: 700 },
};
