import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import KanbanColumn from "../components/KanbanColumn";
import KanbanCard from "../components/KanbanCard";
import OrderDetailModal from "../components/OrderDetailModal";

const estados = [
  "Nuevo",
  "En Producción",
  "Finalizado",
  "Empaquetado",
  "Enviado",
];

function collisionDetectionStrategy(args) {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
}

export default function Kanban() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const isAdmin = profile?.rol === "admin";
  const isOperario = profile?.rol === "operario";
  const canDrag = isAdmin || isOperario;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    })
  );

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchOrders() {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("fecha_creacion", { ascending: true });

    if (error) {
      console.error("Error cargando órdenes:", error);
      return;
    }

    setOrders(data || []);
  }

  const columns = useMemo(() => {
    const grouped = {};
    for (const estado of estados) {
      grouped[estado] = orders.filter((order) => order.estado === estado);
    }
    return grouped;
  }, [orders]);

  function findOrderById(id) {
    return orders.find((order) => order.id === id);
  }

  function handleDragStart(event) {
    if (!canDrag) return;
    const order = findOrderById(event.active.id);
    setActiveOrder(order || null);
  }

  async function handleDragEnd(event) {
    setActiveOrder(null);

    if (!canDrag) return;

    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    const draggedOrder = findOrderById(activeId);
    if (!draggedOrder) return;

    let newEstado = null;

    if (estados.includes(overId)) {
      newEstado = overId;
    } else {
      const targetOrder = findOrderById(overId);
      if (targetOrder) {
        newEstado = targetOrder.estado;
      }
    }

    if (!newEstado || draggedOrder.estado === newEstado) return;

    const previousOrders = [...orders];

    setOrders((prev) =>
      prev.map((order) =>
        order.id === activeId ? { ...order, estado: newEstado } : order
      )
    );

    const { error } = await supabase
      .from("orders")
      .update({ estado: newEstado })
      .eq("id", activeId);

    if (error) {
      console.error("Error actualizando estado:", error);
      setOrders(previousOrders);
      alert(`Error actualizando estado: ${error.message}`);
    }
  }

  async function subirArchivo(orderId, file, bucket, campo) {
    if (!file || !isAdmin) return;

    try {
      const fileName = `${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const url = supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl;

      const { error: updateError } = await supabase
        .from("orders")
        .update({ [campo]: url })
        .eq("id", orderId);

      if (updateError) throw updateError;

      await fetchOrders();
    } catch (error) {
      console.error("Error subiendo archivo:", error);
      alert(`Error subiendo archivo: ${error.message}`);
    }
  }

  async function handleUploadDesign(orderId, file) {
    await subirArchivo(orderId, file, "designs", "design_url");
  }

  async function handleUploadGuide(orderId, file) {
    await subirArchivo(orderId, file, "guides", "shipping_guide_url");
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">
              Tablero de producción
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Arrastra las órdenes entre columnas para cambiar su estado.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-600">
            Rol actual:{" "}
            <span className="font-semibold capitalize">
              {profile?.rol || "sin rol"}
            </span>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[1450px] grid-cols-5 gap-4">
              {estados.map((estado) => (
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

          <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
            {activeOrder ? (
              <div className="w-[280px]">
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

        {!canDrag && (
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-200">
            Tu rol puede visualizar, pero no mover órdenes.
          </div>
        )}
      </div>

      {selectedOrder && (
        <OrderDetailModal
          order={orders.find((o) => o.id === selectedOrder.id) || selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onRefresh={fetchOrders}
        />
      )}
    </>
  );
}