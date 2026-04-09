import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const fmt = v => `$${Number(v || 0).toFixed(2)}`;
const fmtDate = d => new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });

function lineIcon(linea) {
  const icons = { Sellos: "🔖", Sublimación: "🌈", UV: "🔆", Textil: "👕", Plotter: "✂️", Láser: "⚡", Otros: "📦" };
  return icons[linea] || "📦";
}
function lineColor(linea) {
  const colors = { Sellos: "#6366f1", Sublimación: "#ec4899", UV: "#f59e0b", Textil: "#10b981", Plotter: "#0ea5e9", Láser: "#ef4444", Otros: "#94a3b8" };
  return colors[linea] || "#94a3b8";
}
function naturalSort(a, b) {
  return a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity: "base" });
}

export default function Inventory() {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === "admin";

  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [uploadingImageId, setUploadingImageId] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedLine, setSelectedLine] = useState("");
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  useEffect(() => { fetchInventory(); }, []);

  async function fetchInventory() {
    try {
      setLoading(true);
      const [{ data: pd, error: pe }, { data: vd, error: ve }] = await Promise.all([
        supabase.from("products").select("*").eq("is_active", true).order("linea").order("nombre"),
        supabase.from("product_variants").select("*").eq("is_active", true),
      ]);
      if (pe) throw pe;
      if (ve) throw ve;
      setProducts(pd || []);
      setVariants((vd || []).sort(naturalSort));
    } catch (e) { alert("Error cargando inventario"); }
    finally { setLoading(false); }
  }

  async function fetchHistorial(variantId, variantNombre) {
    setSelectedVariant({ id: variantId, nombre: variantNombre });
    setHistorial([]);
    setLoadingHistorial(true);
    try {
      const { data, error } = await supabase
        .from("order_items")
        .select(`id, cantidad, precio_unitario, subtotal_venta, specs, orders ( id, fecha_creacion, pdf_url, estado, prioridad, data_json )`)
        .eq("variant_id", variantId)
        .order("id", { ascending: false });
      if (error) throw error;
      setHistorial(data || []);
    } catch (e) { console.error(e); setHistorial([]); }
    finally { setLoadingHistorial(false); }
  }

  function updateVariantField(variantId, field, value) {
    setVariants(prev => prev.map(v =>
      v.id === variantId ? { ...v, [field]: field === "stock" || field === "costo" ? Number(value) : value } : v
    ));
  }

  async function saveVariant(variant) {
    try {
      setSavingId(variant.id);
      const { error } = await supabase.from("product_variants")
        .update({ stock: Number(variant.stock || 0), costo: Number(variant.costo || 0) })
        .eq("id", variant.id);
      if (error) throw error;
    } catch (e) { alert(`Error: ${e.message}`); }
    finally { setSavingId(null); }
  }

  async function uploadVariantImage(variantId, file) {
    if (!file) return;
    try {
      setUploadingImageId(variantId);
      const fn = `${Date.now()}-${file.name}`;
      const { error: ue } = await supabase.storage.from("designs").upload(fn, file);
      if (ue) throw ue;
      const url = supabase.storage.from("designs").getPublicUrl(fn).data.publicUrl;
      const { error: upd } = await supabase.from("product_variants").update({ image_url: url }).eq("id", variantId);
      if (upd) throw upd;
      setVariants(prev => prev.map(v => v.id === variantId ? { ...v, image_url: url } : v));
    } catch (e) { alert(`Error: ${e.message}`); }
    finally { setUploadingImageId(null); }
  }

  const availableLines = useMemo(() => [...new Set(products.map(p => p.linea).filter(Boolean))].sort(), [products]);

  useEffect(() => {
    if (availableLines.length > 0 && !selectedLine) setSelectedLine(availableLines[0]);
  }, [availableLines]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products
      .filter(p => {
        if (selectedLine && p.linea !== selectedLine) return false;
        const pvs = variants.filter(v => v.product_id === p.id);
        return !term || p.nombre.toLowerCase().includes(term) || pvs.some(v => v.nombre.toLowerCase().includes(term));
      })
      .sort(naturalSort);
  }, [products, variants, search, selectedLine]);

  const lineStats = useMemo(() => {
    const lp = products.filter(p => p.linea === selectedLine);
    const lv = variants.filter(v => lp.some(p => p.id === v.product_id));
    return { productos: lp.length, variantes: lv.length, totalStock: lv.reduce((a, v) => a + Number(v.stock || 0), 0), stockBajo: lv.filter(v => Number(v.stock) <= 3).length };
  }, [products, variants, selectedLine]);

  if (!isAdmin) return (
    <div style={S.restricted}>
      <span style={{ fontSize: "48px" }}>🔒</span>
      <h3 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Acceso restringido</h3>
      <p style={{ color: "#94a3b8", margin: 0 }}>Solo el rol admin puede gestionar inventario.</p>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.hero}>
        <div>
          <div style={S.heroLabel}>GESTIÓN DE STOCK</div>
          <h2 style={S.heroTitle}>Inventario</h2>
          <p style={S.heroSub}>Stock, costos e historial de órdenes por variante</p>
        </div>
        {selectedLine && (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <StatPill label="Productos"   value={lineStats.productos}  color="#6366f1" />
            <StatPill label="Variantes"   value={lineStats.variantes}  color="#0ea5e9" />
            <StatPill label="Stock total" value={lineStats.totalStock} color="#10b981" />
            {lineStats.stockBajo > 0 && <StatPill label="Stock bajo" value={lineStats.stockBajo} color="#ef4444" />}
          </div>
        )}
      </div>

      <div style={S.filterBar}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {availableLines.map(line => (
            <button key={line} onClick={() => { setSelectedLine(line); setExpandedProduct(null); }}
              style={{ ...S.lineTab, ...(selectedLine === line ? { background: lineColor(line), color: "white", borderColor: lineColor(line) } : {}) }}>
              {lineIcon(line)} {line}
            </button>
          ))}
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <span style={{ position: "absolute", left: "12px", fontSize: "18px", color: "#94a3b8", pointerEvents: "none" }}>⌕</span>
          <input type="text" placeholder="Buscar modelo o variante..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: "38px", paddingRight: "14px", paddingTop: "10px", paddingBottom: "10px", borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "13px", outline: "none", fontFamily: "inherit", width: "240px" }} />
        </div>
      </div>

      {loading ? (
        <div style={S.loadingWrap}><div style={S.spinner} /><p style={{ color: "#94a3b8", margin: 0 }}>Cargando...</p></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filteredProducts.map(product => {
            const pvs = variants.filter(v => v.product_id === product.id).sort(naturalSort);
            const isExpanded = expandedProduct === product.id;
            const stockTotal = pvs.reduce((acc, v) => acc + Number(v.stock || 0), 0);
            const hasLowStock = pvs.some(v => Number(v.stock) <= 3);
            const lColor = lineColor(product.linea);

            return (
              <div key={product.id} style={S.productCard}>
                <button style={S.productHeader} onClick={() => setExpandedProduct(isExpanded ? null : product.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "40px", fontSize: "12px", fontWeight: 700, background: lColor + "18", color: lColor, whiteSpace: "nowrap" }}>
                      {lineIcon(product.linea)} {product.linea}
                    </div>
                    <div>
                      <p style={S.productName}>{product.nombre}</p>
                      <p style={{ fontSize: "12px", color: "#94a3b8", margin: "2px 0 0", textAlign: "left" }}>{pvs.length} variante{pvs.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {hasLowStock && <span style={{ fontSize: "11px", fontWeight: 600, color: "#dc2626", background: "#fef2f2", padding: "4px 10px", borderRadius: "40px", border: "1px solid #fecaca" }}>⚠ Stock bajo</span>}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "6px 14px" }}>
                      <span style={{ fontSize: "18px", fontWeight: 800, color: "#1e293b", lineHeight: 1 }}>{stockTotal}</span>
                      <span style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>en stock</span>
                    </div>
                    <span style={{ fontSize: "18px", color: "#cbd5e1", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "none" }}>▾</span>
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ borderTop: "1px solid #f1f5f9", padding: "14px 20px", display: "flex", flexDirection: "column", gap: "10px", background: "#fafbfc" }}>
                    {pvs.length === 0 ? (
                      <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "13px", padding: "20px" }}>Sin variantes registradas</div>
                    ) : pvs.map(variant => (
                      <div key={variant.id} style={{ display: "flex", alignItems: "center", gap: "14px", background: "white", borderRadius: "14px", padding: "12px 16px", border: "1px solid #e2e8f0" }}>
                        <div style={{ position: "relative", flexShrink: 0 }}>
                          {variant.image_url
                            ? <img src={variant.image_url} alt={variant.nombre} style={{ width: "52px", height: "52px", borderRadius: "12px", objectFit: "cover", border: "1px solid #e2e8f0" }} />
                            : <div style={{ width: "52px", height: "52px", borderRadius: "12px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", border: "1px solid #e2e8f0" }}>📦</div>
                          }
                          <label style={{ position: "absolute", bottom: "-4px", right: "-4px", background: "#1e293b", color: "white", borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", cursor: "pointer" }}>
                            📷<input type="file" accept="image/*" style={{ display: "none" }} onChange={e => uploadVariantImage(variant.id, e.target.files?.[0])} />
                          </label>
                          {uploadingImageId === variant.id && (
                            <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.8)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "#6366f1" }}>...</div>
                          )}
                        </div>

                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>{variant.nombre}</p>
                          <div style={{ display: "flex", gap: "10px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <label style={{ fontSize: "9px", fontWeight: 800, color: "#94a3b8", letterSpacing: "1px" }}>STOCK</label>
                              <input type="number" value={variant.stock} onChange={e => updateVariantField(variant.id, "stock", e.target.value)}
                                style={{ width: "100px", padding: "7px 10px", borderRadius: "10px", border: `1.5px solid ${Number(variant.stock) <= 3 ? "#f87171" : "#e2e8f0"}`, fontSize: "14px", fontWeight: 700, outline: "none", fontFamily: "inherit", color: Number(variant.stock) <= 3 ? "#dc2626" : "#1e293b" }} />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <label style={{ fontSize: "9px", fontWeight: 800, color: "#94a3b8", letterSpacing: "1px" }}>COSTO ($)</label>
                              <input type="number" step="0.01" value={variant.costo} onChange={e => updateVariantField(variant.id, "costo", e.target.value)}
                                style={{ width: "100px", padding: "7px 10px", borderRadius: "10px", border: "1.5px solid #e2e8f0", fontSize: "14px", fontWeight: 700, outline: "none", fontFamily: "inherit" }} />
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
                          <button onClick={() => saveVariant(variant)} disabled={savingId === variant.id}
                            style={{ padding: "8px 16px", borderRadius: "10px", background: "#0f172a", color: "white", border: "none", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: savingId === variant.id ? 0.6 : 1 }}>
                            {savingId === variant.id ? "..." : "💾 Guardar"}
                          </button>
                          <button onClick={() => fetchHistorial(variant.id, variant.nombre)}
                            style={{ padding: "8px 16px", borderRadius: "10px", background: "#f0f9ff", color: "#0284c7", border: "1px solid #bae6fd", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            📋 Historial
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {filteredProducts.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px", gap: "12px" }}>
              <span style={{ fontSize: "48px" }}>📭</span>
              <p style={{ color: "#94a3b8", margin: 0 }}>No se encontraron productos</p>
            </div>
          )}
        </div>
      )}

      {/* Modal historial */}
      {selectedVariant && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "flex-end", backdropFilter: "blur(2px)" }}
          onClick={() => setSelectedVariant(null)}>
          <div style={{ width: "100%", maxWidth: "560px", height: "100vh", background: "white", overflowY: "auto", display: "flex", flexDirection: "column" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "24px", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, background: "white", zIndex: 1 }}>
              <div>
                <p style={{ fontSize: "18px", fontWeight: 800, color: "#1e293b", margin: 0 }}>📋 Historial de órdenes</p>
                <p style={{ fontSize: "13px", color: "#94a3b8", margin: "4px 0 0" }}>{selectedVariant.nombre}</p>
              </div>
              <button onClick={() => setSelectedVariant(null)}
                style={{ padding: "8px 14px", borderRadius: "10px", background: "#f1f5f9", border: "none", fontSize: "16px", cursor: "pointer", fontFamily: "inherit", color: "#64748b" }}>✕</button>
            </div>

            {loadingHistorial ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}><div style={S.spinner} /></div>
            ) : historial.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px", gap: "12px" }}>
                <span style={{ fontSize: "40px" }}>📭</span>
                <p style={{ color: "#94a3b8", margin: 0 }}>Sin órdenes para esta variante</p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0" }}>
                  {[
                    { label: "unidades total", value: historial.reduce((a, h) => a + Number(h.cantidad || 0), 0), color: "#6366f1" },
                    { label: "venta total", value: fmt(historial.reduce((a, h) => a + Number(h.subtotal_venta || 0), 0)), color: "#10b981" },
                    { label: "órdenes", value: historial.length, color: "#0ea5e9" },
                  ].map((s, i) => (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "16px", borderRight: i < 2 ? "1px solid #e2e8f0" : "none", gap: "4px" }}>
                      <span style={{ fontSize: "22px", fontWeight: 800, color: s.color }}>{s.value}</span>
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>{s.label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", padding: "0 16px 16px" }}>
                  {historial.map((h, i) => {
                    const order = h.orders || {};
                    const num = order.data_json?.order_number || "—";
                    const cliente = order.data_json?.cliente?.nombre || "—";
                    const fecha = order.fecha_creacion ? fmtDate(order.fecha_creacion) : "—";
                    const specs = h.specs || {};
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", padding: "16px 0", borderBottom: "1px solid #f1f5f9" }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: "14px", fontWeight: 800, color: "#1e293b", margin: "0 0 2px" }}>#{num}</p>
                          <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 4px" }}>{cliente}</p>
                          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 6px" }}>📅 {fecha}</p>
                          {Object.keys(specs).length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                              {Object.entries(specs).filter(([, v]) => v !== null && v !== "" && v !== false).map(([k, v]) => (
                                <span key={k} style={{ fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "6px", background: "#f1f5f9", color: "#64748b" }}>{k}: {String(v)}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px", flexShrink: 0 }}>
                          <div style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}>
                            <div style={{ textAlign: "center" }}>
                              <span style={{ fontSize: "18px", fontWeight: 800, color: "#1e293b", display: "block" }}>{h.cantidad}</span>
                              <span style={{ fontSize: "10px", color: "#94a3b8" }}>unidades</span>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <span style={{ fontSize: "16px", fontWeight: 700, color: "#10b981", display: "block" }}>{fmt(h.subtotal_venta)}</span>
                              <span style={{ fontSize: "10px", color: "#94a3b8" }}>venta</span>
                            </div>
                          </div>
                          {order.pdf_url && (
                            <a href={order.pdf_url} target="_blank" rel="noreferrer"
                              style={{ padding: "6px 14px", borderRadius: "10px", background: "#0f172a", color: "white", fontSize: "12px", fontWeight: 700, textDecoration: "none" }}>
                              📄 Ver PDF
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${color}33`, borderRadius: "14px", padding: "10px 16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ fontSize: "22px", fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: "10px", color: "#94a3b8", marginTop: "3px" }}>{label}</span>
    </div>
  );
}

const S = {
  page:        { display: "flex", flexDirection: "column", gap: "20px", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#1e293b" },
  restricted:  { display: "flex", flexDirection: "column", alignItems: "center", padding: "80px", gap: "12px", background: "white", borderRadius: "20px", border: "1px solid #e2e8f0" },
  hero:        { background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)", borderRadius: "20px", padding: "28px 32px", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" },
  heroLabel:   { fontSize: "10px", fontWeight: 700, letterSpacing: "3px", color: "#94a3b8", marginBottom: "6px" },
  heroTitle:   { fontSize: "32px", fontWeight: 800, margin: 0, letterSpacing: "-1px" },
  heroSub:     { fontSize: "13px", color: "#94a3b8", marginTop: "6px" },
  filterBar:   { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" },
  lineTab:     { display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "40px", border: "1px solid #e2e8f0", background: "white", fontSize: "13px", fontWeight: 600, color: "#64748b", cursor: "pointer", fontFamily: "inherit" },
  loadingWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px", gap: "16px" },
  spinner:     { width: "28px", height: "28px", border: "3px solid #e2e8f0", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  productCard: { background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden" },
  productHeader:{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", cursor: "pointer", background: "transparent", border: "none", fontFamily: "inherit", gap: "14px" },
  productName: { fontSize: "15px", fontWeight: 700, color: "#1e293b", margin: 0, textAlign: "left" },
};
