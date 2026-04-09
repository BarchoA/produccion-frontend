import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function OrderDetailModal({
  order,
  onClose,
  onRefresh,
}) {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === "admin";
  const isOperario = profile?.rol === "operario";
  const isLectura = profile?.rol === "lectura";

  const [notes, setNotes] = useState(order?.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);

  useEffect(() => {
    setNotes(order?.notes || "");
  }, [order]);

  if (!order) return null;

  const cliente = order.data_json?.cliente?.nombre || "Sin nombre";
  const telefono = order.data_json?.cliente?.telefono || "";
  const orderNumber = order.data_json?.order_number || "";
  const descripcionOrden =
    order.data_json?.descripcion_orden ||
    order.data_json?.operational_summary?.descripcion_orden ||
    "";
  const items = order.data_json?.items || [];

  async function subirArchivo(file, bucket, campo) {
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
        .eq("id", order.id);

      if (updateError) throw updateError;

      await onRefresh();
    } catch (error) {
      console.error(error);
      alert(`Error subiendo archivo: ${error.message}`);
    }
  }

  async function guardarNotas() {
    try {
      setSavingNotes(true);

      const { error } = await supabase
        .from("orders")
        .update({ notes })
        .eq("id", order.id);

      if (error) throw error;

      await onRefresh();
    } catch (error) {
      console.error(error);
      alert(`Error guardando notas: ${error.message}`);
    } finally {
      setSavingNotes(false);
    }
  }

  async function eliminarOrden() {
    if (!isAdmin) return;

    const confirmDelete = window.confirm(
      `¿Seguro que deseas eliminar la orden #${orderNumber || "sin número"}?\n\nEsta acción restaurará stock si la orden descontó inventario y borrará la orden definitivamente.`
    );

    if (!confirmDelete) return;

    try {
      setDeletingOrder(true);

      // 1. Leer order_items de la orden para restaurar stock si aplica
      const { data: orderItems, error: orderItemsError } = await supabase
        .from("order_items")
        .select("id, cantidad, variant_id")
        .eq("order_id", order.id);

      if (orderItemsError) throw orderItemsError;

      // 2. Restaurar stock de variantes asociadas
      for (const item of orderItems || []) {
        if (item.variant_id && Number(item.cantidad) > 0) {
          const { error: restoreError } = await supabase.rpc(
            "increment_variant_stock",
            {
              p_variant_id: item.variant_id,
              p_quantity: Number(item.cantidad),
            }
          );

          if (restoreError) throw restoreError;
        }
      }

      // 3. Eliminar orden (los items deberían borrarse por cascade)
      const { error: deleteOrderError } = await supabase
        .from("orders")
        .delete()
        .eq("id", order.id);

      if (deleteOrderError) throw deleteOrderError;

      await onRefresh();
      onClose();
      alert("Orden eliminada correctamente");
    } catch (error) {
      console.error(error);
      alert(`Error eliminando orden: ${error.message}`);
    } finally {
      setDeletingOrder(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/30">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">{cliente}</h3>
            <p className="mt-1 text-sm text-slate-500">{telefono}</p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Cerrar
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Número de orden</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              #{orderNumber || "Sin número"}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Estado</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {order.estado}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Prioridad</p>
            <p className="mt-1 text-sm font-semibold capitalize text-slate-900">
              {order.prioridad || "media"}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Fecha</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {new Date(order.fecha_creacion).toLocaleDateString()}
            </p>
          </div>

          {isAdmin && (
            <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2">
              <p className="text-xs text-slate-500">Subtotal / total venta</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                ${Number(order.total_venta || 0).toFixed(2)}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-slate-900">
            Descripción de la orden
          </h4>

          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-800">
              {descripcionOrden || "Sin descripción operativa"}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-slate-900">Items</h4>

          <div className="mt-3 space-y-3">
            {items.map((item, index) => (
              <div
                key={index}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {item.description || "Sin descripción"}
                </p>

                <div
                  className={`mt-3 grid gap-3 text-sm ${
                    isAdmin ? "md:grid-cols-4" : "md:grid-cols-2"
                  }`}
                >
                  <div>
                    <p className="text-xs text-slate-500">Cantidad</p>
                    <p className="font-medium text-slate-800">
                      {item.quantity ?? 0}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Línea</p>
                    <p className="font-medium text-slate-800">
                      {item.linea || "Sin línea"}
                    </p>
                  </div>

                  {isAdmin && (
                    <>
                      <div>
                        <p className="text-xs text-slate-500">Valor unitario</p>
                        <p className="font-medium text-slate-800">
                          ${Number(item.unit_value || 0).toFixed(2)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">Subtotal</p>
                        <p className="font-medium text-slate-800">
                          ${Number(item.line_total || 0).toFixed(2)}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}

            {items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-400">
                Sin items detectados
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-slate-900">Archivos</h4>

          <div className="mt-3 flex flex-wrap gap-2">
            {isAdmin && order.pdf_url && (
              <a
                href={order.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white"
              >
                📄 Ver PDF
              </a>
            )}

            {order.design_url && (
              <a
                href={order.design_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-medium text-white"
              >
                🎨 Ver diseño
              </a>
            )}

            {order.shipping_guide_url && (
              <a
                href={order.shipping_guide_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white"
              >
                🚚 Ver guía
              </a>
            )}
          </div>

          {isAdmin && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-500">
                  Subir diseño
                </label>
                <input
                  type="file"
                  onChange={(e) =>
                    subirArchivo(e.target.files[0], "designs", "design_url")
                  }
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-slate-500">
                  Subir guía
                </label>
                <input
                  type="file"
                  onChange={(e) =>
                    subirArchivo(
                      e.target.files[0],
                      "guides",
                      "shipping_guide_url"
                    )
                  }
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-slate-900">Notas</h4>

          <div className="mt-3 space-y-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
              placeholder="Escribe notas de producción, observaciones o seguimiento..."
            />

            {!isLectura && (
              <button
                onClick={guardarNotas}
                disabled={savingNotes}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingNotes ? "Guardando..." : "Guardar notas"}
              </button>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="mt-8 border-t border-slate-200 pt-6">
            <h4 className="text-sm font-semibold text-red-700">
              Zona de peligro
            </h4>
            <p className="mt-2 text-sm text-slate-500">
              Eliminar una orden restaurará stock si descontó inventario y
              borrará la orden definitivamente.
            </p>

            <button
              onClick={eliminarOrden}
              disabled={deletingOrder}
              className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deletingOrder ? "Eliminando..." : "Eliminar orden"}
            </button>
          </div>
        )}

        {(isOperario || isLectura) && (
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
            Vista operativa: aquí solo se muestra información necesaria para producción.
          </div>
        )}
      </div>
    </div>
  );
}