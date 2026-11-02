// Indicador: um dia em destaque, outros dias no gráfico, no mapa de calor e na tabela.
import { loadOverview, loadDay, loadProfile, hasOverview } from "../api.js";
import { METRICS, normalRange, statusOf, toneOf, STATUS_TEXT } from "../metrics.js";
import { mount, baseOptions, legendTop, dayTitle, css } from "../charts.js";
import { heatmap, levelize, scrollHeatToEnd } from "../heatmap.js";
import { loadingHtml, emptyHtml, fillDays, barsHtml } from "../ui.js";
import { go } from "../nav.js";
import { esc, num, avg, fmtDay, addDays, minutesText, hhmm, icon } from "../util.js";

const RANGES = [[30, "30 dias"], [90, "90 dias"], [180, "6 meses"], [365, "1 ano"]];
const url = (id, d, r, x) => `#/m/${id}?d=${d}&r=${r}${x ? "&x=1" : ""}`;
let live = null;

/** Seta esquerda e direita trocam de dia. */
export function stepDay(dir) {
  if (!live) return;
  const i = live.dates.indexOf(live.sel), j = i + dir;
  if (j < 0 || j >= live.dates.length) return;
  go(url(live.id, live.dates[j], live.r, live.x), { replace: true });
}

const withUnit = (m, v) => `${m.fmt(v)}${m.unit ? ` ${m.unit}` : ""}`;

function chartConfig(m, rows, selIdx, pick) {
  const dates = rows.map((r) => r.date);
  const labels = dates.map((d) => fmtDay(d));
  const text = css("--text"), muted = css("--muted");
  const n = rows.length;
  const hasData = new Set(rows.filter((r) => r[m.key] != null).map((r) => r.date));

  const interact = {
    onClick: (e, _els, chart) => {
      const p = chart.getElementsAtEventForMode(e, "index", { intersect: false }, true);
      if (p.length && hasData.has(dates[p[0].index])) pick(dates[p[0].index]);
    },
    onHover: (e, els, chart) => { chart.canvas.style.cursor = els.length ? "pointer" : "default"; },
  };
  const options = (extra = {}) => baseOptions({
    ...interact,
    plugins: { selectedBand: { index: selIdx }, tooltip: { callbacks: { title: (items) => dayTitle(dates[items[0].dataIndex]) } } },
    ...extra,
  });
  const merge = (extra) => {
    const o = options();
    return {
      ...o,
      ...extra,
      plugins: { ...o.plugins, ...(extra.plugins || {}), tooltip: { ...o.plugins.tooltip, ...(extra.plugins?.tooltip || {}), callbacks: { ...o.plugins.tooltip.callbacks, ...(extra.plugins?.tooltip?.callbacks || {}) } } },
      scales: { x: { ...o.scales.x, ...(extra.scales?.x || {}) }, y: { ...o.scales.y, ...(extra.scales?.y || {}) } },
    };
  };
  const radius = rows.map((_, i) => (i === selIdx ? 4 : n > 60 ? 0 : 2));
  const bar = { borderRadius: 2, maxBarThickness: 16, categoryPercentage: 0.85, barPercentage: 0.8 };
  const line = (label, data, extra = {}) => ({
    type: "line", label, data, borderColor: text, backgroundColor: text, borderWidth: 1.5, tension: 0,
    pointRadius: radius, pointHoverRadius: 4, pointBackgroundColor: text, pointBorderWidth: 0, spanGaps: true, ...extra,
  });
  const val = (c) => `${m.label}: ${withUnit(m, c.raw)}`;

  switch (m.id) {
    case "sleep": {
      const stage = (label, key, color) => ({ label, data: rows.map((r) => (r[key] == null ? null : r[key] / 60)), backgroundColor: color, stack: "s", ...bar, borderRadius: 1 });
      return {
        type: "bar",
        data: { labels, datasets: [stage("Profundo", "deepMin", css("--s-deep")), stage("REM", "remMin", css("--s-rem")), stage("Leve", "lightMin", css("--s-light")), stage("Acordado", "awakeMin", css("--s-awake"))] },
        options: merge({
          scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: (v) => `${v}h` } } },
          plugins: { legend: legendTop, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${minutesText(c.raw * 60)}` } } },
        }),
      };
    }
    case "hrv":
      return {
        type: "line",
        data: { labels, datasets: [
          { type: "line", label: "Faixa mínima", data: rows.map((r) => r.hrvLow ?? null), borderColor: "transparent", pointRadius: 0, spanGaps: true, order: 3 },
          { type: "line", label: "Faixa equilibrada", data: rows.map((r) => r.hrvHigh ?? null), borderColor: "transparent", backgroundColor: "rgba(255,255,255,0.09)", fill: "-1", pointRadius: 0, spanGaps: true, order: 3 },
          line("Noite", rows.map((r) => r.hrv ?? null), { order: 1 }),
          { type: "line", label: "Média de 7 dias", data: rows.map((r) => r.hrvWeekly ?? null), borderColor: muted, borderDash: [4, 4], borderWidth: 1.25, pointRadius: 0, spanGaps: true, order: 2 },
        ] },
        options: merge({
          plugins: { crosshair: { enabled: true }, legend: { ...legendTop, labels: { ...legendTop.labels, filter: (i) => i.text !== "Faixa mínima" } },
            tooltip: { filter: (c) => c.dataset.label !== "Faixa mínima", callbacks: { label: (c) => `${c.dataset.label}: ${num(c.raw)} ms` } } },
        }),
      };
    case "rhr":
    case "resp":
    case "hr":
      return { type: "line", data: { labels, datasets: [line(m.label, rows.map((r) => r[m.key] ?? null))] }, options: merge({ plugins: { crosshair: { enabled: true }, tooltip: { callbacks: { label: val } } } }) };
    case "battery":
      return {
        type: "bar",
        data: { labels, datasets: [{ label: m.label, data: rows.map((r) => (r.bbMin == null ? null : [r.bbMin, r.bbMax])), backgroundColor: text, ...bar }] },
        options: merge({ scales: { y: { min: 0, max: 100 } }, plugins: { tooltip: { callbacks: { label: (c) => `De ${num(c.raw[0])} a ${num(c.raw[1])}` } } } }),
      };
    case "steps":
      return {
        type: "bar",
        data: { labels, datasets: [
          { label: "Passos", data: rows.map((r) => r.steps ?? null), backgroundColor: text, ...bar, order: 2 },
          { type: "line", label: "Meta", data: rows.map((r) => r.stepGoal ?? null), borderColor: muted, borderDash: [4, 4], borderWidth: 1.25, pointRadius: 0, stepped: "middle", spanGaps: true, order: 1 },
        ] },
        options: merge({ plugins: { legend: legendTop, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${num(c.raw)}` } } } }),
      };
    case "calories": {
      const part = (label, key, color) => ({ label, data: rows.map((r) => r[key] ?? null), backgroundColor: color, stack: "k", ...bar, borderRadius: 1 });
      return {
        type: "bar",
        data: { labels, datasets: [part("Em repouso", "kcalRest", css("--s-light")), part("Ativas", "kcalActive", text)] },
        options: merge({ scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { legend: legendTop, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${num(c.raw)} kcal` } } } }),
      };
    }
    default: // estresse, esforço, andares
      return {
        type: "bar",
        data: { labels, datasets: [{ label: m.label, data: rows.map((r) => r[m.key] ?? null), backgroundColor: text, ...bar }] },
        options: merge({ scales: { y: { min: 0, ...(m.max ? { max: m.max } : {}) } }, plugins: { tooltip: { callbacks: { label: val } } } }),
      };
  }
}

function scoreConfig(rows, selIdx, pick) {
  const dates = rows.map((r) => r.date);
  const text = css("--text");
  const n = rows.length;
  return {
    type: "line",
    data: { labels: dates.map((d) => fmtDay(d)), datasets: [{
      label: "Nota", data: rows.map((r) => r.sleepScore ?? null), borderColor: text, backgroundColor: text, borderWidth: 1.5, tension: 0,
      pointRadius: rows.map((_, i) => (i === selIdx ? 4 : n > 60 ? 0 : 2)), pointBackgroundColor: text, pointBorderWidth: 0, spanGaps: true,
    }] },
    options: baseOptions({
      onClick: (e, _els, chart) => {
        const p = chart.getElementsAtEventForMode(e, "index", { intersect: false }, true);
        if (p.length && rows[p[0].index].sleepScore != null) pick(dates[p[0].index]);
      },
      scales: { y: { min: 0, max: 100 } },
      plugins: { selectedBand: { index: selIdx }, crosshair: { enabled: true }, tooltip: { callbacks: { title: (items) => dayTitle(dates[items[0].dataIndex]), label: (c) => `Nota: ${num(c.raw)} de 100` } } },
    }),
  };
}

const INTRA = {
  hr: { title: "Frequência cardíaca no dia", about: "Batimentos ao longo das 24 horas de" },
  bb: { title: "Body Battery no dia", about: "Leituras de energia ao longo de" },
  hrv: { title: "HRV durante a noite", about: "Leituras de HRV na noite que terminou em" },
};

function intraOptions(unit, extra = {}) {
  const muted = css("--muted");
  return baseOptions({
    interaction: { mode: "nearest", axis: "x", intersect: false },
    scales: { x: { type: "linear", min: 0, max: 1440, ticks: { stepSize: 180, callback: (v) => hhmm(v), color: muted } }, y: { ticks: { callback: (v) => `${v}` } } },
    plugins: { crosshair: { enabled: true }, tooltip: { callbacks: { title: (i) => hhmm(i[0].parsed.x), label: (c) => `${num(c.parsed.y)} ${unit}` } } },
    ...extra,
  });
}

async function loadIntraday(kind, sel, alive) {
  let day;
  try { day = await loadDay(sel); } catch (e) { document.getElementById("intra-extra")?.insertAdjacentHTML("beforeend", `<p class="note">Não foi possível carregar o detalhe do dia: ${esc(e.message)}</p>`); return; }
  if (!alive() || !document.getElementById("c-intra")) return;
  const text = css("--text");
  const dataset = (pts) => ({ data: pts.map((p) => ({ x: p[0], y: p[1] })), borderColor: text, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3, tension: 0, fill: true, parsing: false });
  const extra = document.getElementById("intra-extra");
  const empty = (t) => { document.getElementById("c-intra").closest(".plot").outerHTML = `<p class="muted">${t}</p>`; };

  if (kind === "hr") {
    const pts = day.hr.points;
    if (!pts.length) return empty("Sem batimentos registrados neste dia.");
    mount("c-intra", { type: "line", data: { datasets: [dataset(pts)] }, options: intraOptions("bpm") });
    // Tempo em cada zona, contando cada leitura como 2 minutos.
    loadProfile().then((p) => {
      if (!alive() || !p.zones) return;
      const floors = p.zones.floors;
      const mins = [0, 0, 0, 0, 0, 0];
      for (const [, v] of pts) mins[floors.filter((f) => v >= f).length] += 2;
      const names = ["Abaixo da zona 1", "Zona 1", "Zona 2", "Zona 3", "Zona 4", "Zona 5"];
      const colors = ["#2f2f2f", "#4a4a4a", "#6c6c6c", "#9a9a9a", "#cfcfcf", "#f4f4f4"];
      const total = mins.reduce((a, b) => a + b, 0);
      extra.innerHTML = barsHtml({ title: "Tempo em cada zona de frequência", items: mins.map((v, i) => ({ label: names[i], value: v, total, color: colors[i], text: `${minutesText(v)} · ${Math.round((v / total) * 100)}%` })) });
    }).catch(() => {});
  } else if (kind === "bb") {
    const pts = day.bb.points;
    if (!pts.length) return empty("Sem leituras de Body Battery neste dia.");
    mount("c-intra", { type: "line", data: { datasets: [{ ...dataset(pts), pointRadius: 3 }] }, options: intraOptions("", { scales: { x: { type: "linear", min: 0, max: 1440, ticks: { stepSize: 180, callback: (v) => hhmm(v) } }, y: { min: 0, max: 100 } } }) });
    const NAMES = { SLEEP: "Sono", ACTIVITY: "Treino", NAP: "Cochilo", RECOVERY: "Recuperação" };
    const ev = day.bb.events || [];
    if (ev.length) extra.innerHTML = `<dl class="facts" style="margin-top:20px">${ev.map((e) => `<div class="fact"><dt>${esc(NAMES[e.type] || e.type)}${e.minutes ? `, ${minutesText(e.minutes)}` : ""}</dt><dd class="num">${e.impact > 0 ? "+" : ""}${num(e.impact)}</dd></div>`).join("")}</dl>`;
  } else {
    const r = day.hrv.readings;
    if (!r.length) return empty("Sem leituras de HRV nesta noite.");
    const toMin = (t) => { const [a, b] = t.split(":").map(Number); return (a < 12 ? a + 24 : a) * 60 + b; };
    const pts = r.map((x) => [toMin(x.t), x.v]);
    const lo = pts[0][0], hi = pts[pts.length - 1][0];
    const band = (v) => pts.map((p) => ({ x: p[0], y: v }));
    mount("c-intra", {
      type: "line",
      data: { datasets: [
        dataset(pts),
        ...(day.hrv.low != null ? [{ data: band(day.hrv.low), borderColor: css("--muted"), borderDash: [4, 4], borderWidth: 1, pointRadius: 0, parsing: false }, { data: band(day.hrv.high), borderColor: css("--muted"), borderDash: [4, 4], borderWidth: 1, pointRadius: 0, parsing: false }] : []),
      ] },
      options: intraOptions("ms", { scales: { x: { type: "linear", min: lo, max: hi, ticks: { maxTicksLimit: 7, callback: (v) => hhmm(v) } }, y: { ticks: { callback: (v) => `${v}` } } }, plugins: { crosshair: { enabled: true }, tooltip: { filter: (c) => c.datasetIndex === 0, callbacks: { title: (i) => hhmm(i[0].parsed.x), label: (c) => `${num(c.parsed.y)} ms` } } } }),
    });
    if (day.hrv.low != null) extra.innerHTML = `<p class="muted" style="margin-top:12px">As linhas tracejadas mostram a sua faixa equilibrada, de ${num(day.hrv.low)} a ${num(day.hrv.high)} ms.</p>`;
  }
}

export async function renderMetric(root, { id, q }, alive) {
  const m = METRICS[id];
  if (!m) { root.innerHTML = emptyHtml("Indicador não encontrado", "Volte para a página inicial e escolha um dos indicadores."); return; }
  if (!hasOverview(365)) root.innerHTML = loadingHtml(`Buscando ${m.label.toLowerCase()} do último ano`);
  const ov = await loadOverview(365);
  if (!alive()) return;

  const r = RANGES.some(([v]) => v === Number(q.r)) ? Number(q.r) : 30;
  const expanded = q.x === "1";
  const start = addDays(ov.end, -(r - 1));
  const rows = fillDays(ov.days, start, ov.end);
  const byDate = new Map(ov.days.map((d) => [d.date, d]));
  const withData = rows.filter((x) => x[m.key] != null);
  if (!withData.length) {
    root.innerHTML = `<a class="crumb" href="#/">${icon("chevLeft")} Hoje</a>${emptyHtml(`Sem dados de ${m.label.toLowerCase()}`, "Nenhum registro nesse período. Escolha um período maior ou sincronize o relógio com o aplicativo Garmin Connect.")}`;
    return;
  }
  const dates = withData.map((x) => x.date);
  const sel = dates.includes(q.d) ? q.d : dates[dates.length - 1];
  const row = byDate.get(sel);
  const selIdx = rows.findIndex((x) => x.date === sel);
  live = { id, dates, sel, r, x: expanded };

  // Resumo do período
  const values = withData.map((x) => x[m.key]);
  const mean = avg(values);
  const hi = withData.reduce((a, b) => (b[m.key] > a[m.key] ? b : a));
  const lo = withData.reduce((a, b) => (b[m.key] < a[m.key] ? b : a));
  const before = fillDays(ov.days, addDays(start, -r), addDays(start, -1)).map((x) => x[m.key]);
  const prevMean = before.filter((v) => v != null).length >= 5 ? avg(before) : null;

  // Situação do dia
  const range = normalRange(m, rows.filter((x) => x.date !== sel), row);
  const status = statusOf(row[m.key], range);
  const tone = toneOf(m, status);
  const dayDelta = mean == null ? null : row[m.key] - avg(withData.filter((x) => x.date !== sel).map((x) => x[m.key]));
  const idx = dates.indexOf(sel);
  const prevDay = dates[idx - 1], nextDay = dates[idx + 1];
  const groups = m.groups ? m.groups(row) : [];
  const note = m.note ? m.note(row) : "";

  // Mapa de calor do ano inteiro
  const level = levelize(ov.days.map((d) => d[m.key]));
  const cells = new Map();
  for (let d = ov.start; d <= ov.end; d = addDays(d, 1)) {
    const v = byDate.get(d)?.[m.key];
    cells.set(d, { level: level(v), tip: `${fmtDay(d)}: ${v == null ? "sem dado" : withUnit(m, v)}`, href: v == null ? undefined : url(id, d, r, expanded), replace: true });
  }

  const list = [...withData].reverse();
  const shown = expanded ? list : list.slice(0, 14);
  const [c1, c2] = m.cols;

  root.innerHTML = `
    <a class="crumb" href="#/">${icon("chevLeft")} Hoje</a>
    <div class="page-head">
      <div><h1>${esc(m.label)}</h1><p class="muted">${esc(m.about)}</p></div>
      <div class="tabs" role="group" aria-label="Período">
        ${RANGES.map(([v, t]) => `<a href="${url(id, sel, v, expanded)}" data-replace${v === r ? ' aria-current="true"' : ""}>${t}</a>`).join("")}
      </div>
    </div>

    <section class="day">
      <div class="day-main">
        <div class="daynav">
          <button class="step" type="button" ${prevDay ? `data-go="${url(id, prevDay, r, expanded)}" data-replace` : "disabled"} aria-label="Dia anterior">${icon("chevLeft")}</button>
          <span class="when">${esc(fmtDay(sel, { weekday: "long", day: "numeric", month: "long" }))}</span>
          <button class="step" type="button" ${nextDay ? `data-go="${url(id, nextDay, r, expanded)}" data-replace` : "disabled"} aria-label="Próximo dia">${icon("chevRight")}</button>
        </div>
        <div class="big num">${m.fmt(row[m.key])}${m.unit ? `<small>${m.unit}</small>` : ""}</div>
        <p class="status"><i class="dot tone-${tone}"></i><span>${status ? `${STATUS_TEXT[status]}, entre ${m.fmt(range[0])} e ${m.fmt(range[1])}${m.unit ? ` ${m.unit}` : ""}.` : "Ainda sem histórico suficiente para definir o seu normal."}</span></p>
        ${dayDelta != null ? `<p class="muted">${m.delta(dayDelta)} em relação à média do período.</p>` : ""}
      </div>
      <div class="day-more">
        <dl class="facts">${m.facts(row).map(([k, v]) => `<div class="fact"><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`).join("")}</dl>
        ${note ? `<p class="note" style="margin-top:18px">${esc(note)}</p>` : ""}
        ${groups.map(barsHtml).join("")}
      </div>
    </section>

    ${m.intraday ? `<section class="section" id="intra-sec">
      <div class="section-head"><div><h2>${INTRA[m.intraday].title}</h2><p>${INTRA[m.intraday].about} ${esc(fmtDay(sel, { weekday: "long", day: "numeric", month: "long" }))}.</p></div></div>
      <div class="plot sm"><canvas id="c-intra" role="img" aria-label="${INTRA[m.intraday].title}"></canvas></div>
      <div id="intra-extra"></div>
    </section>` : ""}

    <section class="section">
      <div class="section-head"><div><h2>Dia a dia</h2><p>Clique em um dia para ver os detalhes. Use as setas do teclado para andar entre os dias.</p></div></div>
      <div class="plot"><canvas id="c-main" role="img" aria-label="${esc(m.label)} por dia"></canvas></div>
      ${id === "sleep" ? `<div class="section-head sub"><div><h2>Nota de sono</h2></div></div><div class="plot sm"><canvas id="c-score" role="img" aria-label="Nota de sono por dia"></canvas></div>` : ""}
    </section>

    <section class="stats">
      <div class="stat"><span class="muted">Média</span><span class="num">${withUnit(m, mean)}</span>${prevMean != null ? `<span class="muted">${m.delta(mean - prevMean)} vs. período anterior</span>` : ""}</div>
      <div class="stat"><span class="muted">Mais baixo</span><span class="num">${withUnit(m, lo[m.key])}</span><span class="muted">${esc(fmtDay(lo.date))}</span></div>
      <div class="stat"><span class="muted">Mais alto</span><span class="num">${withUnit(m, hi[m.key])}</span><span class="muted">${esc(fmtDay(hi.date))}</span></div>
      <div class="stat"><span class="muted">Dias com dado</span><span class="num">${withData.length} de ${rows.length}</span></div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>O ano inteiro</h2><p>Cada quadrado é um dia. Quanto mais claro, maior o valor.</p></div></div>
      ${heatmap({ from: ov.start, to: ov.end, cells, selected: sel })}
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Todos os dias</h2><p>${withData.length} dias nesse período.</p></div></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Dia</th><th class="r">${esc(m.label)}</th><th class="r">${esc(c1[0])}</th><th class="r">${esc(c2[0])}</th></tr></thead>
        <tbody>${shown.map((x) => `<tr data-go="${url(id, x.date, r, expanded)}" data-replace aria-selected="${x.date === sel}">
          <td>${esc(fmtDay(x.date, { weekday: "short", day: "numeric", month: "short" }))}</td>
          <td class="r num">${withUnit(m, x[m.key])}</td><td class="r num muted">${esc(c1[1](x))}</td><td class="r num muted">${esc(c2[1](x))}</td></tr>`).join("")}</tbody>
      </table></div>
      ${!expanded && list.length > shown.length ? `<p class="more"><a class="link" href="${url(id, sel, r, true)}" data-replace>Mostrar todos os ${list.length} dias</a></p>` : ""}
    </section>`;

  // Adia a troca de tela: o Chart.js ainda está tratando o clique e quebra se for destruído nesse momento.
  const pick = (d) => setTimeout(() => go(url(id, d, r, expanded), { replace: true }), 0);
  mount("c-main", chartConfig(m, rows, selIdx, pick));
  if (id === "sleep") mount("c-score", scoreConfig(rows, selIdx, pick));
  if (m.intraday) loadIntraday(m.intraday, sel, alive);
  scrollHeatToEnd(root);
}
