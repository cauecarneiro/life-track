"use strict";

const view = document.getElementById("view");
const state = { days: 30, overview: {}, actDays: 365, acts: {}, type: "all" };
const charts = {};
let map = null;

const TYPES = {
  running: "Corrida", treadmill_running: "Esteira", trail_running: "Trail",
  indoor_cycling: "Bike indoor", cycling: "Pedal", road_biking: "Pedal",
  mountain_biking: "Mountain bike", hiking: "Trilha", walking: "Caminhada",
  strength_training: "Musculação", lap_swimming: "Natação",
  open_water_swimming: "Águas abertas", yoga: "Yoga", cardio: "Cardio",
};
const RUNS = new Set(["running", "treadmill_running", "trail_running", "track_running"]);
const TE_LABEL = {
  RECOVERY: "Recuperação", AEROBIC_BASE: "Base aeróbica", TEMPO: "Ritmo",
  LACTATE_THRESHOLD: "Limiar", VO2MAX: "VO2 máx.", ANAEROBIC_CAPACITY: "Anaeróbico",
  SPRINT: "Tiro", NONE: "",
};

// ------------------------------------------------------------------ utilidades

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const typeName = (t) => TYPES[t] || String(t || "").replaceAll("_", " ");
const num = (v, d = 0) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d }));
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const isDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

function sd(a) {
  const m = avg(a);
  return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : 0;
}

function duration(s) {
  if (s == null) return "—";
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

function pace(v) {
  if (!v || v < 0.5) return "—";
  const s = Math.round(1000 / v);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function sleepTime(h) {
  if (h == null) return "—";
  let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return `${hh}h${String(mm).padStart(2, "0")}`;
}

const day = (iso, opts = { day: "2-digit", month: "short" }) =>
  new Date(iso.slice(0, 10) + "T12:00").toLocaleDateString("pt-BR", opts).replace(".", "");

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || body.detail || `erro ${res.status}`);
  return body;
}

function showError(err) {
  view.innerHTML = `<div class="notice"><strong>Não consegui buscar os dados na Garmin.</strong>
    ${esc(err.message)}<br><br>
    Confira se o servidor está rodando e se a chave ainda vale em Garmin Connect › Configurações › Chave de API pessoal.
    Depois use "Buscar de novo".</div>`;
}

function loading(text) {
  view.innerHTML = `<div class="notice"><strong>${esc(text)}</strong>Buscando direto na Garmin.</div>`;
}

// ------------------------------------------------------------------ gráficos

function baseOptions(extra = {}) {
  const grid = css("--grid"), muted = css("--muted");
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    animation: matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 400 },
    plugins: {
      legend: { position: "bottom", labels: { boxWidth: 8, boxHeight: 8, color: muted, usePointStyle: true } },
      tooltip: {
        backgroundColor: css("--bg"), titleColor: css("--ink"), bodyColor: css("--muted"),
        borderColor: css("--line"), borderWidth: 1, padding: 10, cornerRadius: 8,
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: muted, maxRotation: 0, autoSkipPadding: 14 } },
      y: { grid: { color: grid }, border: { display: false }, ticks: { color: muted } },
    },
    ...extra,
  };
}

function areaFill(context) {
  const { ctx, chartArea } = context.chart;
  if (!chartArea) return null;
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, css("--area"));
  g.addColorStop(1, "rgba(128,128,128,0)");
  return g;
}

function draw(id, config) {
  charts[id]?.destroy();
  const el = document.getElementById(id);
  if (el) charts[id] = new Chart(el, config);
}

function destroyAll() {
  for (const k of Object.keys(charts)) { charts[k].destroy(); delete charts[k]; }
  if (map) { map.remove(); map = null; }
}

function chartBlock(id, title, note, wide = false) {
  return `<section class="chart${wide ? " wide" : ""}"><h2>${title}</h2>${note ? `<p>${note}</p>` : ""}
    <div class="canvas"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div></section>`;
}

// ------------------------------------------------------------------ hoje

function lane({ label, value, display, unit, lo, hi, history, goodWhenUp, rangeText, fmt = num }) {
  if (value == null) {
    return `<div class="metric"><div class="label">${label}</div><div class="value">—</div><p class="status muted">Sem dado nessa noite.</p></div>`;
  }
  const vals = history.filter((v) => v != null).concat([value, lo, hi]);
  let min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min) * 0.08 || 1;
  min = Math.max(0, min - pad); max += pad;
  const pct = (v) => (((v - min) / (max - min)) * 100).toFixed(1) + "%";
  const below = value < lo, above = value > hi;
  const where = below ? "abaixo da sua faixa" : above ? "acima da sua faixa" : "dentro da sua faixa";
  const good = !below && !above ? true : above === goodWhenUp;
  const tone = good ? "pos" : "neg";
  return `<div class="metric" style="--accent:var(--${tone})">
    <div class="label">${label}</div>
    <div class="value">${display}${unit ? `<small>${unit}</small>` : ""}</div>
    <div class="lane" role="img" aria-label="${label}: ${display}, ${where} (${rangeText})">
      <span class="band" style="left:${pct(lo)};width:calc(${pct(hi)} - ${pct(lo)})"></span>
      <span class="dot" style="left:${pct(value)}"></span>
    </div>
    <div class="lane-scale"><span>${fmt(min)}</span><span>${fmt(max)}</span></div>
    <p class="status"><b class="${tone}">${where.charAt(0).toUpperCase() + where.slice(1)}.</b><br><span class="muted">Seu normal: ${rangeText}.</span></p>
  </div>`;
}

function personalRange(values) {
  const v = values.filter((x) => x != null);
  const m = avg(v), s = sd(v);
  return m == null ? [null, null] : [m - s, m + s];
}

async function renderToday() {
  destroyAll();
  if (!state.overview[state.days]) {
    loading("Carregando seus últimos dias");
    try { state.overview[state.days] = await api(`/api/overview?days=${state.days}`); }
    catch (e) { return showError(e); }
  }
  const days = state.overview[state.days].days;
  const night = [...days].reverse().find((r) => r.sleepH != null);
  if (!night) {
    view.innerHTML = `<div class="notice"><strong>Nenhuma noite registrada nesse período.</strong>Durma com o relógio e sincronize pelo app Garmin Connect para ver seus dados aqui.</div>`;
    return;
  }
  const col = (k) => days.map((r) => r[k]);
  const [sLo, sHi] = personalRange(col("sleepH"));
  const [rLo, rHi] = personalRange(col("restingHR"));
  const [bLo, bHi] = personalRange(col("bbMax"));
  const periodText = `média de ${state.days} dias`;

  const metrics = [
    lane({ label: "Sono", value: night.sleepH, display: sleepTime(night.sleepH), unit: night.sleepScore ? `nota ${night.sleepScore}` : "",
      lo: sLo, hi: sHi, history: col("sleepH"), goodWhenUp: true, fmt: sleepTime, rangeText: `${sleepTime(sLo)} a ${sleepTime(sHi)}, ${periodText}` }),
    lane({ label: "Variabilidade cardíaca (HRV)", value: night.hrv, display: num(night.hrv), unit: "ms",
      lo: night.hrvLow, hi: night.hrvHigh, history: col("hrv"), goodWhenUp: true, rangeText: `${num(night.hrvLow)} a ${num(night.hrvHigh)} ms, faixa da Garmin` }),
    lane({ label: "Frequência cardíaca em repouso", value: night.restingHR, display: num(night.restingHR), unit: "bpm",
      lo: rLo, hi: rHi, history: col("restingHR"), goodWhenUp: false, rangeText: `${num(rLo)} a ${num(rHi)} bpm, ${periodText}` }),
    lane({ label: "Body Battery máximo", value: night.bbMax, display: num(night.bbMax), unit: "",
      lo: bLo, hi: bHi, history: col("bbMax"), goodWhenUp: true, rangeText: `${num(bLo)} a ${num(bHi)}, ${periodText}` }),
  ];

  const periods = [7, 30, 90, 180].map((d) => `<button type="button" data-days="${d}" aria-pressed="${d === state.days}">${d} dias</button>`).join("");
  view.innerHTML = `
    <div class="lead">
      <h1>${esc(day(night.date, { weekday: "long", day: "numeric", month: "long" }))}</h1>
      <p>Você dormiu das ${esc(night.bedtime || "—")} às ${esc(night.wake || "—")}. A faixa cinza é o seu normal.</p>
    </div>
    <div class="lanes">${metrics.join("")}</div>
    <div class="lead"><h2>Tendência</h2><div class="periods" role="group" aria-label="Período">${periods}</div></div>
    <div class="charts">
      ${chartBlock("c-sleep", "Sono por noite", "Horas em cada fase. A linha é a nota de sono.", true)}
      ${chartBlock("c-hrv", "HRV", "Média da noite contra a sua faixa equilibrada.")}
      ${chartBlock("c-rhr", "Frequência em repouso", "Batimentos por minuto, dia a dia.")}
      ${chartBlock("c-bb", "Body Battery", "Do mínimo ao máximo de cada dia.")}
      ${chartBlock("c-stress", "Estresse médio", "Escala de 0 a 100 da Garmin.")}
      ${chartBlock("c-steps", "Passos", "Barras são os passos. A linha é a meta do dia.", true)}
    </div>`;

  view.querySelectorAll(".periods button").forEach((b) =>
    b.addEventListener("click", () => { state.days = Number(b.dataset.days); renderToday(); }));

  const labels = days.map((r) => day(r.date));
  const h = (m) => (m == null ? null : m / 60);
  const dots = days.length > 45 ? 0 : 2.5;

  draw("c-sleep", {
    data: { labels, datasets: [
      { type: "bar", label: "Profundo", data: days.map((r) => h(r.deepMin)), backgroundColor: css("--c5"), stack: "s" },
      { type: "bar", label: "Leve", data: days.map((r) => h(r.lightMin)), backgroundColor: css("--c1"), stack: "s" },
      { type: "bar", label: "REM", data: days.map((r) => h(r.remMin)), backgroundColor: css("--c3"), stack: "s" },
      { type: "bar", label: "Acordado", data: days.map((r) => h(r.awakeMin)), backgroundColor: css("--c2"), stack: "s" },
      { type: "line", label: "Nota", data: col("sleepScore"), borderColor: css("--ink"), pointRadius: 0, borderWidth: 1.5, yAxisID: "score", spanGaps: true },
    ] },
    options: baseOptions({
      scales: {
        ...baseOptions().scales,
        x: { ...baseOptions().scales.x, stacked: true },
        y: { ...baseOptions().scales.y, stacked: true, title: { display: true, text: "horas", color: css("--muted") } },
        score: { position: "right", min: 0, max: 100, grid: { display: false }, border: { display: false }, ticks: { color: css("--muted") } },
      },
    }),
  });

  draw("c-hrv", {
    type: "line",
    data: { labels, datasets: [
      { label: "Faixa mínima", data: col("hrvLow"), borderColor: "transparent", pointRadius: 0, spanGaps: true, order: 3 },
      { label: "Faixa equilibrada", data: col("hrvHigh"), borderColor: "transparent", backgroundColor: css("--band"), fill: "-1", pointRadius: 0, spanGaps: true, order: 3 },
      { label: "Noite", data: col("hrv"), borderColor: css("--ink"), backgroundColor: css("--ink"), pointRadius: dots, borderWidth: 1.75, spanGaps: true, order: 1 },
      { label: "Média de 7 dias", data: col("hrvWeekly"), borderColor: css("--c2"), borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5, spanGaps: true, order: 2 },
    ] },
    options: baseOptions({ plugins: { ...baseOptions().plugins, legend: { ...baseOptions().plugins.legend, labels: { ...baseOptions().plugins.legend.labels, filter: (i) => i.text !== "Faixa mínima" } } } }),
  });

  draw("c-rhr", {
    type: "line",
    data: { labels, datasets: [{ label: "Repouso", data: col("restingHR"), borderColor: css("--c3"), pointBackgroundColor: css("--c3"), backgroundColor: areaFill, fill: true, pointRadius: dots, borderWidth: 1.75, spanGaps: true }] },
    options: baseOptions({ plugins: { ...baseOptions().plugins, legend: { display: false } } }),
  });

  draw("c-bb", {
    type: "bar",
    data: { labels, datasets: [{ label: "Body Battery", data: days.map((r) => (r.bbMin == null ? null : [r.bbMin, r.bbMax])), backgroundColor: css("--c1"), hoverBackgroundColor: css("--c3"), borderRadius: 4 }] },
    options: baseOptions({ plugins: { ...baseOptions().plugins, legend: { display: false } }, scales: { ...baseOptions().scales, y: { ...baseOptions().scales.y, min: 0, max: 100 } } }),
  });

  draw("c-stress", {
    type: "bar",
    data: { labels, datasets: [{ label: "Estresse médio", data: col("stressAvg"), backgroundColor: css("--c2"), hoverBackgroundColor: css("--c4"), borderRadius: 3 }] },
    options: baseOptions({ plugins: { ...baseOptions().plugins, legend: { display: false } }, scales: { ...baseOptions().scales, y: { ...baseOptions().scales.y, min: 0, max: 100 } } }),
  });

  draw("c-steps", {
    data: { labels, datasets: [
      { type: "bar", label: "Passos", data: col("steps"), backgroundColor: css("--c1"), hoverBackgroundColor: css("--c3"), borderRadius: 3, order: 2 },
      { type: "line", label: "Meta", data: col("stepGoal"), borderColor: css("--ink"), borderDash: [4, 4], pointRadius: 0, borderWidth: 1.25, stepped: "middle", order: 1 },
    ] },
    options: baseOptions(),
  });
}

// ------------------------------------------------------------------ treinos

async function loadActivities() {
  if (!state.acts[state.actDays]) state.acts[state.actDays] = await api(`/api/activities?days=${state.actDays}`);
  return state.acts[state.actDays];
}

function weekStart(iso) {
  const d = new Date(iso.slice(0, 10) + "T12:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

async function renderActivities() {
  destroyAll();
  let all;
  if (!state.acts[state.actDays]) loading("Carregando seus treinos");
  try { all = await loadActivities(); } catch (e) { return showError(e); }

  const types = [...new Set(all.map((a) => a.type))];
  if (state.type !== "all" && !types.includes(state.type)) state.type = "all";
  const list = state.type === "all" ? all : all.filter((a) => a.type === state.type);
  const km = list.reduce((s, a) => s + (a.km || 0), 0);
  const secs = list.reduce((s, a) => s + (a.durationS || 0), 0);

  const ranges = [[30, "30 dias"], [90, "90 dias"], [365, "1 ano"], [3650, "Tudo"]]
    .map(([d, t]) => `<button type="button" data-days="${d}" aria-pressed="${d === state.actDays}">${t}</button>`).join("");
  const chips = [["all", "Todos"], ...types.map((t) => [t, typeName(t)])]
    .map(([t, name]) => `<button type="button" data-type="${esc(t)}" aria-pressed="${t === state.type}">${esc(name)}</button>`).join("");

  const rows = list.map((a) => `<tr>
      <td>${esc(day(a.start))}</td>
      <td><a href="#treino/${a.id}">${esc(a.name || typeName(a.type))}</a></td>
      <td>${esc(typeName(a.type))}</td>
      <td class="num">${a.km ? num(a.km, 2) + " km" : "—"}</td>
      <td class="num">${duration(a.durationS)}</td>
      <td class="num">${RUNS.has(a.type) && a.km ? pace(a.avgSpeed) + " /km" : "—"}</td>
      <td class="num">${num(a.avgHR)}</td>
      <td class="num"><span class="te" title="${esc(TE_LABEL[a.teLabel] || "")}">${num(a.te, 1)}</span></td>
    </tr>`).join("");

  view.innerHTML = `
    <div class="lead"><h1>Treinos</h1><div class="periods" role="group" aria-label="Período">${ranges}</div></div>
    <div class="filters" role="group" aria-label="Tipo de treino">${chips}</div>
    <div class="totals">
      <div>${list.length}<span>treinos</span></div>
      <div>${num(km, 1)}<span>quilômetros</span></div>
      <div>${duration(secs)}<span>de treino</span></div>
    </div>
    <div class="charts">${chartBlock("c-week", "Tempo por semana", "Horas de treino somadas por semana, separadas por tipo.", true)}</div>
    ${list.length ? `<div class="table-wrap" style="margin-top:48px"><table>
      <thead><tr><th>Data</th><th>Treino</th><th>Tipo</th><th class="num">Distância</th><th class="num">Tempo</th><th class="num">Ritmo</th><th class="num">FC média</th><th class="num">Efeito</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
      : `<div class="notice"><strong>Nenhum treino nesse período.</strong>Escolha um período maior acima.</div>`}`;

  view.querySelectorAll(".periods button").forEach((b) =>
    b.addEventListener("click", () => { state.actDays = Number(b.dataset.days); renderActivities(); }));
  view.querySelectorAll(".filters button").forEach((b) =>
    b.addEventListener("click", () => { state.type = b.dataset.type; renderActivities(); }));

  const weeks = [...new Set(list.map((a) => weekStart(a.start)))].sort();
  const greys = [css("--c5"), css("--c3"), css("--c1"), css("--c4"), css("--c2")];
  const byType = [...new Set(list.map((a) => a.type))];
  draw("c-week", {
    type: "bar",
    data: {
      labels: weeks.map((w) => day(w)),
      datasets: byType.map((t, i) => ({
        label: typeName(t),
        data: weeks.map((w) => list.filter((a) => a.type === t && weekStart(a.start) === w).reduce((s, a) => s + a.durationS / 3600, 0) || null),
        backgroundColor: greys[i % greys.length],
        stack: "w",
        borderRadius: 3,
      })),
    },
    options: baseOptions({
      scales: { ...baseOptions().scales, x: { ...baseOptions().scales.x, stacked: true }, y: { ...baseOptions().scales.y, stacked: true, title: { display: true, text: "horas", color: css("--muted") } } },
      plugins: { ...baseOptions().plugins, tooltip: { ...baseOptions().plugins.tooltip, callbacks: { label: (c) => `${c.dataset.label}: ${duration(c.raw * 3600)}` } } },
    }),
  });
}

// ------------------------------------------------------------------ um treino

function smooth(values, w = 5) {
  return values.map((_, i) => {
    const part = values.slice(Math.max(0, i - w), i + w + 1).filter((v) => v != null);
    return part.length ? avg(part) : null;
  });
}

async function renderActivity(id) {
  destroyAll();
  loading("Carregando o treino");
  let all, fit;
  try { [all, fit] = await Promise.all([loadActivities(), api(`/api/activities/${id}`)]); }
  catch (e) { return showError(e); }
  const a = all.find((x) => String(x.id) === String(id)) || {};
  const pts = fit.points;
  const hasGps = pts.some((p) => p.lat != null);
  const hasDist = pts.some((p) => p.d);
  const isRun = RUNS.has(a.type) || String(fit.sport).includes("running");
  const s = fit.session || {};

  const stat = (value, unit, label) => `<div>${value}${unit ? `<small>${unit}</small>` : ""}<span>${label}</span></div>`;
  const stats = [
    a.km ? stat(num(a.km, 2), "km", "distância") : "",
    stat(duration(a.durationS), "", "tempo"),
    a.km && isRun ? stat(pace(a.avgSpeed), "/km", "ritmo médio") : "",
    stat(num(a.avgHR), "bpm", `FC média, máxima ${num(a.maxHR)}`),
    a.elevGain ? stat(num(a.elevGain), "m", "subida") : "",
    a.cadence ? stat(num(a.cadence), "ppm", "cadência") : "",
    a.te != null ? stat(num(a.te, 1), "", `efeito aeróbico${TE_LABEL[a.teLabel] ? ` (${TE_LABEL[a.teLabel].toLowerCase()})` : ""}`) : "",
    a.kcal ? stat(num(a.kcal), "kcal", "gasto") : "",
  ].join("");

  const dyn = [
    s.avgPower && ["Potência média", `${num(s.avgPower)} W`],
    s.normalizedPower && ["Potência normalizada", `${num(s.normalizedPower)} W`],
    s.avgStanceMs && ["Contato com o solo", `${num(s.avgStanceMs)} ms`],
    s.avgVertOscMm && ["Oscilação vertical", `${num(s.avgVertOscMm / 10, 1)} cm`],
    s.avgVertRatio && ["Razão vertical", `${num(s.avgVertRatio, 1)} %`],
    s.avgStepLengthMm && ["Passada", `${num(s.avgStepLengthMm / 1000, 2)} m`],
    s.avgTemp != null && ["Temperatura", `${num(s.avgTemp)} °C`],
  ].filter(Boolean).map(([k, v]) => `<li><b>${v}</b>${k}</li>`).join("");

  const laps = fit.laps.length > 1 ? `<section class="chart wide"><h2>Voltas</h2><div class="table-wrap"><table>
      <thead><tr><th>Volta</th><th class="num">Distância</th><th class="num">Tempo</th><th class="num">Ritmo</th><th class="num">FC média</th><th class="num">FC máx.</th><th class="num">Cadência</th><th class="num">Subida</th><th class="num">Potência</th></tr></thead>
      <tbody>${fit.laps.map((l) => `<tr><td>${l.n}</td><td class="num">${l.dist ? num(l.dist / 1000, 2) + " km" : "—"}</td><td class="num">${duration(l.timeS)}</td>
        <td class="num">${isRun ? pace(l.v) : "—"}</td><td class="num">${num(l.hr)}</td><td class="num">${num(l.maxHR)}</td><td class="num">${num(l.cad)}</td><td class="num">${l.ascent != null ? num(l.ascent) + " m" : "—"}</td><td class="num">${l.power ? num(l.power) + " W" : "—"}</td></tr>`).join("")}</tbody>
    </table></div></section>` : "";

  const hasAlt = pts.some((p) => p.alt != null);
  const hasCad = pts.some((p) => p.cad);
  const hasPw = pts.some((p) => p.pw);

  view.innerHTML = `
    <a class="back" href="#treinos">Voltar aos treinos</a>
    <div class="detail-head">
      <h1>${esc(a.name || typeName(a.type) || "Treino")}</h1>
      <p>${esc(typeName(a.type))}${a.start ? ", " + esc(day(a.start, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) + " às " + esc(a.start.slice(11, 16)) : ""}${a.location ? ", " + esc(a.location) : ""}</p>
    </div>
    <div class="stats">${stats}</div>
    ${hasGps ? `<div id="map" role="img" aria-label="Mapa do percurso"></div>` : ""}
    <div class="charts">
      ${chartBlock("c-pace", isRun ? "Ritmo e frequência cardíaca" : "Velocidade e frequência cardíaca", hasDist ? "Ao longo da distância." : "Ao longo do tempo.", true)}
      ${a.zones?.some((z) => z) ? chartBlock("c-zones", "Tempo em cada zona de FC", "Minutos por zona, da 1 (leve) à 5 (máxima).") : ""}
      ${hasAlt && hasGps ? chartBlock("c-alt", "Altimetria", "Altitude em metros.") : ""}
      ${hasCad || hasPw ? chartBlock("c-cad", hasPw ? "Cadência e potência" : "Cadência", "", true) : ""}
      ${dyn ? `<section class="chart wide"><h2>Dinâmica de corrida</h2><ul class="dynamics">${dyn}</ul></section>` : ""}
      ${laps}
    </div>`;

  const x = pts.map((p) => (hasDist ? num((p.d || 0) / 1000, 1) : duration(p.t)));

  if (hasGps) {
    const line = pts.filter((p) => p.lat != null).map((p) => [p.lat, p.lon]);
    map = L.map("map", { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap", className: isDark() ? "tiles-dark" : "tiles-light",
    }).addTo(map);
    const path = L.polyline(line, { color: css("--ink"), weight: 3 }).addTo(map);
    L.circleMarker(line[0], { radius: 6, color: css("--bg"), weight: 2, fillColor: css("--pos"), fillOpacity: 1 }).addTo(map);
    L.circleMarker(line[line.length - 1], { radius: 6, color: css("--bg"), weight: 2, fillColor: css("--neg"), fillOpacity: 1 }).addTo(map);
    map.fitBounds(path.getBounds(), { padding: [20, 20] });
  }

  const speed = smooth(pts.map((p) => (p.v && p.v > 0.5 ? p.v : null)));
  const paceMin = speed.map((v) => (v ? 1000 / v / 60 : null));
  draw("c-pace", {
    type: "line",
    data: { labels: x, datasets: [
      isRun
        ? { label: "Ritmo (min/km)", data: paceMin, borderColor: css("--ink"), pointRadius: 0, borderWidth: 2, yAxisID: "y", spanGaps: true }
        : { label: "Velocidade (km/h)", data: speed.map((v) => (v ? v * 3.6 : null)), borderColor: css("--ink"), pointRadius: 0, borderWidth: 2, yAxisID: "y", spanGaps: true },
      { label: "FC (bpm)", data: pts.map((p) => p.hr), borderColor: css("--c2"), pointRadius: 0, borderWidth: 1.25, yAxisID: "hr", spanGaps: true },
    ] },
    options: baseOptions({
      scales: {
        x: { ...baseOptions().scales.x, title: { display: true, text: hasDist ? "km" : "tempo", color: css("--muted") } },
        y: { ...baseOptions().scales.y, reverse: isRun, ticks: { color: css("--muted"), callback: (v) => (isRun ? `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}` : v) } },
        hr: { position: "right", grid: { display: false }, border: { display: false }, ticks: { color: css("--muted") } },
      },
      plugins: { ...baseOptions().plugins, tooltip: { ...baseOptions().plugins.tooltip, callbacks: {
        label: (c) => (c.dataset.yAxisID === "y" && isRun ? `Ritmo: ${pace(1000 / (c.raw * 60))} /km` : `${c.dataset.label}: ${num(c.raw, c.dataset.yAxisID === "hr" ? 0 : 1)}`),
      } } },
    }),
  });

  if (a.zones?.some((z) => z)) {
    draw("c-zones", {
      type: "bar",
      data: { labels: ["Zona 1", "Zona 2", "Zona 3", "Zona 4", "Zona 5"], datasets: [{ label: "Minutos", data: a.zones.map((z) => (z || 0) / 60),
        backgroundColor: [css("--c1"), css("--c2"), css("--c3"), css("--c4"), css("--c5")], borderRadius: 4 }] },
      options: baseOptions({ indexAxis: "y", plugins: { ...baseOptions().plugins, legend: { display: false },
        tooltip: { ...baseOptions().plugins.tooltip, callbacks: { label: (c) => duration(c.raw * 60) } } } }),
    });
  }

  if (hasAlt && hasGps) {
    draw("c-alt", {
      type: "line",
      data: { labels: x, datasets: [{ label: "Altitude", data: pts.map((p) => p.alt), borderColor: css("--c3"), backgroundColor: areaFill, fill: "origin", pointRadius: 0, borderWidth: 1.5 }] },
      options: baseOptions({ plugins: { ...baseOptions().plugins, legend: { display: false } }, scales: { ...baseOptions().scales, y: { ...baseOptions().scales.y, beginAtZero: false } } }),
    });
  }

  if (hasCad || hasPw) {
    const sets = [];
    if (hasCad) sets.push({ label: isRun ? "Cadência (ppm)" : "Cadência (rpm)", data: smooth(pts.map((p) => p.cad || null), 3), borderColor: css("--ink"), pointRadius: 0, borderWidth: 1.5, yAxisID: "y", spanGaps: true });
    if (hasPw) sets.push({ label: "Potência (W)", data: smooth(pts.map((p) => p.pw || null), 3), borderColor: css("--c2"), pointRadius: 0, borderWidth: 1.25, yAxisID: hasCad ? "pw" : "y", spanGaps: true });
    draw("c-cad", {
      type: "line",
      data: { labels: x, datasets: sets },
      options: baseOptions({ scales: { ...baseOptions().scales, y: { ...baseOptions().scales.y, beginAtZero: false },
        ...(hasCad && hasPw ? { pw: { position: "right", grid: { display: false }, border: { display: false }, ticks: { color: css("--muted") } } } : {}) } }),
    });
  }
}

// ------------------------------------------------------------------ navegação

function route() {
  const hash = location.hash.slice(1) || "hoje";
  const [page, id] = hash.split("/");
  const tab = page === "treino" ? "treinos" : page;
  document.querySelectorAll(".tabs a").forEach((a) => (a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  window.scrollTo(0, 0);
  if (page === "treino" && id) return renderActivity(id);
  if (page === "treinos") return renderActivities();
  return renderToday();
}

document.getElementById("refresh").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    await api("/api/refresh", { method: "POST" });
    state.overview = {};
    state.acts = {};
    await route();
  } catch (err) {
    showError(err);
  } finally {
    btn.disabled = false;
  }
});

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", route);
window.addEventListener("hashchange", route);
Chart.defaults.font.family = '"Barlow", system-ui, sans-serif';
Chart.defaults.font.size = 13;
route();
