import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { parsePDF, extraerDatos } from "../utils/pdfParser";
import { useAuth } from "../context/AuthContext";

const lineasOptions = [
  "",
  "Sellos",
  "Sublimación",
  "UV",
  "Textil",
  "Plotter",
  "Láser",
  "Otros",
];

const tintaOptions = [
  "",
  "Negra",
  "Azul",
  "Roja",
  "Verde",
  "Morada",
  "Otros",
];

function createEmptyItem() {
  return {
    description: "",
    quantity: 1,
    unit_value: 0,
    line_total: 0,
    linea: "",
    inventory_mode: "catalogo",
    product_id: null,
    variant_id: null,
    specs: {
      tinta: "",
      uv: false,
    },
  };
}

export default function CreateOrder() {
  const { profile } = useAuth();

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [priority, setPriority] = useState("media");

  const [products, setProducts] = useState([]);
  const [productVariants, setProductVariants] = useState([]);

  const sellosProducts = useMemo(
    () => products.filter((p) => p.linea === "Sellos"),
    [products]
  );

  useEffect(() => {
    fetchInventoryCatalog();
  }, []);

  async function fetchInventoryCatalog() {
    try {
      const [
        { data: productsData, error: productsError },
        { data: variantsData, error: variantsError },
      ] = await Promise.all([
        supabase
          .from("products")
          .select("*")
          .eq("linea", "Sellos")
          .eq("is_active", true)
          .order("nombre"),
        supabase
          .from("product_variants")
          .select("*")
          .eq("is_active", true)
          .order("nombre"),
      ]);

      if (productsError) throw productsError;
      if (variantsError) throw variantsError;

      setProducts(productsData || []);
      setProductVariants(variantsData || []);
    } catch (error) {
      console.error("Error cargando catálogo de inventario:", error);
    }
  }

  if (profile?.rol !== "admin") {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <h3 className="text-xl font-semibold text-slate-800">
          Acceso restringido
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Solo el rol admin puede crear órdenes.
        </p>
      </div>
    );
  }

  function enrichParsedItem(item) {
    return {
      description: item.description || "",
      quantity: Number(item.quantity || 0),
      unit_value: Number(item.unit_value || 0),
      line_total: Number(item.line_total || 0),
      linea: item.linea || "",
      inventory_mode: "catalogo",
      product_id: null,
      variant_id: null,
      specs: {
        tinta: "",
        uv: false,
      },
    };
  }

  async function handleUpload() {
    if (!file) {
      alert("Selecciona un PDF");
      return;
    }

    try {
      setLoading(true);

      const text = await parsePDF(file);
      const data = extraerDatos(text);

      const enrichedItems = (data.items || []).map(enrichParsedItem);

      setPreviewData({
        ...data,
        items: enrichedItems,
      });
    } catch (error) {
      console.error("Error procesando PDF:", error);
      alert("Error procesando PDF");
    } finally {
      setLoading(false);
    }
  }

  function updateField(field, value) {
    setPreviewData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function updateDescripcionOrden(value) {
    setPreviewData((prev) => ({
      ...prev,
      descripcion_orden: value,
      operational_summary: {
        ...prev.operational_summary,
        descripcion_orden: value,
      },
    }));
  }

  function updateItem(index, field, value) {
    setPreviewData((prev) => {
      const newItems = [...prev.items];

      newItems[index] = {
        ...newItems[index],
        [field]:
          field === "quantity" ||
          field === "line_total" ||
          field === "unit_value"
            ? Number(value)
            : value,
      };

      return {
        ...prev,
        items: newItems,
      };
    });
  }

  function updateItemSpecs(index, specKey, value) {
    setPreviewData((prev) => {
      const newItems = [...prev.items];

      newItems[index] = {
        ...newItems[index],
        specs: {
          ...(newItems[index].specs || {}),
          [specKey]: value,
        },
      };

      return {
        ...prev,
        items: newItems,
      };
    });
  }

  function updateItemLinea(index, value) {
    setPreviewData((prev) => {
      const newItems = [...prev.items];
      const current = newItems[index];

      newItems[index] = {
        ...current,
        linea: value,
        inventory_mode: value === "Sellos" ? current.inventory_mode || "catalogo" : "catalogo",
        product_id: value === "Sellos" ? current.product_id : null,
        variant_id: value === "Sellos" ? current.variant_id : null,
        specs:
          value === "Sellos"
            ? {
                tinta: current.specs?.tinta || "",
                uv: current.specs?.uv || false,
              }
            : {},
      };

      return {
        ...prev,
        items: newItems,
      };
    });
  }

  function updateSellosMode(index, mode) {
    setPreviewData((prev) => {
      const newItems = [...prev.items];

      newItems[index] = {
        ...newItems[index],
        inventory_mode: mode,
        product_id: null,
        variant_id: null,
      };

      return {
        ...prev,
        items: newItems,
      };
    });
  }

  function updateSellosProduct(index, productId) {
    setPreviewData((prev) => {
      const newItems = [...prev.items];

      newItems[index] = {
        ...newItems[index],
        product_id: productId || null,
        variant_id: null,
      };

      return {
        ...prev,
        items: newItems,
      };
    });
  }

  function updateSellosVariant(index, variantId) {
    setPreviewData((prev) => {
      const newItems = [...prev.items];

      newItems[index] = {
        ...newItems[index],
        variant_id: variantId || null,
      };

      return {
        ...prev,
        items: newItems,
      };
    });
  }

  function getVariantsForProduct(productId) {
    return productVariants.filter((variant) => variant.product_id === productId);
  }

  function recalculateSubtotalFromItems() {
    setPreviewData((prev) => {
      const subtotal = prev.items.reduce(
        (acc, item) => acc + (Number(item.line_total) || 0),
        0
      );

      return {
        ...prev,
        subtotal,
      };
    });
  }

  function addManualItem() {
    setPreviewData((prev) => ({
      ...prev,
      items: [...(prev.items || []), createEmptyItem()],
    }));
  }

  function removeItem(index) {
    setPreviewData((prev) => {
      const newItems = prev.items.filter((_, i) => i !== index);
      const subtotal = newItems.reduce(
        (acc, item) => acc + (Number(item.line_total) || 0),
        0
      );

      return {
        ...prev,
        items: newItems,
        subtotal,
      };
    });
  }

  async function guardarOrden() {
    if (!file || !previewData) {
      alert("Falta información para guardar la orden");
      return;
    }

    try {
      setLoading(true);

      const fileName = `${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("pdfs")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const pdfUrl = supabase.storage
        .from("pdfs")
        .getPublicUrl(fileName).data.publicUrl;

      const itemsForOrder = previewData.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit_value: item.unit_value,
        line_total: item.line_total,
        linea: item.linea,
        inventory_mode: item.inventory_mode,
        product_id: item.product_id,
        variant_id: item.variant_id,
        specs: item.specs || {},
      }));

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            estado: "Nuevo",
            prioridad: priority,
            pdf_url: pdfUrl,
            total_venta: previewData.subtotal,
            data_json: {
              order_number: previewData.order_number,
              cliente: {
                nombre: previewData.client_name,
                telefono: previewData.phone,
              },
              items: itemsForOrder,
              descripcion_orden: previewData.descripcion_orden,
              operational_summary: previewData.operational_summary,
            },
          },
        ])
        .select()
        .single();

      if (orderError) throw orderError;

      for (const item of previewData.items) {
        const { error: itemError } = await supabase.from("order_items").insert([
          {
            order_id: order.id,
            descripcion: item.description,
            linea: item.linea || null,
            cantidad: item.quantity,
            precio_unitario: item.unit_value,
            subtotal_venta: item.line_total,
            product_id: item.product_id,
            variant_id: item.variant_id,
            specs: item.specs || {},
          },
        ]);

        if (itemError) throw itemError;

        if (
          item.linea === "Sellos" &&
          item.inventory_mode === "catalogo" &&
          item.variant_id &&
          Number(item.quantity) > 0
        ) {
          const { error: stockError } = await supabase.rpc("decrement_variant_stock", {
            p_variant_id: item.variant_id,
            p_quantity: Number(item.quantity),
          });

          if (stockError) throw stockError;
        }
      }

      alert("Orden guardada correctamente");

      setPreviewData(null);
      setFile(null);
      setPriority("media");

      const fileInput = document.getElementById("pdf-upload-input");
      if (fileInput) fileInput.value = "";
    } catch (error) {
      console.error("Error guardando orden:", error);
      alert(`Error guardando la orden: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Nueva orden</h3>
        <p className="mt-1 text-sm text-slate-500">
          Sube el PDF, corrige la extracción y agrega o elimina items si hace falta.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              PDF de la orden
            </label>
            <input
              id="pdf-upload-input"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files[0])}
              className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Prioridad
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-slate-500"
            >
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={handleUpload}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Procesando..." : "Leer PDF"}
          </button>
        </div>

        {file && (
          <p className="mt-3 text-sm text-slate-500">
            Archivo seleccionado:{" "}
            <span className="font-medium">{file.name}</span>
          </p>
        )}
      </div>

      {previewData && (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900">
              Preview editable
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Revisa, corrige, elimina o agrega items antes de guardar.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Número de orden
              </label>
              <input
                value={previewData.order_number || ""}
                onChange={(e) => updateField("order_number", e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                placeholder="PUBLI00108"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Cliente
              </label>
              <input
                value={previewData.client_name || ""}
                onChange={(e) => updateField("client_name", e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                placeholder="Nombre del cliente"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Teléfono
              </label>
              <input
                value={previewData.phone || ""}
                onChange={(e) => updateField("phone", e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                placeholder="+593..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Subtotal
              </label>
              <input
                type="number"
                step="0.01"
                value={previewData.subtotal || 0}
                onChange={(e) =>
                  updateField("subtotal", Number(e.target.value))
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
              />
            </div>
          </div>

          <div className="mt-6">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Descripción de la orden
            </label>
            <textarea
              value={previewData.descripcion_orden || ""}
              onChange={(e) => updateDescripcionOrden(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
              placeholder="Descripción operativa resumida"
            />
          </div>

          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">Items</h4>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addManualItem}
                  className="rounded-xl bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-200"
                >
                  + Agregar item
                </button>

                <button
                  type="button"
                  onClick={recalculateSubtotalFromItems}
                  className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200"
                >
                  Recalcular subtotal
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {previewData.items?.map((item, index) => {
                const variantsForSelectedProduct = item.product_id
                  ? getVariantsForProduct(item.product_id)
                  : [];

                const isSellos = item.linea === "Sellos";
                const isCatalogMode = item.inventory_mode === "catalogo";
                const isOtrosMode = item.inventory_mode === "otros";

                return (
                  <div
                    key={index}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h5 className="text-sm font-semibold text-slate-900">
                        Item #{index + 1}
                      </h5>

                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="rounded-xl bg-red-100 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-200"
                      >
                        Eliminar item
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          Descripción del item
                        </label>
                        <input
                          value={item.description || ""}
                          onChange={(e) =>
                            updateItem(index, "description", e.target.value)
                          }
                          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                          placeholder="Descripción del producto o servicio"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          Cantidad
                        </label>
                        <input
                          type="number"
                          value={item.quantity || 0}
                          onChange={(e) =>
                            updateItem(index, "quantity", e.target.value)
                          }
                          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          Línea
                        </label>
                        <select
                          value={item.linea || ""}
                          onChange={(e) => updateItemLinea(index, e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
                        >
                          {lineasOptions.map((linea) => (
                            <option key={linea} value={linea}>
                              {linea === "" ? "Seleccionar línea" : linea}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          Valor unitario
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_value || 0}
                          onChange={(e) =>
                            updateItem(index, "unit_value", e.target.value)
                          }
                          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          Subtotal del item
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.line_total || 0}
                          onChange={(e) =>
                            updateItem(index, "line_total", e.target.value)
                          }
                          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                        />
                      </div>
                    </div>

                    {isSellos && (
                      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                        <h5 className="text-sm font-semibold text-slate-900">
                          Configuración de Sellos
                        </h5>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">
                              Tipo
                            </label>
                            <select
                              value={item.inventory_mode || "catalogo"}
                              onChange={(e) =>
                                updateSellosMode(index, e.target.value)
                              }
                              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
                            >
                              <option value="catalogo">Catálogo</option>
                              <option value="otros">Otros</option>
                            </select>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">
                              Color de tinta
                            </label>
                            <select
                              value={item.specs?.tinta || ""}
                              onChange={(e) =>
                                updateItemSpecs(index, "tinta", e.target.value)
                              }
                              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
                            >
                              {tintaOptions.map((tinta) => (
                                <option key={tinta} value={tinta}>
                                  {tinta === "" ? "Seleccionar tinta" : tinta}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-2 block text-sm font-medium text-slate-700">
                              UV en carcasa
                            </label>

                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() =>
                                  updateItemSpecs(index, "uv", true)
                                }
                                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                                  item.specs?.uv
                                    ? "bg-slate-900 text-white"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                Sí
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  updateItemSpecs(index, "uv", false)
                                }
                                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                                  item.specs?.uv === false
                                    ? "bg-slate-900 text-white"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                No
                              </button>
                            </div>
                          </div>

                          {isCatalogMode && (
                            <>
                              <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700">
                                  Modelo
                                </label>
                                <select
                                  value={item.product_id || ""}
                                  onChange={(e) =>
                                    updateSellosProduct(index, e.target.value)
                                  }
                                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
                                >
                                  <option value="">Seleccionar modelo</option>
                                  {sellosProducts
                                    .filter((p) => p.nombre !== "Otros")
                                    .map((product) => (
                                      <option key={product.id} value={product.id}>
                                        {product.nombre}
                                      </option>
                                    ))}
                                </select>
                              </div>

                              <div>
                                <label className="mb-2 block text-sm font-medium text-slate-700">
                                  Variante
                                </label>
                                <select
                                  value={item.variant_id || ""}
                                  onChange={(e) =>
                                    updateSellosVariant(index, e.target.value)
                                  }
                                  disabled={!item.product_id}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100"
                                >
                                  <option value="">Seleccionar variante</option>
                                  {variantsForSelectedProduct.map((variant) => (
                                    <option key={variant.id} value={variant.id}>
                                      {variant.nombre}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </>
                          )}

                          {isOtrosMode && (
                            <div className="md:col-span-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                              Este item se marcará como <strong>Otros</strong>,
                              no descontará stock por ahora, pero sí quedará
                              guardado para producción y finanzas.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {(!previewData.items || previewData.items.length === 0) && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400">
                  No hay items. Agrega uno manualmente.
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4 rounded-2xl bg-slate-100 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-slate-500">Subtotal de la orden</p>
              <p className="text-2xl font-bold text-slate-900">
                ${Number(previewData.subtotal || 0).toFixed(2)}
              </p>
            </div>

            <button
              onClick={guardarOrden}
              disabled={loading}
              className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Guardando..." : "Confirmar y guardar orden"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}