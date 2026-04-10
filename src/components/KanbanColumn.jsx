import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import KanbanCard from "./KanbanCard";

const COLUMN_CONFIG = {
  "Nuevo": {
    icon: "🆕", color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe",
    headerBg: "linear-gradient(135deg,#6366f1,#818cf8)",
    description: "Órdenes recién ingresadas",
  },
  "En Producción": {
    icon: "⚙️", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a",
    headerBg: "linear-gradient(135deg,#f59e0b,#fbbf24)",
    description: "En proceso de fabricación",
  },
  "Finalizado": {
    icon: "✅", color: "#10b981", bg: "#f0fdf4", border: "#a7f3d0",
    headerBg: "linear-gradient(135deg,#10b981,#34d399)",
    description: "Producción completada",
  },
  "Empaquetado": {
    icon: "📦", color: "#0ea5e9", bg: "#f0f9ff", border: "#bae6fd",
    headerBg: "linear-gradient(135deg,#0ea5e9,#38bdf8)",
    description: "Listo para envío",
  },
  "Enviado": {
    icon: "🚚", color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe",
    headerBg: "linear-gradient(135deg,#8b5cf6,#a78bfa)",
    description: "Entregado al transportista",
  },
};

export default function KanbanColumn({
  estado, orders, onOpenOrder, onUploadDesign, onUploadGuide, onRefresh,
}) {
  const config = COLUMN_CONFIG[estado] || {
    icon: "📋", color: "#64748b", bg: "#f8fafc", border: "#e2e8f0",
    headerBg: "linear-gradient(135deg,#64748b,#94a3b8)", description: "",
  };

  const { setNodeRef, isOver } = useDroppable({ id: estado });

  const totalUnidades = orders.reduce((acc, o) => {
    const items = o.data_json?.items || [];
    return acc + items.reduce((a, i) => a + (Number(i.quantity) || 0), 0);
  }, 0);

  return (
    <div style={{ ...S.column, border: isOver ? `2px solid ${config.color}` : "2px solid transparent" }}>

      {/* Header */}
      <div style={{ ...S.header, background: config.headerBg }}>
        <div style={S.headerTop}>
          <div style={S.headerLeft}>
            <span style={S.headerIcon}>{config.icon}</span>
            <div>
              <h3 style={S.headerTitle}>{estado}</h3>
              <p style={S.headerDesc}>{config.description}</p>
            </div>
          </div>
          <div style={S.countBadge}>{orders.length}</div>
        </div>
        <div style={S.headerStats}>
          <span style={S.headerStat}>
            <span style={S.headerStatNum}>{orders.length}</span> orden{orders.length !== 1 ? "es" : ""}
          </span>
          <span style={S.headerStatDivider}>·</span>
          <span style={S.headerStat}>
            <span style={S.headerStatNum}>{totalUnidades}</span> unidades
          </span>
        </div>
      </div>

      {/* Drop zone */}
      <SortableContext items={orders.map(o => o.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          style={{
            ...S.dropZone,
            background: isOver ? config.bg : "#f8fafc",
            borderColor: isOver ? config.border : "transparent",
          }}
        >
          {orders.length === 0 ? (
            <div style={S.emptyZone}>
              <span style={{ fontSize: "32px", opacity: 0.4 }}>{config.icon}</span>
              <p style={S.emptyText}>Sin órdenes</p>
              <p style={S.emptyHint}>Arrastra aquí para mover</p>
            </div>
          ) : (
            <div style={S.cardsList}>
              {orders.map(order => (
                <KanbanCard
                  key={order.id}
                  order={order}
                  onOpen={onOpenOrder}
                  onUploadDesign={onUploadDesign}
                  onUploadGuide={onUploadGuide}
                  onRefresh={onRefresh}
                />
              ))}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

const S = {
  column:            { display: "flex", flexDirection: "column", borderRadius: "20px", overflow: "hidden", background: "white", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", transition: "border-color 0.15s", minHeight: "520px", fontFamily: "'DM Sans','Segoe UI',sans-serif" },
  header:            { padding: "16px 16px 14px", color: "white", display: "flex", flexDirection: "column", gap: "10px" },
  headerTop:         { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" },
  headerLeft:        { display: "flex", alignItems: "center", gap: "10px" },
  headerIcon:        { fontSize: "24px", lineHeight: 1 },
  headerTitle:       { fontSize: "15px", fontWeight: 800, margin: 0, letterSpacing: "-0.3px" },
  headerDesc:        { fontSize: "11px", margin: "2px 0 0", opacity: 0.8, fontWeight: 400 },
  countBadge:        { background: "rgba(255,255,255,0.25)", backdropFilter: "blur(4px)", borderRadius: "10px", padding: "4px 11px", fontSize: "16px", fontWeight: 800, flexShrink: 0 },
  headerStats:       { display: "flex", alignItems: "center", gap: "8px", background: "rgba(0,0,0,0.15)", borderRadius: "8px", padding: "5px 10px" },
  headerStat:        { fontSize: "11px", fontWeight: 500, opacity: 0.9 },
  headerStatNum:     { fontWeight: 800 },
  headerStatDivider: { opacity: 0.4 },
  dropZone:          { flex: 1, padding: "12px", border: "2px dashed", margin: "8px", borderRadius: "14px", transition: "background 0.15s, border-color 0.15s" },
  emptyZone:         { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: "6px" },
  emptyText:         { fontSize: "13px", fontWeight: 700, color: "#94a3b8", margin: 0 },
  emptyHint:         { fontSize: "11px", color: "#cbd5e1", margin: 0 },
  cardsList:         { display: "flex", flexDirection: "column", gap: "10px" },
};
