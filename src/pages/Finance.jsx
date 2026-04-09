import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = {
  venta: "#3B82F6",
  costo: "#F59E0B",
  margen: "#10B981",
  cantidad: "#8B5CF6",
  line1: "#3B82F6",
  line2: "#10B981",
  line3: "#F59E0B",
  line4: "#8B5CF6",
  line5: "#EF4444",
  line6: "#14B8A6",
};

const PIE_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#14B8A6"];

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDateInput(date) {
  return date.toISOString().split("T")[0];
}

function getDefaultRanges() {
  const today = new Date();

  const currentEnd = new Date(today);
  const currentStart = new Date(today);
  currentStart.setDate(currentStart.getDate() - 29);

  const previousEnd = new Date(currentStart);
  previousEnd.setDate(previousEnd.getDate() - 1);

  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - 29);

  return {
    currentStart: formatDateInput(currentStart),
    currentEnd: formatDateInput(currentEnd),
    previousStart: formatDateInput(previousStart),
    previousEnd: formatDateInput(previousEnd),
  };
}

function calcDiffPercent(current, previous) {
  const c = Number(current || 0);
  const p = Number(previous || 0);

  if (p === 0 && c === 0) return "0.0%";
  if (p === 0) return "+100.0%";

  const diff = ((c - p) / p) * 100;
  return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
}

function MetricCard({ title, currentValue, previousValue, subtitle }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
        {currentValue}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-slate-400">{subtitle}</p>
        <div className="text-right">
          <p className="text-[11px] text-slate-400">Periodo anterior</p>
          <p className="text-sm font-semibold text-slate-700">{previousValue}</p>
        </div>
      </div>
    </div>
  );
}

function ComparisonBadge({ current, previous, currency = false }) {
  const diff = calcDiffPercent(current, previous);
  const positive = diff.startsWith("+") || diff === "0.0%";

  return (
    <div
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        positive
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {currency ? `${diff}` : diff}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-2xl bg-white p-3 shadow-lg ring-1 ring-slate-200">
      <p className="mb-2 text-sm font-semibold text-slate-900">{label}</p>
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-slate-500">{entry.name}</span>
            <span className="font-semibold text-slate-900">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopVisualCard({
  rank,
  item,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
}) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="relative h-40 bg-slate-100">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.nombre}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Sin imagen
          </div>
        )}

        <div className="absolute left-3 top-3 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow">
          Top {rank}
        </div>
      </div>

      <div className="p-4">
        <p className="line-clamp-2 text-sm font-semibold text-slate-900">
          {item.nombre}
        </p>
        <p className="mt-1 text-xs text-slate-500">{item.linea}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              {primaryLabel}
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {primaryValue}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              {secondaryLabel}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {secondaryValue}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              Venta
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {formatCurrency(item.venta)}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              Costo
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {formatCurrency(item.costo)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function aggregateRows(rows) {
  const ventaTotal = rows.reduce((acc, row) => acc + Number(row.subtotal_venta || 0), 0);
  const costoTotal = rows.reduce((acc, row) => acc + Number(row.subtotal_costo || 0), 0);
  const margenTotal = rows.reduce((acc, row) => acc + Number(row.margen || 0), 0);
  const cantidadTotal = rows.reduce((acc, row) => acc + Number(row.cantidad || 0), 0);

  return {
    ventaTotal,
    costoTotal,
    margenTotal,
    cantidadTotal,
  };
}

function buildTopData(rows) {
  const grouped = {};

  for (const row of rows) {
    const key = row.variant_id || row.descripcion || row.order_item_id;

    if (!grouped[key]) {
      grouped[key] = {
        nombre: row.variant_name || row.descripcion || "Sin nombre",
        linea: row.linea || "Sin línea",
        image_url: row.image_url || null,
        margen: 0,
        cantidad: 0,
        venta: 0,
        costo: 0,
      };
    }

    grouped[key].margen += Number(row.margen || 0);
    grouped[key].cantidad += Number(row.cantidad || 0);
    grouped[key].venta += Number(row.subtotal_venta || 0);
    grouped[key].costo += Number(row.subtotal_costo || 0);

    if (!grouped[key].image_url && row.image_url) {
      grouped[key].image_url = row.image_url;
    }
  }

  return Object.values(grouped);
}

export default function Finance() {
  const { profile } = useAuth();
  const isAdmin = profile?.rol === "admin";

  const defaultRanges = getDefaultRanges();

  const [rowsCurrent, setRowsCurrent] = useState([]);
  const [rowsPrevious, setRowsPrevious] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentStartDate, setCurrentStartDate] = useState(defaultRanges.currentStart);
  const [currentEndDate, setCurrentEndDate] = useState(defaultRanges.currentEnd);
  const [previousStartDate, setPreviousStartDate] = useState(defaultRanges.previousStart);
  const [previousEndDate, setPreviousEndDate] = useState(defaultRanges.previousEnd);
  const [selectedLine, setSelectedLine] = useState("Todas");

  useEffect(() => {
    fetchFinanceData();
  }, [currentStartDate, currentEndDate, previousStartDate, previousEndDate]);

  async function fetchFinanceData() {
    try {
      setLoading(true);

      const currentStart = `${currentStartDate}T00:00:00`;
      const currentEnd = `${currentEndDate}T23:59:59`;
      const previousStart = `${previousStartDate}T00:00:00`;
      const previousEnd = `${previousEndDate}T23:59:59`;

      const [
        { data: currentData, error: currentError },
        { data: previousData, error: previousError },
      ] = await Promise.all([
        supabase
          .from("financial_order_items")
          .select("*")
          .gte("fecha_creacion", currentStart)
          .lte("fecha_creacion", currentEnd),
        supabase
          .from("financial_order_items")
          .select("*")
          .gte("fecha_creacion", previousStart)
          .lte("fecha_creacion", previousEnd),
      ]);

      if (currentError) throw currentError;
      if (previousError) throw previousError;

      setRowsCurrent(currentData || []);
      setRowsPrevious(previousData || []);
    } catch (error) {
      console.error("Error cargando finanzas:", error);
      alert("Error cargando finanzas");
    } finally {
      setLoading(false);
    }
  }

  const availableLines = useMemo(() => {
    const lines = [
      ...new Set(
        [...rowsCurrent, ...rowsPrevious].map((row) => row.linea).filter(Boolean)
      ),
    ].sort();

    return ["Todas", ...lines];
  }, [rowsCurrent, rowsPrevious]);

  const filteredCurrent = useMemo(() => {
    if (selectedLine === "Todas") return rowsCurrent;
    return rowsCurrent.filter((row) => row.linea === selectedLine);
  }, [rowsCurrent, selectedLine]);

  const filteredPrevious = useMemo(() => {
    if (selectedLine === "Todas") return rowsPrevious;
    return rowsPrevious.filter((row) => row.linea === selectedLine);
  }, [rowsPrevious, selectedLine]);

  const currentMetrics = useMemo(() => aggregateRows(filteredCurrent), [filteredCurrent]);
  const previousMetrics = useMemo(() => aggregateRows(filteredPrevious), [filteredPrevious]);

  const summaryByLine = useMemo(() => {
    const grouped = {};

    for (const row of filteredCurrent) {
      const linea = row.linea || "Sin línea";

      if (!grouped[linea]) {
        grouped[linea] = {
          linea,
          venta: 0,
          costo: 0,
          margen: 0,
          cantidad: 0,
        };
      }

      grouped[linea].venta += Number(row.subtotal_venta || 0);
      grouped[linea].costo += Number(row.subtotal_costo || 0);
      grouped[linea].margen += Number(row.margen || 0);
      grouped[linea].cantidad += Number(row.cantidad || 0);
    }

    return Object.values(grouped).sort((a, b) => b.margen - a.margen);
  }, [filteredCurrent]);

  const groupedTopData = useMemo(() => buildTopData(filteredCurrent), [filteredCurrent]);

  const topByMargin = useMemo(() => {
    return [...groupedTopData].sort((a, b) => b.margen - a.margen).slice(0, 3);
  }, [groupedTopData]);

  const topByQuantity = useMemo(() => {
    return [...groupedTopData].sort((a, b) => b.cantidad - a.cantidad).slice(0, 3);
  }, [groupedTopData]);

  const chartByLine = useMemo(() => {
    return summaryByLine.map((item) => ({
      linea: item.linea,
      Venta: Number(item.venta.toFixed(2)),
      Costo: Number(item.costo.toFixed(2)),
      Margen: Number(item.margen.toFixed(2)),
      Cantidad: item.cantidad,
    }));
  }, [summaryByLine]);

  const topMarginChart = useMemo(() => {
    return topByMargin.map((item) => ({
      nombre: item.nombre,
      Margen: Number(item.margen.toFixed(2)),
      Venta: Number(item.venta.toFixed(2)),
      Costo: Number(item.costo.toFixed(2)),
    }));
  }, [topByMargin]);

  const topQuantityChart = useMemo(() => {
    return topByQuantity.map((item) => ({
      nombre: item.nombre,
      Cantidad: item.cantidad,
      Margen: Number(item.margen.toFixed(2)),
    }));
  }, [topByQuantity]);

  const pieLineData = useMemo(() => {
    return summaryByLine.map((item) => ({
      name: item.linea,
      value: Number(item.margen.toFixed(2)),
    }));
  }, [summaryByLine]);

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <h3 className="text-xl font-semibold text-slate-800">
          Acceso restringido
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Solo el rol admin puede ver finanzas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="text-2xl font-semibold text-slate-900">Finanzas</h3>
            <p className="mt-1 text-sm text-slate-500">
              Análisis financiero de producción por línea, costo, margen y rendimiento.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <h4 className="text-sm font-semibold text-slate-900">Periodo actual</h4>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={currentStartDate}
                    onChange={(e) => setCurrentStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={currentEndDate}
                    onChange={(e) => setCurrentEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <h4 className="text-sm font-semibold text-slate-900">Periodo comparativo</h4>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={previousStartDate}
                    onChange={(e) => setPreviousStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={previousEndDate}
                    onChange={(e) => setPreviousEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-xs">
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
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white p-8 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          Cargando datos financieros...
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <MetricCard
                title="Venta total"
                currentValue={formatCurrency(currentMetrics.ventaTotal)}
                previousValue={formatCurrency(previousMetrics.ventaTotal)}
                subtitle="Periodo actual vs comparativo"
              />
              <div className="mt-2">
                <ComparisonBadge
                  current={currentMetrics.ventaTotal}
                  previous={previousMetrics.ventaTotal}
                  currency
                />
              </div>
            </div>

            <div>
              <MetricCard
                title="Costo total"
                currentValue={formatCurrency(currentMetrics.costoTotal)}
                previousValue={formatCurrency(previousMetrics.costoTotal)}
                subtitle="Costo acumulado"
              />
              <div className="mt-2">
                <ComparisonBadge
                  current={currentMetrics.costoTotal}
                  previous={previousMetrics.costoTotal}
                  currency
                />
              </div>
            </div>

            <div>
              <MetricCard
                title="Margen total"
                currentValue={formatCurrency(currentMetrics.margenTotal)}
                previousValue={formatCurrency(previousMetrics.margenTotal)}
                subtitle="Rentabilidad"
              />
              <div className="mt-2">
                <ComparisonBadge
                  current={currentMetrics.margenTotal}
                  previous={previousMetrics.margenTotal}
                  currency
                />
              </div>
            </div>

            <div>
              <MetricCard
                title="Cantidad total"
                currentValue={currentMetrics.cantidadTotal}
                previousValue={previousMetrics.cantidadTotal}
                subtitle="Volumen vendido"
              />
              <div className="mt-2">
                <ComparisonBadge
                  current={currentMetrics.cantidadTotal}
                  previous={previousMetrics.cantidadTotal}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-4">
                <h4 className="text-lg font-semibold text-slate-900">
                  Resumen por línea
                </h4>
                <p className="text-sm text-slate-500">
                  Venta, costo y margen por línea.
                </p>
              </div>

              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartByLine}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="linea" tick={{ fill: "#475569", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#475569", fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="Venta" fill={COLORS.venta} radius={[8, 8, 0, 0]} />
                    <Bar dataKey="Costo" fill={COLORS.costo} radius={[8, 8, 0, 0]} />
                    <Bar dataKey="Margen" fill={COLORS.margen} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-4">
                <h4 className="text-lg font-semibold text-slate-900">
                  Distribución del margen por línea
                </h4>
                <p className="text-sm text-slate-500">
                  Qué líneas aportan más rentabilidad.
                </p>
              </div>

              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieLineData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={120}
                      innerRadius={70}
                      paddingAngle={3}
                    >
                      {pieLineData.map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-5">
                <h4 className="text-lg font-semibold text-slate-900">
                  Top 3 por margen
                </h4>
                <p className="text-sm text-slate-500">
                  Los productos o servicios más rentables del periodo.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {topByMargin.length > 0 ? (
                  topByMargin.map((item, index) => (
                    <TopVisualCard
                      key={`${item.nombre}-margen-${index}`}
                      rank={index + 1}
                      item={item}
                      primaryLabel="Margen"
                      primaryValue={formatCurrency(item.margen)}
                      secondaryLabel="Cantidad"
                      secondaryValue={item.cantidad}
                    />
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Sin datos</p>
                )}
              </div>

              <div className="mt-6 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topMarginChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="nombre" tick={{ fill: "#475569", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#475569", fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="Margen" fill={COLORS.margen} radius={[8, 8, 0, 0]} />
                    <Bar dataKey="Venta" fill={COLORS.venta} radius={[8, 8, 0, 0]} />
                    <Bar dataKey="Costo" fill={COLORS.costo} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="mb-5">
                <h4 className="text-lg font-semibold text-slate-900">
                  Top 3 por cantidad
                </h4>
                <p className="text-sm text-slate-500">
                  Los productos o servicios con mayor volumen.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {topByQuantity.length > 0 ? (
                  topByQuantity.map((item, index) => (
                    <TopVisualCard
                      key={`${item.nombre}-cantidad-${index}`}
                      rank={index + 1}
                      item={item}
                      primaryLabel="Cantidad"
                      primaryValue={item.cantidad}
                      secondaryLabel="Margen"
                      secondaryValue={formatCurrency(item.margen)}
                    />
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Sin datos</p>
                )}
              </div>

              <div className="mt-6 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topQuantityChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="nombre" tick={{ fill: "#475569", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#475569", fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="Cantidad" fill={COLORS.cantidad} radius={[8, 8, 0, 0]} />
                    <Bar dataKey="Margen" fill={COLORS.margen} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}