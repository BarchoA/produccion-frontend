import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

// ─── Utilidades ───────────────────────────────────────────────────────────────
const fmt   = v => `$${Number(v || 0).toFixed(2)}`;
const fmtN  = v => Number(v || 0).toFixed(2);
const fDate = d => d.toISOString().split("T")[0];
const fmtDate = d => { if (!d) return "—"; return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" }); };

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const PALETTE = { venta: "#6366f1", costo: "#f59e0b", margen: "#10b981", transporte: "#f97316", margenReal: "#16a34a" };
const PIE_COLORS = ["#6366f1","#10b981","#f59e0b","#0ea5e9","#ec4899","#14b8a6","#f97316","#8b5cf6"];

function getMesActual() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

function getRangoMes(year, month) {
  const start = new Date(year, month, 1);
  const end   = new Date(year, month + 1, 0);
  return { start: fDate(start), end: fDate(end) };
}

function getRangoMesAnterior(year, month) {
  const m = month === 0 ? 11 : month - 1;
  const y = month === 0 ? year - 1 : year;
  return getRangoMes(y, m);
}

function diffPct(cur, prev) {
  const c = Number(cur || 0), p = Number(prev || 0);
  if (p === 0 && c === 0) return { label: "0%", positive: true };
  if (p === 0) return { label: "+∞%", positive: true };
  const d = ((c - p) / p) * 100;
  return { label: `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`, positive: d >= 0 };
}

function agg(rows) {
  // Costo transporte: sumar por orden única (no multiplicar por ítems)
  const orderTransporte = {};
  rows.forEach(r => {
    if (r.order_id && !orderTransporte[r.order_id]) {
      orderTransporte[r.order_id] = Number(r.costo_transporte || 0);
    }
  });
  const totalTransporte = Object.values(orderTransporte).reduce((a, b) => a + b, 0);

  return rows.reduce((acc, r) => ({
    venta:      acc.venta      + Number(r.subtotal_venta     || 0),
    costo:      acc.costo      + Number(r.subtotal_costo     || 0),
    margen:     acc.margen     + Number(r.margen             || 0),
    cantidad:   acc.cantidad   + Number(r.cantidad           || 0),
    transporte: totalTransporte,
    margenReal: acc.margenReal + Number(r.margen             || 0),
  }), { venta: 0, costo: 0, margen: 0, cantidad: 0, transporte: totalTransporte, margenReal: 0 });
}

function specsStr(specs) {
  if (!specs || typeof specs !== "object") return "";
  const labels = { tinta: "Tinta", uv: "UV", formato: "Formato", equivalente: "Equiv.A3", metros_cuadrados: "m²", modo_trabajo: "Modo", articulo: "Artículo" };
  return Object.entries(specs).filter(([, v]) => v !== null && v !== "" && v !== false && v !== 0)
    .map(([k, v]) => `${labels[k] || k}: ${v}`).join(" | ");
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1e293b", borderRadius: "12px", padding: "12px 16px", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
      <p style={{ color: "#94a3b8", fontSize: "12px", margin: "0 0 8px" }}>{label}</p>
      {payload.map((e, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "20px", fontSize: "13px" }}>
          <span style={{ color: e.color }}>{e.name}</span>
          <span style={{ color: "white", fontWeight: 700 }}>{typeof e.value === "number" && e.value > 50 ? fmt(e.value) : e.value}</span>
        </div>
      ))}
    </div>
  );
}

async function exportToExcel(rows, label) {
  try {
    const XLSX = await import("xlsx");
    const detalle = rows.map(r => ({
      "Fecha":                (r.fecha_creacion || "").split("T")[0],
      "# Orden":              r.order_number    || "",
      "Cliente":              r.cliente_nombre  || "",
      "Estado":               r.estado          || "",
      "Descripción":          r.descripcion     || "",
      "Línea":                r.linea           || "",
      "Producto":             r.product_nombre  || "",
      "Variante":             r.variant_name    || "",
      "Specs":                specsStr(r.specs),
      "Cantidad":             Number(r.cantidad        || 0),
      "Precio Unit. ($)":     Number(r.precio_unitario || 0),
      "Venta ($)":            Number(r.subtotal_venta  || 0),
      "Costo Promedio Unit.": Number(r.costo_promedio_unitario || 0),
      "Costo Total ($)":      Number(r.subtotal_costo  || 0),
      "Costo Transporte ($)": Number(r.costo_transporte || 0),
      "Transportista":        r.transportista   || "",
      "Margen Bruto ($)":     Number(r.margen          || 0),
      "% Margen Bruto":       Number(r.margen_pct      || 0),
      "Margen Real ($)":      Number(r.margen_real     || 0),
      "Importaciones usadas": Number(r.total_importaciones || 0),
    }));

    // Resumen por línea
    const byLine = {};
    rows.forEach(r => {
      const l = r.linea || "Sin línea";
      if (!byLine[l]) byLine[l] = { Línea: l, Venta: 0, Costo: 0, Margen: 0, MargenReal: 0, Cantidad: 0 };
      byLine[l].Venta     += Number(r.subtotal_venta || 0);
      byLine[l].Costo     += Number(r.subtotal_costo || 0);
      byLine[l].Margen    += Number(r.margen         || 0);
      byLine[l].MargenReal+= Number(r.margen_real    || 0);
      byLine[l].Cantidad  += Number(r.cantidad       || 0);
    });
    const resumenLinea = Object.values(byLine).map(l => ({
      "Línea":           l.Línea,
      "Venta ($)":       +l.Venta.toFixed(2),
      "Costo ($)":       +l.Costo.toFixed(2),
      "Margen Bruto ($)":+l.Margen.toFixed(2),
      "Margen Real ($)": +l.MargenReal.toFixed(2),
      "% Margen":        l.Venta > 0 ? +((l.Margen / l.Venta) * 100).toFixed(2) : 0,
      "Cantidad":        l.Cantidad,
    }));

    const tot = agg(rows);
    const margenRealTotal = tot.margen - tot.transporte;
    const totales = [
      { "Métrica": "Período",              "Valor": label },
      { "Métrica": "Venta total",          "Valor": +tot.venta.toFixed(2) },
      { "Métrica": "Costo producto",       "Valor": +tot.costo.toFixed(2) },
      { "Métrica": "Costo transporte",     "Valor": +tot.transporte.toFixed(2) },
      { "Métrica": "Margen bruto",         "Valor": +tot.margen.toFixed(2) },
      { "Métrica": "Margen real",          "Valor": +margenRealTotal.toFixed(2) },
      { "Métrica": "% Margen bruto",       "Valor": tot.venta > 0 ? +((tot.margen / tot.venta) * 100).toFixed(2) : 0 },
      { "Métrica": "% Margen real",        "Valor": tot.venta > 0 ? +((margenRealTotal / tot.venta) * 100).toFixed(2) : 0 },
      { "Métrica": "Unidades",             "Valor": tot.cantidad },
    ];

    const wb  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle),      "Detalle completo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenLinea), "Por línea");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(totales),      "Totales");
    XLSX.writeFile(wb, `finanzas_${label.replace(/\s/g, "_")}.xlsx`);
  } catch (e) {
    alert("Error exportando. Verifica: npm install xlsx\n" + e.message);
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Finance() {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === "admin" || profile?.rol === "importaciones";

  const now = getMesActual();

  // Modo de filtro: "mes" | "rango"
  const [filterMode, setFilterMode]   = useState("mes");
  const [selYear,    setSelYear]      = useState(now.year);
  const [selMonth,   setSelMonth]     = useState(now.month);
  const [rangeStart, setRangeStart]   = useState(fDate(new Date(now.year, now.month, 1)));
  const [rangeEnd,   setRangeEnd]     = useState(fDate(new Date()));
  const [selLine,    setSelLine]      = useState("Todas");
  const [activeTab,  setActiveTab]    = useState("resumen");

  const [rowsCur,   setRowsCur]   = useState([]);
  const [rowsPrev,  setRowsPrev]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);

  // Rango actual y anterior calculado
  const { start: curStart, end: curEnd } = useMemo(() => {
    if (filterMode === "mes") return getRangoMes(selYear, selMonth);
    return { start: rangeStart, end: rangeEnd };
  }, [filterMode, selYear, selMonth, rangeStart, rangeEnd]);

  const { start: prevStart, end: prevEnd } = useMemo(() => {
    if (filterMode === "mes") return getRangoMesAnterior(selYear, selMonth);
    // Para rango libre: comparar mismo periodo anterior
    const diffDays = (new Date(rangeEnd) - new Date(rangeStart)) / (1000 * 60 * 60 * 24);
    const ps = new Date(rangeStart); ps.setDate(ps.getDate() - diffDays - 1);
    const pe = new Date(rangeStart); pe.setDate(pe.getDate() - 1);
    return { start: fDate(ps), end: fDate(pe) };
  }, [filterMode, selYear, selMonth, rangeStart, rangeEnd]);

  const periodoLabel = useMemo(() => {
    if (filterMode === "mes") return `${MESES[selMonth]} ${selYear}`;
    return `${curStart} → ${curEnd}`;
  }, [filterMode, selYear, selMonth, curStart, curEnd]);

  useEffect(() => { fetchData(); }, [curStart, curEnd, prevStart, prevEnd]);

  async function fetchData() {
    try {
      setLoading(true);
      const [{ data: cd }, { data: pd }] = await Promise.all([
        supabase.from("financial_order_items").select("*")
          .gte("fecha_creacion", `${curStart}T00:00:00`)
          .lte("fecha_creacion", `${curEnd}T23:59:59`),
        supabase.from("financial_order_items").select("*")
          .gte("fecha_creacion", `${prevStart}T00:00:00`)
          .lte("fecha_creacion", `${prevEnd}T23:59:59`),
      ]);
      setRowsCur(cd  || []);
      setRowsPrev(pd || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  const lines   = useMemo(() => ["Todas", ...[...new Set([...rowsCur, ...rowsPrev].map(r => r.linea).filter(Boolean))].sort()], [rowsCur, rowsPrev]);
  const fCur    = useMemo(() => selLine === "Todas" ? rowsCur  : rowsCur.filter(r  => r.linea === selLine), [rowsCur,  selLine]);
  const fPrev   = useMemo(() => selLine === "Todas" ? rowsPrev : rowsPrev.filter(r => r.linea === selLine), [rowsPrev, selLine]);
  const mCur    = useMemo(() => agg(fCur),  [fCur]);
  const mPrev   = useMemo(() => agg(fPrev), [fPrev]);

  const margenRealCur   = mCur.margen  - mCur.transporte;
  const margenRealPrev  = mPrev.margen - mPrev.transporte;
  const margenPct       = mCur.venta > 0 ? ((mCur.margen / mCur.venta) * 100).toFixed(1) : "0.0";
  const margenRealPct   = mCur.venta > 0 ? ((margenRealCur / mCur.venta) * 100).toFixed(1) : "0.0";

  // Por línea
  const byLine = useMemo(() => {
    const g = {};
    fCur.forEach(r => {
      const l = r.linea || "Sin línea";
      if (!g[l]) g[l] = { linea: l, venta: 0, costo: 0, margen: 0, margenReal: 0, cantidad: 0 };
      g[l].venta     += Number(r.subtotal_venta || 0);
      g[l].costo     += Number(r.subtotal_costo || 0);
      g[l].margen    += Number(r.margen         || 0);
      g[l].margenReal+= Number(r.margen_real    || 0);
      g[l].cantidad  += Number(r.cantidad       || 0);
    });
    return Object.values(g).sort((a, b) => b.margen - a.margen);
  }, [fCur]);

  // Por día
  const byDay = useMemo(() => {
    const g = {};
    fCur.forEach(r => {
      const day = (r.fecha_creacion || "").split("T")[0];
      if (!day) return;
      if (!g[day]) g[day] = { day: day.slice(5), Venta: 0, Costo: 0, Margen: 0 };
      g[day].Venta  += Number(r.subtotal_venta || 0);
      g[day].Costo  += Number(r.subtotal_costo || 0);
      g[day].Margen += Number(r.margen         || 0);
    });
    return Object.values(g).sort((a, b) => a.day.localeCompare(b.day))
      .map(d => ({ ...d, Venta: +d.Venta.toFixed(2), Costo: +d.Costo.toFixed(2), Margen: +d.Margen.toFixed(2) }));
  }, [fCur]);

  // Top por margen
  const byVariant = useMemo(() => {
    const g = {};
    fCur.forEach(r => {
      const k = r.variant_id || r.catalog_item_id || r.descripcion;
      if (!g[k]) g[k] = { nombre: r.variant_name || r.catalog_item_nombre || r.descripcion || "—", linea: r.linea, product: r.product_nombre, margen: 0, venta: 0, cantidad: 0, pct: 0 };
      g[k].margen   += Number(r.margen         || 0);
      g[k].venta    += Number(r.subtotal_venta || 0);
      g[k].cantidad += Number(r.cantidad       || 0);
    });
    return Object.values(g).map(v => ({ ...v, pct: v.venta > 0 ? +((v.margen / v.venta) * 100).toFixed(1) : 0 }))
      .sort((a, b) => b.margen - a.margen);
  }, [fCur]);

  const pieData = useMemo(() => byLine.map(i => ({ name: i.linea, value: +i.margen.toFixed(2) })), [byLine]);

  if (!isAdmin) return (
    <div style={S.restricted}>
      <span style={{ fontSize: "48px" }}>🔒</span>
      <h3 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Acceso restringido</h3>
    </div>
  );

  return (
    <div style={S.page}>

      {/* ── Hero ── */}
      <div style={S.hero}>
        <div>
          <div style={S.heroLabel}>PANEL FINANCIERO</div>
          <h2 style={S.heroTitle}>Finanzas</h2>
          <p style={S.heroSub}>Balance real · Costo promedio por importaciones · Margen por ítem</p>
        </div>
        <div style={S.heroRight}>
          <div style={{ display: "flex", gap: "24px" }}>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Margen bruto</span>
              <span style={{ fontSize: "32px", fontWeight: 900, color: "#34d399", display: "block", letterSpacing: "-1px", lineHeight: 1 }}>{margenPct}%</span>
            </div>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: "11px", color: "#64748b", display: "block" }}>Margen real</span>
              <span style={{ fontSize: "32px", fontWeight: 900, color: Number(margenRealPct) >= 0 ? "#10b981" : "#ef4444", display: "block", letterSpacing: "-1px", lineHeight: 1 }}>{margenRealPct}%</span>
            </div>
          </div>
          <button onClick={() => { setExporting(true); exportToExcel(fCur, periodoLabel).finally(() => setExporting(false)); }}
            disabled={exporting || loading}
            style={{ ...S.exportBtn, opacity: exporting || loading ? 0.6 : 1 }}>
            {exporting ? "⏳ Exportando..." : "📥 Exportar Excel"}
          </button>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div style={S.filtersCard}>
        {/* Selector de modo */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
          <button onClick={() => setFilterMode("mes")}
            style={{ ...S.modeBtn, ...(filterMode === "mes" ? S.modeBtnOn : {}) }}>
            📅 Por mes
          </button>
          <button onClick={() => setFilterMode("rango")}
            style={{ ...S.modeBtn, ...(filterMode === "rango" ? S.modeBtnOn : {}) }}>
            📆 Rango de fechas
          </button>
        </div>

        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "flex-end" }}>
          {/* Filtro por mes */}
          {filterMode === "mes" && (
            <>
              <div>
                <label style={S.fieldLabel}>MES</label>
                <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))} style={S.select}>
                  {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={S.fieldLabel}>AÑO</label>
                <select value={selYear} onChange={e => setSelYear(Number(e.target.value))} style={S.select}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div style={{ padding: "8px 14px", background: "#f1f5f9", borderRadius: "10px", fontSize: "13px", fontWeight: 600, color: "#475569" }}>
                {curStart} → {curEnd}
              </div>
            </>
          )}

          {/* Filtro por rango */}
          {filterMode === "rango" && (
            <>
              <div>
                <label style={S.fieldLabel}>DESDE</label>
                <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} style={S.dateInput} />
              </div>
              <div>
                <label style={S.fieldLabel}>HASTA</label>
                <input type="date" value={rangeEnd}   onChange={e => setRangeEnd(e.target.value)}   style={S.dateInput} />
              </div>
            </>
          )}

          {/* Filtro de línea */}
          <div style={{ marginLeft: "auto" }}>
            <label style={S.fieldLabel}>LÍNEA</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {lines.map(l => (
                <button key={l} onClick={() => setSelLine(l)}
                  style={{ ...S.lineTab, ...(selLine === l ? S.lineTabOn : {}) }}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Período label */}
        <div style={{ marginTop: "12px", fontSize: "12px", color: "#64748b" }}>
          Mostrando: <strong style={{ color: "#1e293b" }}>{periodoLabel}</strong>
          {" · "} vs anterior: <strong>{prevStart} → {prevEnd}</strong>
          {" · "} <strong style={{ color: "#6366f1" }}>{fCur.length} registros</strong>
        </div>
      </div>

      {loading ? (
        <div style={S.loadingWrap}>
          <div style={S.spinner} />
          <p style={{ color: "#94a3b8", margin: 0 }}>Cargando datos financieros...</p>
        </div>
      ) : (
        <>
          {/* ── KPIs ── */}
          <div style={S.kpiGrid}>
            <KPICard icon="💵" label="Venta total"         cur={mCur.venta}       prev={mPrev.venta}       format={fmt}   color="#6366f1" />
            <KPICard icon="📦" label="Costo producto"      cur={mCur.costo}       prev={mPrev.costo}       format={fmt}   color="#f59e0b" />
            <KPICard icon="🚚" label="Costo transporte"    cur={mCur.transporte}  prev={mPrev.transporte}  format={fmt}   color="#f97316" />
            <KPICard icon="📈" label="Margen bruto"        cur={mCur.margen}      prev={mPrev.margen}      format={fmt}   color="#10b981" />
            <KPICard icon="✅" label="Margen real"         cur={margenRealCur}    prev={margenRealPrev}    format={fmt}   color="#16a34a" accent />
            <KPICard icon="🔢" label="Unidades vendidas"   cur={mCur.cantidad}    prev={mPrev.cantidad}    format={v => v} color="#0ea5e9" />
          </div>

          {/* Balance real card */}
          <div style={S.balanceCard}>
            <div style={S.balanceLeft}>
              <p style={S.balanceTitle}>💰 Balance Real — {periodoLabel}</p>
              <p style={S.balanceSub}>Venta - Costo producto - Costo transporte = Margen real</p>
            </div>
            <div style={S.balanceFormula}>
              <BalanceItem label="Venta"       value={fmt(mCur.venta)}       color="#6366f1" />
              <span style={S.balanceOp}>−</span>
              <BalanceItem label="Costo prod." value={fmt(mCur.costo)}       color="#f59e0b" />
              <span style={S.balanceOp}>−</span>
              <BalanceItem label="Transporte"  value={fmt(mCur.transporte)}  color="#f97316" />
              <span style={S.balanceOp}>=</span>
              <BalanceItem label="Margen real" value={fmt(margenRealCur)}    color={margenRealCur >= 0 ? "#16a34a" : "#dc2626"} big />
            </div>
            <div style={S.balancePct}>
              <span style={{ fontSize: "42px", fontWeight: 900, color: Number(margenRealPct) >= 0 ? "#16a34a" : "#dc2626", letterSpacing: "-2px" }}>
                {margenRealPct}%
              </span>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>margen real</span>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div style={S.tabs}>
            {[
              { key: "resumen",   label: "📊 Resumen"        },
              { key: "tendencia", label: "📈 Tendencia"       },
              { key: "items",     label: "📋 Margen por ítem" },
              { key: "detalle",   label: "🔍 Detalle"         },
            ].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                style={{ ...S.tab, ...(activeTab === t.key ? S.tabOn : {}) }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Resumen ── */}
          {activeTab === "resumen" && (
            <div style={S.chartsRow}>
              {/* Gráfico por línea */}
              <div style={S.chartCard}>
                <p style={S.chartTitle}>Venta · Costo · Margen por línea</p>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byLine.map(i => ({ linea: i.linea, Venta: +i.venta.toFixed(2), Costo: +i.costo.toFixed(2), Margen: +i.margen.toFixed(2) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="linea" tick={{ fill: "#64748b", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} /><Legend />
                      <Bar dataKey="Venta"  fill={PALETTE.venta}  radius={[4,4,0,0]} />
                      <Bar dataKey="Costo"  fill={PALETTE.costo}  radius={[4,4,0,0]} />
                      <Bar dataKey="Margen" fill={PALETTE.margen} radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Pie margen */}
              <div style={S.chartCard}>
                <p style={S.chartTitle}>Distribución del margen por línea</p>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={110} innerRadius={65} paddingAngle={3}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} /><Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tabla por línea */}
              <div style={{ ...S.chartCard, gridColumn: "1 / -1" }}>
                <p style={S.chartTitle}>Resumen por línea de producción</p>
                <div style={{ overflowX: "auto" }}>
                  <table style={S.table}>
                    <thead>
                      <tr>{["Línea","Venta","Costo producto","Margen bruto","% Margen","Margen real","Cantidad"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {byLine.map((row, i) => {
                        const pct = row.venta > 0 ? ((row.margen / row.venta) * 100).toFixed(1) : "0.0";
                        return (
                          <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                            <td style={{ ...S.td, fontWeight: 700 }}>{row.linea}</td>
                            <td style={S.td}>{fmt(row.venta)}</td>
                            <td style={S.td}>{fmt(row.costo)}</td>
                            <td style={{ ...S.td, color: "#10b981", fontWeight: 700 }}>{fmt(row.margen)}</td>
                            <td style={S.td}>
                              <div style={S.pctBar}>
                                <div style={{ ...S.pctFill, width: `${Math.min(Number(pct), 100)}%` }} />
                                <span style={S.pctLabel}>{pct}%</span>
                              </div>
                            </td>
                            <td style={{ ...S.td, color: "#16a34a", fontWeight: 700 }}>{fmt(row.margenReal)}</td>
                            <td style={S.td}>{row.cantidad}</td>
                          </tr>
                        );
                      })}
                      {byLine.length === 0 && <tr><td colSpan={7} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: "32px" }}>Sin datos para este período</td></tr>}
                      {/* Totales */}
                      {byLine.length > 0 && (
                        <tr style={{ background: "#0f172a", color: "white" }}>
                          <td style={{ ...S.td, color: "white", fontWeight: 800 }}>TOTAL</td>
                          <td style={{ ...S.td, color: "#a5b4fc", fontWeight: 700 }}>{fmt(mCur.venta)}</td>
                          <td style={{ ...S.td, color: "#fde68a", fontWeight: 700 }}>{fmt(mCur.costo)}</td>
                          <td style={{ ...S.td, color: "#6ee7b7", fontWeight: 800 }}>{fmt(mCur.margen)}</td>
                          <td style={{ ...S.td, color: "#6ee7b7", fontWeight: 700 }}>{margenPct}%</td>
                          <td style={{ ...S.td, color: "#34d399", fontWeight: 800 }}>{fmt(margenRealCur)}</td>
                          <td style={{ ...S.td, color: "white", fontWeight: 700 }}>{mCur.cantidad}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Tendencia ── */}
          {activeTab === "tendencia" && (
            <div style={S.chartCard}>
              <p style={S.chartTitle}>Evolución diaria — {periodoLabel}</p>
              {byDay.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Sin datos para este período</div>
              ) : (
                <div style={{ height: 380 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={byDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} /><Legend />
                      <Line type="monotone" dataKey="Venta"  stroke={PALETTE.venta}  strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Costo"  stroke={PALETTE.costo}  strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Margen" stroke={PALETTE.margen} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* ── Margen por ítem ── */}
          {activeTab === "items" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={S.chartCard}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                  <p style={{ ...S.chartTitle, margin: 0 }}>📊 Margen por producto/variante</p>
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>{byVariant.length} productos</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={S.table}>
                    <thead>
                      <tr>{["Producto","Variante","Línea","Unidades","Venta","Costo prom.","Margen","% Margen","Importaciones"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {byVariant.map((item, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                          <td style={{ ...S.td, fontWeight: 700 }}>{item.product || "—"}</td>
                          <td style={S.td}>{item.nombre}</td>
                          <td style={S.td}><span style={S.chip}>{item.linea || "—"}</span></td>
                          <td style={S.td}>{item.cantidad}</td>
                          <td style={S.td}>{fmt(item.venta)}</td>
                          <td style={{ ...S.td, color: "#f97316", fontWeight: 600 }}>
                            {fmt(item.venta > 0 && item.cantidad > 0 ? (item.venta - item.margen) / item.cantidad : 0)}
                          </td>
                          <td style={{ ...S.td, color: item.margen >= 0 ? "#10b981" : "#dc2626", fontWeight: 700 }}>{fmt(item.margen)}</td>
                          <td style={S.td}>
                            <span style={{ ...S.pctChip, background: item.pct >= 40 ? "#dcfce7" : item.pct >= 20 ? "#fef9c3" : "#fee2e2", color: item.pct >= 40 ? "#16a34a" : item.pct >= 20 ? "#ca8a04" : "#dc2626" }}>
                              {item.pct}%
                            </span>
                          </td>
                          <td style={{ ...S.td, color: "#6366f1", fontWeight: 600 }}>
                            {/* Buscar total_importaciones del row */}
                            {fCur.find(r => (r.variant_id && byVariant[i]?.nombre === r.variant_name))?.total_importaciones || "—"}
                          </td>
                        </tr>
                      ))}
                      {byVariant.length === 0 && <tr><td colSpan={9} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: "32px" }}>Sin datos</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Detalle completo ── */}
          {activeTab === "detalle" && (
            <div style={S.chartCard}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <p style={{ ...S.chartTitle, margin: 0 }}>Detalle por ítem de orden</p>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>{fCur.length} registros</span>
                  <button onClick={() => { setExporting(true); exportToExcel(fCur, periodoLabel).finally(() => setExporting(false)); }}
                    disabled={exporting} style={S.exportBtnSm}>
                    {exporting ? "..." : "📥 Excel"}
                  </button>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ ...S.table, minWidth: "1100px" }}>
                  <thead>
                    <tr>
                      {["Fecha","# Orden","Cliente","Descripción","Línea","Variante","Cant.","Venta","Costo prom.","Total costo","Margen bruto","Margen real","% Bruto","Transp."].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fCur.slice(0, 300).map((r, i) => {
                      const pct = Number(r.margen_pct || 0);
                      const margenReal = Number(r.margen_real || 0);
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                          <td style={S.td}>{(r.fecha_creacion || "").split("T")[0]}</td>
                          <td style={{ ...S.td, fontWeight: 700 }}>{r.order_number || "—"}</td>
                          <td style={{ ...S.td, maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.cliente_nombre || "—"}</td>
                          <td style={{ ...S.td, maxWidth: "130px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descripcion || "—"}</td>
                          <td style={S.td}><span style={S.chip}>{r.linea || "—"}</span></td>
                          <td style={{ ...S.td, fontWeight: 600 }}>{r.variant_name || r.catalog_item_nombre || "—"}</td>
                          <td style={S.td}>{r.cantidad}</td>
                          <td style={S.td}>{fmt(r.subtotal_venta)}</td>
                          <td style={{ ...S.td, color: "#f97316", fontSize: "11px" }}>{fmt(r.costo_promedio_unitario)}</td>
                          <td style={{ ...S.td, color: "#f59e0b" }}>{fmt(r.subtotal_costo)}</td>
                          <td style={{ ...S.td, color: "#10b981", fontWeight: 700 }}>{fmt(r.margen)}</td>
                          <td style={{ ...S.td, color: margenReal >= 0 ? "#16a34a" : "#dc2626", fontWeight: 700 }}>{fmt(margenReal)}</td>
                          <td style={S.td}>
                            <span style={{ ...S.pctChip, background: pct >= 40 ? "#dcfce7" : pct >= 20 ? "#fef9c3" : "#fee2e2", color: pct >= 40 ? "#16a34a" : pct >= 20 ? "#ca8a04" : "#dc2626" }}>
                              {pct}%
                            </span>
                          </td>
                          <td style={{ ...S.td, color: "#f97316", fontSize: "11px" }}>{r.costo_transporte > 0 ? fmt(r.costo_transporte) : "—"}</td>
                        </tr>
                      );
                    })}
                    {fCur.length === 0 && <tr><td colSpan={14} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: "40px" }}>Sin datos para este período</td></tr>}
                    {fCur.length > 300 && <tr><td colSpan={14} style={{ ...S.td, textAlign: "center", color: "#94a3b8", fontStyle: "italic" }}>Mostrando 300 de {fCur.length}. Exporta Excel para todos.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function KPICard({ icon, label, cur, prev, format, color, accent }) {
  const { label: pctLabel, positive } = diffPct(cur, prev);
  return (
    <div style={{ ...S.kpiCard, borderTop: `3px solid ${color}`, ...(accent ? { background: "linear-gradient(135deg,#f0fdf4,white)" } : {}) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "20px" }}>{icon}</span>
        <span style={{ ...S.pctChip, background: positive ? "#dcfce7" : "#fee2e2", color: positive ? "#16a34a" : "#dc2626" }}>{pctLabel}</span>
      </div>
      <p style={{ fontSize: "26px", fontWeight: 900, color, margin: "8px 0 4px", letterSpacing: "-0.5px" }}>{format(cur)}</p>
      <p style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", margin: "0 0 2px" }}>{label}</p>
      <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>anterior: {format(prev)}</p>
    </div>
  );
}

function BalanceItem({ label, value, color, big }) {
  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ fontSize: "10px", color: "#94a3b8", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</p>
      <p style={{ fontSize: big ? "22px" : "18px", fontWeight: big ? 900 : 700, color, margin: 0, letterSpacing: "-0.5px" }}>{value}</p>
    </div>
  );
}

const S = {
  page:         { display: "flex", flexDirection: "column", gap: "20px", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#1e293b" },
  restricted:   { display: "flex", flexDirection: "column", alignItems: "center", padding: "80px", gap: "12px", background: "white", borderRadius: "20px", border: "1px solid #e2e8f0" },
  hero:         { background: "linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)", borderRadius: "20px", padding: "28px 32px", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" },
  heroLabel:    { fontSize: "10px", fontWeight: 700, letterSpacing: "3px", color: "#818cf8", marginBottom: "8px" },
  heroTitle:    { fontSize: "32px", fontWeight: 800, margin: 0, letterSpacing: "-1px" },
  heroSub:      { fontSize: "13px", color: "#64748b", marginTop: "6px" },
  heroRight:    { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "14px" },
  exportBtn:    { padding: "11px 22px", borderRadius: "12px", background: "#10b981", color: "white", border: "none", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  exportBtnSm:  { padding: "8px 14px", borderRadius: "10px", background: "#10b981", color: "white", border: "none", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  filtersCard:  { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px 24px" },
  modeBtn:      { padding: "8px 18px", borderRadius: "10px", border: "1.5px solid #e2e8f0", background: "white", fontSize: "13px", fontWeight: 600, color: "#64748b", cursor: "pointer", fontFamily: "inherit" },
  modeBtnOn:    { background: "#0f172a", color: "white", borderColor: "#0f172a" },
  fieldLabel:   { display: "block", fontSize: "10px", fontWeight: 600, color: "#94a3b8", marginBottom: "4px" },
  select:       { padding: "9px 12px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "13px", fontFamily: "inherit", outline: "none", background: "white" },
  dateInput:    { padding: "9px 12px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "13px", fontFamily: "inherit", outline: "none", background: "white" },
  lineTab:      { padding: "6px 14px", borderRadius: "40px", border: "1px solid #e2e8f0", background: "white", fontSize: "12px", fontWeight: 500, color: "#64748b", cursor: "pointer", fontFamily: "inherit" },
  lineTabOn:    { background: "#0f172a", color: "white", borderColor: "#0f172a" },
  loadingWrap:  { display: "flex", flexDirection: "column", alignItems: "center", padding: "80px", gap: "16px" },
  spinner:      { width: "32px", height: "32px", border: "3px solid #e2e8f0", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  kpiGrid:      { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: "12px" },
  kpiCard:      { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "2px" },
  balanceCard:  { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" },
  balanceLeft:  { minWidth: "200px" },
  balanceTitle: { fontSize: "15px", fontWeight: 800, color: "#1e293b", margin: "0 0 4px" },
  balanceSub:   { fontSize: "12px", color: "#94a3b8", margin: 0 },
  balanceFormula: { display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", flex: 1, justifyContent: "center" },
  balanceOp:    { fontSize: "24px", fontWeight: 900, color: "#94a3b8" },
  balancePct:   { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", minWidth: "100px" },
  tabs:         { display: "flex", gap: "4px", background: "white", borderRadius: "14px", padding: "6px", border: "1px solid #e2e8f0" },
  tab:          { flex: 1, padding: "9px 16px", borderRadius: "10px", border: "none", background: "transparent", fontSize: "13px", fontWeight: 600, color: "#64748b", cursor: "pointer", fontFamily: "inherit" },
  tabOn:        { background: "#0f172a", color: "white" },
  chartsRow:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  chartCard:    { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "22px" },
  chartTitle:   { fontSize: "14px", fontWeight: 700, color: "#1e293b", margin: "0 0 14px" },
  table:        { width: "100%", borderCollapse: "separate", borderSpacing: "0 3px" },
  th:           { padding: "10px 14px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap", background: "#f8fafc" },
  td:           { padding: "10px 14px", fontSize: "12px", color: "#1e293b" },
  pctBar:       { position: "relative", background: "#f1f5f9", borderRadius: "40px", height: "20px", width: "90px", overflow: "hidden", display: "flex", alignItems: "center" },
  pctFill:      { position: "absolute", left: 0, top: 0, bottom: 0, background: "linear-gradient(90deg,#10b981,#34d399)", borderRadius: "40px" },
  pctLabel:     { position: "relative", zIndex: 1, fontSize: "11px", fontWeight: 700, color: "#1e293b", paddingLeft: "8px" },
  pctChip:      { padding: "3px 8px", borderRadius: "40px", fontSize: "11px", fontWeight: 700 },
  chip:         { padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: "#f1f5f9", color: "#475569" },
};
