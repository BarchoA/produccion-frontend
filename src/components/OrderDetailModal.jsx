import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

const ESTADO_CONFIG = {
  "Nuevo":         { color: "#6366f1", bg: "#eef2ff", icon: "🆕" },
  "En Producción": { color: "#f59e0b", bg: "#fffbeb", icon: "⚙️" },
  "Finalizado":    { color: "#10b981", bg: "#f0fdf4", icon: "✅" },
  "Empaquetado":   { color: "#0ea5e9", bg: "#f0f9ff", icon: "📦" },
  "Enviado":       { color: "#8b5cf6", bg: "#f5f3ff", icon: "🚚" },
  "Entregado":     { color: "#16a34a", bg: "#dcfce7", icon: "🎉" },
};

const LINEA_CONFIG = {
  Sellos:      { icon: "🔖", color: "#4f46e5" },
  Sublimación: { icon: "🌈", color: "#db2777" },
  UV:          { icon: "🔆", color: "#d97706" },
  Textil:      { icon: "👕", color: "#16a34a" },
  Plotter:     { icon: "✂️", color: "#0284c7" },
  Láser:       { icon: "⚡", color: "#e11d48" },
  Otros:       { icon: "📦", color: "#64748b" },
};

const fmt     = v => `$${Number(v || 0).toFixed(2)}`;
const fmtDate = d => { if (!d) return "—"; return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" }); };

function extractGuiaNumero(url) {
  if (!url) return "";
  return url.trim().split("/").pop() || "";
}

function needsUV(items = []) {
  return items.some(i => i.linea === "Sellos" && i.specs?.uv === true);
}

function getItemSpecs(item) {
  const specs = item.specs || {};
  const chips = [];
  if (item.linea === "Sellos") {
    if (item.product_name) chips.push(`Modelo: ${item.product_name}`);
    if (item.variant_name) chips.push(`Variante: ${item.variant_name}`);
    if (specs.tinta)       chips.push(`Tinta: ${specs.tinta}`);
    if (specs.uv === true)  chips.push("UV en carcasa: Sí");
    if (specs.uv === false) chips.push("UV en carcasa: No");
  } else if (item.linea === "UV") {
    if (specs.formato)          chips.push(`Formato: ${specs.formato}`);
    if (specs.equivalente)      chips.push(`Equiv. A3: ${specs.equivalente}`);
    if (specs.metros_cuadrados) chips.push(`m²: ${specs.metros_cuadrados}`);
    if (specs.modo_trabajo)     chips.push(`Modo: ${specs.modo_trabajo}`);
    if (specs.modo_dtf)         chips.push(`DTF: ${specs.modo_dtf}`);
    if (specs.destino)          chips.push(`Destino: ${specs.destino}`);
    if (specs.articulo)         chips.push(`Artículo: ${specs.articulo}`);
    if (specs.observacion_tecnica) chips.push(`Obs: ${specs.observacion_tecnica}`);
  } else {
    Object.entries(specs).filter(([, v]) => v !== null && v !== "" && v !== false)
      .forEach(([k, v]) => chips.push(`${k}: ${v}`));
  }
  return chips;
}

export default function OrderDetailModal({ order, onClose, onRefresh }) {
  const { profile } = useAuth();
  const isAdmin    = profile?.rol === "admin";
  const isOperario = profile?.rol === "operario";
  const isLectura  = profile?.rol === "lectura";

  const [notes,          setNotes]          = useState(order?.notes || "");
  const [savingNotes,    setSavingNotes]    = useState(false);
  const [deletingOrder,  setDeletingOrder]  = useState(false);
  const [trackingUrl,    setTrackingUrl]    = useState(order?.tracking_url || "");
  const [guiaFile,       setGuiaFile]       = useState(null);
  const [costoEnvio,     setCostoEnvio]     = useState(order?.costo_transporte || "");
  const [transportista,  setTransportista]  = useState(order?.transportista || "");
  const [savingGuia,     setSavingGuia]     = useState(false);
  const [uploadingUV,    setUploadingUV]    = useState(false);
  const [verificando,    setVerificando]    = useState(false);
  const [trackingResult, setTrackingResult] = useState(null);

  useEffect(() => {
    setNotes(order?.notes || "");
    setTrackingUrl(order?.tracking_url || "");
    setCostoEnvio(order?.costo_transporte || "");
    setTransportista(order?.transportista || "");
  }, [order]);

  if (!order) return null;

  const cliente          = order.data_json?.cliente?.nombre || "Sin nombre";
  const telefono         = order.data_json?.cliente?.telefono || "";
  const orderNumber      = order.data_json?.order_number || "";
  const descripcionOrden = order.data_json?.descripcion_orden || order.data_json?.operational_summary?.descripcion_orden || "";
  const items            = order.data_json?.items || [];
  const estadoConfig     = ESTADO_CONFIG[order.estado] || {};
  const uvRequired       = needsUV(items);
  const guiaNumeroAuto   = extractGuiaNumero(trackingUrl);

  async function subirArchivo(file, bucket, campo) {
    if (!file || !isAdmin) return;
    try {
      const fn = `${Date.now()}-${file.name}`;
      const { error: ue } = await supabase.storage.from(bucket).upload(fn, file);
      if (ue) throw ue;
      const url = supabase.storage.from(bucket).getPublicUrl(fn).data.publicUrl;
      const { error } = await supabase.from("orders").update({ [campo]: url }).eq("id", order.id);
      if (error) throw error;
      await onRefresh();
    } catch (e) { alert(`Error: ${e.message}`); }
  }

  async function subirUV(file) {
    if (!file || !isAdmin) return;
    try {
      setUploadingUV(true);
      await subirArchivo(file, "designs", "uv_url");
    } finally { setUploadingUV(false); }
  }

  async function guardarGuia() {
    if (!isAdmin || !trackingUrl.trim()) { alert("Ingresa el link de tracking"); return; }
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
      setGuiaFile(null);
      await onRefresh();
      alert("✅ Guía guardada correctamente");
    } catch (e) { alert(`Error: ${e.message}`); }
    finally { setSavingGuia(false); }
  }

  async function verificarTracking() {
    if (!order.tracking_url) { alert("Sin link de tracking"); return; }
    try {
      setVerificando(true);
      const res = await fetch("https://ibjtjtmakpdulkraiaca.supabase.co/functions/v1/clever-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlianRqdG1ha3BkdWxrcmFpYWNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2Nzg2NTEsImV4cCI6MjA5MTI1NDY1MX0.vMAFzvDZ-4R8Sn38kTG01a2e5JOWPoO2LAV-WYmUIY8" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      const resultado = data?.resultados?.find(r => r.id === order.id);
      setTrackingResult(resultado?.accion || "Revisado — sin cambios");
      if (resultado?.accion?.includes("Entregado")) { await onRefresh(); onClose(); }
    } catch (e) { setTrackingResult("Error: " + e.message); }
    finally { setVerificando(false); }
  }

  async function guardarNotas() {
    try {
      setSavingNotes(true);
      const { error } = await supabase.from("orders").update({ notes }).eq("id", order.id);
      if (error) throw error;
      await onRefresh();
    } catch (e) { alert(`Error: ${e.message}`); }
    finally { setSavingNotes(false); }
  }

  async function eliminarOrden() {
    if (!isAdmin) return;
    if (!window.confirm(`¿Eliminar orden #${orderNumber}? Esto restaurará stock permanentemente.`)) return;
    try {
      setDeletingOrder(true);
      const { data: orderItems } = await supabase.from("order_items").select("id, cantidad, variant_id").eq("order_id", order.id);
      for (const item of orderItems || []) {
        if (item.variant_id && Number(item.cantidad) > 0) {
          await supabase.rpc("increment_variant_stock", { p_variant_id: item.variant_id, p_quantity: Number(item.cantidad) });
        }
      }
      await supabase.from("orders").delete().eq("id", order.id);
      await onRefresh();
      onClose();
    } catch (e) { alert(`Error: ${e.message}`); }
    finally { setDeletingOrder(false); }
  }

  return (
    <div style={S.overlay}>
      <div style={S.panel}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <h3 style={S.headerTitle}>{cliente}</h3>
              <span style={{ ...S.estadoBadge, background: estadoConfig.bg, color: estadoConfig.color }}>
                {estadoConfig.icon} {order.estado}
              </span>
            </div>
            {telefono && <p style={S.headerSub}>{telefono}</p>}
          </div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        {/* Info grid */}
        <div style={S.infoGrid}>
          <InfoBox label="Número de orden" value={`#${orderNumber || "—"}`} />
          <InfoBox label="Prioridad" value={<span style={{ textTransform: "capitalize" }}>{order.prioridad || "media"}</span>} />
          <InfoBox label="Fecha" value={fmtDate(order.fecha_creacion)} />
          {isAdmin && (
            <InfoBox label="Total venta" value={<span style={{ color: "#10b981", fontWeight: 800 }}>{fmt(order.total_venta)}</span>} />
          )}
          {isAdmin && order.costo_transporte > 0 && (
            <InfoBox label="Costo transporte" value={<span style={{ color: "#f59e0b", fontWeight: 700 }}>💰 {fmt(order.costo_transporte)}</span>} />
          )}
          {order.transportista && (
            <InfoBox label="Transportista" value={`🚚 ${order.transportista}`} />
          )}
        </div>

        {/* Descripción */}
        {descripcionOrden && (
          <Section title="📝 Descripción">
            <div style={S.descBox}>{descripcionOrden}</div>
          </Section>
        )}

        {/* Ítems */}
        <Section title="📦 Ítems">
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {items.map((item, i) => {
              const lc    = LINEA_CONFIG[item.linea] || LINEA_CONFIG.Otros;
              const specs = getItemSpecs(item);
              return (
                <div key={i} style={S.itemRow}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {item.variant_image_url ? (
                      <img src={item.variant_image_url} alt="" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover", border: "1px solid #e2e8f0", flexShrink: 0 }} />
                    ) : (
                      <span style={{ fontSize: "18px", flexShrink: 0 }}>{lc.icon}</span>
                    )}
                    <div style={{ flex: 1 }}>
                      <p style={S.itemName}>{item.description || "—"}</p>
                      <p style={S.itemLinea}>{item.linea || "—"}</p>
                      {specs.length > 0 && (
                        <div style={S.specsRow}>
                          {specs.map((s, si) => <span key={si} style={S.specChip}>{s}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={S.itemQty}>×{item.quantity || 0}</p>
                    {isAdmin && <p style={S.itemTotal}>{fmt(item.line_total)}</p>}
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <p style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center" }}>Sin ítems</p>}
          </div>
        </Section>

        {/* ── ARCHIVOS ── */}
        <Section title="📁 Archivos">
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

            {/* 1. PDF Inicial */}
            <FileRow
              icon="📄" label="PDF Inicial" locked
              url={order.pdf_url} linkLabel="Ver PDF"
            />

            {/* 2. Diseño */}
            <div style={S.fileRow}>
              <div style={S.fileRowHeader}>
                <span style={S.fileRowLabel}>🎨 Diseño</span>
                {order.design_url
                  ? <a href={order.design_url} target="_blank" rel="noreferrer" style={S.fileLink}>Ver diseño</a>
                  : <span style={S.fileMissing}>⚠ Sin archivo</span>
                }
              </div>
              {isAdmin && (
                <label style={S.uploadLabel}>
                  {order.design_url ? "Reemplazar" : "Subir diseño"}
                  <input type="file" accept="image/*,.pdf,.ai,.psd" style={{ display: "none" }}
                    onChange={e => subirArchivo(e.target.files?.[0], "designs", "design_url")} />
                </label>
              )}
            </div>

            {/* 3. UV — solo si algún ítem de Sellos tiene UV = true */}
            {uvRequired && (
              <div style={{ ...S.fileRow, border: `1px solid ${order.uv_url ? "#86efac" : "#fde68a"}`, background: order.uv_url ? "#f0fdf4" : "#fffbeb" }}>
                <div style={S.fileRowHeader}>
                  <span style={{ ...S.fileRowLabel, color: "#d97706" }}>
                    🔆 Archivo UV {order.uv_url ? "✓" : "⚠ Requerido"}
                  </span>
                  {order.uv_url
                    ? <a href={order.uv_url} target="_blank" rel="noreferrer" style={{ ...S.fileLink, background: "#f0fdf4", color: "#16a34a" }}>Ver UV</a>
                    : <span style={{ fontSize: "11px", color: "#d97706", fontWeight: 600 }}>Pendiente</span>
                  }
                </div>
                {isAdmin && (
                  <label style={{ ...S.uploadLabel, opacity: uploadingUV ? 0.6 : 1 }}>
                    {uploadingUV ? "Subiendo..." : order.uv_url ? "Reemplazar UV" : "Subir archivo UV"}
                    <input type="file" accept="image/*,.pdf,.ai,.psd" style={{ display: "none" }} disabled={uploadingUV}
                      onChange={e => subirUV(e.target.files?.[0])} />
                  </label>
                )}
              </div>
            )}

            {/* 4. Guía de envío */}
            <div style={S.guiaSection}>
              <div style={S.fileRowHeader}>
                <span style={S.fileRowLabel}>🚚 Guía de envío</span>
                {order.shipping_guide_url && (
                  <a href={order.shipping_guide_url} target="_blank" rel="noreferrer" style={S.fileLink}>Ver archivo</a>
                )}
              </div>

              {/* Info actual de guía */}
              {(order.guia_numero || order.tracking_url || order.transportista || order.costo_transporte > 0) && (
                <div style={S.guiaInfoBox}>
                  {order.guia_numero && <GuiaInfoRow label="Número de guía" value={<span style={{ fontFamily: "monospace", fontWeight: 700 }}>{order.guia_numero}</span>} />}
                  {order.transportista && <GuiaInfoRow label="Transportista" value={order.transportista} />}
                  {order.costo_transporte > 0 && <GuiaInfoRow label="Costo de envío" value={<span style={{ color: "#f59e0b", fontWeight: 800 }}>{fmt(order.costo_transporte)}</span>} />}
                  {order.tracking_url && <GuiaInfoRow label="Tracking" value={<a href={order.tracking_url} target="_blank" rel="noreferrer" style={{ ...S.fileLink, fontSize: "11px" }}>🔗 Abrir tracking</a>} />}
                  {order.entregado_at && (
                    <div style={{ background: "#dcfce7", borderRadius: "8px", padding: "8px 12px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#16a34a" }}>🎉 Entregado el {fmtDate(order.entregado_at)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Botón verificar */}
              {order.tracking_url && order.estado === "Enviado" && (
                <div>
                  <button onClick={verificarTracking} disabled={verificando} style={S.trackingBtn}>
                    {verificando ? "⏳ Verificando..." : "🔍 Verificar estado ahora"}
                  </button>
                  {trackingResult && (
                    <div style={{ ...S.trackingResult, background: trackingResult.includes("Entregado") ? "#dcfce7" : "#f1f5f9", color: trackingResult.includes("Entregado") ? "#16a34a" : "#64748b" }}>
                      {trackingResult}
                    </div>
                  )}
                </div>
              )}

              {/* Formulario guía */}
              {isAdmin && (
                <div style={S.guiaForm}>
                  <p style={S.guiaFormTitle}>{order.shipping_guide_url ? "Actualizar guía" : "Registrar guía"}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div>
                      <label style={S.fieldLabel}>LINK DE TRACKING *</label>
                      <input type="url" placeholder="https://yex-ec.yobelscm.biz/tracking/..."
                        value={trackingUrl} onChange={e => setTrackingUrl(e.target.value)} style={S.input} />
                    </div>
                    {guiaNumeroAuto && (
                      <div style={S.guiaAutoNum}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#16a34a" }}>✅ Número detectado automáticamente</span>
                        <span style={{ fontSize: "14px", fontWeight: 800, color: "#166534", fontFamily: "monospace" }}>{guiaNumeroAuto}</span>
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <label style={S.fieldLabel}>TRANSPORTISTA</label>
                        <select value={transportista} onChange={e => setTransportista(e.target.value)} style={{ ...S.input, background: "white" }}>
                          <option value="">Seleccionar...</option>
                          <option value="Yobel">Yobel</option>
                          <option value="Servientrega">Servientrega</option>
                          <option value="Uber">Uber</option>
                          <option value="Indrive">Indrive</option>
                          <option value="Didi">Didi</option>
                          <option value="Otro">Otro</option>
                        </select>
                      </div>
                      <div>
                        <label style={S.fieldLabel}>COSTO DE ENVÍO ($)</label>
                        <input type="number" step="0.01" placeholder="0.00"
                          value={costoEnvio} onChange={e => setCostoEnvio(e.target.value)} style={S.input} />
                      </div>
                    </div>
                    <div>
                      <label style={S.fieldLabel}>ARCHIVO DE GUÍA (opcional)</label>
                      <input type="file" accept=".pdf,image/*" onChange={e => setGuiaFile(e.target.files?.[0] || null)} style={S.fileInput} />
                      {guiaFile && <p style={{ fontSize: "11px", color: "#64748b", margin: "4px 0 0" }}>📎 {guiaFile.name}</p>}
                    </div>
                  </div>
                  <button onClick={guardarGuia} disabled={savingGuia || !trackingUrl.trim()}
                    style={{ ...S.btnPrimary, marginTop: "10px", opacity: savingGuia || !trackingUrl.trim() ? 0.5 : 1 }}>
                    {savingGuia ? "Guardando..." : "💾 Guardar guía"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Notas */}
        <Section title="📋 Notas de producción">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
            placeholder="Observaciones, seguimiento, notas internas..." style={S.textarea} />
          {!isLectura && (
            <button onClick={guardarNotas} disabled={savingNotes}
              style={{ ...S.btnSecondary, opacity: savingNotes ? 0.6 : 1 }}>
              {savingNotes ? "Guardando..." : "Guardar notas"}
            </button>
          )}
        </Section>

        {/* Zona de peligro */}
        {isAdmin && (
          <div style={S.dangerZone}>
            <p style={S.dangerTitle}>⚠️ Zona de peligro</p>
            <p style={S.dangerSub}>Eliminar restaurará stock y borrará la orden permanentemente.</p>
            <button onClick={eliminarOrden} disabled={deletingOrder}
              style={{ ...S.btnDanger, opacity: deletingOrder ? 0.6 : 1 }}>
              {deletingOrder ? "Eliminando..." : "🗑 Eliminar orden"}
            </button>
          </div>
        )}

        {(isOperario || isLectura) && (
          <div style={S.readonlyNote}>Vista operativa — solo información necesaria para producción.</div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return <div style={S.section}><p style={S.sectionTitle}>{title}</p>{children}</div>;
}
function InfoBox({ label, value }) {
  return <div style={S.infoBox}><p style={S.infoLabel}>{label}</p><p style={S.infoValue}>{value}</p></div>;
}
function GuiaInfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
      <span style={{ fontSize: "11px", fontWeight: 600, color: "#94a3b8" }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>{value}</span>
    </div>
  );
}
function FileRow({ icon, label, url, linkLabel }) {
  return (
    <div style={S.fileRow}>
      <div style={S.fileRowHeader}>
        <span style={S.fileRowLabel}>{icon} {label}</span>
        {url
          ? <a href={url} target="_blank" rel="noreferrer" style={S.fileLink}>{linkLabel}</a>
          : <span style={S.fileMissing}>Sin archivo</span>
        }
      </div>
    </div>
  );
}

const S = {
  overlay:        { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 50, display: "flex", alignItems: "stretch", justifyContent: "flex-end", backdropFilter: "blur(2px)" },
  panel:          { width: "100%", maxWidth: "600px", height: "100vh", background: "white", overflowY: "auto", display: "flex", flexDirection: "column", fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  header:         { display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "24px", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, background: "white", zIndex: 1 },
  headerTitle:    { fontSize: "20px", fontWeight: 800, color: "#1e293b", margin: 0 },
  headerSub:      { fontSize: "13px", color: "#94a3b8", margin: "4px 0 0" },
  estadoBadge:    { padding: "4px 12px", borderRadius: "40px", fontSize: "12px", fontWeight: 700 },
  closeBtn:       { padding: "8px 14px", borderRadius: "10px", background: "#f1f5f9", border: "none", fontSize: "16px", cursor: "pointer", color: "#64748b", fontFamily: "inherit" },
  infoGrid:       { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", padding: "20px 24px" },
  infoBox:        { background: "#f8fafc", borderRadius: "12px", padding: "12px 14px" },
  infoLabel:      { fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" },
  infoValue:      { fontSize: "14px", fontWeight: 700, color: "#1e293b", margin: 0 },
  section:        { padding: "20px 24px", borderTop: "1px solid #f1f5f9" },
  sectionTitle:   { fontSize: "12px", fontWeight: 800, color: "#1e293b", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.5px" },
  descBox:        { background: "#f8fafc", borderRadius: "12px", padding: "14px", fontSize: "13px", color: "#475569", lineHeight: 1.6 },
  itemRow:        { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", background: "#f8fafc", borderRadius: "12px", padding: "12px" },
  itemName:       { fontSize: "13px", fontWeight: 700, color: "#1e293b", margin: "0 0 2px" },
  itemLinea:      { fontSize: "11px", color: "#94a3b8", margin: "0 0 6px" },
  specsRow:       { display: "flex", flexWrap: "wrap", gap: "4px" },
  specChip:       { fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "6px", background: "#e2e8f0", color: "#475569" },
  itemQty:        { fontSize: "14px", fontWeight: 800, color: "#1e293b", margin: 0 },
  itemTotal:      { fontSize: "12px", color: "#10b981", fontWeight: 700, margin: "2px 0 0" },
  fileRow:        { background: "#f8fafc", borderRadius: "12px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px", border: "1px solid #e2e8f0" },
  fileRowHeader:  { display: "flex", alignItems: "center", justifyContent: "space-between" },
  fileRowLabel:   { fontSize: "13px", fontWeight: 700, color: "#1e293b" },
  fileMissing:    { fontSize: "11px", color: "#94a3b8" },
  fileLink:       { padding: "5px 12px", borderRadius: "8px", background: "#0f172a", color: "white", fontSize: "12px", fontWeight: 700, textDecoration: "none" },
  uploadLabel:    { display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "8px", background: "#f1f5f9", border: "1px solid #e2e8f0", fontSize: "12px", fontWeight: 600, color: "#64748b", cursor: "pointer" },
  guiaSection:    { background: "#f8fafc", borderRadius: "14px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px", border: "1px solid #e2e8f0" },
  guiaInfoBox:    { background: "white", borderRadius: "10px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "6px", border: "1px solid #e2e8f0" },
  trackingBtn:    { padding: "9px 16px", borderRadius: "10px", background: "#6366f1", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  trackingResult: { marginTop: "8px", padding: "8px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600 },
  guiaForm:       { background: "white", borderRadius: "12px", padding: "14px", border: "1px dashed #e2e8f0" },
  guiaFormTitle:  { fontSize: "11px", fontWeight: 800, color: "#64748b", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.5px" },
  guiaAutoNum:    { background: "#f0fdf4", borderRadius: "10px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "3px", border: "1px solid #86efac" },
  fieldLabel:     { display: "block", fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "1px", marginBottom: "5px" },
  input:          { width: "100%", padding: "9px 12px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  fileInput:      { width: "100%", padding: "8px 10px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "12px", fontFamily: "inherit", boxSizing: "border-box" },
  textarea:       { width: "100%", padding: "12px 14px", borderRadius: "12px", border: "1.5px solid #e2e8f0", fontSize: "13px", outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", minHeight: "90px" },
  btnPrimary:     { padding: "10px 20px", borderRadius: "10px", background: "#0f172a", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary:   { marginTop: "8px", padding: "9px 18px", borderRadius: "10px", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnDanger:      { padding: "10px 20px", borderRadius: "10px", background: "#dc2626", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  dangerZone:     { margin: "0 24px 24px", padding: "16px", borderRadius: "14px", background: "#fff1f2", border: "1px solid #fecaca" },
  dangerTitle:    { fontSize: "13px", fontWeight: 800, color: "#dc2626", margin: "0 0 4px" },
  dangerSub:      { fontSize: "12px", color: "#94a3b8", margin: "0 0 12px" },
  readonlyNote:   { margin: "0 24px 24px", padding: "12px 16px", borderRadius: "12px", background: "#f8fafc", fontSize: "12px", color: "#94a3b8", textAlign: "center" },
};
