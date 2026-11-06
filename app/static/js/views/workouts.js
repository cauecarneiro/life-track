// Treinos: totais, ano de atividade, volume por semana e a lista completa.
import { loadActivities, hasActivities } from "../api.js?v=4";
import { mount, baseOptions, css } from "../charts.js?v=4";
import { heatmap, scrollHeatToEnd } from "../heatmap.js?v=4";
import { trainingCells, totals, between } from "../acts.js?v=4";
import { loadingHtml, emptyHtml } from "../ui.js?v=4";
import { esc, num, sum, duration, pace, fmtDay, today, addDays, parseDay, typeName, RUNS, icon } from "../util.js?v=4";

const RANGES = [[30, "30 dias"], [90, "90 dias"], [365, "1 ano"], [3650, "Tudo"]];
const href = (r, t) => `#/treinos?r=${r}&t=${t}`;
const weekStart = (iso) => addDays(iso, -parseDay(iso).getDay());

export async function renderWorkouts(root, { q }, alive) {
  if (!hasActivities()) root.innerHTML = loadingHtml("Buscando seus treinos");
  const all = await loadActivities();
  if (!alive()) return;

  const r = RANGES.some(([v]) => v === Number(q.r)) ? Number(q.r) : 365;
  const to = today();
  const from = r >= 3650 ? "0000-00-00" : addDays(to, -(r - 1));
  const inRange = between(all, from, to);
  const kinds = [...new Set(inRange.map((a) => a.type))];
  const type = kinds.includes(q.t) ? q.t : "all";
  const list = type === "all" ? inRange : inRange.filter((a) => a.type === type);
  const t = totals(list);

  const heatFrom = addDays(to, -364);
  const heatList = type === "all" ? all : all.filter((a) => a.type === type);

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Treinos</h1><p class="muted">Tudo o que o relógio registrou, do mais recente ao mais antigo.</p></div>
      <div class="tabs" role="group" aria-label="Período">
        ${RANGES.map(([v, label]) => `<a href="${href(v, type)}" data-replace${v === r ? ' aria-current="true"' : ""}>${label}</a>`).join("")}
      </div>
    </div>

    <div class="tabs filters" role="group" aria-label="Modalidade">
      <a href="${href(r, "all")}" data-replace${type === "all" ? ' aria-current="true"' : ""}>Todos</a>
      ${kinds.map((k) => `<a href="${href(r, k)}" data-replace${type === k ? ' aria-current="true"' : ""}>${esc(typeName(k))}</a>`).join("")}
    </div>

    <section class="kpis kpis-4">
      <div class="kpi"><span class="kpi-label">Treinos</span><span class="kpi-value num">${t.count}</span></div>
      <div class="kpi"><span class="kpi-label">Distância</span><span class="kpi-value num">${num(t.km, 1)} km</span></div>
      <div class="kpi"><span class="kpi-label">Tempo</span><span class="kpi-value num">${duration(t.seconds)}</span></div>
      <div class="kpi"><span class="kpi-label">FC média</span><span class="kpi-value num">${t.hr ? `${num(t.hr)} bpm` : "—"}</span></div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Atividade</h2><p>Minutos de treino por dia, nos últimos 12 meses. Clique em um dia para abrir o treino.</p></div></div>
      ${heatmap({ from: heatFrom, to, cells: trainingCells(heatList, heatFrom, to) })}
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Volume por semana</h2><p>Horas de treino somadas em cada semana.</p></div></div>
      <div class="plot sm"><canvas id="c-week" role="img" aria-label="Horas de treino por semana"></canvas></div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Todos os treinos</h2><p>${list.length} no período.</p></div></div>
      ${list.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>Data</th><th>Treino</th><th>Modalidade</th><th class="r">Distância</th><th class="r">Tempo</th><th class="r">Ritmo</th><th class="r">FC média</th><th class="r">Efeito</th><th></th></tr></thead>
        <tbody>${list.map((a) => `<tr data-go="#/treino/${a.id}">
          <td class="muted">${esc(fmtDay(a.start, a.start.slice(0, 4) === to.slice(0, 4) ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }))}</td>
          <td><b>${esc(a.name || typeName(a.type))}</b></td>
          <td class="muted">${esc(typeName(a.type))}</td>
          <td class="r num">${a.km ? `${num(a.km, 2)} km` : "—"}</td>
          <td class="r num">${duration(a.durationS)}</td>
          <td class="r num">${RUNS.has(a.type) && a.km ? `${pace(a.avgSpeed)} /km` : "—"}</td>
          <td class="r num">${num(a.avgHR)}</td>
          <td class="r num">${num(a.te, 1)}</td>
          <td class="r muted">${icon("chevRight")}</td></tr>`).join("")}</tbody>
      </table></div>` : emptyHtml("Nenhum treino nesse período", "Escolha um período maior acima.")}
    </section>`;

  scrollHeatToEnd(root);

  // Volume por semana: uma barra por semana, inclusive as sem treino.
  if (list.length) {
    const first = weekStart(list[list.length - 1].start.slice(0, 10));
    const weeks = [];
    for (let w = first; w <= to; w = addDays(w, 7)) weeks.push(w);
    const per = weeks.map((w) => list.filter((a) => weekStart(a.start.slice(0, 10)) === w));
    const hours = per.map((l) => sum(l.map((a) => a.durationS)) / 3600);
    mount("c-week", {
      type: "bar",
      data: { labels: weeks.map((w) => fmtDay(w)), datasets: [{ label: "Horas", data: hours, backgroundColor: css("--text"), borderRadius: 2, maxBarThickness: 18, categoryPercentage: 0.85, barPercentage: 0.8 }] },
      options: baseOptions({
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => `${v}h` } } },
        plugins: { tooltip: { callbacks: { title: (items) => `Semana de ${fmtDay(weeks[items[0].dataIndex])}`, label: (c) => `${duration(c.raw * 3600)} em ${per[c.dataIndex].length} treino${per[c.dataIndex].length === 1 ? "" : "s"}` } } },
      }),
    });
  }
}

