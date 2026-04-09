import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import KanbanCard from "./KanbanCard";

export default function KanbanColumn({
  estado,
  orders,
  onOpenOrder,
  onUploadDesign,
  onUploadGuide,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: estado,
    data: {
      type: "column",
      estado,
    },
  });

  return (
    <div className="flex min-h-[70vh] flex-col rounded-3xl bg-slate-100 p-3 ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{estado}</h3>
          <p className="text-[11px] text-slate-500">{orders.length} orden(es)</p>
        </div>

        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
          {orders.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 rounded-2xl p-1 transition ${
          isOver ? "bg-slate-200/70" : ""
        }`}
      >
        <SortableContext
          items={orders.map((order) => order.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {orders.map((order) => (
              <KanbanCard
                key={order.id}
                order={order}
                onOpen={onOpenOrder}
                onUploadDesign={onUploadDesign}
                onUploadGuide={onUploadGuide}
              />
            ))}

            {orders.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-400">
                Sin órdenes
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}