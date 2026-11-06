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
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
  pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
  body: '<circle cx="12" cy="5" r="2"/><path d="M7 10h10M12 8v6m0 0-3 7m3-7 3 7"/>',
  fork: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-2.5 5-2.5 8H17v10"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  dumbbell: '<path d="M6 7v10M3.5 9.5v5M18 7v10M20.5 9.5v5M6 12h12"/>',
  steps: '<path d="M4 17c2.5-.8 3.5-3 3.5-6V6a2.2 2.2 0 0 1 4.4 0v4c0 3 1.2 5 4.6 6.2V20H4z"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="3"/><path d="M22 10.5v3M6 10.5v3M10 10.5v3"/>',
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9.5a4 4 0 0 1 6 0M12 9.5l1.6 2"/>',
  droplet: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  wind: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
  bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>',
  stairs: '<path d="M3 20h5v-4h4v-4h4V8h5"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  wave: '<path d="M3 12c2 0 2-6 4.5-6S10 18 12 18s2.5-12 4.5-12S19 12 21 12"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
};
export const icon = (name, cls = "") =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name]}</svg>`;

export const heartFill = '<svg class="ic fill" viewBox="0 0 24 24" width="44" height="44" aria-hidden="true" style="width:44px;height:44px"><path d="M12 21s-8-5-8-11.2A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.8C20 16 12 21 12 21z"/></svg>';

export const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
