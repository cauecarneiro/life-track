// Acesso ao servidor local, com cache em memória no navegador.

const overview = new Map();
const fits = new Map();
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

// Passos e estresse acumulam ao longo do dia: o dia de hoje ainda está incompleto e distorceria médias e "último dia".
function dropPartialToday(ov) {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  for (const row of ov.days) if (row.date === iso) { row.steps = null; row.stressAvg = null; }
  return ov;
}

export async function loadOverview(days) {
  if (!overview.has(days)) overview.set(days, dropPartialToday(await get(`/api/overview?days=${days}`)));
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

export async function refreshAll() {
  await get("/api/refresh", { method: "POST" });
  overview.clear();
  fits.clear();
  activities = null;
}
