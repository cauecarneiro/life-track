// Formatação, datas e ícones usados por todas as telas.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const num = (v, d = 0) =>
  v == null || Number.isNaN(v)
    ? "—"
    : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });

export const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);

export const avg = (a) => {
  const v = a.filter((x) => x != null && !Number.isNaN(x));
  return v.length ? sum(v) / v.length : null;
};

export const sd = (a) => {
  const v = a.filter((x) => x != null && !Number.isNaN(x));
  const m = avg(v);
  return v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) : 0;
};

export const signed = (v, d = 0) => (v > 0 ? "+" : v < 0 ? "−" : "") + num(Math.abs(v), d);

export function duration(s) {
  if (s == null) return "—";
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export function minutesText(m) {
  if (m == null) return "—";
  m = Math.round(m);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m} min`;
}

export function pace(v) {
  if (!v || v < 0.5) return "—";
  const s = Math.round(1000 / v);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function sleepTime(h) {
  if (h == null) return "—";
  let hh = Math.floor(Math.abs(h)), mm = Math.round((Math.abs(h) - hh) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return `${hh}h${String(mm).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- datas (sempre "AAAA-MM-DD")

const pad = (n) => String(n).padStart(2, "0");
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (iso) => new Date(iso.slice(0, 10) + "T12:00");
export const today = () => isoDay(new Date());
export const addDays = (iso, n) => {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
export const diffDays = (a, b) => Math.round((parseDay(a) - parseDay(b)) / 864e5);
export const fmtDay = (iso, opts = { day: "numeric", month: "short" }) =>
  parseDay(iso).toLocaleDateString("pt-BR", opts).replaceAll(".", "");

// ---------------------------------------------------------------- modalidades

export const TYPES = {
  running: "Corrida", treadmill_running: "Esteira", trail_running: "Trail", track_running: "Pista",
  indoor_cycling: "Bike indoor", cycling: "Pedal", road_biking: "Pedal", mountain_biking: "Mountain bike",
  hiking: "Trilha", walking: "Caminhada", strength_training: "Musculação",
  lap_swimming: "Natação", open_water_swimming: "Águas abertas", yoga: "Yoga", cardio: "Cardio",
};
export const RUNS = new Set(["running", "treadmill_running", "trail_running", "track_running"]);
export const typeName = (t) => TYPES[t] || String(t || "").replaceAll("_", " ");

// ---------------------------------------------------------------- ícones (traço único de 1,5 px)

const PATHS = {
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  arrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  chevLeft: '<path d="m15 18-6-6 6-6"/>',
  chevRight: '<path d="m9 18 6-6-6-6"/>',
};
export const icon = (name, cls = "") =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name]}</svg>`;
