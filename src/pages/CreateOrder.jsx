import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { parsePDF, extraerDatos } from "../utils/pdfParser";
import { useAuth } from "../context/AuthContext";

const LINEAS = ["", "Sellos", "Sublimación", "UV", "Textil", "Plotter", "Láser", "Otros"];
const TINTAS = ["", "Negra", "Azul", "Roja", "Verde", "Morada", "Otros"];

const UV_DTF_FORMATS = {
  "A3 (42x29.7 cm)": 1,
  "A4 (29.7x21 cm)": 0.5,
  "A5 (21x14.8 cm)": 0.25,
  "A6 (14.8x10.5 cm)": 0.125,
};

const LINE_META = {
  Sellos:      { icon: "🔖", color: "#6366f1", bg: "#eef2ff", desc: "Sellos automáticos y personalizados" },
  Sublimación: { icon: "🌈", color: "#ec4899", bg: "#fdf2f8", desc: "Impresión por sublimación" },
  UV:          { icon: "🔆", color: "#f59e0b", bg: "#fffbeb", desc: "Impresión UV directa y DTF" },
  Textil:      { icon: "👕", color: "#10b981", bg: "#f0fdf4", desc: "Bordado y serigrafía textil" },
  Plotter:     { icon: "✂️", color: "#0ea5e9", bg: "#f0f9ff", desc: "Corte e impresión en plotter" },
  Láser:       { icon: "⚡", color: "#ef4444", bg: "#fff1f2", desc: "Grabado y corte láser" },
  Otros:       { icon: "📦", color: "#94a3b8", bg: "#f8fafc", desc: "Otros trabajos y servicios" },
};

function emptyItem() {
  return {
    description: "", quantity: 1, unit_value: 0, line_total: 0,
    linea: "", inventory_mode: "catalogo",
    product_id: null, variant_id: null, catalog_item_id: null,
    product_name: "", variant_name: "", variant_image_url: "",
    specs: { tinta: "", uv: false },
  };
}

function norm(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function uvEquiv(specs = {}) { return UV_DTF_FORMATS[specs.formato] || 0; }

function buildUvCost(item, uvItems, uvRes) {
  if (item.linea !== "UV" || !item.catalog_item_id) return { costo_unitario: 0, subtotal_costo: 0, cost_breakdown: [] };
  const ci = uvItems.find(x => x.id === item.catalog_item_id);
  if (!ci) return { costo_unitario: 0, subtotal_costo: 0, cost_breakdown: [] };

  if (ci.slug === "uv-textil") {
    const m2  = norm(item.specs?.metros_cuadrados);
    const res = uvRes.find(r => r.slug === "uv-textil-m2");
    const base = norm(res?.costo_unitario);
    const cu = m2 * base;
    return { costo_unitario: +cu.toFixed(2), subtotal_costo: +(cu * norm(item.quantity)).toFixed(2), cost_breakdown: [{ type: "resource", resource_slug: "uv-textil-m2", resource_name: res?.nombre || "UV Textil m2", unit: "m2", quantity: m2, unit_cost: base, total_cost: +cu.toFixed(2) }] };
  }
  if (ci.slug === "uv-dtf") {
    const eq  = norm(item.specs?.equivalente) || uvEquiv(item.specs);
    const res = uvRes.find(r => r.slug === "uv-dtf-a3");
    const base = norm(res?.costo_unitario);
    const cu = eq * base;
    return { costo_unitario: +cu.toFixed(2), subtotal_costo: +(cu * norm(item.quantity)).toFixed(2), cost_breakdown: [{ type: "resource", resource_slug: "uv-dtf-a3", resource_name: res?.nombre || "UV DTF A3", unit: "plancha", quantity: eq, unit_cost: base, total_cost: +cu.toFixed(2), formato: item.specs?.formato || "" }] };
  }
  return { costo_unitario: 0, subtotal_costo: 0, cost_breakdown: [] };
}

export default function CreateOrder() {
  const { profile } = useAuth();
  const [file,          setFile]          = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [preview,       setPreview]       = useState(null);
  const [priority,      setPriority]      = useState("media");
  const [products,      setProducts]      = useState([]);
  const [variants,      setVariants]      = useState([]);
  const [uvItems,       setUvItems]       = useState([]);
  const [uvAttrs,       setUvAttrs]       = useState([]);
  const [uvRes,         setUvRes]         = useState([]);

  const sellosProducts = useMemo(() => products.filter(p => p.linea === "Sellos"), [products]);

  useEffect(() => { fetchCatalog(); }, []);

  async function fetchCatalog() {
    try {
      const [{ data: pd }, { data: vd }, { data: cd }, { data: ad }, { data: rd }] = await Promise.all([
        supabase.from("products").select("*").eq("linea", "Sellos").eq("is_active", true).order("nombre"),
        supabase.from("product_variants").select("*").eq("is_active", true).order("nombre"),
        supabase.from("catalog_items").select("*").eq("linea", "UV").eq("is_active", true).order("nombre"),
        supabase.from("catalog_item_attributes").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
        supabase.from("inventory_resources").select("*").eq("linea", "UV").eq("is_active", true).order("nombre"),
      ]);
      setProducts(pd || []);
      setVariants(vd || []);
      setUvItems(cd || []);
      setUvAttrs(ad || []);
      setUvRes(rd || []);
    } catch (e) { console.error(e); }
  }

  if (profile?.rol !== "admin") {
    return (
      <div style={S.restricted}>
        <span style={{ fontSize: "48px" }}>🔒</span>
        <h3 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Acceso restringido</h3>
        <p style={{ color: "#94a3b8", margin: 0 }}>Solo el rol admin puede crear órdenes.</p>
      </div>
    );
  }

  async function handleUpload() {
    if (!file) { alert("Selecciona un PDF"); return; }
    try {
      setLoading(true);
      const text = await parsePDF(file);
      const data = extraerDatos(text);
      setPreview({
        ...data,
        items: (data.items || []).map(i => ({
          description: i.description || "", quantity: Number(i.quantity || 0),
          unit_value: Number(i.unit_value || 0), line_total: Number(i.line_total || 0),
          linea: i.linea || "", inventory_mode: "catalogo",
          product_id: null, variant_id: null, catalog_item_id: null,
          product_name: "", variant_name: "", variant_image_url: "",
          specs: { tinta: "", uv: false },
        })),
      });
    } catch (e) { alert("Error procesando PDF"); }
    finally { setLoading(false); }
  }

  function upd(field, value) { setPreview(p => ({ ...p, [field]: value })); }
  function updDesc(value)     { setPreview(p => ({ ...p, descripcion_orden: value, operational_summary: { ...p.operational_summary, descripcion_orden: value } })); }

  function updItem(idx, field, value) {
    setPreview(p => {
      const items = [...p.items];
      items[idx] = { ...items[idx], [field]: ["quantity","line_total","unit_value"].includes(field) ? Number(value) : value };
      return { ...p, items };
    });
  }

  function updSpecs(idx, key, value) {
    setPreview(p => {
      const items = [...p.items];
      const cur   = items[idx];
      const specs = { ...(cur.specs || {}), [key]: value };
      if (cur.linea === "UV" && key === "formato") specs.equivalente = uvEquiv(specs);
      items[idx] = { ...cur, specs };
      return { ...p, items };
    });
  }

  function updLinea(idx, value) {
    setPreview(p => {
      const items = [...p.items];
      const cur   = items[idx];
      const baseSpecs = value === "Sellos" ? { tinta: cur.specs?.tinta || "", uv: cur.specs?.uv || false } : {};
      items[idx] = {
        ...cur, linea: value,
        inventory_mode: value === "Sellos" ? cur.inventory_mode || "catalogo" : "catalogo",
        product_id:     value === "Sellos" ? cur.product_id : null,
        variant_id:     value === "Sellos" ? cur.variant_id : null,
        catalog_item_id: value === "UV" ? cur.catalog_item_id : null,
        product_name: "", variant_name: "", variant_image_url: "",
        specs: baseSpecs,
      };
      return { ...p, items };
    });
  }

  function updSellosProduct(idx, productId) {
    setPreview(p => {
      const items = [...p.items];
      items[idx] = { ...items[idx], product_id: productId || null, variant_id: null, product_name: products.find(pr => pr.id === productId)?.nombre || "", variant_name: "", variant_image_url: "" };
      return { ...p, items };
    });
  }

  function updSellosVariant(idx, variantId) {
    const variant = variants.find(v => v.id === variantId);
    setPreview(p => {
      const items = [...p.items];
      items[idx] = {
        ...items[idx],
        variant_id:         variantId || null,
        variant_name:       variant?.nombre || "",
        variant_image_url:  variant?.image_url || "",
      };
      return { ...p, items };
    });
  }

  function updSellosMode(idx, mode) {
    setPreview(p => {
      const items = [...p.items];
      items[idx] = { ...items[idx], inventory_mode: mode, product_id: null, variant_id: null, product_name: "", variant_name: "", variant_image_url: "" };
      return { ...p, items };
    });
  }

  function updUvItem(idx, id) {
    const ci = uvItems.find(x => x.id === id);
    const initSpecs = ci?.slug === "uv-textil"
      ? { modo_trabajo: "", articulo: "", metros_cuadrados: 0, cantidad: 0 }
      : ci?.slug === "uv-dtf"
      ? { modo_dtf: "", formato: "", equivalente: 0, destino: "" }
      : {};
    setPreview(p => {
      const items = [...p.items];
      items[idx] = { ...items[idx], catalog_item_id: id || null, product_id: null, variant_id: null, specs: initSpecs };
      return { ...p, items };
    });
  }

  function addItem()       { setPreview(p => ({ ...p, items: [...(p.items || []), emptyItem()] })); }
  function removeItem(idx) {
    setPreview(p => {
      const items = p.items.filter((_, i) => i !== idx);
      return { ...p, items, subtotal: items.reduce((a, i) => a + norm(i.line_total), 0) };
    });
  }
  function recalc() { setPreview(p => ({ ...p, subtotal: (p.items || []).reduce((a, i) => a + norm(i.line_total), 0) })); }

  function getVariantsForProduct(productId) { return variants.filter(v => v.product_id === productId); }
  function getUvAttrsForItem(catalogItemId) { return uvAttrs.filter(a => a.item_id === catalogItemId); }
  function getUvItemById(id)                { return uvItems.find(x => x.id === id) || null; }

  async function guardar() {
    if (!file || !preview) { alert("Falta información"); return; }
    try {
      setLoading(true);
      const fn = `${Date.now()}-${file.name}`;
      const { error: ue } = await supabase.storage.from("pdfs").upload(fn, file);
      if (ue) throw ue;
      const pdfUrl = supabase.storage.from("pdfs").getPublicUrl(fn).data.publicUrl;

      const itemsData = preview.items.map(item => {
        const uvC = item.linea === "UV" ? buildUvCost(item, uvItems, uvRes) : { costo_unitario: 0, subtotal_costo: 0, cost_breakdown: [] };
        return {
          description:       item.description,
          quantity:          item.quantity,
          unit_value:        item.unit_value,
          line_total:        item.line_total,
          linea:             item.linea,
          inventory_mode:    item.inventory_mode,
          product_id:        item.product_id,
          variant_id:        item.variant_id,
          catalog_item_id:   item.catalog_item_id,
          // ← Guardamos nombre e imagen para mostrar en Kanban
          product_name:      item.product_name || "",
          variant_name:      item.variant_name || "",
          variant_image_url: item.variant_image_url || "",
          specs:             item.specs || {},
          costo_unitario:    uvC.costo_unitario || null,
          subtotal_costo:    uvC.subtotal_costo || null,
          cost_breakdown:    uvC.cost_breakdown || [],
        };
      });

      const { data: order, error: oe } = await supabase.from("orders").insert([{
        estado:      "Nuevo",
        prioridad:   priority,
        pdf_url:     pdfUrl,
        total_venta: preview.subtotal,
        data_json: {
          order_number: preview.order_number,
          cliente:      { nombre: preview.client_name, telefono: preview.phone },
          items:        itemsData,
          descripcion_orden:    preview.descripcion_orden,
          operational_summary:  preview.operational_summary,
        },
      }]).select().single();
      if (oe) throw oe;

      for (const item of preview.items) {
        const uvC = item.linea === "UV" ? buildUvCost(item, uvItems, uvRes) : { costo_unitario: null, subtotal_costo: null, cost_breakdown: [] };
        const { error: ie } = await supabase.from("order_items").insert([{
          order_id:        order.id,
          descripcion:     item.description,
          linea:           item.linea || null,
          cantidad:        item.quantity,
          precio_unitario: item.unit_value,
          subtotal_venta:  item.line_total,
          costo_unitario:  item.linea === "UV" ? uvC.costo_unitario : null,
          subtotal_costo:  item.linea === "UV" ? uvC.subtotal_costo : null,
          product_id:      item.product_id,
          variant_id:      item.variant_id,
          catalog_item_id: item.catalog_item_id,
          specs:           item.specs || {},
          cost_breakdown:  item.linea === "UV" ? uvC.cost_breakdown : [],
        }]);
        if (ie) throw ie;

        if (item.linea === "Sellos" && item.inventory_mode === "catalogo" && item.variant_id && norm(item.quantity) > 0) {
          const { error: se } = await supabase.rpc("decrement_variant_stock", { p_variant_id: item.variant_id, p_quantity: norm(item.quantity) });
          if (se) throw se;
        }
      }

      alert("✅ Orden guardada correctamente");
      setPreview(null); setFile(null); setPriority("media");
      const inp = document.getElementById("pdf-input"); if (inp) inp.value = "";
    } catch (e) { alert(`Error: ${e.message}`); }
    finally { setLoading(false); }
  }

  function renderDynamicAttr(index, item, attr) {
    const opts  = Array.isArray(attr.options) ? attr.options : [];
    const value = item.specs?.[attr.attribute_key];

    if (attr.attribute_key === "equivalente") {
      const eq = norm(item.specs?.equivalente) || uvEquiv(item.specs);
      return (
        <div key={attr.id}>
          <label style={S.fieldLabel}>{attr.label.toUpperCase()}</label>
          <input type="number" step="0.001" value={eq} readOnly style={{ ...S.input, background: "#f1f5f9", color: "#64748b" }} />
        </div>
      );
    }
    if (attr.field_type === "select") return (
      <div key={attr.id} style={attr.attribute_key === "observacion_tecnica" ? { gridColumn: "1 / -1" } : {}}>
        <label style={S.fieldLabel}>{attr.label.toUpperCase()}</label>
        <select value={value || ""} onChange={e => updSpecs(index, attr.attribute_key, e.target.value)} style={S.select}>
          <option value="">Seleccionar {attr.label.toLowerCase()}</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
    if (attr.field_type === "number") return (
      <div key={attr.id}>
        <label style={S.fieldLabel}>{attr.label.toUpperCase()}</label>
        <input type="number" step="0.01" value={value || 0} onChange={e => updSpecs(index, attr.attribute_key, Number(e.target.value))} style={S.input} />
      </div>
    );
    if (attr.field_type === "boolean") return (
      <div key={attr.id}>
        <label style={S.fieldLabel}>{attr.label.toUpperCase()}</label>
        <div style={{ display: "flex", gap: "8px" }}>
          {[true, false].map(v => (
            <button key={String(v)} type="button" onClick={() => updSpecs(index, attr.attribute_key, v)}
              style={{ ...S.toggleBtn, ...(value === v ? S.toggleBtnOn : {}) }}>{v ? "Sí" : "No"}</button>
          ))}
        </div>
      </div>
    );
    return (
      <div key={attr.id} style={attr.attribute_key === "observacion_tecnica" ? { gridColumn: "1 / -1" } : {}}>
        <label style={S.fieldLabel}>{attr.label.toUpperCase()}</label>
        <input value={value || ""} onChange={e => updSpecs(index, attr.attribute_key, e.target.value)} style={S.input} placeholder={attr.label} />
      </div>
    );
  }

  return (
    <div style={S.page}>

      {/* Hero */}
      <div style={S.hero}>
        <div>
          <div style={S.heroLabel}>NUEVA ORDEN</div>
          <h2 style={S.heroTitle}>Crear orden</h2>
          <p style={S.heroSub}>Sube el PDF, revisa los datos y configura cada ítem por línea de producción</p>
        </div>
        <div style={S.heroDecor}>+</div>
      </div>

      {/* Upload */}
      <div style={S.card}>
        <p style={S.cardTitle}>📄 Cargar PDF de cotización</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "16px" }}>
          <div>
            <label style={S.fieldLabel}>ARCHIVO PDF</label>
            <label htmlFor="pdf-input" style={S.uploadZone}>
              <span style={{ fontSize: "28px" }}>📁</span>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b" }}>{file ? file.name : "Seleccionar PDF"}</span>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>{file ? "Click para cambiar" : "Click para explorar"}</span>
              <input id="pdf-input" type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div>
            <label style={S.fieldLabel}>PRIORIDAD</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                { key: "baja",  icon: "🟢", label: "Baja",  active: { background: "#dcfce7", borderColor: "#4ade80", color: "#16a34a" } },
                { key: "media", icon: "🟡", label: "Media", active: { background: "#fef9c3", borderColor: "#fbbf24", color: "#ca8a04" } },
                { key: "alta",  icon: "🔴", label: "Alta",  active: { background: "#fee2e2", borderColor: "#f87171", color: "#dc2626" } },
              ].map(p => (
                <button key={p.key} type="button" onClick={() => setPriority(p.key)}
                  style={{ ...S.priorityBtn, ...(priority === p.key ? p.active : {}) }}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button type="button" onClick={handleUpload} disabled={loading || !file}
          style={{ ...S.btnPrimary, opacity: loading || !file ? 0.5 : 1 }}>
          {loading ? "Procesando..." : "📖 Leer PDF y continuar"}
        </button>
      </div>

      {/* Preview */}
      {preview && (
        <div style={S.card}>
          <p style={S.cardTitle}>✏️ Datos de la orden</p>
          <div style={S.formGrid}>
            <Field label="Número de orden" value={preview.order_number || ""} onChange={v => upd("order_number", v)} placeholder="PUBLI00108" />
            <Field label="Cliente"         value={preview.client_name  || ""} onChange={v => upd("client_name",  v)} placeholder="Nombre del cliente" />
            <Field label="Teléfono"        value={preview.phone        || ""} onChange={v => upd("phone",        v)} placeholder="+593..." />
            <Field label="Subtotal ($)"    value={preview.subtotal     || 0}  onChange={v => upd("subtotal", Number(v))} type="number" />
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={S.fieldLabel}>DESCRIPCIÓN DE LA ORDEN</label>
              <textarea value={preview.descripcion_orden || ""} onChange={e => updDesc(e.target.value)} rows={3}
                style={{ ...S.input, resize: "vertical", minHeight: "80px" }} placeholder="Descripción operativa..." />
            </div>
          </div>

          {/* Ítems */}
          <div style={{ marginTop: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <p style={{ ...S.cardTitle, margin: 0 }}>📦 Ítems</p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" onClick={recalc} style={S.btnSecondary}>↺ Recalcular</button>
                <button type="button" onClick={addItem} style={S.btnSuccess}>+ Agregar ítem</button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {(preview.items || []).map((item, idx) => {
                const meta                  = LINE_META[item.linea];
                const isSellos              = item.linea === "Sellos";
                const isUV                  = item.linea === "UV";
                const isCatalog             = item.inventory_mode === "catalogo";
                const isOtros               = item.inventory_mode === "otros";
                const variantsForProduct    = item.product_id ? getVariantsForProduct(item.product_id) : [];
                const selectedUvItem        = item.catalog_item_id ? getUvItemById(item.catalog_item_id) : null;
                const uvAttrsForItem        = item.catalog_item_id ? getUvAttrsForItem(item.catalog_item_id) : [];
                const selectedVariant       = item.variant_id ? variants.find(v => v.id === item.variant_id) : null;

                return (
                  <div key={idx} style={S.itemCard}>
                    <div style={S.itemHeader}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={S.itemNum}>{idx + 1}</div>
                        {meta && <div style={{ ...S.itemLineBadge, background: meta.bg, color: meta.color }}>{meta.icon} {item.linea}</div>}
                      </div>
                      <button type="button" onClick={() => removeItem(idx)} style={S.btnDanger}>✕ Eliminar</button>
                    </div>

                    <div style={S.formGrid}>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <Field label="Descripción del ítem" value={item.description} onChange={v => updItem(idx, "description", v)} placeholder="Descripción del producto o servicio" />
                      </div>
                      <Field label="Cantidad"        value={item.quantity}   onChange={v => updItem(idx, "quantity",   v)} type="number" />
                      <Field label="Valor unitario ($)" value={item.unit_value} onChange={v => updItem(idx, "unit_value", v)} type="number" step="0.01" />
                      <Field label="Subtotal ($)"    value={item.line_total} onChange={v => updItem(idx, "line_total", v)} type="number" step="0.01" />

                      {/* Selector de línea */}
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={S.fieldLabel}>LÍNEA DE PRODUCCIÓN</label>
                        <div style={S.lineaGrid}>
                          {LINEAS.filter(l => l !== "").map(linea => {
                            const m      = LINE_META[linea];
                            const active = item.linea === linea;
                            return (
                              <button key={linea} type="button" onClick={() => updLinea(idx, linea)}
                                style={{ ...S.lineaBtn, ...(active ? { background: m.bg, borderColor: m.color, color: m.color } : {}) }}>
                                <span style={{ fontSize: "18px" }}>{m.icon}</span>
                                <span style={{ fontSize: "12px", fontWeight: 600 }}>{linea}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Config Sellos */}
                    {isSellos && (
                      <div style={{ ...S.lineConfig, borderColor: "#6366f1", background: "#eef2ff" }}>
                        <p style={{ ...S.lineConfigTitle, color: "#6366f1" }}>🔖 Configuración de Sellos</p>
                        <div style={S.formGrid}>
                          <div>
                            <label style={S.fieldLabel}>TIPO</label>
                            <select value={item.inventory_mode} onChange={e => updSellosMode(idx, e.target.value)} style={S.select}>
                              <option value="catalogo">Catálogo</option>
                              <option value="otros">Otros</option>
                            </select>
                          </div>
                          <div>
                            <label style={S.fieldLabel}>COLOR DE TINTA</label>
                            <select value={item.specs?.tinta || ""} onChange={e => updSpecs(idx, "tinta", e.target.value)} style={S.select}>
                              {TINTAS.map(t => <option key={t} value={t}>{t || "Seleccionar tinta"}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={S.fieldLabel}>UV EN CARCASA</label>
                            <div style={{ display: "flex", gap: "8px" }}>
                              {[true, false].map(v => (
                                <button key={String(v)} type="button" onClick={() => updSpecs(idx, "uv", v)}
                                  style={{ ...S.toggleBtn, ...(item.specs?.uv === v ? S.toggleBtnOn : {}) }}>{v ? "Sí" : "No"}</button>
                              ))}
                            </div>
                          </div>

                          {isCatalog && (
                            <>
                              <div>
                                <label style={S.fieldLabel}>MODELO</label>
                                <select value={item.product_id || ""} onChange={e => updSellosProduct(idx, e.target.value)} style={S.select}>
                                  <option value="">Seleccionar modelo</option>
                                  {sellosProducts.filter(p => p.nombre !== "Otros").map(p => (
                                    <option key={p.id} value={p.id}>{p.nombre}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={S.fieldLabel}>VARIANTE</label>
                                <select value={item.variant_id || ""} onChange={e => updSellosVariant(idx, e.target.value)}
                                  disabled={!item.product_id} style={{ ...S.select, opacity: !item.product_id ? 0.5 : 1 }}>
                                  <option value="">Seleccionar variante</option>
                                  {variantsForProduct.map(v => (
                                    <option key={v.id} value={v.id}>{v.nombre}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Preview imagen variante */}
                              {selectedVariant?.image_url && (
                                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "12px", background: "white", borderRadius: "12px", padding: "10px 14px", border: "1px solid #c7d2fe" }}>
                                  <img src={selectedVariant.image_url} alt={selectedVariant.nombre}
                                    style={{ width: "48px", height: "48px", borderRadius: "10px", objectFit: "cover", border: "1px solid #e2e8f0" }} />
                                  <div>
                                    <p style={{ fontSize: "13px", fontWeight: 700, color: "#4f46e5", margin: 0 }}>{selectedVariant.nombre}</p>
                                    <p style={{ fontSize: "11px", color: "#94a3b8", margin: "2px 0 0" }}>Vista previa del modelo seleccionado</p>
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {isOtros && (
                            <div style={{ gridColumn: "1 / -1", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "12px", fontSize: "13px", color: "#92400e" }}>
                              ⚠ Este ítem se marcará como <strong>Otros</strong>. No descontará stock pero quedará registrado.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Config UV */}
                    {isUV && (
                      <div style={{ ...S.lineConfig, borderColor: "#f59e0b", background: "#fffbeb" }}>
                        <p style={{ ...S.lineConfigTitle, color: "#d97706" }}>🔆 Configuración UV</p>
                        <div style={S.formGrid}>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <label style={S.fieldLabel}>TIPO UV</label>
                            <div style={{ display: "flex", gap: "10px" }}>
                              {uvItems.map(ci => (
                                <button key={ci.id} type="button" onClick={() => updUvItem(idx, ci.id)}
                                  style={{ ...S.uvTypeBtn, ...(item.catalog_item_id === ci.id ? S.uvTypeBtnOn : {}) }}>
                                  <span style={{ fontSize: "20px" }}>{ci.slug === "uv-textil" ? "🧵" : "🖨️"}</span>
                                  <span style={{ fontSize: "13px", fontWeight: 600 }}>{ci.nombre}</span>
                                  <span style={{ fontSize: "11px", color: item.catalog_item_id === ci.id ? "#d97706" : "#94a3b8" }}>
                                    {ci.slug === "uv-textil" ? "Por m²" : "Por plancha A3"}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                          {selectedUvItem && uvAttrsForItem.map(attr => renderDynamicAttr(idx, item, attr))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {(!preview.items || preview.items.length === 0) && (
                <div style={S.emptyItems}>
                  <span style={{ fontSize: "32px" }}>📋</span>
                  <p style={{ color: "#94a3b8", margin: 0 }}>No hay ítems. Agrega uno manualmente o carga un PDF.</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "20px", marginTop: "24px", borderTop: "1px solid #e2e8f0", paddingTop: "20px" }}>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 2px" }}>Total de la orden</p>
              <p style={{ fontSize: "28px", fontWeight: 900, color: "#1e293b", margin: 0, letterSpacing: "-1px" }}>${Number(preview.subtotal || 0).toFixed(2)}</p>
            </div>
            <button type="button" onClick={guardar} disabled={loading}
              style={{ ...S.btnPrimary, opacity: loading ? 0.5 : 1, fontSize: "15px", padding: "14px 28px" }}>
              {loading ? "Guardando..." : "💾 Guardar orden"}
            </button>
          </div>
        </div>
      )}
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

const S = {
  page:          { display: "flex", flexDirection: "column", gap: "20px", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#1e293b" },
  restricted:    { display: "flex", flexDirection: "column", alignItems: "center", padding: "80px", gap: "12px", background: "white", borderRadius: "20px", border: "1px solid #e2e8f0" },
  hero:          { background: "linear-gradient(135deg,#0f172a 0%,#134e4a 100%)", borderRadius: "20px", padding: "28px 32px", color: "white", position: "relative", overflow: "hidden" },
  heroLabel:     { fontSize: "10px", fontWeight: 700, letterSpacing: "3px", color: "#5eead4", marginBottom: "6px" },
  heroTitle:     { fontSize: "32px", fontWeight: 800, margin: 0, letterSpacing: "-1px" },
  heroSub:       { fontSize: "13px", color: "#64748b", marginTop: "6px" },
  heroDecor:     { position: "absolute", right: "40px", top: "50%", transform: "translateY(-50%)", fontSize: "120px", fontWeight: 900, color: "rgba(94,234,212,0.1)", lineHeight: 1 },
  card:          { background: "white", borderRadius: "20px", border: "1px solid #e2e8f0", padding: "24px" },
  cardTitle:     { fontSize: "15px", fontWeight: 700, color: "#1e293b", margin: "0 0 16px" },
  formGrid:      { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" },
  fieldLabel:    { display: "block", fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "1px", marginBottom: "5px" },
  input:         { width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  select:        { width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "13px", outline: "none", fontFamily: "inherit", background: "white" },
  uploadZone:    { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", border: "2px dashed #e2e8f0", borderRadius: "14px", gap: "6px", cursor: "pointer" },
  priorityBtn:   { display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderRadius: "10px", border: "1.5px solid #e2e8f0", background: "white", fontSize: "13px", fontWeight: 600, color: "#64748b", cursor: "pointer", fontFamily: "inherit" },
  lineaGrid:     { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: "8px" },
  lineaBtn:      { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "10px 8px", borderRadius: "12px", border: "1.5px solid #e2e8f0", background: "white", cursor: "pointer", fontFamily: "inherit" },
  itemCard:      { border: "1.5px solid #e2e8f0", borderRadius: "16px", overflow: "hidden" },
  itemHeader:    { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" },
  itemNum:       { width: "26px", height: "26px", background: "#1e293b", color: "white", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800 },
  itemLineBadge: { padding: "4px 12px", borderRadius: "40px", fontSize: "12px", fontWeight: 700 },
  lineConfig:    { margin: "0 16px 16px", borderRadius: "12px", border: "1.5px solid", padding: "14px" },
  lineConfigTitle:{ fontSize: "13px", fontWeight: 700, margin: "0 0 12px" },
  toggleBtn:     { padding: "8px 18px", borderRadius: "9px", border: "1.5px solid #e2e8f0", background: "white", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  toggleBtnOn:   { background: "#1e293b", color: "white", borderColor: "#1e293b" },
  uvTypeBtn:     { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "14px", borderRadius: "12px", border: "1.5px solid #e2e8f0", background: "white", cursor: "pointer", fontFamily: "inherit" },
  uvTypeBtnOn:   { background: "#fffbeb", borderColor: "#f59e0b" },
  emptyItems:    { display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "40px", border: "2px dashed #e2e8f0", borderRadius: "14px" },
  btnPrimary:    { padding: "11px 22px", borderRadius: "12px", background: "#0f172a", color: "white", border: "none", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary:  { padding: "9px 14px", borderRadius: "10px", background: "white", color: "#64748b", border: "1.5px solid #e2e8f0", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnSuccess:    { padding: "9px 14px", borderRadius: "10px", background: "#f0fdf4", color: "#16a34a", border: "1.5px solid #4ade80", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnDanger:     { padding: "7px 12px", borderRadius: "9px", background: "#fff1f2", color: "#dc2626", border: "1.5px solid #fecaca", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
};
