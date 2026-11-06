import { addBalance } from "./metrics.js?v=5";

// Acesso ao servidor local, com cache em memória no navegador.

const overview = new Map();
const fits = new Map();
const days = new Map();
let profile = null;
let activities = null;

async function get(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || body.detail || `erro ${res.status}`);
  return body;
}

export const hasOverview = (days) => overview.has(days);
export const hasActivities = () => activities !== null;
export const hasFit = (id) => fits.has(id);
export const hasDay = (d) => days.has(d);

// Estes valores acumulam ao longo do dia. Hoje eles ficam em row.live (a tela mostra "até agora")
// e saem dos campos normais, para não distorcer médias, gráficos e tabelas.
const ACCUMULATING = ["steps", "stressAvg", "kcal", "kcalActive", "kcalRest", "intensity", "moderateMin", "vigorousMin", "floorsUp", "floorsDown", "distanceKm"];

function dropPartialToday(ov) {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  for (const row of ov.days) {
    if (row.date !== iso) continue;
    row.live = {};
    for (const k of ACCUMULATING) { if (row[k] != null) row.live[k] = row[k]; row[k] = null; }
  }
  return ov;
}

export async function loadOverview(days) {
  if (!overview.has(days)) {
    const ov = dropPartialToday(await get(`/api/overview?days=${days}`));
    addBalance(ov.days);
    overview.set(days, ov);
  }
  return overview.get(days);
}

export async function loadActivities() {
  activities ??= await get("/api/activities?days=3650");
  return activities;
}

export async function loadFit(id) {
  if (!fits.has(id)) fits.set(id, await get(`/api/activities/${id}`));
  return fits.get(id);
}

export async function loadDay(date) {
  if (!days.has(date)) days.set(date, await get(`/api/day/${date}`));
  return days.get(date);
}

export async function loadProfile() {
  profile ??= await get("/api/profile");
  return profile;
}

export async function refreshAll() {
  await get("/api/refresh", { method: "POST" });
  overview.clear();
  fits.clear();
  days.clear();
  profile = null;
  activities = null;
}
