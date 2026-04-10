import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const PRIORIDAD_CONFIG = {
  alta:  { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5", dot: "#ef4444", label: "Alta"  },
  media: { bg: "#fef9c3", color: "#ca8a04", border: "#fde047", dot: "#eab308", label: "Media" },
  baja:  { bg: "#dcfce7", color: "#16a34a", border: "#86efac", dot: "#22c55e", label: "Baja"  },
};

const LINEA_CONFIG = {
  Sellos:      { icon: "🔖", bg: "#eef2ff",  color: "#4f46e5" },
  Sublimación: { icon: "🌈", bg: "#fdf2f8",  color: "#db2777" },
  UV:          { icon: "🔆", bg: "#fffbeb",  color: "#d97706" },
  Textil:      { icon: "👕", bg: "#f0fdf4",  color: "#16a34a" },
  Plotter:     { icon: "✂️", bg: "#f0f9ff",  color: "#0284c7" },
  Láser:       { icon: "⚡", bg: "#fff1f2",  color: "#e11d48" },
  Otros:       { icon: "📦", bg: "#f8fafc",  color: "#64748b" },
};

function getLineas(items = []) {
  return [...new Set(items.map(i => i.linea).filter(Boolean))];
}

function getElapsedDays(fecha) {
  if (!fecha) return null;
  return Math.floor((Date.now() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24));
}

function extractGuiaNumero(url) {
  if (!url) return "";
  const parts = url.trim().split("/");
  return parts[parts.length - 1] || "";
}

// ¿Algún ítem de Sellos tiene UV = true?
function needsUV(items = []) {
  return items.some(i => i.linea === "Sellos" && i.specs?.uv === true);
}

// Chips de specs por ítem
function getItemSpecChips(item) {
  const specs = item.specs || {};
  const chips = [];
  if (item.linea === "Sellos") {
    if (item.product_name) chips.push({ label: item.product_name, color: "#4f46e5", bold: true });
    if (item.variant_name) chips.push({ label: item.variant_name, color: "#4f46e5", bold: true });
    if (specs.tinta)       chips.push({ label: `Tinta: ${specs.tinta}`, color: "#4f46e5" });
    if (specs.uv === true)  chips.push({ label: "UV: Sí", color: "#d97706" });
    if (specs.uv === false) chips.push({ label: "UV: No", color: "#94a3b8" });
  } else if (item.linea === "UV") {
    if (specs.formato)          chips.push({ label: `Formato: ${specs.formato}`,       color: "#d97706" });
    if (specs.equivalente)      chips.push({ label: `Equiv. A3: ${specs.equivalente}`, color: "#d97706" });
    if (specs.metros_cuadrados) chips.push({ label: `${specs.metros_cuadrados} m²`,    color: "#d97706" });
    if (specs.modo_dtf)         chips.push({ label: specs.modo_dtf,                     color: "#64748b" });
    if (specs.destino)          chips.push({ label: `Destino: ${specs.destino}`,        color: "#64748b" });
  } else {
    Object.entries(specs)
      .filter(([, v]) => v !== null && v !== "" && v !== false)
      .slice(0, 2)
      .forEach(([k, v]) => chips.push({ label: `${k}: ${v}`, color: "#64748b" }));
  }
  return chips;
}

// Primera imagen de variante disponible en los ítems
function getFirstVariantImage(items = []) {
  for (const item of items) {
    if (item.variant_image_url) return item.variant_image_url;
  }
  return null;
}

export default function KanbanCard({
  order, onOpen, onUploadDesign, onUploadGuide,
  isDragging = false, dragOverlay = false,
  onRefresh,
}) {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === "admin";

  const [guiaModalOpen, setGuiaModalOpen] = useState(false);
  const [guiaFile,      setGuiaFile]      = useState(null);
  const [trackingUrl,   setTrackingUrl]   = useState(order?.tracking_url || "");
  const [costoEnvio,    setCostoEnvio]    = useState(order?.costo_transporte || "");
  const [transportista, setTransportista] = useState(order?.transportista || "");
  const [savingGuia,    setSavingGuia]    = useState(false);
  const [uploadingUV,   setUploadingUV]   = useState(false);

  const sortable = useSortable({
    id: order.id,
    data: { type: "order", order },
    disabled: dragOverlay,
  });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: sortDragging } = sortable;
  const style = dragOverlay ? undefined : { transform: CSS.Transform.toString(transform), transition };

  const cliente     = order.data_json?.cliente?.nombre || "Sin nombre";
  const telefono    = order.data_json?.cliente?.telefono || "";
  const orderNumber = order.data_json?.order_number || "—";
  const items       = order.data_json?.items || [];
  const lineas      = getLineas(items);
  const prioridad   = order.prioridad || "media";
  const pConfig     = PRIORIDAD_CONFIG[prioridad] || PRIORIDAD_CONFIG.media;
  const dias        = getElapsedDays(order.fecha_creacion);
  const dragging    = isDragging || sortDragging;
  const guiaNumeroAuto = extractGuiaNumero(trackingUrl);
  const uvRequired  = needsUV(items);
  const variantImg  = getFirstVariantImage(items);

  async function guardarGuia() {
    if (!trackingUrl.trim()) { alert("Ingresa el link de tracking"); return; }
    try {
      setSavingGuia(true);
      let shippingGuideUrl = order.shipping_guide_url;
      if (guiaFile) {
        const fn = `${Date.now()}-${guiaFile.name}`;
        const { error: ue } = await supabase.storage.from("guides").upload(fn, guiaFile);
        if (ue) throw ue;
        shippingGuideUrl = supabase.storage.from("guides").getPublicUrl(fn).data.publicUrl;
      }
      const { error } = await supabase.from("orders").update({
        shipping_guide_url: shippingGuideUrl,
        guia_numero:        extractGuiaNumero(trackingUrl.trim()),
        tracking_url:       trackingUrl.trim(),
        costo_transporte:   costoEnvio ? Number(costoEnvio) : 0,
        transportista:      transportista.trim() || null,
      }).eq("id", order.id);
      if (error) throw error;
      setGuiaModalOpen(false);
      setGuiaFile(null);
      if (onRefresh) onRefresh();
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setSavingGuia(false);
    }
  }

  async function subirUV(file) {
    if (!file) return;
    try {
      setUploadingUV(true);
      const fn = `${Date.now()}-${file.name}`;
      const { error: ue } = await supabase.storage.from("designs").upload(fn, file);
      if (ue) throw ue;
      const url = supabase.storage.from("designs").getPublicUrl(fn).data.publicUrl;
      const { error } = await supabase.from("orders").update({ uv_url: url }).eq("id", order.id);
      if (error) throw error;
      if (onRefresh) onRefresh();
    } catch (e) {
      alert(`Error subiendo UV: ${e.message}`);
    } finally {
      setUploadingUV(false);
    }
  }

  return (
    <div ref={dragOverlay ? undefined : setNodeRef} style={{ ...S.card, ...(dragging ? S.cardDragging : {}) }}>
      {/* Strip prioridad */}
      <div style={{ ...S.prioStrip, background: pConfig.dot }} />

      {/* Cuerpo clickable */}
      <button type="button" onClick={e => { e.stopPropagation(); onOpen(order); }} style={S.cardBody}>

        {/* Header */}
        <div style={S.headerRow}>
          <div style={S.orderNumWrap}>
            <span style={S.orderNum}>#{orderNumber}</span>
            {dias !== null && (
              <span style={{ ...S.daysBadge, background: dias > 3 ? "#fee2e2" : "#f1f5f9", color: dias > 3 ? "#dc2626" : "#64748b" }}>
                {dias === 0 ? "Hoy" : `${dias}d`}
              </span>
            )}
          </div>
          <span style={{ ...S.prioBadge, background: pConfig.bg, color: pConfig.color, border: `1px solid ${pConfig.border}` }}>
            <span style={{ ...S.prioDot, background: pConfig.dot }} />{pConfig.label}
          </span>
        </div>

        {/* Cliente */}
        <div style={S.clienteRow}>
          <span style={{ fontSize: "14px" }}>👤</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={S.clienteNombre}>{cliente}</p>
            {telefono && <p style={S.clienteTel}>{telefono}</p>}
          </div>
          {/* Foto del producto (variante) */}
          {variantImg && (
            <img src={variantImg} alt="producto"
              style={{ width: "40px", height: "40px", borderRadius: "10px", objectFit: "cover", border: "2px solid #e2e8f0", flexShrink: 0 }} />
          )}
        </div>

        {/* Líneas */}
        {lineas.length > 0 && (
          <div style={S.section}>
            <span style={S.sectionLabel}>LÍNEAS</span>
            <div style={S.lineasRow}>
              {lineas.map(l => {
                const lc = LINEA_CONFIG[l] || LINEA_CONFIG.Otros;
                return <span key={l} style={{ ...S.lineaTag, background: lc.bg, color: lc.color }}>{lc.icon} {l}</span>;
              })}
            </div>
          </div>
        )}

        {/* Detalle ítems */}
        {items.length > 0 && (
          <div style={S.section}>
            <span style={S.sectionLabel}>DETALLE</span>
            <div style={S.productosList}>
              {items.slice(0, 4).map((item, i) => {
                const lc    = LINEA_CONFIG[item.linea] || LINEA_CONFIG.Otros;
                const chips = getItemSpecChips(item);
                return (
                  <div key={i} style={S.productoRow}>
                    {/* Foto de variante o ícono de línea */}
                    {item.variant_image_url ? (
                      <img src={item.variant_image_url} alt=""
                        style={{ width: "28px", height: "28px", borderRadius: "7px", objectFit: "cover", border: "1px solid #e2e8f0", flexShrink: 0 }} />
                    ) : (
                      <span style={{ ...S.productoIcon, background: lc.bg }}>{lc.icon}</span>
                    )}
                    <div style={S.productoInfo}>
                      <span style={S.productoNombre}>{item.description || "Sin descripción"}</span>
                      {chips.length > 0 && (
                        <div style={S.chipsRow}>
                          {chips.map((chip, ci) => (
                            <span key={ci} style={{ ...S.chip, background: chip.color + "18", color: chip.color, border: `1px solid ${chip.color}33`, fontWeight: chip.bold ? 800 : 600 }}>
                              {chip.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span style={S.productoQty}>×{item.quantity || 0}</span>
                  </div>
                );
              })}
              {items.length > 4 && <p style={S.masItems}>+{items.length - 4} más</p>}
            </div>
          </div>
        )}

        {/* Alertas */}
        <div style={S.alertsRow}>
          {!order.design_url         && <span style={S.alertRed}>⚠ Sin diseño</span>}
          {uvRequired && !order.uv_url && <span style={{ ...S.alertRed, background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a" }}>⚠ Sin UV</span>}
          {!order.shipping_guide_url  && <span style={S.alertYellow}>⚠ Sin guía</span>}
          {order.guia_numero          && <span style={S.alertGreen}>🚚 {order.guia_numero.slice(-8)}</span>}
          {order.costo_transporte > 0 && <span style={{ ...S.alertGreen, background: "#f0fdf4", color: "#15803d" }}>💰 ${Number(order.costo_transporte).toFixed(2)}</span>}
        </div>

        {/* Links archivos */}
        {(order.pdf_url || order.design_url || order.uv_url || order.shipping_guide_url || order.tracking_url) && (
          <div style={S.filesRow}>
            {isAdmin && order.pdf_url && (
              <a href={order.pdf_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={S.fileLink}>📄 PDF</a>
            )}
            {order.design_url && (
              <a href={order.design_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ ...S.fileLink, background: "#eff6ff", color: "#2563eb" }}>🎨 Diseño</a>
            )}
            {order.uv_url && (
              <a href={order.uv_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ ...S.fileLink, background: "#fffbeb", color: "#d97706" }}>🔆 UV</a>
            )}
            {order.shipping_guide_url && (
              <a href={order.shipping_guide_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ ...S.fileLink, background: "#f0fdf4", color: "#16a34a" }}>🚚 Guía</a>
            )}
            {order.tracking_url && (
              <a href={order.tracking_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ ...S.fileLink, background: "#f5f3ff", color: "#7c3aed" }}>🔗 Tracking</a>
            )}
          </div>
        )}
      </button>

      {/* Admin uploads */}
      {isAdmin && (
        <div style={S.adminSection}>
          {/* Diseño */}
          <label style={S.uploadRow}>
            <span style={S.uploadLabel}>🎨 Diseño</span>
            <input type="file" style={{ display: "none" }} onClick={e => e.stopPropagation()}
              onChange={e => onUploadDesign(order.id, e.target.files?.[0])} />
            <span style={S.uploadBtn}>↑ Elegir</span>
          </label>

          {/* UV — solo si algún ítem de Sellos tiene UV = true */}
          {uvRequired && (
            <label style={{ ...S.uploadRow, opacity: uploadingUV ? 0.6 : 1 }}>
              <span style={{ ...S.uploadLabel, color: "#d97706" }}>
                🔆 UV{!order.uv_url ? " ⚠" : " ✓"}
              </span>
              <input type="file" style={{ display: "none" }} onClick={e => e.stopPropagation()}
                onChange={e => subirUV(e.target.files?.[0])} disabled={uploadingUV} />
              <span style={{ ...S.uploadBtn, background: order.uv_url ? "#f0fdf4" : "#fffbeb", color: order.uv_url ? "#16a34a" : "#d97706", border: `1px solid ${order.uv_url ? "#86efac" : "#fde68a"}` }}>
                {uploadingUV ? "..." : "↑ Elegir"}
              </span>
            </label>
          )}

          {/* Guía */}
          <button type="button"
            onClick={e => { e.stopPropagation(); setGuiaModalOpen(v => !v); setTrackingUrl(order?.tracking_url || ""); setCostoEnvio(order?.costo_transporte || ""); setTransportista(order?.transportista || ""); }}
            style={{ ...S.guiaBtn, background: order.shipping_guide_url ? "#f0fdf4" : "#fefce8", color: order.shipping_guide_url ? "#16a34a" : "#ca8a04", border: `1px solid ${order.shipping_guide_url ? "#86efac" : "#fde047"}` }}>
            🚚 {order.shipping_guide_url ? "✓ Guía — Actualizar" : "Registrar guía"}
          </button>

          {/* Modal guía */}
          {guiaModalOpen && (
            <div style={S.guiaModal} onClick={e => e.stopPropagation()}>
              <div style={S.guiaModalHeader}>
                <span style={{ fontSize: "13px", fontWeight: 800, color: "#1e293b" }}>🚚 Registrar guía de envío</span>
                <button onClick={() => setGuiaModalOpen(false)} style={S.closeBtn}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {/* Link tracking */}
                <div>
                  <label style={S.guiaLabel}>LINK DE TRACKING *</label>
                  <input type="url" placeholder="https://yex-ec.yobelscm.biz/tracking/..."
                    value={trackingUrl} onChange={e => setTrackingUrl(e.target.value)} style={S.guiaInput} />
                </div>
                {guiaNumeroAuto && (
                  <div style={S.guiaAutoNum}>
                    <span style={{ fontSize: "9px", fontWeight: 700, color: "#16a34a" }}>✅ NÚMERO DETECTADO</span>
                    <span style={{ fontSize: "13px", fontWeight: 800, color: "#166534", fontFamily: "monospace" }}>{guiaNumeroAuto}</span>
                  </div>
                )}
                {/* Transportista */}
                <div>
                  <label style={S.guiaLabel}>TRANSPORTISTA</label>
                  <select value={transportista} onChange={e => setTransportista(e.target.value)} style={{ ...S.guiaInput, background: "white" }}>
                    <option value="">Seleccionar...</option>
                    <option value="Yobel">Yobel</option>
                    <option value="Servientrega">Servientrega</option>
                    <option value="Uber">Uber</option>
                    <option value="Indrive">Indrive</option>
                    <option value="Didi">Didi</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                {/* Costo de envío */}
                <div>
                  <label style={S.guiaLabel}>COSTO DE ENVÍO ($)</label>
                  <input type="number" step="0.01" placeholder="0.00"
                    value={costoEnvio} onChange={e => setCostoEnvio(e.target.value)} style={S.guiaInput} />
                </div>
                {/* PDF guía */}
                <div>
                  <label style={S.guiaLabel}>PDF DE LA GUÍA (opcional)</label>
                  <label style={S.guiaFileLabel}>
                    <span>📎 {guiaFile ? guiaFile.name : "Seleccionar..."}</span>
                    <input type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={e => setGuiaFile(e.target.files?.[0] || null)} />
                  </label>
                </div>
                <button onClick={guardarGuia} disabled={savingGuia || !trackingUrl.trim()}
                  style={{ ...S.guiaSaveBtn, opacity: savingGuia || !trackingUrl.trim() ? 0.5 : 1 }}>
                  {savingGuia ? "Guardando..." : "💾 Guardar guía"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drag handle */}
      <div {...(dragOverlay ? {} : attributes)} {...(dragOverlay ? {} : listeners)} style={S.dragHandle}>
        <span style={{ fontSize: "16px", color: "#cbd5e1" }}>⠿</span>
        <span style={{ fontSize: "10px", fontWeight: 700, color: "#cbd5e1", letterSpacing: "0.5px", textTransform: "uppercase" }}>Arrastrar</span>
      </div>
    </div>
  );
}

const S = {
  card:           { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  cardDragging:   { boxShadow: "0 20px 40px rgba(0,0,0,0.18)", transform: "rotate(1.5deg) scale(1.02)", opacity: 0.92 },
  prioStrip:      { height: "3px", width: "100%", flexShrink: 0 },
  cardBody:       { display: "flex", flexDirection: "column", gap: "10px", padding: "14px 14px 10px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", width: "100%" },
  headerRow:      { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  orderNumWrap:   { display: "flex", alignItems: "center", gap: "6px" },
  orderNum:       { fontSize: "15px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px" },
  daysBadge:      { fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "40px" },
  prioBadge:      { display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", fontWeight: 700, padding: "3px 9px", borderRadius: "40px" },
  prioDot:        { width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0 },
  clienteRow:     { display: "flex", alignItems: "center", gap: "8px" },
  clienteNombre:  { fontSize: "13px", fontWeight: 700, color: "#1e293b", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  clienteTel:     { fontSize: "11px", color: "#94a3b8", margin: "2px 0 0" },
  section:        { display: "flex", flexDirection: "column", gap: "5px" },
  sectionLabel:   { fontSize: "9px", fontWeight: 800, color: "#cbd5e1", letterSpacing: "1.5px" },
  lineasRow:      { display: "flex", flexWrap: "wrap", gap: "4px" },
  lineaTag:       { fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "6px" },
  productosList:  { display: "flex", flexDirection: "column", gap: "5px" },
  productoRow:    { display: "flex", alignItems: "flex-start", gap: "7px", background: "#f8fafc", borderRadius: "8px", padding: "7px 8px" },
  productoIcon:   { width: "28px", height: "28px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0 },
  productoInfo:   { flex: 1, display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 },
  productoNombre: { fontSize: "11px", fontWeight: 700, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chipsRow:       { display: "flex", flexWrap: "wrap", gap: "3px" },
  chip:           { fontSize: "10px", padding: "2px 6px", borderRadius: "5px" },
  productoQty:    { fontSize: "11px", fontWeight: 800, color: "#475569", flexShrink: 0 },
  masItems:       { fontSize: "10px", color: "#94a3b8", margin: 0 },
  alertsRow:      { display: "flex", flexWrap: "wrap", gap: "4px" },
  alertRed:       { fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px", background: "#fff1f2", color: "#dc2626", border: "1px solid #fecaca" },
  alertYellow:    { fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px", background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a" },
  alertGreen:     { fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac" },
  filesRow:       { display: "flex", flexWrap: "wrap", gap: "4px" },
  fileLink:       { fontSize: "10px", fontWeight: 700, padding: "4px 10px", borderRadius: "8px", background: "#f8fafc", color: "#475569", textDecoration: "none" },
  adminSection:   { borderTop: "1px solid #f1f5f9", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "8px", background: "#fafbfc" },
  uploadRow:      { display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", gap: "8px" },
  uploadLabel:    { fontSize: "11px", fontWeight: 600, color: "#94a3b8" },
  uploadBtn:      { fontSize: "10px", fontWeight: 700, padding: "4px 10px", borderRadius: "8px", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" },
  guiaBtn:        { width: "100%", padding: "8px 12px", borderRadius: "10px", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" },
  guiaModal:      { background: "white", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "14px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" },
  guiaModalHeader:{ display: "flex", alignItems: "center", justifyContent: "space-between" },
  closeBtn:       { background: "none", border: "none", fontSize: "14px", cursor: "pointer", color: "#94a3b8", fontFamily: "inherit", padding: "2px 6px" },
  guiaLabel:      { display: "block", fontSize: "9px", fontWeight: 800, color: "#94a3b8", letterSpacing: "1px", marginBottom: "4px" },
  guiaInput:      { width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1.5px solid #e2e8f0", fontSize: "12px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  guiaAutoNum:    { background: "#f0fdf4", borderRadius: "8px", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "2px", border: "1px solid #86efac" },
  guiaFileLabel:  { display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: "8px", border: "1.5px dashed #e2e8f0", fontSize: "12px", color: "#64748b", cursor: "pointer", background: "#f8fafc" },
  guiaSaveBtn:    { padding: "9px 16px", borderRadius: "10px", background: "#0f172a", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%" },
  dragHandle:     { borderTop: "1px solid #f1f5f9", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: "grab", background: "#fafbfc" },
};
