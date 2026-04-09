import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../context/AuthContext";

const PRIORIDAD_CONFIG = {
  alta:  { bg: "#fee2e2", color: "#dc2626", border: "#fca5a5", dot: "#ef4444", label: "Alta" },
  media: { bg: "#fef9c3", color: "#ca8a04", border: "#fde047", dot: "#eab308", label: "Media" },
  baja:  { bg: "#dcfce7", color: "#16a34a", border: "#86efac", dot: "#22c55e", label: "Baja" },
};

const LINEA_CONFIG = {
  Sellos:      { icon: "🔖", bg: "#eef2ff", color: "#4f46e5" },
  Sublimación: { icon: "🌈", bg: "#fdf2f8", color: "#db2777" },
  UV:          { icon: "🔆", bg: "#fffbeb", color: "#d97706" },
  Textil:      { icon: "👕", bg: "#f0fdf4", color: "#16a34a" },
  Plotter:     { icon: "✂️", bg: "#f0f9ff", color: "#0284c7" },
  Láser:       { icon: "⚡", bg: "#fff1f2", color: "#e11d48" },
  Otros:       { icon: "📦", bg: "#f8fafc", color: "#64748b" },
};

function getLineas(items = []) {
  return [...new Set(items.map(i => i.linea).filter(Boolean))];
}

function getTotalQty(items = []) {
  return items.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
}

function getProductosSummary(items = []) {
  // Recolecta descripcion + specs relevantes por item
  return items.map(item => {
    const parts = [item.description || "Sin descripción"];
    if (item.specs?.tinta) parts.push(`Tinta: ${item.specs.tinta}`);
    if (item.linea === "Sellos" && item.specs?.uv) parts.push("UV en carcasa");
    if (item.linea === "UV" && item.specs?.formato) parts.push(item.specs.formato);
    if (item.linea === "UV" && item.specs?.metros_cuadrados) parts.push(`${item.specs.metros_cuadrados} m²`);
    return { text: parts[0], detail: parts.slice(1).join(" · "), qty: item.quantity || 0, linea: item.linea };
  });
}

function getElapsedDays(fechaCreacion) {
  if (!fechaCreacion) return null;
  const diff = Date.now() - new Date(fechaCreacion).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function KanbanCard({
  order, onOpen, onUploadDesign, onUploadGuide,
  isDragging = false, dragOverlay = false,
}) {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === "admin";

  const sortable = useSortable({
    id: order.id,
    data: { type: "order", order },
    disabled: dragOverlay,
  });

  const { attributes, listeners, setNodeRef, transform, transition, isDragging: sortDragging } = sortable;

  const style = dragOverlay ? undefined : {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const cliente      = order.data_json?.cliente?.nombre || "Sin nombre";
  const telefono     = order.data_json?.cliente?.telefono || "";
  const orderNumber  = order.data_json?.order_number || "—";
  const items        = order.data_json?.items || [];
  const totalQty     = getTotalQty(items);
  const lineas       = getLineas(items);
  const prioridad    = order.prioridad || "media";
  const pConfig      = PRIORIDAD_CONFIG[prioridad] || PRIORIDAD_CONFIG.media;
  const dias         = getElapsedDays(order.fecha_creacion);
  const productos    = getProductosSummary(items);
  const dragging     = isDragging || sortDragging;

  return (
    <div
      ref={dragOverlay ? undefined : setNodeRef}
      style={{
        ...S.card,
        ...(dragging ? S.cardDragging : {}),
      }}
    >
      {/* Prioridad strip */}
      <div style={{ ...S.prioStrip, background: pConfig.dot }} />

      {/* Clickable body */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onOpen(order); }}
        style={S.cardBody}
      >
        {/* Header row */}
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
            <span style={{ ...S.prioDot, background: pConfig.dot }} />
            {pConfig.label}
          </span>
        </div>

        {/* Cliente */}
        <div style={S.clienteRow}>
          <span style={S.clienteIcon}>👤</span>
          <div>
            <p style={S.clienteNombre}>{cliente}</p>
            {telefono && <p style={S.clienteTel}>{telefono}</p>}
          </div>
        </div>

        {/* Métricas rápidas */}
        <div style={S.metricsRow}>
          <div style={S.metricBox}>
            <span style={S.metricVal}>{totalQty}</span>
            <span style={S.metricLabel}>unidades</span>
          </div>
          <div style={S.metricBox}>
            <span style={S.metricVal}>{items.length}</span>
            <span style={S.metricLabel}>ítems</span>
          </div>
          {isAdmin && order.total_venta ? (
            <div style={{ ...S.metricBox, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <span style={{ ...S.metricVal, color: "#16a34a" }}>${Number(order.total_venta).toFixed(0)}</span>
              <span style={{ ...S.metricLabel, color: "#16a34a" }}>total</span>
            </div>
          ) : null}
        </div>

        {/* Líneas */}
        {lineas.length > 0 && (
          <div style={S.lineasSection}>
            <span style={S.sectionLabel}>LÍNEAS</span>
            <div style={S.lineasRow}>
              {lineas.map(l => {
                const lc = LINEA_CONFIG[l] || LINEA_CONFIG.Otros;
                return (
                  <span key={l} style={{ ...S.lineaTag, background: lc.bg, color: lc.color }}>
                    {lc.icon} {l}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Productos / ítems detalle */}
        {productos.length > 0 && (
          <div style={S.productosSection}>
            <span style={S.sectionLabel}>DETALLE</span>
            <div style={S.productosList}>
              {productos.slice(0, 3).map((p, i) => {
                const lc = LINEA_CONFIG[p.linea] || LINEA_CONFIG.Otros;
                return (
                  <div key={i} style={S.productoRow}>
                    <span style={{ ...S.productoIcon, background: lc.bg }}>{lc.icon}</span>
                    <div style={S.productoInfo}>
                      <span style={S.productoNombre}>{p.text}</span>
                      {p.detail && <span style={S.productoDetail}>{p.detail}</span>}
                    </div>
                    <span style={S.productoQty}>×{p.qty}</span>
                  </div>
                );
              })}
              {productos.length > 3 && (
                <p style={S.masItems}>+{productos.length - 3} ítem{productos.length - 3 > 1 ? "s" : ""} más</p>
              )}
            </div>
          </div>
        )}

        {/* Alertas */}
        <div style={S.alertsRow}>
          {!order.design_url && (
            <span style={S.alertChip}>⚠ Sin diseño</span>
          )}
          {!order.shipping_guide_url && (
            <span style={{ ...S.alertChip, background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a" }}>⚠ Sin guía</span>
          )}
        </div>

        {/* Archivos */}
        {(order.pdf_url || order.design_url || order.shipping_guide_url) && (
          <div style={S.filesRow}>
            {isAdmin && order.pdf_url && (
              <a href={order.pdf_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={S.fileLink}>
                📄 PDF
              </a>
            )}
            {order.design_url && (
              <a href={order.design_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ ...S.fileLink, background: "#eff6ff", color: "#2563eb" }}>
                🎨 Diseño
              </a>
            )}
            {order.shipping_guide_url && (
              <a href={order.shipping_guide_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ ...S.fileLink, background: "#f0fdf4", color: "#16a34a" }}>
                🚚 Guía
              </a>
            )}
          </div>
        )}
      </button>

      {/* Uploads (solo admin) */}
      {isAdmin && (
        <div style={S.uploadsSection}>
          <UploadRow label="Subir diseño" onChange={f => onUploadDesign(order.id, f)} />
          <UploadRow label="Subir guía" onChange={f => onUploadGuide(order.id, f)} />
        </div>
      )}

      {/* Drag handle */}
      <div
        {...(dragOverlay ? {} : attributes)}
        {...(dragOverlay ? {} : listeners)}
        style={S.dragHandle}
      >
        <span style={S.dragDots}>⠿</span>
        <span style={S.dragLabel}>Arrastrar</span>
      </div>
    </div>
  );
}

function UploadRow({ label, onChange }) {
  return (
    <label style={S.uploadRow}>
      <span style={S.uploadLabel}>{label}</span>
      <input
        type="file"
        style={{ display: "none" }}
        onClick={e => e.stopPropagation()}
        onChange={e => onChange(e.target.files?.[0])}
      />
      <span style={S.uploadBtn}>↑ Elegir</span>
    </label>
  );
}

const S = {
  card: {
    background: "white",
    borderRadius: "16px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    transition: "box-shadow 0.2s, transform 0.15s",
    position: "relative",
  },
  cardDragging: {
    boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
    transform: "rotate(1.5deg) scale(1.02)",
    opacity: 0.92,
  },
  prioStrip: {
    height: "3px",
    width: "100%",
    flexShrink: 0,
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "14px 14px 10px",
    background: "transparent",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
    width: "100%",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  orderNumWrap: { display: "flex", alignItems: "center", gap: "6px" },
  orderNum: { fontSize: "15px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px" },
  daysBadge: { fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "40px" },
  prioBadge: { display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", fontWeight: 700, padding: "3px 9px", borderRadius: "40px" },
  prioDot: { width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0 },
  clienteRow: { display: "flex", alignItems: "flex-start", gap: "8px" },
  clienteIcon: { fontSize: "14px", marginTop: "1px", flexShrink: 0 },
  clienteNombre: { fontSize: "13px", fontWeight: 700, color: "#1e293b", margin: 0, lineHeight: 1.3 },
  clienteTel: { fontSize: "11px", color: "#94a3b8", margin: "2px 0 0", lineHeight: 1 },
  metricsRow: { display: "flex", gap: "6px" },
  metricBox: { flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "7px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" },
  metricVal: { fontSize: "16px", fontWeight: 800, color: "#0f172a", lineHeight: 1 },
  metricLabel: { fontSize: "9px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" },
  lineasSection: { display: "flex", flexDirection: "column", gap: "5px" },
  sectionLabel: { fontSize: "9px", fontWeight: 800, color: "#cbd5e1", letterSpacing: "1.5px" },
  lineasRow: { display: "flex", flexWrap: "wrap", gap: "4px" },
  lineaTag: { fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "6px" },
  productosSection: { display: "flex", flexDirection: "column", gap: "6px" },
  productosList: { display: "flex", flexDirection: "column", gap: "4px" },
  productoRow: { display: "flex", alignItems: "center", gap: "7px", background: "#f8fafc", borderRadius: "8px", padding: "6px 8px" },
  productoIcon: { width: "22px", height: "22px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", flexShrink: 0 },
  productoInfo: { flex: 1, display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 },
  productoNombre: { fontSize: "11px", fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  productoDetail: { fontSize: "10px", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  productoQty: { fontSize: "11px", fontWeight: 800, color: "#475569", flexShrink: 0 },
  masItems: { fontSize: "10px", color: "#94a3b8", margin: 0, paddingLeft: "4px" },
  alertsRow: { display: "flex", flexWrap: "wrap", gap: "4px" },
  alertChip: { fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px", background: "#fff1f2", color: "#dc2626", border: "1px solid #fecaca" },
  filesRow: { display: "flex", flexWrap: "wrap", gap: "4px" },
  fileLink: { fontSize: "10px", fontWeight: 700, padding: "4px 10px", borderRadius: "8px", background: "#f8fafc", color: "#475569", textDecoration: "none" },
  uploadsSection: { borderTop: "1px solid #f1f5f9", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "6px", background: "#fafbfc" },
  uploadRow: { display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", gap: "8px" },
  uploadLabel: { fontSize: "11px", fontWeight: 600, color: "#94a3b8" },
  uploadBtn: { fontSize: "10px", fontWeight: 700, padding: "4px 10px", borderRadius: "8px", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" },
  dragHandle: { borderTop: "1px solid #f1f5f9", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: "grab", background: "#fafbfc" },
  dragDots: { fontSize: "16px", color: "#cbd5e1", lineHeight: 1 },
  dragLabel: { fontSize: "10px", fontWeight: 700, color: "#cbd5e1", letterSpacing: "0.5px", textTransform: "uppercase" },
};
