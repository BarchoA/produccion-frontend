import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const PALETTE = { venta: "#6366f1", costo: "#f59e0b", margen: "#10b981" };
const PIE_COLORS = ["#6366f1","#10b981","#f59e0b","#0ea5e9","#ec4899","#14b8a6","#f97316"];

const fmt   = v => `$${Number(v || 0).toFixed(2)}`;
const fDate = d => d.toISOString().split("T")[0];

function getDefaults() {
  const today = new Date();
  const ce = new Date(today);
  const cs = new Date(today); cs.setDate(cs.getDate() - 29);
  const pe = new Date(cs);    pe.setDate(pe.getDate() - 1);
  const ps = new Date(pe);    ps.setDate(ps.getDate() - 29);
  return { cs: fDate(cs), ce: fDate(ce), ps: fDate(ps), pe: fDate(pe) };
}

function diffPct(cur, prev) {
  const c = Number(cur || 0), p = Number(prev || 0);
  if (p === 0 && c === 0) return { label: "0%", positive: true };
  if (p === 0)            return { label: "+∞%", positive: true };
  const d = ((c - p) / p) * 100;
  return { label: `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`, positive: d >= 0 };
}

function agg(rows) {
  return rows.reduce((acc, r) => ({
    venta:    acc.venta    + Number(r.subtotal_venta  || 0),
    costo:    acc.costo    + Number(r.subtotal_costo  || 0),
    margen:   acc.margen   + Number(r.margen          || 0),
    cantidad: acc.cantidad + Number(r.cantidad        || 0),
  }), { venta: 0, costo: 0, margen: 0, cantidad: 0 });
}

function buildTop(rows) {
  const g = {};
  for (const r of rows) {
    const k = r.variant_id || r.catalog_item_id || r.descripcion || r.order_item_id;
    if (!g[k]) g[k] = {
      nombre:    r.variant_name || r.catalog_item_nombre || r.descripcion || "Sin nombre",
      linea:     r.linea || "–",
      image_url: r.image_url || null,
      margen: 0, cantidad: 0, venta: 0, costo: 0,
    };
    g[k].margen   += Number(r.margen          || 0);
    g[k].cantidad += Number(r.cantidad        || 0);
    g[k].venta    += Number(r.subtotal_venta  || 0);
    g[k].costo    += Number(r.subtotal_costo  || 0);
  }
  return Object.values(g);
}

function buildByDay(rows) {
  const g = {};
  for (const r of rows) {
    const day = (r.fecha_creacion || "").split("T")[0];
    if (!day) continue;
    if (!g[day]) g[day] = { day, venta: 0, costo: 0, margen: 0 };
    g[day].venta  += Number(r.subtotal_venta || 0);
    g[day].costo  += Number(r.subtotal_costo || 0);
    g[day].margen += Number(r.margen         || 0);
  }
  return Object.values(g)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map(d => ({ ...d, Venta: +d.venta.toFixed(2), Costo: +d.costo.toFixed(2), Margen: +d.margen.toFixed(2) }));
}

// ── Specs legibles ────────────────────────────────────────────────────────────
function specsToString(specs) {
  if (!specs || typeof specs !== "object") return "";
  const labels = {
    tinta: "Tinta", uv: "UV carcasa", formato: "Formato",
    equivalente: "Equiv. A3", metros_cuadrados: "m²",
    modo_trabajo: "Modo", articulo: "Artículo",
    modo_dtf: "Modo DTF", destino: "Destino",
    observacion_tecnica: "Obs.",
  };
  return Object.entries(specs)
    .filter(([, v]) => v !== null && v !== "" && v !== false && v !== 0)
    .map(([k, v]) => `${labels[k] || k}: ${v}`)
    .join(" | ");
}

// ── Export Excel ──────────────────────────────────────────────────────────────
async function exportToExcel(rows, curStart, curEnd) {
  try {
    const XLSX = await import("xlsx");

    // ── Hoja 1: Detalle completo ──
    const detalle = rows.map(r => {
      const specs = r.specs || {};
      const pct   = r.subtotal_venta > 0
        ? +((Number(r.margen || 0) / Number(r.subtotal_venta)) * 100).toFixed(2)
        : 0;

      return {
        "Fecha":              (r.fecha_creacion || "").split("T")[0],
        "# Orden":            r.order_number    || "",
        "Cliente":            r.cliente_nombre  || "",
        "Estado":             r.estado          || "",
        "Prioridad":          r.prioridad       || "",
        "Descripción":        r.descripcion     || "",
        "Línea":              r.linea           || "",
        // Sellos
        "Producto":           r.product_nombre  || "",
        "Variante / Modelo":  r.variant_name    || "",
        // UV
        "Tipo UV":            r.catalog_item_nombre || "",
        // Specs dinámicos
        "Tinta":              specs.tinta        || "",
        "UV en carcasa":      specs.uv === true ? "Sí" : specs.uv === false ? "No" : "",
        "Formato UV-DTF":     specs.formato      || "",
        "Equiv. Plancha A3":  specs.equivalente  || "",
        "m² UV-Textil":       specs.metros_cuadrados || "",
        "Modo trabajo":       specs.modo_trabajo || "",
        "Artículo":           specs.articulo     || "",
        "Modo DTF":           specs.modo_dtf     || "",
        "Destino":            specs.destino      || "",
        "Obs. Técnica":       specs.observacion_tecnica || "",
        "Otros specs":        specsToString(
          Object.fromEntries(
            Object.entries(specs).filter(([k]) =>
              !["tinta","uv","formato","equivalente","metros_cuadrados","modo_trabajo","articulo","modo_dtf","destino","observacion_tecnica"].includes(k)
            )
          )
        ),
        // Números
        "Cantidad":           Number(r.cantidad        || 0),
        "Precio Unit. ($)":   Number(r.precio_unitario || 0),
        "Venta Subtotal ($)": Number(r.subtotal_venta  || 0),
        "Costo Unit. ($)":    Number(r.variant_cost    || 0),
        "Costo Subtotal ($)": Number(r.subtotal_costo  || 0),
        "Margen ($)":         Number(r.margen          || 0),
        "% Margen":           pct,
        "PDF Orden":          r.pdf_url || "",
      };
    });

    // ── Hoja 2: Resumen por línea ──
    const byLine = {};
    for (const r of rows) {
      const l = r.linea || "Sin línea";
      if (!byLine[l]) byLine[l] = { Línea: l, Venta: 0, Costo: 0, Margen: 0, Cantidad: 0, Órdenes: new Set() };
      byLine[l].Venta    += Number(r.subtotal_venta || 0);
      byLine[l].Costo    += Number(r.subtotal_costo || 0);
      byLine[l].Margen   += Number(r.margen         || 0);
      byLine[l].Cantidad += Number(r.cantidad       || 0);
      if (r.order_id) byLine[l].Órdenes.add(r.order_id);
    }
    const resumenLinea = Object.values(byLine).map(l => ({
      "Línea":       l.Línea,
      "Venta ($)":   +l.Venta.toFixed(2),
      "Costo ($)":   +l.Costo.toFixed(2),
      "Margen ($)":  +l.Margen.toFixed(2),
      "% Margen":    l.Venta > 0 ? +((l.Margen / l.Venta) * 100).toFixed(2) : 0,
      "Cantidad":    l.Cantidad,
      "# Órdenes":   l.Órdenes.size,
    }));

    // ── Hoja 3: Resumen por producto/variante ──
    const byVariant = {};
    for (const r of rows) {
      const k = r.variant_id || r.catalog_item_id || r.descripcion || "sin-key";
      const nombre = r.variant_name || r.catalog_item_nombre || r.descripcion || "Sin nombre";
      if (!byVariant[k]) byVariant[k] = {
        "Producto":    r.product_nombre || "",
        "Variante":    nombre,
        "Tipo UV":     r.catalog_item_nombre || "",
        "Línea":       r.linea || "",
        Venta: 0, Costo: 0, Margen: 0, Cantidad: 0,
      };
      byVariant[k].Venta    += Number(r.subtotal_venta || 0);
      byVariant[k].Costo    += Number(r.subtotal_costo || 0);
      byVariant[k].Margen   += Number(r.margen         || 0);
      byVariant[k].Cantidad += Number(r.cantidad       || 0);
    }
    const resumenVariante = Object.values(byVariant)
      .sort((a, b) => b.Margen - a.Margen)
      .map(v => ({
        "Producto":    v["Producto"],
        "Variante":    v["Variante"],
        "Tipo UV":     v["Tipo UV"],
        "Línea":       v["Línea"],
        "Venta ($)":   +v.Venta.toFixed(2),
        "Costo ($)":   +v.Costo.toFixed(2),
        "Margen ($)":  +v.Margen.toFixed(2),
        "% Margen":    v.Venta > 0 ? +((v.Margen / v.Venta) * 100).toFixed(2) : 0,
        "Cantidad":    v.Cantidad,
      }));

    // ── Hoja 4: Totales ──
    const totales = agg(rows);
    const resumenGeneral = [
      { "Métrica": "Período",         "Valor": `${curStart} → ${curEnd}` },
      { "Métrica": "Venta total",     "Valor": +totales.venta.toFixed(2)   },
      { "Métrica": "Costo total",     "Valor": +totales.costo.toFixed(2)   },
      { "Métrica": "Margen total",    "Valor": +totales.margen.toFixed(2)  },
      { "Métrica": "% Margen",        "Valor": totales.venta > 0 ? +((totales.margen / totales.venta) * 100).toFixed(2) : 0 },
      { "Métrica": "Unidades total",  "Valor": totales.cantidad             },
      { "Métrica": "Total ítems",     "Valor": rows.length                  },
    ];

    // ── Crear workbook ──
    const wb  = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(detalle);
    const ws2 = XLSX.utils.json_to_sheet(resumenLinea);
    const ws3 = XLSX.utils.json_to_sheet(resumenVariante);
    const ws4 = XLSX.utils.json_to_sheet(resumenGeneral);

    ws1["!cols"] = [10,14,20,10,10,28,12,18,18,16,10,12,14,12,10,12,14,12,12,20,20,10,12,14,12,14,10,30].map(w => ({ wch: w }));
    ws2["!cols"] = [16,12,12,12,10,10,10].map(w => ({ wch: w }));
    ws3["!cols"] = [20,22,16,12,12,12,12,10,10].map(w => ({ wch: w }));
    ws4["!cols"] = [22,20].map(w => ({ wch: w }));

    XLSX.utils.book_append_sheet(wb, ws1, "Detalle completo");
    XLSX.utils.book_append_sheet(wb, ws2, "Por línea");
    XLSX.utils.book_append_sheet(wb, ws3, "Por producto-variante");
    XLSX.utils.book_append_sheet(wb, ws4, "Totales");

    XLSX.writeFile(wb, `finanzas_${curStart}_${curEnd}.xlsx`);
  } catch (e) {
    alert("Error exportando. Verifica: npm install xlsx");
    console.error(e);
  }
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1e293b", borderRadius: "12px", padding: "12px 16px", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
      <p style={{ color: "#94a3b8", fontSize: "12px", margin: "0 0 8px" }}>{label}</p>
      {payload.map((e, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "20px", fontSize: "13px" }}>
          <span style={{ color: e.color }}>{e.name}</span>
          <span style={{ color: "white", fontWeight: 700 }}>
            {typeof e.value === "number" && e.value > 50 ? fmt(e.value) : e.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function KPICard({ label, cur, prev, format, icon, accent }) {
  const { label: pctLabel, positive } = diffPct(cur, prev);
  return (
    <div style={S.kpiCard}>
      <div style={{ ...S.kpiIcon, background: accent + "20" }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <p style={S.kpiLabel}>{label}</p>
        <p style={{ ...S.kpiValue, color: accent }}>{format(cur)}</p>
        <div style={S.kpiFooter}>
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>anterior: {format(prev)}</span>
          <span style={{ ...S.kpiBadge, background: positive ? "#dcfce7" : "#fee2e2", color: positive ? "#16a34a" : "#dc2626" }}>
            {pctLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <div>
      <label style={S.fieldLabel}>{label}</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} style={S.dateInput} />
    </div>
  );
}

function TopRow({ rank, item, metric, metricLabel, format }) {
  const rc = ["#f59e0b", "#94a3b8", "#cd7c2f", "#64748b", "#64748b"];
  return (
    <div style={S.topRow}>
      <div style={{ ...S.topRank, background: rc[rank - 1] + "22", color: rc[rank - 1] }}>#{rank}</div>
      {item.image_url
        ? <img src={item.image_url} alt="" style={S.topImg} />
        : <div style={S.topImgEmpty}>📦</div>
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nombre}</p>
        <p style={{ fontSize: "11px", color: "#94a3b8", margin: "2px 0 0" }}>{item.linea}</p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ fontSize: "15px", fontWeight: 800, color: "#10b981", margin: 0 }}>{format(item[metric])}</p>
        <p style={{ fontSize: "10px", color: "#94a3b8", margin: "2px 0 0" }}>{metricLabel}</p>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Finance() {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === "admin";
  const d = getDefaults();

  const [rowsCur,   setRowsCur]   = useState([]);
  const [rowsPrev,  setRowsPrev]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);
  const [curStart,  setCurStart]  = useState(d.cs);
  const [curEnd,    setCurEnd]    = useState(d.ce);
  const [prevStart, setPrevStart] = useState(d.ps);
  const [prevEnd,   setPrevEnd]   = useState(d.pe);
  const [selLine,   setSelLine]   = useState("Todas");
  const [activeTab, setActiveTab] = useState("resumen");

  useEffect(() => { fetchData(); }, [curStart, curEnd, prevStart, prevEnd]);

  async function fetchData() {
    try {
      setLoading(true);
      const [{ data: cd, error: ce }, { data: pd, error: pe }] = await Promise.all([
        supabase.from("financial_order_items").select("*")
          .gte("fecha_creacion", `${curStart}T00:00:00`)
          .lte("fecha_creacion", `${curEnd}T23:59:59`),
        supabase.from("financial_order_items").select("*")
          .gte("fecha_creacion", `${prevStart}T00:00:00`)
          .lte("fecha_creacion", `${prevEnd}T23:59:59`),
      ]);
      if (ce) throw ce;
      if (pe) throw pe;
      setRowsCur(cd || []);
      setRowsPrev(pd || []);
    } catch (e) {
      alert("Error cargando finanzas");
    } finally {
      setLoading(false);
    }
  }

  const lines    = useMemo(() => ["Todas", ...[...new Set([...rowsCur, ...rowsPrev].map(r => r.linea).filter(Boolean))].sort()], [rowsCur, rowsPrev]);
  const fCur     = useMemo(() => selLine === "Todas" ? rowsCur  : rowsCur.filter(r => r.linea === selLine),  [rowsCur,  selLine]);
  const fPrev    = useMemo(() => selLine === "Todas" ? rowsPrev : rowsPrev.filter(r => r.linea === selLine), [rowsPrev, selLine]);
  const mCur     = useMemo(() => agg(fCur),  [fCur]);
  const mPrev    = useMemo(() => agg(fPrev), [fPrev]);

  const byLine = useMemo(() => {
    const g = {};
    for (const r of fCur) {
      const l = r.linea || "Sin línea";
      if (!g[l]) g[l] = { linea: l, venta: 0, costo: 0, margen: 0, cantidad: 0 };
      g[l].venta    += Number(r.subtotal_venta || 0);
      g[l].costo    += Number(r.subtotal_costo || 0);
      g[l].margen   += Number(r.margen         || 0);
      g[l].cantidad += Number(r.cantidad       || 0);
    }
    return Object.values(g).sort((a, b) => b.margen - a.margen);
  }, [fCur]);

  const topData   = useMemo(() => buildTop(fCur),  [fCur]);
  const topMargin = useMemo(() => [...topData].sort((a, b) => b.margen   - a.margen).slice(0, 5),   [topData]);
  const topQty    = useMemo(() => [...topData].sort((a, b) => b.cantidad - a.cantidad).slice(0, 5), [topData]);
  const byDay     = useMemo(() => buildByDay(fCur), [fCur]);
  const pieData   = useMemo(() => byLine.map(i => ({ name: i.linea, value: +i.margen.toFixed(2) })), [byLine]);
  const chartLine = useMemo(() => byLine.map(i => ({ linea: i.linea, Venta: +i.venta.toFixed(2), Costo: +i.costo.toFixed(2), Margen: +i.margen.toFixed(2) })), [byLine]);
  const margenPct = mCur.venta > 0 ? ((mCur.margen / mCur.venta) * 100).toFixed(1) : "0.0";

  async function handleExport() { setExporting(true); await exportToExcel(fCur, curStart, curEnd); setExporting(false); }

  if (!isAdmin) return (
    <div style={S.restricted}>
      <span style={{ fontSize: "48px" }}>🔒</span>
      <h3 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Acceso restringido</h3>
      <p style={{ color: "#94a3b8", margin: 0 }}>Solo el rol admin puede ver finanzas.</p>
    </div>
  );

  return (
    <div style={S.page}>

      {/* Hero */}
      <div style={S.hero}>
        <div>
          <div style={S.heroLabel}>PANEL FINANCIERO</div>
          <h2 style={S.heroTitle}>Finanzas</h2>
          <p style={S.heroSub}>Rentabilidad, costos y volumen · Cierre mensual exportable a Excel</p>
        </div>
        <div style={S.heroRight}>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "42px", fontWeight: 900, color: "#34d399", display: "block", letterSpacing: "-2px", lineHeight: 1 }}>{margenPct}%</span>
            <span style={{ fontSize: "11px", color: "#64748b", display: "block", marginTop: "4px" }}>Margen del período</span>
          </div>
          <button onClick={handleExport} disabled={exporting || loading}
            style={{ ...S.exportBtn, opacity: exporting || loading ? 0.6 : 1 }}>
            {exporting ? "⏳ Exportando..." : "📥 Exportar Excel"}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={S.filtersCard}>
        <div style={S.filtersRow}>
          <div style={S.filterGroup}>
            <span style={S.filterGroupTitle}>📅 Periodo actual</span>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <DateField label="Desde" value={curStart} onChange={setCurStart} />
              <DateField label="Hasta" value={curEnd}   onChange={setCurEnd}   />
            </div>
          </div>
          <div style={S.filterDivider} />
          <div style={S.filterGroup}>
            <span style={S.filterGroupTitle}>📊 Periodo comparativo</span>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <DateField label="Desde" value={prevStart} onChange={setPrevStart} />
              <DateField label="Hasta" value={prevEnd}   onChange={setPrevEnd}   />
            </div>
          </div>
          <div style={S.filterDivider} />
          <div style={S.filterGroup}>
            <span style={S.filterGroupTitle}>🏷 Línea</span>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {lines.map(l => (
                <button key={l} onClick={() => setSelLine(l)}
                  style={{ ...S.lineTab, ...(selLine === l ? S.lineTabOn : {}) }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={S.loading}><div style={S.spinner} /><p style={{ color: "#94a3b8", margin: 0 }}>Cargando datos...</p></div>
      ) : (
        <>
          {/* KPIs */}
          <div style={S.kpiGrid}>
            <KPICard label="Venta total"  cur={mCur.venta}    prev={mPrev.venta}    format={fmt}   icon="💰" accent="#6366f1" />
            <KPICard label="Costo total"  cur={mCur.costo}    prev={mPrev.costo}    format={fmt}   icon="📦" accent="#f59e0b" />
            <KPICard label="Margen total" cur={mCur.margen}   prev={mPrev.margen}   format={fmt}   icon="📈" accent="#10b981" />
            <KPICard label="Unidades"     cur={mCur.cantidad} prev={mPrev.cantidad} format={v => v} icon="🔢" accent="#0ea5e9" />
          </div>

          {/* Tabs */}
          <div style={S.tabs}>
            {[
              { key: "resumen",   label: "📊 Resumen"        },
              { key: "tendencia", label: "📈 Tendencia"       },
              { key: "tops",      label: "🏆 Top productos"   },
              { key: "detalle",   label: "📋 Detalle"         },
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
              <div style={S.chartCard}>
                <p style={S.chartTitle}>Venta · Costo · Margen por línea</p>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartLine}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="linea" tick={{ fill: "#64748b", fontSize: 12 }} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="Venta"  fill={PALETTE.venta}  radius={[6,6,0,0]} />
                      <Bar dataKey="Costo"  fill={PALETTE.costo}  radius={[6,6,0,0]} />
                      <Bar dataKey="Margen" fill={PALETTE.margen} radius={[6,6,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div style={S.chartCard}>
                <p style={S.chartTitle}>Distribución del margen</p>
                <div style={{ height: 300 }}>
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
              <div style={{ ...S.chartCard, gridColumn: "1 / -1" }}>
                <p style={S.chartTitle}>Tabla por línea</p>
                <div style={{ overflowX: "auto" }}>
                  <table style={S.table}>
                    <thead>
                      <tr>{["Línea","Venta","Costo","Margen","% Margen","Cantidad"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
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
                            <td style={S.td}>{row.cantidad}</td>
                          </tr>
                        );
                      })}
                      {byLine.length === 0 && (
                        <tr><td colSpan={6} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: "32px" }}>Sin datos</td></tr>
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
              <p style={S.chartTitle}>Evolución diaria del período</p>
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
              {byDay.length === 0 && <p style={{ textAlign: "center", color: "#94a3b8" }}>Sin datos para este período</p>}
            </div>
          )}

          {/* ── Tops ── */}
          {activeTab === "tops" && (
            <div style={S.chartsRow}>
              <div style={S.chartCard}>
                <p style={S.chartTitle}>🥇 Top 5 por margen</p>
                <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 16px" }}>Productos más rentables</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {topMargin.length === 0
                    ? <p style={{ color: "#94a3b8" }}>Sin datos</p>
                    : topMargin.map((item, i) => <TopRow key={i} rank={i + 1} item={item} metric="margen"   metricLabel="Margen"   format={fmt}   />)
                  }
                </div>
              </div>
              <div style={S.chartCard}>
                <p style={S.chartTitle}>📦 Top 5 por cantidad</p>
                <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 16px" }}>Mayor volumen de unidades</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {topQty.length === 0
                    ? <p style={{ color: "#94a3b8" }}>Sin datos</p>
                    : topQty.map((item, i) => <TopRow key={i} rank={i + 1} item={item} metric="cantidad" metricLabel="Unidades" format={v => v} />)
                  }
                </div>
              </div>
            </div>
          )}

          {/* ── Detalle ── */}
          {activeTab === "detalle" && (
            <div style={S.chartCard}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <p style={{ ...S.chartTitle, margin: 0 }}>Detalle completo de ítems</p>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "13px", color: "#94a3b8" }}>{fCur.length} registros</span>
                  <button onClick={handleExport} disabled={exporting} style={S.exportBtnSm}>
                    {exporting ? "..." : "📥 Excel"}
                  </button>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {["Fecha","# Orden","Cliente","Descripción","Línea","Producto","Variante","Tipo UV","Specs","Cant.","Venta","Costo","Margen","% Margen"].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fCur.slice(0, 200).map((r, i) => {
                      const pct = r.subtotal_venta > 0
                        ? ((Number(r.margen || 0) / Number(r.subtotal_venta)) * 100).toFixed(1)
                        : "0.0";
                      const specsStr = specsToString(r.specs || {});
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                          <td style={S.td}>{(r.fecha_creacion || "").split("T")[0]}</td>
                          <td style={{ ...S.td, fontWeight: 700 }}>{r.order_number || "—"}</td>
                          <td style={S.td}>{r.cliente_nombre || "—"}</td>
                          <td style={{ ...S.td, maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descripcion || "—"}</td>
                          <td style={S.td}><span style={S.chip}>{r.linea || "—"}</span></td>
                          <td style={S.td}>{r.product_nombre || "—"}</td>
                          <td style={{ ...S.td, fontWeight: 600 }}>{r.variant_name || "—"}</td>
                          <td style={S.td}>{r.catalog_item_nombre || "—"}</td>
                          <td style={{ ...S.td, maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "11px", color: "#64748b" }}>{specsStr || "—"}</td>
                          <td style={S.td}>{r.cantidad}</td>
                          <td style={S.td}>{fmt(r.subtotal_venta)}</td>
                          <td style={S.td}>{fmt(r.subtotal_costo)}</td>
                          <td style={{ ...S.td, color: "#10b981", fontWeight: 700 }}>{fmt(r.margen)}</td>
                          <td style={S.td}>
                            <span style={{ ...S.pctChip, background: Number(pct) >= 30 ? "#dcfce7" : Number(pct) >= 10 ? "#fef9c3" : "#fee2e2", color: Number(pct) >= 30 ? "#16a34a" : Number(pct) >= 10 ? "#ca8a04" : "#dc2626" }}>
                              {pct}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {fCur.length === 0 && (
                      <tr><td colSpan={14} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: "40px" }}>Sin datos en este período</td></tr>
                    )}
                    {fCur.length > 200 && (
                      <tr><td colSpan={14} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: "12px", fontStyle: "italic" }}>
                        Mostrando 200 de {fCur.length}. Exporta el Excel para ver todos.
                      </td></tr>
                    )}
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

const S = {
  page:             { display: "flex", flexDirection: "column", gap: "20px", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#1e293b" },
  restricted:       { display: "flex", flexDirection: "column", alignItems: "center", padding: "80px", gap: "12px", background: "white", borderRadius: "20px", border: "1px solid #e2e8f0" },
  hero:             { background: "linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)", borderRadius: "20px", padding: "32px 36px", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" },
  heroLabel:        { fontSize: "10px", fontWeight: 700, letterSpacing: "3px", color: "#818cf8", marginBottom: "8px" },
  heroTitle:        { fontSize: "34px", fontWeight: 800, margin: 0, letterSpacing: "-1px" },
  heroSub:          { fontSize: "13px", color: "#64748b", marginTop: "6px" },
  heroRight:        { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "14px" },
  exportBtn:        { padding: "12px 24px", borderRadius: "12px", background: "#10b981", color: "white", border: "none", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  exportBtnSm:      { padding: "8px 16px", borderRadius: "10px", background: "#10b981", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  filtersCard:      { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px 24px" },
  filtersRow:       { display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-start" },
  filterGroup:      { display: "flex", flexDirection: "column", gap: "10px" },
  filterGroupTitle: { fontSize: "12px", fontWeight: 700, color: "#475569" },
  filterDivider:    { width: "1px", background: "#e2e8f0", alignSelf: "stretch" },
  fieldLabel:       { display: "block", fontSize: "10px", fontWeight: 600, color: "#94a3b8", marginBottom: "4px" },
  dateInput:        { padding: "9px 12px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "13px", outline: "none", fontFamily: "inherit", background: "white" },
  lineTab:          { padding: "6px 14px", borderRadius: "40px", border: "1px solid #e2e8f0", background: "white", fontSize: "12px", fontWeight: 500, color: "#64748b", cursor: "pointer", fontFamily: "inherit" },
  lineTabOn:        { background: "#1e1b4b", color: "white", borderColor: "#1e1b4b" },
  loading:          { display: "flex", flexDirection: "column", alignItems: "center", padding: "80px", gap: "16px" },
  spinner:          { width: "32px", height: "32px", border: "3px solid #e2e8f0", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  kpiGrid:          { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "14px" },
  kpiCard:          { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "18px 20px", display: "flex", gap: "14px", alignItems: "flex-start" },
  kpiIcon:          { width: "44px", height: "44px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0 },
  kpiLabel:         { fontSize: "11px", color: "#94a3b8", margin: "0 0 4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" },
  kpiValue:         { fontSize: "26px", fontWeight: 800, margin: 0, letterSpacing: "-1px" },
  kpiFooter:        { display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" },
  kpiBadge:         { padding: "2px 8px", borderRadius: "40px", fontSize: "11px", fontWeight: 700 },
  tabs:             { display: "flex", gap: "4px", background: "white", borderRadius: "14px", padding: "6px", border: "1px solid #e2e8f0" },
  tab:              { flex: 1, padding: "9px 16px", borderRadius: "10px", border: "none", background: "transparent", fontSize: "13px", fontWeight: 600, color: "#64748b", cursor: "pointer", fontFamily: "inherit" },
  tabOn:            { background: "#0f172a", color: "white" },
  chartsRow:        { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  chartCard:        { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "22px" },
  chartTitle:       { fontSize: "15px", fontWeight: 700, color: "#1e293b", margin: "0 0 16px" },
  table:            { width: "100%", borderCollapse: "separate", borderSpacing: "0 3px" },
  th:               { padding: "10px 14px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap" },
  td:               { padding: "12px 14px", fontSize: "13px", color: "#1e293b" },
  pctBar:           { position: "relative", background: "#f1f5f9", borderRadius: "40px", height: "20px", width: "100px", overflow: "hidden", display: "flex", alignItems: "center" },
  pctFill:          { position: "absolute", left: 0, top: 0, bottom: 0, background: "linear-gradient(90deg,#10b981,#34d399)", borderRadius: "40px" },
  pctLabel:         { position: "relative", zIndex: 1, fontSize: "11px", fontWeight: 700, color: "#1e293b", paddingLeft: "8px" },
  pctChip:          { padding: "3px 8px", borderRadius: "40px", fontSize: "11px", fontWeight: 700 },
  chip:             { padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: "#f1f5f9", color: "#475569" },
  topRow:           { display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", background: "#f8fafc", borderRadius: "12px" },
  topRank:          { width: "30px", height: "30px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800, flexShrink: 0 },
  topImg:           { width: "40px", height: "40px", borderRadius: "10px", objectFit: "cover", border: "1px solid #e2e8f0" },
  topImgEmpty:      { width: "40px", height: "40px", borderRadius: "10px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", border: "1px solid #e2e8f0" },
};
