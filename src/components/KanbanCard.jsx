import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "../context/AuthContext";

const prioridadStyles = {
  baja: "bg-slate-100 text-slate-700 border border-slate-200",
  media: "bg-amber-100 text-amber-700 border border-amber-200",
  alta: "bg-red-100 text-red-700 border border-red-200",
};

function getTotalQuantity(items = []) {
  return items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
}

function getLineas(items = []) {
  return [...new Set(items.map((item) => item.linea).filter(Boolean))];
}

export default function KanbanCard({
  order,
  onOpen,
  onUploadDesign,
  onUploadGuide,
  isDragging = false,
  dragOverlay = false,
}) {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === "admin";

  const sortable = useSortable({
    id: order.id,
    data: {
      type: "order",
      order,
    },
    disabled: dragOverlay,
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: sortableDragging,
  } = sortable;

  const style = dragOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      };

  const cliente = order.data_json?.cliente?.nombre || "Sin nombre";
  const telefono = order.data_json?.cliente?.telefono || "Sin teléfono";
  const orderNumber = order.data_json?.order_number || "Sin número";
  const items = order.data_json?.items || [];
  const totalQuantity = getTotalQuantity(items);
  const lineas = getLineas(items);

  return (
    <div
      ref={dragOverlay ? undefined : setNodeRef}
      style={style}
      className={`rounded-2xl bg-white p-3 ring-1 ring-slate-200 transition ${
        isDragging || sortableDragging
          ? "scale-[1.02] rotate-[1deg] shadow-xl opacity-80"
          : "shadow-sm hover:shadow-md"
      }`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(order);
        }}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              #{orderNumber}
            </p>
            <p className="mt-1 truncate text-[11px] text-slate-700">
              {cliente} - {telefono}
            </p>
          </div>

          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              prioridadStyles[order.prioridad] || prioridadStyles.media
            }`}
          >
            {order.prioridad || "media"}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2">
          <div className="rounded-xl bg-slate-50 px-2 py-2">
            <p className="text-[10px] text-slate-500">Cantidad items</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-800">
              {totalQuantity}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <p className="mb-1 text-[10px] text-slate-500">Líneas relacionadas</p>
          <div className="flex flex-wrap gap-1.5">
            {lineas.length > 0 ? (
              lineas.map((linea) => (
                <span
                  key={linea}
                  className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-700"
                >
                  {linea}
                </span>
              ))
            ) : (
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">
                Sin líneas
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="mt-3 space-y-1">
        {!order.design_url && (
          <div className="rounded-xl bg-red-50 px-2 py-1.5 text-[11px] text-red-600">
            ⚠ Sin diseño
          </div>
        )}

        {!order.shipping_guide_url && (
          <div className="rounded-xl bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
            ⚠ Sin guía
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {isAdmin && order.pdf_url && (
          <a
            href={order.pdf_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-medium text-white"
          >
            PDF
          </a>
        )}

        {order.design_url && (
          <a
            href={order.design_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg bg-sky-600 px-2 py-1 text-[10px] font-medium text-white"
          >
            🎨 Diseño
          </a>
        )}

        {order.shipping_guide_url && (
          <a
            href={order.shipping_guide_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white"
          >
            🚚 Guía
          </a>
        )}
      </div>

      {isAdmin && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-slate-500">
              Subir diseño
            </label>
            <input
              type="file"
              onChange={(e) => onUploadDesign(order.id, e.target.files?.[0])}
              onClick={(e) => e.stopPropagation()}
              className="block w-full rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-[10px]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium text-slate-500">
              Subir guía
            </label>
            <input
              type="file"
              onChange={(e) => onUploadGuide(order.id, e.target.files?.[0])}
              onClick={(e) => e.stopPropagation()}
              className="block w-full rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-[10px]"
            />
          </div>
        </div>
      )}

      <div
        {...(dragOverlay ? {} : attributes)}
        {...(dragOverlay ? {} : listeners)}
        className={`mt-3 rounded-xl border border-dashed px-3 py-2 text-center text-[11px] font-medium ${
          isDragging || sortableDragging
            ? "border-slate-400 bg-slate-100 text-slate-700"
            : "border-slate-200 bg-slate-50 text-slate-500"
        } cursor-grab active:cursor-grabbing`}
      >
        Arrastrar
      </div>
    </div>
  );
}