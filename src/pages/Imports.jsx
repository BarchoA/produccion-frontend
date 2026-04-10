import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

// ─── Utilidades ───────────────────────────────────────────────────────────────
const fmt     = v => `$${Number(v || 0).toFixed(2)}`;
const fmtDate = d => { if (!d) return "—"; return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" }); };

// Parsear precio de string como "$1,234.56" o "1234.56"
function parsePrice(val) {
  if (!val && val !== 0) return 0;
  const s = String(val).replace(/[$,\s]/g, "").trim();
  return isFinite(Number(s)) ? Number(s) : 0;
}

// Normalizar texto para comparación
function normalizeText(t) {
  return String(t || "").toLowerCase().trim()
    .replace(/[áàä]/g, "a").replace(/[éèë]/g, "e")
    .replace(/[íìï]/g, "i").replace(/[óòö]/g, "o")
    .replace(/[úùü]/g, "u").replace(/[ñ]/g, "n")
    .replace(/\s+/g, " ");
}

// Detectar columnas del Excel dinámicamente
function detectColumns(headers) {
  const map = {};
  const normalize = h => normalizeText(String(h || ""));
  headers.forEach((h, i) => {
    const n = normalize(h);
    if (!map.item     && (n.includes("item") || n.includes("descripcion") || n.includes("producto") || n.includes("articulo") || n.includes("nombre"))) map.item = i;
    if (!map.cantidad && (n.includes("cantidad") || n.includes("qty") || n.includes("units") || n.includes("unidad"))) map.cantidad = i;
    if (!map.costo    && (n.includes("costo") || n.includes("cost") || n.includes("precio unit") || n.includes("p.unit") || n.includes("unit price"))) map.costo = i;
    if (!map.pvp      && (n.includes("pvp") || n.includes("venta") || n.includes("sale") || n.includes("precio venta") || n.includes("p.venta"))) map.pvp = i;
    if (!map.vendedor && (n.includes("vendedor") || n.includes("proveedor") || n.includes("vendor") || n.includes("supplier"))) map.vendedor = i;
    if (!map.tracking && (n.includes("tracking") || n.includes("guia") || n.includes("referencia") || n.includes("ref"))) map.tracking = i;
  });
  return map;
}

// Parsear filas del Excel usando detección de columnas
function parseRows(allRows) {
  if (!allRows || allRows.length < 2) return { items: [], headers: [] };
  
  // Buscar la fila de encabezados (primera fila con texto relevante)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const row = allRows[i];
    const text = row.map(c => normalizeText(String(c || ""))).join(" ");
    if (text.includes("item") || text.includes("cantidad") || text.includes("costo") || text.includes("descripcion") || text.includes("producto")) {
      headerIdx = i;
      break;
    }
  }

  const headers  = allRows[headerIdx].map(h => String(h || "").trim());
  const colMap   = detectColumns(headers);
  const dataRows = allRows.slice(headerIdx + 1);
  const items    = [];

  for (const row of dataRows) {
    const nombreRaw = row[colMap.item];
    if (!nombreRaw || String(nombreRaw).trim() === "") continue;
    const nombre = String(nombreRaw).trim();
    // Saltar filas de totales o encabezados repetidos
    if (normalizeText(nombre).startsWith("total") || normalizeText(nombre) === "item" || normalizeText(nombre) === "descripcion") continue;

    const cantidad = Number(row[colMap.cantidad]) || 0;
    const costo    = parsePrice(row[colMap.costo]);
    const pvp      = parsePrice(row[colMap.pvp]);
    if (cantidad === 0 && costo === 0) continue;

    items.push({
      nombre_original: nombre,
      cantidad,
      costo_fob_unitario: costo,
      costo_fob_total:    +(costo * cantidad).toFixed(2),
      pvp_sugerido:       pvp,
      vendedor:           colMap.vendedor !== undefined ? String(row[colMap.vendedor] || "").trim() : "",
      tracking:           colMap.tracking !== undefined ? String(row[colMap.tracking] || "").trim() : "",
      // Normalización — se completa después
      normalizado:        false,
      product_id:         null,
      variant_id:         null,
      linea:              "",
      product_name:       "",
      variant_name:       "",
    });
  }

  return { items, headers, colMap };
}

const ESTADO_CONFIG = {
  borrador:  { color: "#6366f1", bg: "#eef2ff", label: "Borrador",   icon: "📝" },
  procesado: { color: "#f59e0b", bg: "#fffbeb", label: "Procesado",  icon: "⚙️" },
  aplicado:  { color: "#10b981", bg: "#f0fdf4", label: "Aplicado",   icon: "✅" },
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Imports() {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === "admin" || profile?.rol === "importaciones";

  const [tab,           setTab]           = useState("historial"); // historial | nueva
  const [importaciones, setImportaciones] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [selected,      setSelected]      = useState(null); // importación seleccionada para ver detalle
  const [products,      setProducts]      = useState([]);
  const [variants,      setVariants]      = useState([]);
  const [normMap,       setNormMap]       = useState({}); // nombre_original → { product_id, variant_id, linea }

  useEffect(() => { if (isAdmin) { fetchAll(); } }, [isAdmin]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [{ data: imps }, { data: prods }, { data: vars }, { data: norms }] = await Promise.all([
        supabase.from("importaciones").select("*").order("created_at", { ascending: false }),
        supabase.from("products").select("id, nombre, linea, slug").eq("is_active", true).order("nombre"),
        supabase.from("product_variants").select("id, product_id, nombre, costo, costo_promedio, stock, total_importaciones, image_url").eq("is_active", true).order("nombre"),
        supabase.from("importacion_normalizacion").select("*"),
      ]);
      setImportaciones(imps || []);
      setProducts(prods || []);
      setVariants(vars || []);
      // Construir mapa de normalización
      const m = {};
      (norms || []).forEach(n => { m[n.nombre_original] = n; });
      setNormMap(m);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  if (!isAdmin) return (
    <div style={S.restricted}>
      <span style={{ fontSize: "48px" }}>🔒</span>
      <h3 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Acceso restringido</h3>
      <p style={{ color: "#94a3b8", margin: 0 }}>Solo administradores e importaciones pueden acceder.</p>
    </div>
  );

  return (
    <div style={S.page}>
      {/* Hero */}
      <div style={S.hero}>
        <div>
          <div style={S.heroLabel}>MÓDULO DE IMPORTACIONES</div>
          <h2 style={S.heroTitle}>Importaciones</h2>
          <p style={S.heroSub}>Gestión de compras · Normalización de productos · Costo promedio · Control de stock</p>
        </div>
        <div style={S.heroStats}>
          <HeroStat num={importaciones.length}                                        label="Importaciones"  color="#a5b4fc" />
          <HeroStat num={importaciones.filter(i => i.estado === "aplicado").length}   label="Aplicadas"      color="#34d399" />
          <HeroStat num={fmt(importaciones.reduce((a, i) => a + Number(i.total_costo_real || 0), 0))} label="Costo total" color="#fbbf24" />
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        <button onClick={() => setTab("historial")} style={{ ...S.tab, ...(tab === "historial" ? S.tabOn : {}) }}>📋 Historial</button>
        <button onClick={() => setTab("nueva")}     style={{ ...S.tab, ...(tab === "nueva"     ? S.tabOn : {}) }}>➕ Nueva importación</button>
        <button onClick={() => setTab("normalizacion")} style={{ ...S.tab, ...(tab === "normalizacion" ? S.tabOn : {}) }}>🔗 Normalización</button>
        <button onClick={() => setTab("kpis")}      style={{ ...S.tab, ...(tab === "kpis"      ? S.tabOn : {}) }}>📊 KPIs</button>
      </div>

      {/* Historial */}
      {tab === "historial" && (
        <HistorialTab
          importaciones={importaciones}
          loading={loading}
          onSelect={setSelected}
          selected={selected}
          onRefresh={fetchAll}
          products={products}
          variants={variants}
        />
      )}

      {/* Nueva importación */}
      {tab === "nueva" && (
        <NuevaImportacionTab
          products={products}
          variants={variants}
          normMap={normMap}
          onSaved={() => { setTab("historial"); fetchAll(); }}
          onRefreshNorm={fetchAll}
        />
      )}

      {/* Normalización */}
      {tab === "normalizacion" && (
        <NormalizacionTab
          normMap={normMap}
          products={products}
          variants={variants}
          onRefresh={fetchAll}
        />
      )}

      {/* KPIs */}
      {tab === "kpis" && (
        <KPIsTab importaciones={importaciones} variants={variants} products={products} />
      )}
    </div>
  );
}

// ─── Tab: Historial ───────────────────────────────────────────────────────────
function HistorialTab({ importaciones, loading, onSelect, selected, onRefresh, products, variants }) {
  const [detail,        setDetail]        = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [applying,      setApplying]      = useState(false);

  async function loadDetail(imp) {
    try {
      setLoadingDetail(true);
      onSelect(imp);
      const { data } = await supabase
        .from("importacion_items")
        .select("*, product_variants(nombre, costo, costo_promedio, stock), products(nombre, linea)")
        .eq("importacion_id", imp.id)
        .order("created_at");
      setDetail(data || []);
    } catch (e) { console.error(e); }
    finally { setLoadingDetail(false); }
  }

  async function aplicarImportacion(imp) {
    if (imp.estado === "aplicado") { alert("Esta importación ya fue aplicada"); return; }
    if (!window.confirm(`¿Aplicar importación ${imp.numero}?\n\nEsto actualizará el stock y el costo promedio de ${imp.total_items} productos.`)) return;
    try {
      setApplying(true);
      const { data: items } = await supabase.from("importacion_items").select("*").eq("importacion_id", imp.id).eq("normalizado", true);
      if (!items?.length) { alert("No hay ítems normalizados para aplicar"); return; }

      for (const item of items) {
        if (!item.variant_id) continue;
        // 1. Obtener variante actual
        const { data: variant } = await supabase.from("product_variants").select("stock, costo_promedio, total_importaciones").eq("id", item.variant_id).single();
        if (!variant) continue;

        const totalImps      = (variant.total_importaciones || 0) + 1;
        const costoAnterior  = Number(variant.costo_promedio || 0);
        const costoNuevo     = Number(item.costo_unitario_real || item.costo_fob_unitario || 0);
        const costoPromedio  = +((costoAnterior * (totalImps - 1) + costoNuevo) / totalImps).toFixed(4);
        const nuevoStock     = (variant.stock || 0) + (item.cantidad || 0);

        // 2. Actualizar variante
        await supabase.from("product_variants").update({
          stock:               nuevoStock,
          costo_promedio:      costoPromedio,
          costo:               costoPromedio, // También actualiza el costo base
          total_importaciones: totalImps,
          ultimo_costo_fob:    costoNuevo,
          ultima_importacion_id: imp.id,
        }).eq("id", item.variant_id);

        // 3. Registrar historial de costo
        await supabase.from("costo_promedio_historial").insert({
          variant_id:         item.variant_id,
          importacion_id:     imp.id,
          costo_anterior:     costoAnterior,
          costo_nuevo:        costoNuevo,
          costo_promedio:     costoPromedio,
          total_importaciones: totalImps,
        });
      }

      // 4. Marcar importación como aplicada
      await supabase.from("importaciones").update({ estado: "aplicado", updated_at: new Date().toISOString() }).eq("id", imp.id);
      await onRefresh();
      alert(`✅ Importación ${imp.numero} aplicada correctamente.\nStock y costos actualizados.`);
    } catch (e) { alert("Error aplicando: " + e.message); }
    finally { setApplying(false); }
  }

  async function eliminarImportacion(imp) {
    if (imp.estado === "aplicado") { alert("No se puede eliminar una importación ya aplicada"); return; }
    if (!window.confirm(`¿Eliminar importación ${imp.numero}?`)) return;
    await supabase.from("importaciones").delete().eq("id", imp.id);
    await onRefresh();
    if (selected?.id === imp.id) { onSelect(null); setDetail(null); }
  }

  if (loading) return <Loading />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: selected ? "380px 1fr" : "1fr", gap: "16px" }}>
      {/* Lista */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {importaciones.length === 0 ? (
          <div style={S.emptyState}>
            <span style={{ fontSize: "48px" }}>📦</span>
            <p style={{ color: "#94a3b8", margin: 0 }}>Sin importaciones. Crea la primera en la pestaña "Nueva importación".</p>
          </div>
        ) : importaciones.map(imp => {
          const cfg      = ESTADO_CONFIG[imp.estado] || ESTADO_CONFIG.borrador;
          const isActive = selected?.id === imp.id;
          return (
            <div key={imp.id} style={{ ...S.impCard, ...(isActive ? { border: "2px solid #6366f1", background: "#fafeff" } : {}) }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "10px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>{imp.numero}</span>
                    <span style={{ ...S.estadoBadge, background: cfg.bg, color: cfg.color }}>{cfg.icon} {cfg.label}</span>
                  </div>
                  <p style={{ fontSize: "12px", color: "#94a3b8", margin: "3px 0 0" }}>{fmtDate(imp.fecha)} · {imp.proveedor || "Sin proveedor"}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "15px", fontWeight: 800, color: "#10b981", margin: 0 }}>{fmt(imp.total_costo_real || imp.total_costo_fob)}</p>
                  <p style={{ fontSize: "11px", color: "#94a3b8", margin: "2px 0 0" }}>{imp.total_items} productos · {imp.total_unidades} unidades</p>
                </div>
              </div>

              {imp.descripcion && <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 8px" }}>{imp.descripcion}</p>}

              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button onClick={() => isActive ? (onSelect(null), setDetail(null)) : loadDetail(imp)}
                  style={S.btnSm}>
                  {isActive ? "Cerrar" : "📋 Ver detalle"}
                </button>
                {imp.estado !== "aplicado" && (
                  <button onClick={() => aplicarImportacion(imp)} disabled={applying}
                    style={{ ...S.btnSm, background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac", opacity: applying ? 0.6 : 1 }}>
                    {applying ? "Aplicando..." : "✅ Aplicar al inventario"}
                  </button>
                )}
                {imp.archivo_url && (
                  <a href={imp.archivo_url} target="_blank" rel="noreferrer" style={{ ...S.btnSm, textDecoration: "none", background: "#f0f9ff", color: "#0284c7" }}>
                    📎 Archivo
                  </a>
                )}
                {imp.estado !== "aplicado" && (
                  <button onClick={() => eliminarImportacion(imp)}
                    style={{ ...S.btnSm, background: "#fff1f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                    🗑
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detalle */}
      {selected && (
        <div style={S.detailPanel}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>Detalle: {selected.numero}</h3>
            <button onClick={() => { onSelect(null); setDetail(null); }} style={S.btnSm}>✕ Cerrar</button>
          </div>

          {/* Costos adicionales */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "16px" }}>
            <MiniKPI label="FOB total"  value={fmt(selected.total_costo_fob)}  color="#6366f1" />
            <MiniKPI label="Flete"      value={fmt(selected.costo_flete)}       color="#f59e0b" />
            <MiniKPI label="Aduana"     value={fmt(selected.costo_aduana)}      color="#f97316" />
            <MiniKPI label="Costo real" value={fmt(selected.total_costo_real)}  color="#10b981" />
          </div>

          {loadingDetail ? <Loading /> : detail ? (
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {["Item original", "Línea", "Producto / Variante", "Cant.", "Costo FOB", "Costo real unit.", "PVP sugerido", "Margen %", "Norm."].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.map((item, i) => {
                    const pct = item.pvp_sugerido > 0
                      ? (((item.pvp_sugerido - (item.costo_unitario_real || item.costo_fob_unitario)) / item.pvp_sugerido) * 100).toFixed(1)
                      : "—";
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                        <td style={{ ...S.td, maxWidth: "200px", fontSize: "11px" }}>{item.nombre_original}</td>
                        <td style={S.td}>{item.linea || "—"}</td>
                        <td style={S.td}>
                          {item.normalizado ? (
                            <div>
                              <p style={{ fontSize: "11px", fontWeight: 700, margin: 0 }}>{item.products?.nombre}</p>
                              <p style={{ fontSize: "10px", color: "#94a3b8", margin: 0 }}>{item.product_variants?.nombre}</p>
                            </div>
                          ) : <span style={{ color: "#dc2626", fontSize: "11px" }}>⚠ Sin normalizar</span>}
                        </td>
                        <td style={S.td}>{item.cantidad}</td>
                        <td style={S.td}>{fmt(item.costo_fob_unitario)}</td>
                        <td style={{ ...S.td, fontWeight: 700, color: "#f97316" }}>{fmt(item.costo_unitario_real || item.costo_fob_unitario)}</td>
                        <td style={{ ...S.td, color: "#10b981", fontWeight: 600 }}>{item.pvp_sugerido > 0 ? fmt(item.pvp_sugerido) : "—"}</td>
                        <td style={S.td}>{pct !== "—" ? <span style={{ ...S.pctChip, background: Number(pct) >= 30 ? "#dcfce7" : "#fef9c3", color: Number(pct) >= 30 ? "#16a34a" : "#ca8a04" }}>{pct}%</span> : "—"}</td>
                        <td style={S.td}>
                          {item.normalizado
                            ? <span style={{ color: "#16a34a", fontWeight: 700 }}>✓</span>
                            : <span style={{ color: "#dc2626" }}>✗</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Nueva importación ───────────────────────────────────────────────────
function NuevaImportacionTab({ products, variants, normMap, onSaved, onRefreshNorm }) {
  const [step,          setStep]          = useState(1); // 1=info, 2=upload, 3=normalizar, 4=costos, 5=confirmar
  const [info,          setInfo]          = useState({ numero: "", fecha: new Date().toISOString().split("T")[0], proveedor: "", descripcion: "", moneda: "USD", tipo_cambio: 1 });
  const [file,          setFile]          = useState(null);
  const [items,         setItems]         = useState([]);
  const [headers,       setHeaders]       = useState([]);
  const [costos,        setCostos]        = useState({ flete: 0, aduana: 0, otros: 0 });
  const [saving,        setSaving]        = useState(false);
  const [parsing,       setParsing]       = useState(false);

  // Auto-generar número de importación
  useEffect(() => {
    if (!info.numero) {
      const num = `IMP-${String(Date.now()).slice(-6)}`;
      setInfo(p => ({ ...p, numero: num }));
    }
  }, []);

  async function parseExcel(f) {
    try {
      setParsing(true);
      const XLSX = await import("xlsx");
      const buffer = await f.arrayBuffer();
      const wb    = XLSX.read(buffer, { type: "array" });
      const ws    = wb.Sheets[wb.SheetNames[0]];
      const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const { items: parsed, headers: hdrs } = parseRows(allRows);

      // Aplicar normalización automática a los que ya existen en el mapa
      const withNorm = parsed.map(item => {
        const norm = normMap[item.nombre_original];
        if (norm) {
          const prod = products.find(p => p.id === norm.product_id);
          const vari = variants.find(v => v.id === norm.variant_id);
          return { ...item, normalizado: true, product_id: norm.product_id, variant_id: norm.variant_id, linea: norm.linea || prod?.linea || "", product_name: prod?.nombre || "", variant_name: vari?.nombre || "" };
        }
        return item;
      });

      setItems(withNorm);
      setHeaders(hdrs);
      setStep(3);
    } catch (e) {
      alert("Error procesando Excel: " + e.message);
    } finally {
      setParsing(false);
    }
  }

  function updItem(idx, field, value) {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function mapItemToVariant(idx, variantId) {
    const variant = variants.find(v => v.id === variantId);
    const prod    = products.find(p => p.id === variant?.product_id);
    setItems(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        variant_id:   variantId || null,
        product_id:   variant?.product_id || null,
        linea:        prod?.linea || "",
        product_name: prod?.nombre || "",
        variant_name: variant?.nombre || "",
        normalizado:  !!variantId,
      };
      return next;
    });
  }

  // Calcular costos reales prorateando flete+aduana+otros
  const costosTotalesExtra = Number(costos.flete) + Number(costos.aduana) + Number(costos.otros);
  const totalFOB           = items.reduce((a, i) => a + i.costo_fob_total, 0);
  const totalUnidades      = items.reduce((a, i) => a + i.cantidad, 0);
  const totalCostoReal     = totalFOB + costosTotalesExtra;

  const itemsConCostoReal = useMemo(() => items.map(item => {
    const proporcion     = totalFOB > 0 ? item.costo_fob_total / totalFOB : 0;
    const extraProp      = costosTotalesExtra * proporcion;
    const costoTotalReal = item.costo_fob_total + extraProp;
    const costoUnitReal  = item.cantidad > 0 ? +(costoTotalReal / item.cantidad).toFixed(4) : 0;
    return { ...item, costo_unitario_real: costoUnitReal, costo_total_real: +costoTotalReal.toFixed(2) };
  }), [items, costos]);

  async function guardarImportacion() {
    if (!info.numero) { alert("Ingresa un número de importación"); return; }
    if (items.length === 0) { alert("Sin ítems"); return; }
    try {
      setSaving(true);
      let archivoUrl = null, archivoNombre = null;
      if (file) {
        const fn = `importaciones/${Date.now()}-${file.name}`;
        const { error: ue } = await supabase.storage.from("pdfs").upload(fn, file);
        if (!ue) archivoUrl = supabase.storage.from("pdfs").getPublicUrl(fn).data.publicUrl;
        archivoNombre = file.name;
      }

      const normalizados = itemsConCostoReal.filter(i => i.normalizado).length;

      const { data: imp, error: ie } = await supabase.from("importaciones").insert({
        numero:          info.numero,
        fecha:           info.fecha,
        proveedor:       info.proveedor,
        descripcion:     info.descripcion,
        moneda:          info.moneda,
        tipo_cambio:     Number(info.tipo_cambio),
        costo_flete:     Number(costos.flete),
        costo_aduana:    Number(costos.aduana),
        otros_costos:    Number(costos.otros),
        total_items:     itemsConCostoReal.length,
        total_unidades:  totalUnidades,
        total_costo_fob: +totalFOB.toFixed(2),
        total_costo_real: +totalCostoReal.toFixed(2),
        archivo_url:     archivoUrl,
        archivo_nombre:  archivoNombre,
        estado:          "procesado",
      }).select().single();
      if (ie) throw ie;

      // Guardar items
      const itemsToInsert = itemsConCostoReal.map(item => ({
        importacion_id:      imp.id,
        nombre_original:     item.nombre_original,
        cantidad:            item.cantidad,
        costo_fob_unitario:  item.costo_fob_unitario,
        costo_fob_total:     item.costo_fob_total,
        pvp_sugerido:        item.pvp_sugerido || 0,
        normalizado:         item.normalizado,
        product_id:          item.product_id || null,
        variant_id:          item.variant_id || null,
        linea:               item.linea || null,
        costo_unitario_real: item.costo_unitario_real,
        costo_total_real:    item.costo_total_real,
        notas:               item.notas || null,
      }));

      const { error: iie } = await supabase.from("importacion_items").insert(itemsToInsert);
      if (iie) throw iie;

      // Guardar/actualizar normalización para los ítems normalizados
      for (const item of itemsConCostoReal.filter(i => i.normalizado && i.variant_id)) {
        await supabase.from("importacion_normalizacion").upsert({
          nombre_original:    item.nombre_original,
          nombre_normalizado: `${item.product_name} / ${item.variant_name}`,
          product_id:         item.product_id,
          variant_id:         item.variant_id,
          linea:              item.linea,
          confianza:          "manual",
          updated_at:         new Date().toISOString(),
        }, { onConflict: "nombre_original" });
      }

      alert(`✅ Importación ${info.numero} guardada.\n${normalizados}/${itemsConCostoReal.length} ítems normalizados.\nRevisa el historial y aplica cuando estés listo.`);
      onSaved();
    } catch (e) { alert("Error: " + e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Stepper */}
      <div style={S.stepper}>
        {["Info general", "Subir Excel", "Normalizar ítems", "Costos adicionales", "Confirmar"].map((label, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ ...S.stepDot, background: step > i + 1 ? "#10b981" : step === i + 1 ? "#6366f1" : "#e2e8f0", color: step >= i + 1 ? "white" : "#94a3b8" }}>
              {step > i + 1 ? "✓" : i + 1}
            </div>
            <span style={{ fontSize: "12px", fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? "#6366f1" : "#94a3b8" }}>{label}</span>
            {i < 4 && <div style={{ width: "24px", height: "2px", background: step > i + 1 ? "#10b981" : "#e2e8f0" }} />}
          </div>
        ))}
      </div>

      {/* Step 1: Info general */}
      {step === 1 && (
        <div style={S.stepCard}>
          <p style={S.stepTitle}>📋 Información de la importación</p>
          <div style={S.formGrid}>
            <Field label="Número *"      value={info.numero}      onChange={v => setInfo(p => ({ ...p, numero: v }))}      placeholder="IMP-001" />
            <Field label="Fecha *"       value={info.fecha}       onChange={v => setInfo(p => ({ ...p, fecha: v }))}        type="date" />
            <Field label="Proveedor"     value={info.proveedor}   onChange={v => setInfo(p => ({ ...p, proveedor: v }))}   placeholder="Nombre del proveedor" />
            <Field label="Moneda"        value={info.moneda}      onChange={v => setInfo(p => ({ ...p, moneda: v }))}       placeholder="USD" />
            <Field label="Tipo de cambio" value={info.tipo_cambio} onChange={v => setInfo(p => ({ ...p, tipo_cambio: v }))} type="number" step="0.0001" />
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={S.fieldLabel}>DESCRIPCIÓN</label>
              <textarea value={info.descripcion} onChange={e => setInfo(p => ({ ...p, descripcion: e.target.value }))}
                rows={2} style={{ ...S.input, resize: "vertical" }} placeholder="Descripción o referencia de la importación..." />
            </div>
          </div>
          <button onClick={() => setStep(2)} disabled={!info.numero || !info.fecha}
            style={{ ...S.btnPrimary, opacity: !info.numero || !info.fecha ? 0.5 : 1, marginTop: "16px" }}>
            Siguiente →
          </button>
        </div>
      )}

      {/* Step 2: Subir Excel */}
      {step === 2 && (
        <div style={S.stepCard}>
          <p style={S.stepTitle}>📂 Subir archivo Excel</p>
          <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px" }}>
            El sistema detecta automáticamente las columnas: <strong>Item/Descripción, Cantidad, Costo, PVP</strong>.<br />
            Las columnas pueden estar en cualquier orden y tener diferentes nombres.
          </p>
          <label style={S.uploadZone}>
            <span style={{ fontSize: "36px" }}>📊</span>
            <span style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b" }}>{file ? file.name : "Seleccionar archivo Excel"}</span>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>.xlsx, .xls — Haz click para explorar</span>
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
              onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <button onClick={() => setStep(1)} style={S.btnSecondary}>← Atrás</button>
            <button onClick={() => parseExcel(file)} disabled={!file || parsing}
              style={{ ...S.btnPrimary, opacity: !file || parsing ? 0.5 : 1, flex: 1 }}>
              {parsing ? "⏳ Procesando..." : "📖 Leer Excel y detectar columnas →"}
            </button>
            <button onClick={() => setStep(3)} style={{ ...S.btnSecondary }}>Omitir (carga manual) →</button>
          </div>
        </div>
      )}

      {/* Step 3: Normalizar ítems */}
      {step === 3 && (
        <div style={S.stepCard}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div>
              <p style={{ ...S.stepTitle, margin: 0 }}>🔗 Normalización de ítems</p>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "4px 0 0" }}>
                Mapea cada ítem del archivo a un producto del inventario.
                Los ítems ya conocidos se normalizan automáticamente.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <span style={{ ...S.estadoBadge, background: "#dcfce7", color: "#16a34a" }}>
                ✓ {items.filter(i => i.normalizado).length} normalizados
              </span>
              <span style={{ ...S.estadoBadge, background: "#fee2e2", color: "#dc2626" }}>
                ✗ {items.filter(i => !i.normalizado).length} pendientes
              </span>
            </div>
          </div>

          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
              <p>Sin ítems. Agrega manualmente o vuelve a subir un archivo Excel.</p>
              <button onClick={() => setItems([{ nombre_original: "", cantidad: 0, costo_fob_unitario: 0, costo_fob_total: 0, pvp_sugerido: 0, normalizado: false, product_id: null, variant_id: null, linea: "", product_name: "", variant_name: "" }])}
                style={S.btnPrimary}>+ Agregar ítem</button>
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto", marginBottom: "12px" }}>
                <table style={{ ...S.table, minWidth: "900px" }}>
                  <thead>
                    <tr>
                      {["Nombre original del archivo", "Cant.", "Costo FOB", "PVP sugerido", "Mapear a variante del inventario", "Línea", "Estado"].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} style={{ background: item.normalizado ? "#f0fdf4" : idx % 2 === 0 ? "#f8fafc" : "white" }}>
                        <td style={{ ...S.td, minWidth: "200px" }}>
                          <input value={item.nombre_original} onChange={e => updItem(idx, "nombre_original", e.target.value)}
                            style={{ ...S.inputSm, width: "100%" }} placeholder="Nombre del producto..." />
                        </td>
                        <td style={S.td}>
                          <input type="number" value={item.cantidad} onChange={e => updItem(idx, "cantidad", Number(e.target.value))}
                            style={{ ...S.inputSm, width: "70px" }} />
                        </td>
                        <td style={S.td}>
                          <input type="number" step="0.0001" value={item.costo_fob_unitario}
                            onChange={e => { const v = Number(e.target.value); updItem(idx, "costo_fob_unitario", v); updItem(idx, "costo_fob_total", +(v * item.cantidad).toFixed(2)); }}
                            style={{ ...S.inputSm, width: "90px" }} />
                        </td>
                        <td style={S.td}>
                          <input type="number" step="0.01" value={item.pvp_sugerido} onChange={e => updItem(idx, "pvp_sugerido", Number(e.target.value))}
                            style={{ ...S.inputSm, width: "90px" }} />
                        </td>
                        <td style={{ ...S.td, minWidth: "220px" }}>
                          <VariantSelector
                            value={item.variant_id || ""}
                            products={products}
                            variants={variants}
                            onChange={vid => mapItemToVariant(idx, vid)}
                          />
                        </td>
                        <td style={S.td}>
                          <select value={item.linea} onChange={e => updItem(idx, "linea", e.target.value)} style={S.inputSm}>
                            <option value="">—</option>
                            {["Sellos","Sublimación","UV","Textil","Plotter","Láser","Otros"].map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </td>
                        <td style={S.td}>
                          {item.normalizado
                            ? <span style={{ color: "#16a34a", fontWeight: 700, fontSize: "11px" }}>✓ {item.variant_name}</span>
                            : <span style={{ color: "#dc2626", fontSize: "11px" }}>Sin mapear</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => setItems(p => [...p, { nombre_original: "", cantidad: 0, costo_fob_unitario: 0, costo_fob_total: 0, pvp_sugerido: 0, normalizado: false, product_id: null, variant_id: null, linea: "", product_name: "", variant_name: "" }])}
                style={S.btnSuccess}>+ Agregar ítem</button>
            </>
          )}

          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <button onClick={() => setStep(2)} style={S.btnSecondary}>← Atrás</button>
            <button onClick={() => setStep(4)} disabled={items.length === 0}
              style={{ ...S.btnPrimary, opacity: items.length === 0 ? 0.5 : 1 }}>
              Siguiente → Configurar costos
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Costos adicionales */}
      {step === 4 && (
        <div style={S.stepCard}>
          <p style={S.stepTitle}>💰 Costos adicionales (se prorratean por ítem)</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            <Field label="Costo de flete ($)"  value={costos.flete}  onChange={v => setCostos(p => ({ ...p, flete: v }))}  type="number" step="0.01" placeholder="0.00" />
            <Field label="Costo de aduana ($)" value={costos.aduana} onChange={v => setCostos(p => ({ ...p, aduana: v }))} type="number" step="0.01" placeholder="0.00" />
            <Field label="Otros costos ($)"    value={costos.otros}  onChange={v => setCostos(p => ({ ...p, otros: v }))}  type="number" step="0.01" placeholder="0.00" />
          </div>

          {/* Resumen de costos */}
          <div style={{ background: "#f8fafc", borderRadius: "14px", padding: "16px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", margin: "0 0 12px" }}>Resumen de costos</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
              <MiniKPI label="Costo FOB total"    value={fmt(totalFOB)}                            color="#6366f1" />
              <MiniKPI label="Extras (flete+otros)" value={fmt(costosTotalesExtra)}               color="#f59e0b" />
              <MiniKPI label="Costo real total"   value={fmt(totalCostoReal)}                     color="#10b981" />
              <MiniKPI label="Costo real/unidad"  value={fmt(totalUnidades > 0 ? totalCostoReal / totalUnidades : 0)} color="#0ea5e9" />
            </div>
          </div>

          {/* Preview de costo real por ítem */}
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>{["Producto/Variante", "Cant.", "Costo FOB unit.", "Costo real unit.", "Margen bruto (vs PVP)", "% Margen"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {itemsConCostoReal.filter(i => i.normalizado).map((item, i) => {
                  const margen = item.pvp_sugerido > 0 ? item.pvp_sugerido - item.costo_unitario_real : null;
                  const pct    = item.pvp_sugerido > 0 ? ((margen / item.pvp_sugerido) * 100).toFixed(1) : null;
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                      <td style={S.td}><span style={{ fontWeight: 700 }}>{item.product_name}</span> / {item.variant_name}</td>
                      <td style={S.td}>{item.cantidad}</td>
                      <td style={S.td}>{fmt(item.costo_fob_unitario)}</td>
                      <td style={{ ...S.td, fontWeight: 700, color: "#f97316" }}>{fmt(item.costo_unitario_real)}</td>
                      <td style={S.td}>{margen !== null ? fmt(margen) : "—"}</td>
                      <td style={S.td}>{pct ? <span style={{ ...S.pctChip, background: Number(pct) >= 30 ? "#dcfce7" : "#fef9c3", color: Number(pct) >= 30 ? "#16a34a" : "#ca8a04" }}>{pct}%</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <button onClick={() => setStep(3)} style={S.btnSecondary}>← Atrás</button>
            <button onClick={() => setStep(5)} style={S.btnPrimary}>Siguiente → Confirmar</button>
          </div>
        </div>
      )}

      {/* Step 5: Confirmar */}
      {step === 5 && (
        <div style={S.stepCard}>
          <p style={S.stepTitle}>✅ Confirmar y guardar importación</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginBottom: "20px" }}>
            <MiniKPI label="# Importación"   value={info.numero}                    color="#6366f1" />
            <MiniKPI label="Proveedor"        value={info.proveedor || "—"}          color="#6366f1" />
            <MiniKPI label="Fecha"            value={fmtDate(info.fecha)}            color="#6366f1" />
            <MiniKPI label="Total ítems"      value={items.length}                   color="#0ea5e9" />
            <MiniKPI label="Normalizados"     value={items.filter(i => i.normalizado).length} color="#10b981" />
            <MiniKPI label="Sin normalizar"   value={items.filter(i => !i.normalizado).length} color="#f59e0b" />
            <MiniKPI label="Total unidades"   value={totalUnidades}                  color="#0ea5e9" />
            <MiniKPI label="Costo FOB total"  value={fmt(totalFOB)}                  color="#6366f1" />
            <MiniKPI label="Costo real total" value={fmt(totalCostoReal)}            color="#10b981" />
          </div>

          <div style={{ background: "#fffbeb", borderRadius: "12px", padding: "14px", border: "1px solid #fde68a", marginBottom: "16px" }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "#92400e", margin: "0 0 6px" }}>⚠ Nota importante</p>
            <p style={{ fontSize: "12px", color: "#92400e", margin: 0 }}>
              Al guardar, la importación queda en estado <strong>"Procesado"</strong>. Para actualizar el inventario y calcular el costo promedio, debes ir al historial y hacer click en <strong>"Aplicar al inventario"</strong>.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => setStep(4)} style={S.btnSecondary}>← Atrás</button>
            <button onClick={guardarImportacion} disabled={saving}
              style={{ ...S.btnPrimary, flex: 1, opacity: saving ? 0.5 : 1 }}>
              {saving ? "⏳ Guardando..." : "💾 Guardar importación"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Normalización ───────────────────────────────────────────────────────
function NormalizacionTab({ normMap, products, variants, onRefresh }) {
  const [editing,  setEditing]  = useState(null);
  const [deleting, setDeleting] = useState(null);

  const entries = Object.values(normMap);

  async function deleteNorm(id) {
    await supabase.from("importacion_normalizacion").delete().eq("id", id);
    onRefresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px" }}>
        <p style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b", margin: "0 0 4px" }}>🔗 Tabla de normalización</p>
        <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 16px" }}>
          Mapeo entre los nombres que vienen en los archivos de importación y los productos del inventario.
          Cada vez que normalizas un ítem en una importación, queda registrado aquí para usos futuros.
        </p>
        {entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
            Sin mapeos registrados. Se crean automáticamente al normalizar ítems en una importación.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>{["Nombre original (archivo)", "Producto inventario", "Variante", "Línea", "Confianza", "Acciones"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => {
                  const prod = products.find(p => p.id === entry.product_id);
                  const vari = variants.find(v => v.id === entry.variant_id);
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                      <td style={{ ...S.td, fontFamily: "monospace", fontSize: "11px" }}>{entry.nombre_original}</td>
                      <td style={{ ...S.td, fontWeight: 700 }}>{prod?.nombre || "—"}</td>
                      <td style={S.td}>{vari?.nombre || "—"}</td>
                      <td style={S.td}><span style={S.lineaBadge}>{entry.linea || prod?.linea || "—"}</span></td>
                      <td style={S.td}>
                        <span style={{ ...S.estadoBadge, background: entry.confianza === "manual" ? "#eef2ff" : "#f0fdf4", color: entry.confianza === "manual" ? "#6366f1" : "#16a34a" }}>
                          {entry.confianza === "manual" ? "Manual" : "Auto"}
                        </span>
                      </td>
                      <td style={S.td}>
                        <button onClick={() => deleteNorm(entry.id)}
                          style={{ ...S.btnSm, background: "#fff1f2", color: "#dc2626", border: "1px solid #fecaca" }}>🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: KPIs ────────────────────────────────────────────────────────────────
function KPIsTab({ importaciones, variants, products }) {
  const aplicadas = importaciones.filter(i => i.estado === "aplicado");

  const totalInvertido  = aplicadas.reduce((a, i) => a + Number(i.total_costo_real || 0), 0);
  const totalUnidades   = aplicadas.reduce((a, i) => a + Number(i.total_unidades   || 0), 0);
  const costoPromGlobal = totalUnidades > 0 ? totalInvertido / totalUnidades : 0;

  // Variantes con costo promedio calculado
  const variantesConCosto = variants.filter(v => (v.costo_promedio || 0) > 0);

  // Por importación — evolución de costos
  const evolucion = aplicadas.slice().reverse().map(imp => ({
    numero:    imp.numero,
    fecha:     imp.fecha,
    fob:       Number(imp.total_costo_fob  || 0),
    real:      Number(imp.total_costo_real || 0),
    unidades:  Number(imp.total_unidades   || 0),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* KPIs principales */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
        <KPICard icon="📦" label="Importaciones aplicadas" value={aplicadas.length}         color="#6366f1" />
        <KPICard icon="💰" label="Total invertido"          value={fmt(totalInvertido)}      color="#f59e0b" />
        <KPICard icon="🔢" label="Unidades importadas"      value={totalUnidades}            color="#0ea5e9" />
        <KPICard icon="📊" label="Costo promedio global"    value={fmt(costoPromGlobal)}     color="#10b981" />
        <KPICard icon="🔗" label="Variantes con costo calc." value={variantesConCosto.length} color="#8b5cf6" />
      </div>

      {/* Tabla de costo promedio por variante */}
      <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px" }}>
        <p style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b", margin: "0 0 14px" }}>
          📊 Costo promedio por variante (actualizado con importaciones)
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={S.table}>
            <thead>
              <tr>{["Producto", "Variante", "Línea", "Stock actual", "Costo promedio", "Último costo FOB", "Importaciones", "PVP actual"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {variantesConCosto.map((v, i) => {
                const prod = products.find(p => p.id === v.product_id);
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                    <td style={{ ...S.td, fontWeight: 700 }}>{prod?.nombre || "—"}</td>
                    <td style={S.td}>{v.nombre}</td>
                    <td style={S.td}><span style={S.lineaBadge}>{prod?.linea || "—"}</span></td>
                    <td style={{ ...S.td, color: v.stock > 0 ? "#10b981" : "#dc2626", fontWeight: 700 }}>{v.stock || 0}</td>
                    <td style={{ ...S.td, fontWeight: 800, color: "#f97316" }}>{fmt(v.costo_promedio)}</td>
                    <td style={S.td}>{fmt(v.ultimo_costo_fob)}</td>
                    <td style={S.td}>{v.total_importaciones || 0}</td>
                    <td style={{ ...S.td, color: "#6366f1", fontWeight: 600 }}>—</td>
                  </tr>
                );
              })}
              {variantesConCosto.length === 0 && (
                <tr><td colSpan={8} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: "32px" }}>Sin datos. Aplica importaciones para ver el costo promedio.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historial de importaciones */}
      {evolucion.length > 0 && (
        <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px" }}>
          <p style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b", margin: "0 0 14px" }}>📈 Evolución de importaciones</p>
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>{["Importación", "Fecha", "Unidades", "Costo FOB", "Costo real", "Diff. FOB→Real"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {evolucion.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#f8fafc" : "white" }}>
                    <td style={{ ...S.td, fontWeight: 700 }}>{row.numero}</td>
                    <td style={S.td}>{fmtDate(row.fecha)}</td>
                    <td style={S.td}>{row.unidades}</td>
                    <td style={S.td}>{fmt(row.fob)}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: "#10b981" }}>{fmt(row.real)}</td>
                    <td style={{ ...S.td, color: "#f97316" }}>{fmt(row.real - row.fob)} ({row.fob > 0 ? (((row.real - row.fob) / row.fob) * 100).toFixed(1) : 0}%)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function VariantSelector({ value, products, variants, onChange }) {
  const [search, setSearch] = useState("");
  const [open,   setOpen]   = useState(false);

  const filtered = useMemo(() => {
    const term = normalizeText(search);
    if (!term) return variants.slice(0, 20);
    return variants.filter(v => {
      const prod = products.find(p => p.id === v.product_id);
      return normalizeText(v.nombre).includes(term) || normalizeText(prod?.nombre || "").includes(term);
    }).slice(0, 30);
  }, [search, variants, products]);

  const selected = variants.find(v => v.id === value);
  const selProd  = selected ? products.find(p => p.id === selected.product_id) : null;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ ...S.inputSm, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", background: selected ? "#f0fdf4" : "white" }}
        onClick={() => setOpen(o => !o)}>
        <span style={{ flex: 1, fontSize: "11px", color: selected ? "#16a34a" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? `${selProd?.nombre} / ${selected.nombre}` : "Seleccionar variante..."}
        </span>
        <span style={{ fontSize: "10px", color: "#94a3b8" }}>▼</span>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: "10px", zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "8px" }}>
          <input autoFocus type="text" placeholder="Buscar producto/variante..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...S.inputSm, width: "100%", boxSizing: "border-box", marginBottom: "6px" }} />
          <div style={{ maxHeight: "180px", overflowY: "auto" }}>
            <div style={{ padding: "6px 8px", fontSize: "11px", color: "#94a3b8", cursor: "pointer" }}
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}>— Sin mapear</div>
            {filtered.map(v => {
              const prod = products.find(p => p.id === v.product_id);
              return (
                <div key={v.id} style={{ padding: "6px 8px", fontSize: "11px", cursor: "pointer", borderRadius: "6px", background: v.id === value ? "#eef2ff" : "transparent" }}
                  onClick={() => { onChange(v.id); setOpen(false); setSearch(""); }}>
                  <span style={{ fontWeight: 700 }}>{prod?.nombre}</span> / {v.nombre}
                  <span style={{ color: "#94a3b8", marginLeft: "6px" }}>{prod?.linea}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function HeroStat({ num, label, color }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${color}33`, borderRadius: "14px", padding: "12px 18px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ fontSize: "20px", fontWeight: 800, color, lineHeight: 1 }}>{num}</span>
      <span style={{ fontSize: "10px", color: "#94a3b8", marginTop: "3px" }}>{label}</span>
    </div>
  );
}

function MiniKPI({ label, value, color }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "12px 14px", border: "1px solid #e2e8f0" }}>
      <p style={{ fontSize: "10px", fontWeight: 600, color: "#94a3b8", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</p>
      <p style={{ fontSize: "18px", fontWeight: 800, color, margin: 0 }}>{value}</p>
    </div>
  );
}

function KPICard({ icon, label, value, color }) {
  return (
    <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "18px", borderTop: `3px solid ${color}` }}>
      <span style={{ fontSize: "22px" }}>{icon}</span>
      <p style={{ fontSize: "24px", fontWeight: 900, color, margin: "8px 0 4px", letterSpacing: "-0.5px" }}>{value}</p>
      <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>{label}</p>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "", step }) {
  return (
    <div>
      <label style={S.fieldLabel}>{label.toUpperCase()}</label>
      <input type={type} value={value} step={step} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} style={S.input} />
    </div>
  );
}

function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px", gap: "12px" }}>
      <div style={{ width: "28px", height: "28px", border: "3px solid #e2e8f0", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "#94a3b8", margin: 0, fontSize: "13px" }}>Cargando...</p>
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────


const S = {
  page:        { display: "flex", flexDirection: "column", gap: "20px", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#1e293b" },
  restricted:  { display: "flex", flexDirection: "column", alignItems: "center", padding: "80px", gap: "12px", background: "white", borderRadius: "20px", border: "1px solid #e2e8f0" },
  hero:        { background: "linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)", borderRadius: "20px", padding: "28px 32px", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" },
  heroLabel:   { fontSize: "10px", fontWeight: 700, letterSpacing: "3px", color: "#a5b4fc", marginBottom: "6px" },
  heroTitle:   { fontSize: "32px", fontWeight: 800, margin: 0, letterSpacing: "-1px" },
  heroSub:     { fontSize: "13px", color: "#64748b", marginTop: "6px" },
  heroStats:   { display: "flex", gap: "8px", flexWrap: "wrap" },
  tabs:        { display: "flex", gap: "4px", background: "white", borderRadius: "14px", padding: "6px", border: "1px solid #e2e8f0", flexWrap: "wrap" },
  tab:         { flex: 1, padding: "9px 16px", borderRadius: "10px", border: "none", background: "transparent", fontSize: "13px", fontWeight: 600, color: "#64748b", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  tabOn:       { background: "#0f172a", color: "white" },
  impCard:     { background: "white", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "16px" },
  detailPanel: { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "20px", overflow: "hidden" },
  estadoBadge: { padding: "3px 10px", borderRadius: "40px", fontSize: "11px", fontWeight: 700 },
  lineaBadge:  { padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: "#f1f5f9", color: "#475569" },
  emptyState:  { display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "60px", background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", textAlign: "center" },
  stepper:     { display: "flex", alignItems: "center", gap: "8px", background: "white", borderRadius: "16px", padding: "16px 20px", border: "1px solid #e2e8f0", flexWrap: "wrap" },
  stepDot:     { width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800, flexShrink: 0 },
  stepCard:    { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "24px" },
  stepTitle:   { fontSize: "15px", fontWeight: 700, color: "#1e293b", margin: "0 0 16px" },
  formGrid:    { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" },
  fieldLabel:  { display: "block", fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "1px", marginBottom: "5px" },
  input:       { width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  inputSm:     { padding: "6px 8px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "12px", outline: "none", fontFamily: "inherit" },
  uploadZone:  { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px", border: "2px dashed #e2e8f0", borderRadius: "14px", gap: "8px", cursor: "pointer", background: "#f8fafc" },
  table:       { width: "100%", borderCollapse: "separate", borderSpacing: "0 3px" },
  th:          { padding: "10px 14px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap", background: "#f8fafc" },
  td:          { padding: "10px 14px", fontSize: "12px", color: "#1e293b" },
  pctChip:     { padding: "3px 8px", borderRadius: "40px", fontSize: "11px", fontWeight: 700 },
  btnPrimary:  { padding: "11px 22px", borderRadius: "12px", background: "#0f172a", color: "white", border: "none", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary:{ padding: "10px 18px", borderRadius: "12px", background: "white", color: "#64748b", border: "1.5px solid #e2e8f0", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnSuccess:  { padding: "9px 16px", borderRadius: "10px", background: "#f0fdf4", color: "#16a34a", border: "1.5px solid #86efac", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnSm:       { padding: "6px 12px", borderRadius: "8px", background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
};
