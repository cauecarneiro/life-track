// Home: os seis indicadores principais, o ano de treinos e os últimos treinos.
import { loadOverview, loadActivities, hasOverview, hasActivities } from "../api.js";
import { METRICS, ORDER, normalRange, statusOf, toneOf } from "../metrics.js";
import { spark } from "../charts.js";
import { heatmap, scrollHeatToEnd } from "../heatmap.js";
import { trainingCells, totals, between } from "../acts.js";
import { loadingHtml, fillDays } from "../ui.js";
import { esc, num, avg, signed, duration, fmtDay, today, addDays, typeName, icon } from "../util.js";

const STATUS_SHORT = { in: "Dentro do normal", above: "Acima do normal", below: "Abaixo do normal" };

function heroTitle(date) {
  const now = today();
  if (date === now) return "Hoje";
  if (date === addDays(now, -1)) return "Ontem";
  return fmtDay(date, { weekday: "long", day: "numeric", month: "long" });
}

function tile(t, i) {
  const { m } = t;
  if (t.empty) {
    return `<div class="tile rise" style="--i:${i}"><div class="tile-top"><span>${m.label}</span></div><div class="tile-value"><span class="v">—</span></div><p class="tile-hint">Sem dado nos últimos 30 dias.</p></div>`;
  }
  const status = t.status ? `<div class="tile-status"><i class="dot tone-${t.tone}"></i><span>${STATUS_SHORT[t.status]}</span></div>` : "";
  const delta = t.delta != null ? `<p class="tile-delta">${m.delta(t.delta)} vs. média de 30 dias</p>` : "";
  return `<a class="tile rise" style="--i:${i}" href="#/m/${m.id}">
    <div class="tile-top"><span>${m.label}</span>${icon("arrowUpRight", "go")}</div>
    <div class="tile-value"><span class="v num">${m.fmt(t.v)}</span>${m.unit ? `<span class="u">${m.unit}</span>` : ""}</div>
    ${status}
    ${delta}
    <p class="tile-hint">${esc(m.hint(t.row))}</p>
    <div class="tile-spark">${spark(t.series)}</div>
  </a>`;
}

function weekStat(label, value, delta, fmt) {
  const d = delta == null ? "" : `<span class="muted">${signed(fmt === "time" ? delta / 60 : delta, fmt === "km" ? 1 : 0)}${fmt === "time" ? " min" : fmt === "km" ? " km" : ""} vs. semana anterior</span>`;
  return `<div class="kpi"><span class="kpi-label">${label}</span><span class="kpi-value num">${value}</span>${d}</div>`;
}

export async function renderHome(root, _p, alive) {
  if (!hasOverview(30) || !hasActivities()) root.innerHTML = loadingHtml("Buscando seus dados na Garmin");
  const [ov, acts] = await Promise.all([loadOverview(30), loadActivities()]);
  if (!alive()) return;
  loadOverview(365).catch(() => {}); // aquece o cache para abrir os indicadores rápido

  const rows = fillDays(ov.days, ov.start, ov.end);
  const tiles = ORDER.map((id) => {
    const m = METRICS[id];
    let li = -1;
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i][m.key] != null) { li = i; break; }
    if (li < 0) return { m, empty: true };
    const row = rows[li], v = row[m.key];
    const others = rows.filter((_, i) => i !== li);
    const status = statusOf(v, normalRange(m, others, row));
    const mean = avg(others.map((r) => r[m.key]));
    return { m, row, v, status, tone: toneOf(m, status), delta: mean == null ? null : v - mean, series: rows.map((r) => r[m.key]) };
  });

  const known = tiles.filter((t) => t.status);
  const inside = known.filter((t) => t.status === "in").length;
  const latest = tiles.filter((t) => !t.empty).map((t) => t.row.date).sort().pop();

  // Treinos
  const to = today(), from = addDays(to, -364);
  const year = between(acts, from, to), yt = totals(year);
  const wk = totals(between(acts, addDays(to, -6), to)), prev = totals(between(acts, addDays(to, -13), addDays(to, -7)));
  const last = acts.slice(0, 5);

  root.innerHTML = `
    <section class="hero rise" style="--i:0">
      <h1>${esc(heroTitle(latest))}</h1>
      <p>${known.length ? `${inside} de ${known.length} indicadores dentro do seu normal. ` : ""}Dados de ${esc(fmtDay(latest, { weekday: "long", day: "numeric", month: "long" }))}.</p>
    </section>

    <section class="tiles">${tiles.map(tile).join("")}</section>

    <section class="section rise" style="--i:7">
      <div class="section-head">
        <div><h2>Atividade</h2><p>${yt.count} treinos e ${duration(yt.seconds)} nos últimos 12 meses.</p></div>
        <a class="link" href="#/treinos">Todos os treinos ${icon("arrowRight")}</a>
      </div>
      ${heatmap({ from, to, cells: trainingCells(acts, from, to) })}
    </section>

    <section class="section split rise" style="--i:8">
      <div>
        <div class="section-head"><div><h2>Últimos treinos</h2></div><a class="link" href="#/treinos">Ver todos ${icon("arrowRight")}</a></div>
        <ul class="list">
          ${last.map((a) => `<li><a href="#/treino/${a.id}"><span class="list-main"><b>${esc(a.name || typeName(a.type))}</b><span class="muted">${esc(typeName(a.type))}, ${esc(fmtDay(a.start))}</span></span><span class="num">${a.km ? `${num(a.km, 1)} km` : duration(a.durationS)}</span></a></li>`).join("")}
        </ul>
      </div>
      <div>
        <div class="section-head"><div><h2>Últimos 7 dias</h2></div></div>
        <div class="kpis kpis-3">
          ${weekStat("Treinos", wk.count, wk.count - prev.count)}
          ${weekStat("Tempo", wk.seconds ? duration(wk.seconds) : "0 min", wk.seconds - prev.seconds, "time")}
          ${weekStat("Distância", `${num(wk.km, 1)} km`, wk.km - prev.km, "km")}
        </div>
      </div>
    </section>`;

  scrollHeatToEnd(root);
}
