import { useEffect, useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor,
  pointerWithin, rectIntersection, useSensor, useSensors,
} from "@dnd-kit/core";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import KanbanColumn from "../components/KanbanColumn";
import KanbanCard from "../components/KanbanCard";
import OrderDetailModal from "../components/OrderDetailModal";

const ESTADOS = ["Nuevo", "En Producción", "Finalizado", "Empaquetado", "Enviado"];

const ESTADO_CONFIG = {
  "Nuevo":         { color: "#6366f1" },
  "En Producción": { color: "#f59e0b" },
  "Finalizado":    { color: "#10b981" },
  "Empaquetado":   { color: "#0ea5e9" },
  "Enviado":       { color: "#8b5cf6" },
};

function collisionStrategy(args) {
  const ptr = pointerWithin(args);
  return ptr.length > 0 ? ptr : rectIntersection(args);
}

export default function Kanban() {
  const { profile } = useAuth();
  const [orders, setOrders]               = useState([]);
  const [activeOrder, setActiveOrder]     = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [search, setSearch]               = useState("");
  const [filterLinea, setFilterLinea]     = useState("Todas");
  const [filterPrio, setFilterPrio]       = useState("Todas");
  const [loading, setLoading]             = useState(true);

  const isAdmin   = profile?.rol === "admin";
  const isOperario = profile?.rol === "operario";
  const canDrag   = isAdmin || isOperario;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  useEffect(() => {
    fetchOrders();
    const channel = supabase
      .channel("orders-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, fetchOrders)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchOrders() {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("fecha_creacion", { ascending: true });
    if (!error) setOrders(data || []);
    setLoading(false);
  }

  // Líneas disponibles para filtro
  const availableLineas = useMemo(() => {
    const ls = new Set();
    orders.forEach(o => (o.data_json?.items || []).forEach(i => i.linea && ls.add(i.linea)));
    return ["Todas", ...Array.from(ls).sort()];
  }, [orders]);

  // Filtrado
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const items  = o.data_json?.items || [];
      const cliente = (o.data_json?.cliente?.nombre || "").toLowerCase();
      const num     = (o.data_json?.order_number || "").toLowerCase();
      const term    = search.trim().toLowerCase();

      if (term && !cliente.includes(term) && !num.includes(term)) return false;
      if (filterPrio !== "Todas" && o.prioridad !== filterPrio) return false;
      if (filterLinea !== "Todas" && !items.some(i => i.linea === filterLinea)) return false;
      return true;
    });
  }, [orders, search, filterLinea, filterPrio]);

  const columns = useMemo(() => {
    const g = {};
    for (const e of ESTADOS) g[e] = filteredOrders.filter(o => o.estado === e);
    return g;
  }, [filteredOrders]);

  // Stats globales
  const stats = useMemo(() => {
    const total = orders.length;
    const enProd = orders.filter(o => o.estado === "En Producción").length;
    const sinDiseno = orders.filter(o => !o.design_url && o.estado !== "Enviado").length;
    const alta = orders.filter(o => o.prioridad === "alta" && o.estado !== "Enviado").length;
    return { total, enProd, sinDiseno, alta };
  }, [orders]);

  function findById(id) { return orders.find(o => o.id === id); }

  function handleDragStart(e) {
    if (!canDrag) return;
    setActiveOrder(findById(e.active.id) || null);
  }

  async function handleDragEnd(e) {
    setActiveOrder(null);
    if (!canDrag) return;
    const { active, over } = e;
    if (!over) return;
    const dragged = findById(active.id);
    if (!dragged) return;
    let newEstado = ESTADOS.includes(over.id) ? over.id : (findById(over.id)?.estado || null);
    if (!newEstado || dragged.estado === newEstado) return;
    const prev = [...orders];
    setOrders(cur => cur.map(o => o.id === active.id ? { ...o, estado: newEstado } : o));
    const { error } = await supabase.from("orders").update({ estado: newEstado }).eq("id", active.id);
    if (error) { setOrders(prev); alert(`Error: ${error.message}`); }
  }

  async function subirArchivo(orderId, file, bucket, campo) {
    if (!file || !isAdmin) return;
    try {
      const fn = `${Date.now()}-${file.name}`;
      const { error: ue } = await supabase.storage.from(bucket).upload(fn, file);
      if (ue) throw ue;
      const url = supabase.storage.from(bucket).getPublicUrl(fn).data.publicUrl;
      const { error: upd } = await supabase.from("orders").update({ [campo]: url }).eq("id", orderId);
      if (upd) throw upd;
      await fetchOrders();
    } catch (err) { alert(`Error: ${err.message}`); }
  }

  const handleUploadDesign = (id, f) => subirArchivo(id, f, "designs", "design_url");
  const handleUploadGuide  = (id, f) => subirArchivo(id, f, "guides", "shipping_guide_url");

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.hero}>
        <div style={S.heroContent}>
          <div style={S.heroLabel}>TABLERO DE PRODUCCIÓN</div>
          <h2 style={S.heroTitle}>Kanban</h2>
          <p style={S.heroSub}>Gestiona el estado de cada orden arrastrando las tarjetas entre columnas</p>
        </div>
        {/* Stats rápidas */}
        <div style={S.heroStats}>
          <HeroStat num={stats.total}     label="Total órdenes"  color="#fff" />
          <HeroStat num={stats.enProd}    label="En producción"  color="#fbbf24" />
          <HeroStat num={stats.alta}      label="Alta prioridad" color="#f87171" />
          <HeroStat num={stats.sinDiseno} label="Sin diseño"     color="#94a3b8" />
        </div>
      </div>

      {/* Filtros */}
      <div style={S.filterBar}>
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>⌕</span>
          <input
            type="text"
            placeholder="Buscar cliente o # orden..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={S.searchInput}
          />
        </div>
        <div style={S.filterGroup}>
          <span style={S.filterLabel}>Línea:</span>
          <select value={filterLinea} onChange={e => setFilterLinea(e.target.value)} style={S.filterSelect}>
            {availableLineas.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div style={S.filterGroup}>
          <span style={S.filterLabel}>Prioridad:</span>
          <select value={filterPrio} onChange={e => setFilterPrio(e.target.value)} style={S.filterSelect}>
            {["Todas", "alta", "media", "baja"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
        <div style={S.rolBadge}>
          <span style={S.rolDot(profile?.rol)} />
          {profile?.rol || "sin rol"}
        </div>
        {!canDrag && (
          <span style={S.readonlyChip}>👁 Solo lectura</span>
        )}
      </div>

      {/* Progreso del pipeline */}
      <div style={S.pipelineBar}>
        {ESTADOS.map(estado => {
          const count = (columns[estado] || []).length;
          const pct   = orders.length > 0 ? Math.round((count / orders.length) * 100) : 0;
          const cfg   = ESTADO_CONFIG[estado];
          return (
            <div key={estado} style={S.pipelineItem}>
              <div style={S.pipelineInfo}>
                <span style={S.pipelineEstado}>{estado}</span>
                <span style={{ ...S.pipelineCount, color: cfg.color }}>{count}</span>
              </div>
              <div style={S.pipelineTrack}>
                <div style={{ ...S.pipelineFill, width: `${pct}%`, background: cfg.color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tablero */}
      {loading ? (
        <div style={S.loadingWrap}>
          <div style={S.spinner} />
          <p style={{ color: "#94a3b8", margin: 0 }}>Cargando órdenes...</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionStrategy}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div style={S.boardWrap}>
            <div style={S.board}>
              {ESTADOS.map(estado => (
                <KanbanColumn
                  key={estado}
                  estado={estado}
                  orders={columns[estado] || []}
                  onOpenOrder={setSelectedOrder}
                  onUploadDesign={handleUploadDesign}
                  onUploadGuide={handleUploadGuide}
                />
              ))}
            </div>
          </div>

          <DragOverlay dropAnimation={{ duration: 160, easing: "ease-out" }}>
            {activeOrder ? (
              <div style={{ width: "280px" }}>
                <KanbanCard
                  order={activeOrder}
                  onOpen={() => {}}
                  onUploadDesign={() => {}}
                  onUploadGuide={() => {}}
                  isDragging
                  dragOverlay
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Modal detalle */}
      {selectedOrder && (
        <OrderDetailModal
          order={orders.find(o => o.id === selectedOrder.id) || selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onRefresh={fetchOrders}
        />
      )}
    </div>
  );
}

function HeroStat({ num, label, color }) {
  return (
    <div style={S.heroStat}>
      <span style={{ ...S.heroStatNum, color }}>{num}</span>
      <span style={S.heroStatLabel}>{label}</span>
    </div>
  );
}

function rolColor(rol) {
  return rol === "admin" ? "#10b981" : rol === "operario" ? "#f59e0b" : "#6366f1";
}

const S = {
  page: { display: "flex", flexDirection: "column", gap: "20px", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", color: "#1e293b" },
  hero: { background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", borderRadius: "20px", padding: "28px 32px", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" },
  heroContent: {},
  heroLabel: { fontSize: "10px", fontWeight: 700, letterSpacing: "3px", color: "#94a3b8", marginBottom: "6px" },
  heroTitle: { fontSize: "32px", fontWeight: 800, margin: 0, letterSpacing: "-1px" },
  heroSub: { fontSize: "13px", color: "#64748b", marginTop: "6px" },
  heroStats: { display: "flex", gap: "8px", flexWrap: "wrap" },
  heroStat: { background: "rgba(255,255,255,0.06)", borderRadius: "14px", padding: "12px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", border: "1px solid rgba(255,255,255,0.08)" },
  heroStatNum: { fontSize: "24px", fontWeight: 800, lineHeight: 1 },
  heroStatLabel: { fontSize: "10px", color: "#64748b", whiteSpace: "nowrap" },
  filterBar: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", background: "white", borderRadius: "16px", padding: "14px 20px", border: "1px solid #e2e8f0" },
  searchWrap: { position: "relative", flex: 1, minWidth: "200px" },
  searchIcon: { position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "18px", color: "#94a3b8", pointerEvents: "none" },
  searchInput: { width: "100%", paddingLeft: "38px", paddingRight: "14px", paddingTop: "9px", paddingBottom: "9px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" },
  filterGroup: { display: "flex", alignItems: "center", gap: "6px" },
  filterLabel: { fontSize: "12px", fontWeight: 600, color: "#94a3b8", whiteSpace: "nowrap" },
  filterSelect: { padding: "8px 12px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "13px", fontFamily: "inherit", outline: "none", background: "white" },
  rolBadge: { display: "flex", alignItems: "center", gap: "7px", padding: "7px 14px", borderRadius: "40px", background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "capitalize", marginLeft: "auto" },
  rolDot: (rol) => ({ width: "8px", height: "8px", borderRadius: "50%", background: rolColor(rol), flexShrink: 0 }),
  readonlyChip: { fontSize: "11px", fontWeight: 600, padding: "5px 12px", borderRadius: "40px", background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" },
  pipelineBar: { display: "flex", gap: "12px", background: "white", borderRadius: "16px", padding: "16px 20px", border: "1px solid #e2e8f0", flexWrap: "wrap" },
  pipelineItem: { flex: 1, minWidth: "120px", display: "flex", flexDirection: "column", gap: "6px" },
  pipelineInfo: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  pipelineEstado: { fontSize: "11px", fontWeight: 600, color: "#64748b" },
  pipelineCount: { fontSize: "15px", fontWeight: 800 },
  pipelineTrack: { height: "6px", background: "#f1f5f9", borderRadius: "40px", overflow: "hidden" },
  pipelineFill: { height: "100%", borderRadius: "40px", transition: "width 0.4s ease" },
  loadingWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px", gap: "16px", background: "white", borderRadius: "16px", border: "1px solid #e2e8f0" },
  spinner: { width: "32px", height: "32px", border: "3px solid #e2e8f0", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  boardWrap: { overflowX: "auto", paddingBottom: "8px" },
  board: { display: "grid", gridTemplateColumns: "repeat(5, minmax(280px, 1fr))", gap: "14px", minWidth: "1440px" },
};
