import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from "recharts";

const fmt = v => `$${Number(v || 0).toFixed(2)}`;
const fmtDate = d => new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short" });

const ESTADO_CONFIG = {
  "Nuevo":         { color: "#6366f1", bg: "#eef2ff", icon: "🆕" },
  "En Producción": { color: "#f59e0b", bg: "#fffbeb", icon: "⚙️" },
  "Finalizado":    { color: "#10b981", bg: "#f0fdf4", icon: "✅" },
  "Empaquetado":   { color: "#0ea5e9", bg: "#f0f9ff", icon: "📦" },
  "Enviado":       { color: "#8b5cf6", bg: "#f5f3ff", icon: "🚚" },
};

const ESTADOS = ["Nuevo", "En Producción", "Finalizado", "Empaquetado", "Enviado"];

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().split("T")[0],
    end:   end.toISOString().split("T")[0],
  };
}

function getLastMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end   = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    start: start.toISOString().split("T")[0],
    end:   end.toISOString().split("T")[0],
  };
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
  const monthRange    = getMonthRange();
  const lastMonthRange = getLastMonthRange();

  const [orders,      setOrders]      = useState([]);
  const [finCur,      setFinCur]      = useState([]);
  const [finPrev,     setFinPrev]     = useState([]);
  const [stockAlerts, setStockAlerts] = useState([]);
  const [recentOrders,setRecentOrders]= useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    try {
      setLoading(true);
      const [
        { data: ordersData },
        { data: finCurData },
        { data: finPrevData },
        { data: variantsData },
      ] = await Promise.all([
        supabase.from("orders").select("*").order("fecha_creacion", { ascending: false }),
        supabase.from("financial_order_items").select("*")
          .gte("fecha_creacion", `${monthRange.start}T00:00:00`)
          .lte("fecha_creacion", `${monthRange.end}T23:59:59`),
        supabase.from("financial_order_items").select("*")
          .gte("fecha_creacion", `${lastMonthRange.start}T00:00:00`)
          .lte("fecha_creacion", `${lastMonthRange.end}T23:59:59`),
        supabase.from("product_variants").select("*, products(nombre, linea)")
          .eq("is_active", true)
          .lte("stock", 5)
          .order("stock", { ascending: true })
          .limit(8),
      ]);

      setOrders(ordersData || []);
      setFinCur(finCurData || []);
      setFinPrev(finPrevData || []);
      setStockAlerts(variantsData || []);
      setRecentOrders((ordersData || []).slice(0, 8));
    } catch (e) {
      console.error("Error cargando dashboard:", e);
    } finally {
      setLoading(false);
    }
  }

  // ── KPIs de órdenes ──
  const kpiOrders = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const hoy   = orders.filter(o => (o.fecha_creacion || "").startsWith(today)).length;
    const activas = orders.filter(o => !["Enviado"].includes(o.estado)).length;
    const enProd  = orders.filter(o => o.estado === "En Producción").length;
    const sinDiseno = orders.filter(o => !o.design_url && o.estado !== "Enviado").length;
    const alta    = orders.filter(o => o.prioridad === "alta" && o.estado !== "Enviado").length;
    return { hoy, activas, enProd, sinDiseno, alta, total: orders.length };
  }, [orders]);

  // ── KPIs financieros ──
  const kpiFinCur  = useMemo(() => finCur.reduce((acc, r)  => ({ venta: acc.venta  + Number(r.subtotal_venta||0), margen: acc.margen  + Number(r.margen||0), cantidad: acc.cantidad  + Number(r.cantidad||0) }), { venta: 0, margen: 0, cantidad: 0 }), [finCur]);
  const kpiFinPrev = useMemo(() => finPrev.reduce((acc, r) => ({ venta: acc.venta  + Number(r.subtotal_venta||0), margen: acc.margen  + Number(r.margen||0), cantidad: acc.cantidad  + Number(r.cantidad||0) }), { venta: 0, margen: 0, cantidad: 0 }), [finPrev]);

  // ── Pipeline por estado ──
  const pipeline = useMemo(() =>
    ESTADOS.map(e => ({ estado: e, count: orders.filter(o => o.estado === e).length, ...ESTADO_CONFIG[e] })),
    [orders]
  );

  // ── Tendencia semanal (últimos 14 días) ──
  const tendencia = useMemo(() => {
    const days = {};
    const now  = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      days[key] = { day: key.slice(5), venta: 0, margen: 0 };
    }
    for (const r of finCur) {
      const day = (r.fecha_creacion || "").split("T")[0];
      if (days[day]) {
        days[day].venta  += Number(r.subtotal_venta || 0);
        days[day].margen += Number(r.margen || 0);
      }
    }
    return Object.values(days).map(d => ({
      day: d.day,
      Venta:  +d.venta.toFixed(2),
      Margen: +d.margen.toFixed(2),
    }));
  }, [finCur]);

  // ── Resumen por línea (mes actual) ──
  const byLine = useMemo(() => {
    const g = {};
    for (const r of finCur) {
      const l = r.linea || "Sin línea";
      if (!g[l]) g[l] = { linea: l, venta: 0, margen: 0 };
      g[l].venta  += Number(r.subtotal_venta || 0);
      g[l].margen += Number(r.margen || 0);
    }
    return Object.values(g).sort((a, b) => b.venta - a.venta)
      .map(i => ({ linea: i.linea, Venta: +i.venta.toFixed(2), Margen: +i.margen.toFixed(2) }));
  }, [finCur]);

  const margenPct = kpiFinCur.venta > 0 ? ((kpiFinCur.margen / kpiFinCur.venta) * 100).toFixed(1) : "0.0";

  const now = new Date();
  const mesActual = now.toLocaleDateString("es-EC", { month: "long", year: "numeric" });

  if (loading) return (
    <div style={S.loadingWrap}>
      <div style={S.spinner} />
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
            Buen {now.getHours() < 12 ? "día" : now.getHours() < 18 ? "tarde" : "noche"},{" "}
            {profile?.nombre?.split(" ")[0] || "Admin"} 👋
          </h2>
          <p style={S.heroSub}>
            {now.toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {" · "}Cierre de mes: <strong style={{ color: "#34d399" }}>{mesActual}</strong>
          </p>
        </div>
        <div style={S.heroBadge}>
          <span style={S.heroBadgeNum}>{margenPct}%</span>
          <span style={S.heroBadgeLabel}>margen del mes</span>
        </div>
      </div>

      {/* ── KPIs operativos ── */}
      <div style={S.sectionLabel}>📋 OPERACIONES HOY</div>
      <div style={S.kpiGrid}>
        <KPICard icon="📬" label="Órdenes hoy"      value={kpiOrders.hoy}       color="#6366f1" sub="nuevas ingresadas" />
        <KPICard icon="⚙️" label="En producción"    value={kpiOrders.enProd}    color="#f59e0b" sub="en proceso activo" />
        <KPICard icon="📦" label="Órdenes activas"  value={kpiOrders.activas}   color="#0ea5e9" sub="sin enviar" />
        <KPICard icon="🔴" label="Alta prioridad"   value={kpiOrders.alta}      color="#ef4444" sub="requieren atención" alert={kpiOrders.alta > 0} />
        <KPICard icon="🎨" label="Sin diseño"       value={kpiOrders.sinDiseno} color="#f59e0b" sub="pendientes de archivo" alert={kpiOrders.sinDiseno > 0} />
      </div>

      {/* ── KPIs financieros (solo admin) ── */}
      {isAdmin && (
        <>
          <div style={S.sectionLabel}>💰 FINANZAS — {mesActual.toUpperCase()}</div>
          <div style={S.kpiGrid}>
            <KPIFinCard icon="💵" label="Venta del mes"  cur={kpiFinCur.venta}    prev={kpiFinPrev.venta}    format={fmt}   color="#6366f1" />
            <KPIFinCard icon="📈" label="Margen del mes" cur={kpiFinCur.margen}   prev={kpiFinPrev.margen}   format={fmt}   color="#10b981" />
            <KPIFinCard icon="🔢" label="Unidades"       cur={kpiFinCur.cantidad} prev={kpiFinPrev.cantidad} format={v => v} color="#0ea5e9" />
            <div style={{ ...S.kpiCard, background: "linear-gradient(135deg,#10b981,#059669)", color: "white" }}>
              <div style={{ fontSize: "28px" }}>📊</div>
              <div>
                <p style={{ fontSize: "11px", margin: "0 0 4px", opacity: 0.8, fontWeight: 600 }}>% MARGEN NETO</p>
                <p style={{ fontSize: "32px", fontWeight: 900, margin: 0, letterSpacing: "-1px" }}>{margenPct}%</p>
                <p style={{ fontSize: "11px", margin: "4px 0 0", opacity: 0.7 }}>sobre venta total</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Pipeline ── */}
      <div style={S.sectionLabel}>🔄 PIPELINE DE PRODUCCIÓN</div>
      <div style={S.pipelineRow}>
        {pipeline.map((p, i) => (
          <div key={p.estado} style={{ ...S.pipelineCard, borderTop: `3px solid ${p.color}` }}>
            <div style={S.pipelineIcon}>{p.icon}</div>
            <div style={{ ...S.pipelineCount, color: p.color }}>{p.count}</div>
            <div style={S.pipelineEstado}>{p.estado}</div>
            <div style={{ ...S.pipelineBar }}>
              <div style={{ ...S.pipelineFill, width: `${orders.length > 0 ? (p.count / orders.length) * 100 : 0}%`, background: p.color }} />
            </div>
            <div style={S.pipelinePct}>
              {orders.length > 0 ? Math.round((p.count / orders.length) * 100) : 0}%
            </div>
            {i < pipeline.length - 1 && <div style={S.pipelineArrow}>→</div>}
          </div>
        ))}
      </div>

      {/* ── Gráficos ── */}
      {isAdmin && (
        <div style={S.chartsRow}>
          <div style={S.chartCard}>
            <p style={S.chartTitle}>📈 Tendencia últimos 14 días</p>
            <div style={{ height: 220 }}>
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
            <div style={{ height: 220 }}>
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
      )}

      {/* ── Alertas de stock + órdenes recientes ── */}
      <div style={S.chartsRow}>
        {/* Stock bajo */}
        <div style={S.chartCard}>
          <p style={S.chartTitle}>⚠️ Alertas de stock bajo</p>
          {stockAlerts.length === 0 ? (
            <div style={S.emptyAlert}>
              <span style={{ fontSize: "32px" }}>✅</span>
              <p style={{ color: "#94a3b8", margin: 0 }}>Todo el inventario está bien</p>
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
                  <div style={{ textAlign: "right" }}>
                    <span style={{ ...S.stockBadge, background: v.stock === 0 ? "#fee2e2" : "#fef9c3", color: v.stock === 0 ? "#dc2626" : "#ca8a04" }}>
                      {v.stock === 0 ? "Sin stock" : `${v.stock} restantes`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Órdenes recientes */}
        <div style={S.chartCard}>
          <p style={S.chartTitle}>🕐 Órdenes recientes</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {recentOrders.map((o, i) => {
              const cfg   = ESTADO_CONFIG[o.estado] || {};
              const cliente = o.data_json?.cliente?.nombre || "Sin nombre";
              const num     = o.data_json?.order_number || "—";
              return (
                <div key={i} style={S.recentRow}>
                  <div style={{ ...S.recentDot, background: cfg.color || "#94a3b8" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      #{num} · {cliente}
                    </p>
                    <p style={{ fontSize: "11px", color: "#94a3b8", margin: "2px 0 0" }}>
                      {fmtDate(o.fecha_creacion)} · {cfg.icon} {o.estado}
                    </p>
                  </div>
                  <div style={{ ...S.prioBadge, background: o.prioridad === "alta" ? "#fee2e2" : o.prioridad === "media" ? "#fef9c3" : "#dcfce7", color: o.prioridad === "alta" ? "#dc2626" : o.prioridad === "media" ? "#ca8a04" : "#16a34a" }}>
                    {o.prioridad || "media"}
                  </div>
                </div>
              );
            })}
            {recentOrders.length === 0 && (
              <div style={S.emptyAlert}>
                <span style={{ fontSize: "32px" }}>📭</span>
                <p style={{ color: "#94a3b8", margin: 0 }}>Sin órdenes aún</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function KPICard({ icon, label, value, color, sub, alert }) {
  return (
    <div style={{ ...S.kpiCard, borderTop: `3px solid ${color}`, ...(alert ? { boxShadow: `0 0 0 2px ${color}33` } : {}) }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "22px" }}>{icon}</span>
        {alert && <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, animation: "pulse 1.5s infinite" }} />}
      </div>
      <p style={{ fontSize: "36px", fontWeight: 900, color, margin: "8px 0 0", lineHeight: 1, letterSpacing: "-1px" }}>{value}</p>
      <p style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", margin: "6px 0 2px" }}>{label}</p>
      <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>{sub}</p>
    </div>
  );
}

function KPIFinCard({ icon, label, cur, prev, format, color }) {
  const { label: pctLabel, positive } = diffPct(cur, prev);
  return (
    <div style={{ ...S.kpiCard, borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "22px" }}>{icon}</span>
        <span style={{ ...S.pctBadge, background: positive ? "#dcfce7" : "#fee2e2", color: positive ? "#16a34a" : "#dc2626" }}>{pctLabel}</span>
      </div>
      <p style={{ fontSize: "28px", fontWeight: 900, color, margin: "8px 0 0", lineHeight: 1, letterSpacing: "-0.5px" }}>{format(cur)}</p>
      <p style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", margin: "6px 0 2px" }}>{label}</p>
      <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>mes anterior: {format(prev)}</p>
    </div>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────────
const S = {
  page:          { display: "flex", flexDirection: "column", gap: "20px", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#1e293b" },
  loadingWrap:   { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "100px", gap: "16px" },
  spinner:       { width: "32px", height: "32px", border: "3px solid #e2e8f0", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  hero:          { background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)", borderRadius: "20px", padding: "28px 32px", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" },
  heroLabel:     { fontSize: "10px", fontWeight: 700, letterSpacing: "3px", color: "#94a3b8", marginBottom: "6px" },
  heroTitle:     { fontSize: "28px", fontWeight: 800, margin: 0, letterSpacing: "-0.5px" },
  heroSub:       { fontSize: "13px", color: "#64748b", marginTop: "6px" },
  heroBadge:     { background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "16px", padding: "16px 24px", textAlign: "center" },
  heroBadgeNum:  { display: "block", fontSize: "40px", fontWeight: 900, color: "#34d399", letterSpacing: "-2px", lineHeight: 1 },
  heroBadgeLabel:{ display: "block", fontSize: "11px", color: "#64748b", marginTop: "4px" },
  sectionLabel:  { fontSize: "10px", fontWeight: 800, color: "#94a3b8", letterSpacing: "2px", marginBottom: "-8px" },
  kpiGrid:       { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "14px" },
  kpiCard:       { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "18px", display: "flex", flexDirection: "column", gap: "0" },
  pctBadge:      { padding: "2px 8px", borderRadius: "40px", fontSize: "11px", fontWeight: 700 },
  pipelineRow:   { display: "flex", gap: "10px", flexWrap: "wrap", position: "relative" },
  pipelineCard:  { flex: 1, minWidth: "140px", background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "16px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", position: "relative", textAlign: "center" },
  pipelineIcon:  { fontSize: "24px" },
  pipelineCount: { fontSize: "32px", fontWeight: 900, lineHeight: 1, letterSpacing: "-1px" },
  pipelineEstado:{ fontSize: "11px", fontWeight: 600, color: "#64748b", textAlign: "center" },
  pipelineBar:   { width: "100%", height: "4px", background: "#f1f5f9", borderRadius: "40px", overflow: "hidden", marginTop: "8px" },
  pipelineFill:  { height: "100%", borderRadius: "40px", transition: "width 0.5s ease" },
  pipelinePct:   { fontSize: "11px", color: "#94a3b8", fontWeight: 600 },
  pipelineArrow: { position: "absolute", right: "-14px", top: "50%", transform: "translateY(-50%)", fontSize: "16px", color: "#cbd5e1", zIndex: 1 },
  chartsRow:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  chartCard:     { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px 22px" },
  chartTitle:    { fontSize: "14px", fontWeight: 700, color: "#1e293b", margin: "0 0 16px" },
  emptyAlert:    { display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "32px", color: "#94a3b8" },
  alertRow:      { display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", background: "#f8fafc", borderRadius: "10px" },
  stockBadge:    { padding: "4px 10px", borderRadius: "40px", fontSize: "11px", fontWeight: 700 },
  recentRow:     { display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid #f1f5f9" },
  recentDot:     { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0 },
  prioBadge:     { padding: "3px 9px", borderRadius: "40px", fontSize: "10px", fontWeight: 700, flexShrink: 0 },
};
