// Gráficos (Chart.js) e mini-gráficos (SVG) em tons de cinza.
import { fmtDay } from "./util.js?v=4";

export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const registry = new Map();
const cleanups = [];

export function onCleanup(fn) { cleanups.push(fn); }

export function destroyCharts() {
  registry.forEach((c) => c.destroy());
  registry.clear();
  while (cleanups.length) cleanups.pop()();
}

export function mount(id, config) {
  registry.get(id)?.destroy();
  const el = document.getElementById(id);
  if (!el) return null;
  const chart = new Chart(el, config);
  registry.set(id, chart);
  return chart;
}

export function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" ? deepMerge(a[k], v) : v;
  }
  return out;
}

// Faixa suave atrás do dia selecionado.
const selectedBand = {
  id: "selectedBand",
  beforeDatasetsDraw(chart, _args, opts) {
    if (opts?.index == null) return;
    const { ctx, chartArea, scales: { x } } = chart;
    const n = chart.data.labels.length;
    const step = n > 1 ? x.getPixelForValue(1) - x.getPixelForValue(0) : chartArea.width;
    const cx = x.getPixelForValue(opts.index);
    ctx.save();
    ctx.fillStyle = "rgba(42,173,187,0.18)";
    ctx.fillRect(cx - step / 2, chartArea.top, step, chartArea.bottom - chartArea.top);
    ctx.restore();
  },
};

// Linha vertical que acompanha o ponteiro nos gráficos de linha.
const crosshair = {
  id: "crosshair",
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.enabled) return;
    const tip = chart.tooltip;
    if (!tip || !tip.opacity || !tip.dataPoints?.length) return;
    const { ctx, chartArea } = chart;
    const x = tip.dataPoints[0].element.x;
    ctx.save();
    ctx.strokeStyle = "rgba(235,235,245,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

export function setupCharts() {
  Chart.register(selectedBand, crosshair);
  Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = css("--muted");
}

export function baseOptions(extra = {}) {
  const muted = css("--muted"), line = css("--line");
  return deepMerge({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#2c2c2e", titleColor: css("--ink"), bodyColor: css("--muted"),
        borderColor: "rgba(84,84,88,0.6)", borderWidth: 1, padding: 10, cornerRadius: 8, boxPadding: 4,
        titleFont: { weight: "500" },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: line }, ticks: { color: muted, maxRotation: 0, autoSkipPadding: 18 } },
      y: { grid: { color: line, drawTicks: false }, border: { display: false }, ticks: { color: muted, padding: 10, maxTicksLimit: 5 } },
    },
  }, extra);
}

export const legendTop = {
  display: true, position: "top", align: "start",
  labels: { usePointStyle: true, pointStyle: "rectRounded", boxWidth: 8, boxHeight: 8, padding: 18, color: css("--muted") },
};

export const dayTitle = (iso) => fmtDay(iso, { weekday: "short", day: "numeric", month: "short" });

/** Mini-gráfico de linha em SVG, sem eixos. Valores nulos viram lacunas. */
export function spark(values, { w = 240, h = 40, pad = 3 } = {}) {
  const have = values.filter((v) => v != null);
  if (have.length < 2) return "";
  let lo = Math.min(...have), hi = Math.max(...have);
  if (hi === lo) { hi += 1; lo -= 1; }
  const x = (i) => pad + (i / (values.length - 1)) * (w - 2 * pad);
  const y = (v) => h - pad - ((v - lo) / (hi - lo)) * (h - 2 * pad);
  let d = "", pen = false;
  values.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d}" fill="none" stroke="#ff8a3d" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
