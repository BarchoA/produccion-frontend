import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

export default function Inventory() {
  const { profile } = useAuth();

  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [uploadingImageId, setUploadingImageId] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedLine, setSelectedLine] = useState("Sellos");

  const isAdmin = profile?.rol === "admin";

  useEffect(() => {
    fetchInventory();
  }, []);

  async function fetchInventory() {
    try {
      setLoading(true);

      const [{ data: productsData, error: productsError }, { data: variantsData, error: variantsError }] =
        await Promise.all([
          supabase
            .from("products")
            .select("*")
            .eq("is_active", true)
            .order("linea")
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
      setVariants(variantsData || []);
    } catch (error) {
      console.error("Error cargando inventario:", error);
      alert("Error cargando inventario");
    } finally {
      setLoading(false);
    }
  }

  const availableLines = useMemo(() => {
    const lines = [...new Set(products.map((p) => p.linea).filter(Boolean))];
    return lines.sort();
  }, [products]);

  function updateVariantField(variantId, field, value) {
    setVariants((prev) =>
      prev.map((variant) =>
        variant.id === variantId
          ? {
              ...variant,
              [field]:
                field === "stock" || field === "costo"
                  ? Number(value)
                  : value,
            }
          : variant
      )
    );
  }

  async function saveVariant(variant) {
    try {
      setSavingId(variant.id);

      const { error } = await supabase
        .from("product_variants")
        .update({
          stock: Number(variant.stock || 0),
          costo: Number(variant.costo || 0),
        })
        .eq("id", variant.id);

      if (error) throw error;
    } catch (error) {
      console.error("Error guardando variante:", error);
      alert(`Error guardando variante: ${error.message}`);
    } finally {
      setSavingId(null);
    }
  }

  async function uploadVariantImage(variantId, file) {
    if (!file) return;

    try {
      setUploadingImageId(variantId);

      const fileName = `${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("designs")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const imageUrl = supabase.storage
        .from("designs")
        .getPublicUrl(fileName).data.publicUrl;

      const { error: updateError } = await supabase
        .from("product_variants")
        .update({ image_url: imageUrl })
        .eq("id", variantId);

      if (updateError) throw updateError;

      setVariants((prev) =>
        prev.map((variant) =>
          variant.id === variantId
            ? { ...variant, image_url: imageUrl }
            : variant
        )
      );
    } catch (error) {
      console.error("Error subiendo imagen:", error);
      alert(`Error subiendo imagen: ${error.message}`);
    } finally {
      setUploadingImageId(null);
    }
  }

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      if (selectedLine && product.linea !== selectedLine) return false;

      const productVariants = variants.filter((v) => v.product_id === product.id);

      const productMatch = product.nombre.toLowerCase().includes(term);
      const variantMatch = productVariants.some((v) =>
        v.nombre.toLowerCase().includes(term)
      );

      return !term || productMatch || variantMatch;
    });
  }, [products, variants, search, selectedLine]);

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <h3 className="text-xl font-semibold text-slate-800">
          Acceso restringido
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Solo el rol admin puede gestionar inventario.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Inventario</h3>
            <p className="mt-1 text-sm text-slate-500">
              Gestiona stock, costo e imagen por variante.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:w-[520px]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Línea
              </label>
              <select
                value={selectedLine}
                onChange={(e) => setSelectedLine(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
              >
                {availableLines.map((line) => (
                  <option key={line} value={line}>
                    {line}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Buscar
              </label>
              <input
                type="text"
                placeholder="Modelo o variante..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white p-8 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          Cargando inventario...
        </div>
      ) : (
        <div className="space-y-5">
          {filteredProducts.map((product) => {
            const productVariants = variants.filter((v) => v.product_id === product.id);

            return (
              <div
                key={product.id}
                className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-900">
                      {product.nombre}
                    </h4>
                    <p className="text-sm text-slate-500">{product.linea}</p>
                  </div>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {productVariants.length} variante(s)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-2">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">
                          Variante
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">
                          Imagen
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">
                          Stock
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">
                          Costo
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">
                          Acción
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {productVariants.map((variant) => (
                        <tr key={variant.id} className="bg-slate-50 align-top">
                          <td className="rounded-l-2xl px-3 py-3 text-sm font-medium text-slate-800">
                            {variant.nombre}
                          </td>

                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              {variant.image_url ? (
                                <img
                                  src={variant.image_url}
                                  alt={variant.nombre}
                                  className="h-12 w-12 rounded-xl object-cover ring-1 ring-slate-200"
                                />
                              ) : (
                                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[10px] text-slate-400 ring-1 ring-slate-200">
                                  Sin imagen
                                </div>
                              )}

                              <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-slate-100 p-2 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">
                                <span className="text-xs">🖼️</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) =>
                                    uploadVariantImage(variant.id, e.target.files?.[0])
                                  }
                                  className="hidden"
                                />
                              </label>

                              {uploadingImageId === variant.id && (
                                <span className="text-[11px] text-slate-500">
                                  Subiendo...
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-3">
                            <input
                              type="number"
                              value={variant.stock}
                              onChange={(e) =>
                                updateVariantField(variant.id, "stock", e.target.value)
                              }
                              className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                            />
                          </td>

                          <td className="px-3 py-3">
                            <input
                              type="number"
                              step="0.01"
                              value={variant.costo}
                              onChange={(e) =>
                                updateVariantField(variant.id, "costo", e.target.value)
                              }
                              className="w-32 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
                            />
                          </td>

                          <td className="rounded-r-2xl px-3 py-3">
                            <button
                              onClick={() => saveVariant(variant)}
                              disabled={savingId === variant.id}
                              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                            >
                              {savingId === variant.id ? "Guardando..." : "Guardar"}
                            </button>
                          </td>
                        </tr>
                      ))}

                      {productVariants.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-400"
                          >
                            Sin variantes
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
              No se encontraron productos en esta línea.
            </div>
          )}
        </div>
      )}
    </div>
  );
}