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

const UV_DTF_FORMATS = {
  'A3 (42x29.7 cm)': 1,
  'A4 (29.7x21 cm)': 0.5,
  'A5 (21x14.8 cm)': 0.25,
  'A6 (14.8x10.5 cm)': 0.125,
};

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
    catalog_item_id: null,
    specs: {
      tinta: "",
      uv: false,
    },
  };
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getFieldTypeIsNumeric(field) {
  return (
    field === "quantity" ||
    field === "line_total" ||
    field === "unit_value"
  );
}

function getUVEquivalentFromSpecs(specs = {}) {
  const formato = specs.formato || "";
  if (!formato) return 0;
  return UV_DTF_FORMATS[formato] || 0;
}

function buildUvCostData(item, uvCatalogItems, uvResources) {
  if (item.linea !== "UV" || !item.catalog_item_id) {
    return {
      costo_unitario: 0,
      subtotal_costo: 0,
      cost_breakdown: [],
    };
  }

  const selectedCatalogItem = uvCatalogItems.find(
    (catalogItem) => catalogItem.id === item.catalog_item_id
  );

  if (!selectedCatalogItem) {
    return {
      costo_unitario: 0,
      subtotal_costo: 0,
      cost_breakdown: [],
    };
  }

  if (selectedCatalogItem.slug === "uv-textil") {
    const metrosCuadrados = normalizeNumber(item.specs?.metros_cuadrados);
    const textilResource = uvResources.find(
      (resource) => resource.slug === "uv-textil-m2"
    );

    const costoBase = normalizeNumber(textilResource?.costo_unitario);
    const costoUnitario = metrosCuadrados * costoBase;
    const subtotalCosto = costoUnitario * normalizeNumber(item.quantity);

    return {
      costo_unitario: Number(costoUnitario.toFixed(2)),
      subtotal_costo: Number(subtotalCosto.toFixed(2)),
      cost_breakdown: [
        {
          type: "resource",
          resource_slug: "uv-textil-m2",
          resource_name: textilResource?.nombre || "UV Textil m2",
          unit: "m2",
          quantity: metrosCuadrados,
          unit_cost: costoBase,
          total_cost: Number(costoUnitario.toFixed(2)),
        },
      ],
    };
  }

  if (selectedCatalogItem.slug === "uv-dtf") {
    const equivalente =
      normalizeNumber(item.specs?.equivalente) ||
      getUVEquivalentFromSpecs(item.specs);
    const dtfResource = uvResources.find(
      (resource) => resource.slug === "uv-dtf-a3"
    );

    const costoBase = normalizeNumber(dtfResource?.costo_unitario);
    const costoUnitario = equivalente * costoBase;
    const subtotalCosto = costoUnitario * normalizeNumber(item.quantity);

    return {
      costo_unitario: Number(costoUnitario.toFixed(2)),
      subtotal_costo: Number(subtotalCosto.toFixed(2)),
      cost_breakdown: [
        {
          type: "resource",
          resource_slug: "uv-dtf-a3",
          resource_name: dtfResource?.nombre || "UV DTF Plancha A3",
          unit: "plancha",
          quantity: equivalente,
          unit_cost: costoBase,
          total_cost: Number(costoUnitario.toFixed(2)),
          formato: item.specs?.formato || "",
        },
      ],
    };
  }

  return {
    costo_unitario: 0,
    subtotal_costo: 0,
    cost_breakdown: [],
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

  const [uvCatalogItems, setUvCatalogItems] = useState([]);
  const [uvAttributes, setUvAttributes] = useState([]);
  const [uvResources, setUvResources] = useState([]);

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
        { data: catalogItemsData, error: catalogItemsError },
        { data: uvAttributesData, error: uvAttributesError },
        { data: uvResourcesData, error: uvResourcesError },
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
        supabase
          .from("catalog_items")
          .select("*")
          .eq("linea", "UV")
          .eq("is_active", true)
          .order("nombre"),
        supabase
          .from("catalog_item_attributes")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("inventory_resources")
          .select("*")
          .eq("linea", "UV")
          .eq("is_active", true)
          .order("nombre"),
      ]);

      if (productsError) throw productsError;
      if (variantsError) throw variantsError;
      if (catalogItemsError) throw catalogItemsError;
      if (uvAttributesError) throw uvAttributesError;
      if (uvResourcesError) throw uvResourcesError;

      setProducts(productsData || []);
      setProductVariants(variantsData || []);
      setUvCatalogItems(catalogItemsData || []);
      setUvAttributes(uvAttributesData || []);
      setUvResources(uvResourcesData || []);
    } catch (error) {
      console.error("Error cargando catálogo de inventario:", error);
    }
  }

  if (profile?.rol !== "admin") {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
        <h2 className="text-lg font-semibold">Acceso restringido</h2>
        <p className="mt-2 text-sm">Solo el rol admin puede crear órdenes.</p>
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
      catalog_item_id: null,
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
        [field]: getFieldTypeIsNumeric(field) ? Number(value) : value,
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
      const currentItem = newItems[index];
      const nextSpecs = {
        ...(currentItem.specs || {}),
        [specKey]: value,
      };

      if (currentItem.linea === "UV" && specKey === "formato") {
        nextSpecs.equivalente = getUVEquivalentFromSpecs(nextSpecs);
      }

      newItems[index] = {
        ...currentItem,
        specs: nextSpecs,
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

      const baseSpecs =
        value === "Sellos"
          ? {
              tinta: current.specs?.tinta || "",
              uv: current.specs?.uv || false,
            }
          : {};

      newItems[index] = {
        ...current,
        linea: value,
        inventory_mode: value === "Sellos" ? current.inventory_mode || "catalogo" : "catalogo",
        product_id: value === "Sellos" ? current.product_id : null,
        variant_id: value === "Sellos" ? current.variant_id : null,
        catalog_item_id: value === "UV" ? current.catalog_item_id : null,
        specs: baseSpecs,
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

  function updateUvCatalogItem(index, catalogItemId) {
    const selectedItem = uvCatalogItems.find((item) => item.id === catalogItemId);
    const initialSpecs = {};

    if (selectedItem?.slug === "uv-textil") {
      initialSpecs.modo_trabajo = "";
      initialSpecs.articulo = "";
      initialSpecs.metros_cuadrados = 0;
      initialSpecs.cantidad = 0;
    }

    if (selectedItem?.slug === "uv-dtf") {
      initialSpecs.modo_dtf = "";
      initialSpecs.formato = "";
      initialSpecs.equivalente = 0;
      initialSpecs.destino = "";
    }

    setPreviewData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = {
        ...newItems[index],
        catalog_item_id: catalogItemId || null,
        product_id: null,
        variant_id: null,
        specs: initialSpecs,
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

  function getUvAttributesForItem(catalogItemId) {
    return uvAttributes.filter((attribute) => attribute.item_id === catalogItemId);
  }

  function getUvCatalogItemById(catalogItemId) {
    return uvCatalogItems.find((item) => item.id === catalogItemId) || null;
  }

  function renderDynamicAttribute(index, item, attribute) {
    const options = Array.isArray(attribute.options) ? attribute.options : [];
    const value = item.specs?.[attribute.attribute_key];

    if (item.linea === "UV" && attribute.attribute_key === "equivalente") {
      const equivalenteValue =
        normalizeNumber(item.specs?.equivalente) || getUVEquivalentFromSpecs(item.specs);

      return (
        <div key={attribute.id}>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            {attribute.label}
          </label>
          <input
            type="number"
            step="0.001"
            value={equivalenteValue}
            readOnly
            className="w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm outline-none"
          />
        </div>
      );
    }

    if (attribute.field_type === "select") {
      return (
        <div
          key={attribute.id}
          className={attribute.attribute_key === "observacion_tecnica" ? "md:col-span-2" : ""}
        >
          <label className="mb-2 block text-sm font-medium text-slate-700">
            {attribute.label}
          </label>
          <select
            value={value || ""}
            onChange={(e) => updateItemSpecs(index, attribute.attribute_key, e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
          >
            <option value="">
              {attribute.label.startsWith("Modo") ||
              attribute.attribute_key === "formato" ||
              attribute.attribute_key === "material"
                ? `Seleccionar ${attribute.label.toLowerCase()}`
                : "Seleccionar opción"}
            </option>
            {options.map((option) => (
              <option key={`${attribute.id}-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (attribute.field_type === "number") {
      return (
        <div key={attribute.id}>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            {attribute.label}
          </label>
          <input
            type="number"
            step="0.01"
            value={value || 0}
            onChange={(e) =>
              updateItemSpecs(index, attribute.attribute_key, Number(e.target.value))
            }
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
          />
        </div>
      );
    }

    if (attribute.field_type === "boolean") {
      const boolValue = Boolean(value);

      return (
        <div key={attribute.id}>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            {attribute.label}
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => updateItemSpecs(index, attribute.attribute_key, true)}
              className={`rounded-xl px-4 py-2 text-sm font-medium ${
                boolValue ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              Sí
            </button>
            <button
              type="button"
              onClick={() => updateItemSpecs(index, attribute.attribute_key, false)}
              className={`rounded-xl px-4 py-2 text-sm font-medium ${
                value === false ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              No
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={attribute.id}
        className={attribute.attribute_key === "observacion_tecnica" ? "md:col-span-2" : ""}
      >
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {attribute.label}
        </label>
        <input
          value={value || ""}
          onChange={(e) => updateItemSpecs(index, attribute.attribute_key, e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
          placeholder={attribute.label}
        />
      </div>
    );
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

      const pdfUrl = supabase.storage.from("pdfs").getPublicUrl(fileName).data.publicUrl;

      const itemsForOrder = previewData.items.map((item) => {
        const uvCostData =
          item.linea === "UV"
            ? buildUvCostData(item, uvCatalogItems, uvResources)
            : {
                costo_unitario: 0,
                subtotal_costo: 0,
                cost_breakdown: [],
              };

        return {
          description: item.description,
          quantity: item.quantity,
          unit_value: item.unit_value,
          line_total: item.line_total,
          linea: item.linea,
          inventory_mode: item.inventory_mode,
          product_id: item.product_id,
          variant_id: item.variant_id,
          catalog_item_id: item.catalog_item_id,
          specs: item.specs || {},
          costo_unitario: uvCostData.costo_unitario || null,
          subtotal_costo: uvCostData.subtotal_costo || null,
          cost_breakdown: uvCostData.cost_breakdown || [],
        };
      });

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
        const uvCostData =
          item.linea === "UV"
            ? buildUvCostData(item, uvCatalogItems, uvResources)
            : {
                costo_unitario: null,
                subtotal_costo: null,
                cost_breakdown: [],
              };

        const { error: itemError } = await supabase.from("order_items").insert([
          {
            order_id: order.id,
            descripcion: item.description,
            linea: item.linea || null,
            cantidad: item.quantity,
            precio_unitario: item.unit_value,
            subtotal_venta: item.line_total,
            costo_unitario: item.linea === "UV" ? uvCostData.costo_unitario : null,
            subtotal_costo: item.linea === "UV" ? uvCostData.subtotal_costo : null,
            product_id: item.product_id,
            variant_id: item.variant_id,
            catalog_item_id: item.catalog_item_id,
            specs: item.specs || {},
            cost_breakdown: item.linea === "UV" ? uvCostData.cost_breakdown : [],
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
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      <h2 className="text-2xl font-bold text-slate-900">Nueva orden</h2>
      <p className="mt-2 text-sm text-slate-500">
        Sube el PDF, corrige la extracción y agrega o elimina items si hace falta.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            PDF de la orden
          </label>
          <input
            id="pdf-upload-input"
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleUpload}
          disabled={loading}
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Procesando..." : "Leer PDF"}
        </button>

        {file && (
          <p className="text-sm text-slate-500">
            Archivo seleccionado: <span className="font-medium">{file.name}</span>
          </p>
        )}
      </div>

      {previewData && (
        <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Preview editable</h3>
          <p className="mt-2 text-sm text-slate-500">
            Revisa, corrige, elimina o agrega items antes de guardar.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
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
                onChange={(e) => updateField("subtotal", Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div className="md:col-span-2">
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
                const isUV = item.linea === "UV";
                const selectedUvCatalogItem = item.catalog_item_id
                  ? getUvCatalogItemById(item.catalog_item_id)
                  : null;
                const uvAttributesForSelectedItem = item.catalog_item_id
                  ? getUvAttributesForItem(item.catalog_item_id)
                  : [];

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
                          onChange={(e) => updateItem(index, "description", e.target.value)}
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
                          onChange={(e) => updateItem(index, "quantity", e.target.value)}
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
                          onChange={(e) => updateItem(index, "unit_value", e.target.value)}
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
                          onChange={(e) => updateItem(index, "line_total", e.target.value)}
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
                              onChange={(e) => updateSellosMode(index, e.target.value)}
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
                              onChange={(e) => updateItemSpecs(index, "tinta", e.target.value)}
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
                                onClick={() => updateItemSpecs(index, "uv", true)}
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
                                onClick={() => updateItemSpecs(index, "uv", false)}
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
                                  onChange={(e) => updateSellosProduct(index, e.target.value)}
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
                                  onChange={(e) => updateSellosVariant(index, e.target.value)}
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
                              Este item se marcará como <strong>Otros</strong>, no
                              descontará stock por ahora, pero sí quedará guardado para
                              producción y finanzas.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isUV && (
                      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                        <h5 className="text-sm font-semibold text-slate-900">
                          Configuración de UV
                        </h5>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div className="md:col-span-2">
                            <label className="mb-2 block text-sm font-medium text-slate-700">
                              Tipo UV
                            </label>
                            <select
                              value={item.catalog_item_id || ""}
                              onChange={(e) => updateUvCatalogItem(index, e.target.value)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
                            >
                              <option value="">Seleccionar tipo UV</option>
                              {uvCatalogItems.map((catalogItem) => (
                                <option key={catalogItem.id} value={catalogItem.id}>
                                  {catalogItem.nombre}
                                </option>
                              ))}
                            </select>
                          </div>

                          {selectedUvCatalogItem && (
                            <div className="md:col-span-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                              {selectedUvCatalogItem.slug === "uv-textil" && (
                                <span>
                                  UV Textil se calculará internamente por metros cuadrados.
                                </span>
                              )}
                              {selectedUvCatalogItem.slug === "uv-dtf" && (
                                <span>
                                  UV DTF se calculará internamente por formato equivalente de
                                  plancha A3.
                                </span>
                              )}
                            </div>
                          )}

                          {uvAttributesForSelectedItem.map((attribute) =>
                            renderDynamicAttribute(index, item, attribute)
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

          <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={guardarOrden}
              disabled={loading}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar orden"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}