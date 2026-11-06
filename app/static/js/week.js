// Visão semanal de um indicador: média da semana, um gráfico com os sete dias e a lista dia a dia.
// Cada indicador escolhe o gráfico que melhor o explica (horário do sono, barras, faixas, linha, composição).
import { QUALITY } from "./metrics.js?v=5";
import { esc, num, avg, sum, fmtDay, addDays, parseDay, minutesText, sleepTime, hhmm, icon } from "./util.js?v=5";

const has = (v) => v != null && !Number.isNaN(v);
const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HRV_STATUS = { BALANCED: "equilibrada", UNBALANCED: "desequilibrada", LOW: "baixa", POOR: "baixa" };

export const weekStart = (iso) => addDays(iso, -parseDay(iso).getDay());

/** Horário em minutos a partir das 18:00, para que a noite fique contínua (23:00 vem antes de 02:00). */
const night = (t) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  let v = h * 60 + m;
  if (v < 18 * 60) v += 1440;
  return v - 1080;
};
const fmtNight = (v) => hhmm((v + 1080) % 1440);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const vals = (rows, k) => rows.map((r) => r[k]).filter(has);
const total = (rows, k) => sum(vals(rows, k));
const mean = (rows, k, d = 0) => (vals(rows, k).length ? num(avg(vals(rows, k)), d) : "—");
const days = (rows, k) => `${vals(rows, k).length} de 7`;
const unit = (v, u) => (has(v) ? `${num(v)} ${u}` : "—");

// ---------------------------------------------------------------- configuração por indicador

export const WEEK = {
  sleep: {
    kind: "sleep", avgLabel: "Média por noite",
    cols: [["Deitou → acordou", (r) => (r.bedtime ? `${r.bedtime} → ${r.wake}` : "—")], ["Dormiu", (r) => sleepTime(r.sleepH)], ["Nota", (r) => (r.sleepScore != null ? `${r.sleepScore}, ${QUALITY[r.sleepQuality] || ""}` : "—")], ["Profundo · REM", (r) => (r.deepMin != null ? `${minutesText(r.deepMin)} · ${minutesText(r.remMin)}` : "—")]],
    sum: (rows) => {
      const b = avg(rows.map((r) => night(r.bedtime))), w = avg(rows.map((r) => night(r.wake)));
      return [["Deitou em média", has(b) ? fmtNight(b) : "—"], ["Acordou em média", has(w) ? fmtNight(w) : "—"], ["Nota média", mean(rows, "sleepScore")], ["Noites registradas", days(rows, "sleepH")]];
    },
  },
  steps: {
    kind: "bars", goal: "stepGoal", avgLabel: "Média por dia",
    cols: [["Passos", (r) => num(r.steps)], ["Da meta", (r) => (r.stepGoal && has(r.steps) ? `${pct(r.steps, r.stepGoal)}%` : "—")], ["Distância", (r) => (has(r.distanceKm) && r.steps != null ? `${num(r.distanceKm, 1)} km` : "—")], ["Andares", (r) => num(r.floorsUp)]],
    sum: (rows) => [["Total", num(total(rows, "steps"))], ["Meta batida", `${rows.filter((r) => has(r.steps) && r.stepGoal && r.steps >= r.stepGoal).length} de ${vals(rows, "steps").length} dias`], ["Distância", `${num(total(rows.filter((r) => r.steps != null), "distanceKm"), 1)} km`], ["Andares", num(total(rows, "floorsUp"))]],
  },
  stress: {
    kind: "stress", avgLabel: "Média por dia",
    cols: [["Médio", (r) => num(r.stressAvg)], ["Máximo", (r) => num(r.stressMax)], ["Alto por", (r) => (r.stressAvg != null ? minutesText(r.stressMin?.high) : "—")], ["Em repouso", (r) => (r.stressAvg != null ? minutesText(r.stressMin?.rest) : "—")]],
    sum: (rows) => { const ok = rows.filter((r) => r.stressAvg != null); return [["Pico médio", mean(rows, "stressMax")], ["Estresse alto", minutesText(sum(ok.map((r) => r.stressMin?.high || 0)))], ["Repouso", minutesText(sum(ok.map((r) => r.stressMin?.rest || 0)))], ["Dias registrados", days(rows, "stressAvg")]]; },
  },
  calories: {
    kind: "kcal", avgLabel: "Média por dia",
    cols: [["Total", (r) => unit(r.kcal, "kcal")], ["Ativas", (r) => unit(r.kcalActive, "kcal")], ["Em repouso", (r) => unit(r.kcalRest, "kcal")]],
    sum: (rows) => [["Total da semana", unit(total(rows, "kcal"), "kcal")], ["Ativas no total", unit(total(rows, "kcalActive"), "kcal")], ["Ativas por dia", `${mean(rows, "kcalActive")} kcal`], ["Dias registrados", days(rows, "kcal")]],
  },
  battery: {
    kind: "range", lo: "bbMin", hi: "bbMax", fixed: [0, 100], avgLabel: "Pico médio",
    cols: [["Máximo", (r) => num(r.bbMax)], ["Mínimo", (r) => num(r.bbMin)], ["Carregou", (r) => num(r.bbCharged)], ["Gastou", (r) => num(r.bbDrained)]],
    sum: (rows) => [["Mínimo médio", mean(rows, "bbMin")], ["Carregou", num(total(rows, "bbCharged"))], ["Gastou", num(total(rows, "bbDrained"))], ["Dias registrados", days(rows, "bbMax")]],
  },
  rhr: {
    kind: "range", lo: "minHR", hi: "maxHR", dot: "restingHR", avgLabel: "Média em repouso",
    cols: [["Repouso", (r) => unit(r.restingHR, "bpm")], ["Mínima", (r) => unit(r.minHR, "bpm")], ["Máxima", (r) => unit(r.maxHR, "bpm")], ["No sono", (r) => unit(r.sleepHR, "bpm")]],
    sum: (rows) => [["Menor da semana", unit(Math.min(...vals(rows, "minHR")), "bpm")], ["Maior da semana", unit(Math.max(...vals(rows, "maxHR")), "bpm")], ["Média no sono", `${mean(rows, "sleepHR")} bpm`], ["Dias registrados", days(rows, "restingHR")]],
  },
  hr: {
    kind: "range", lo: "minHR", hi: "maxHR", dot: "restingHR", avgLabel: "Máxima média",
    cols: [["Máxima", (r) => unit(r.maxHR, "bpm")], ["Mínima", (r) => unit(r.minHR, "bpm")], ["Repouso", (r) => unit(r.restingHR, "bpm")], ["No sono", (r) => unit(r.sleepHR, "bpm")]],
    sum: (rows) => [["Maior da semana", unit(Math.max(...vals(rows, "maxHR")), "bpm")], ["Menor da semana", unit(Math.min(...vals(rows, "minHR")), "bpm")], ["Repouso médio", `${mean(rows, "restingHR")} bpm`], ["Dias registrados", days(rows, "maxHR")]],
  },
  hrv: {
    kind: "line", band: ["hrvLow", "hrvHigh"], avgLabel: "Média por noite",
    cols: [["Noite", (r) => unit(r.hrv, "ms")], ["Pico de 5 min", (r) => unit(r.hrvPeak5, "ms")], ["Média de 7 dias", (r) => unit(r.hrvWeekly, "ms")], ["Situação", (r) => HRV_STATUS[r.hrvStatus] || "—"]],
    sum: (rows) => { const last = [...rows].reverse().find((r) => r.hrvLow != null); return [["Faixa equilibrada", last ? `${last.hrvLow} a ${last.hrvHigh} ms` : "—"], ["Maior noite", unit(Math.max(...vals(rows, "hrv")), "ms")], ["Menor noite", unit(Math.min(...vals(rows, "hrv")), "ms")], ["Noites registradas", days(rows, "hrv")]]; },
  },
  resp: {
    kind: "line", avgLabel: "Média por dia",
    cols: [["Média", (r) => unit(r.respiration, "rpm")], ["Mínima", (r) => unit(r.respMin, "rpm")], ["Máxima", (r) => unit(r.respMax, "rpm")], ["No sono", (r) => unit(r.sleepRespAvg, "rpm")]],
  },
  balance: {
    kind: "bars", fixed: 100, avgLabel: "Média por dia",
    cols: [["No normal", (r) => (r.balanceKnown ? `${r.balanceIn.length} de ${r.balanceKnown}` : "—")], ["Fora do normal", (r) => r.balanceOut?.join(", ") || (r.balanceKnown ? "nenhum" : "—")]],
  },
  intensity: {
    kind: "bars", avgLabel: "Média por dia",
    cols: [["Pontos", (r) => unit(r.intensity, "min")], ["Moderados", (r) => unit(r.moderateMin, "min")], ["Vigorosos", (r) => unit(r.vigorousMin, "min")]],
    sum: (rows) => { const g = [...rows].reverse().find((r) => r.intensityGoal)?.intensityGoal; const t = total(rows, "intensity"); return [["Total da semana", `${num(t)} min`], ["Meta semanal", g ? `${num(g)} min (${pct(t, g)}%)` : "—"], ["Dias ativos", `${rows.filter((r) => r.intensity > 0).length} de 7`]]; },
  },
  floors: {
    kind: "bars", goal: "floorsGoal", avgLabel: "Média por dia",
    cols: [["Subidos", (r) => num(r.floorsUp)], ["Descidos", (r) => num(r.floorsDown)], ["Meta", (r) => num(r.floorsGoal)]],
    sum: (rows) => [["Total subidos", num(total(rows, "floorsUp"))], ["Total descidos", num(total(rows, "floorsDown"))], ["Dias registrados", days(rows, "floorsUp")]],
  },
};

const defaultSum = (m) => (rows) => {
  const v = vals(rows, m.key);
  const f = (x) => `${m.fmt(x)}${m.unit ? ` ${m.unit}` : ""}`;
  return [["Mínimo", v.length ? f(Math.min(...v)) : "—"], ["Máximo", v.length ? f(Math.max(...v)) : "—"], ["Dias registrados", `${v.length} de 7`]];
};

// ---------------------------------------------------------------- gráficos

function columns(rows, ctx, inner) {
  const m = ctx.metric;
  return rows.map((r, i) => {
    const future = r.date > ctx.today;
    const on = r.date === ctx.sel ? " on" : "";
    const attrs = future ? "disabled" : `data-go="${ctx.url(r.date)}" data-replace`;
    return `<button type="button" class="wk-col${on}" ${attrs} style="--i:${i}"${on ? ' aria-current="date"' : ""} aria-label="${esc(fmtDay(r.date, { weekday: "long", day: "numeric", month: "long" }))}${has(r[m.key]) ? `: ${m.fmt(r[m.key])}${m.unit ? ` ${m.unit}` : ""}` : future ? "" : ", sem dado"}">${future ? "" : inner(r, i)}</button>`;
  }).join("");
}

const hline = (y, label, cls = "") => `<div class="wk-line ${cls}" style="top:${y}%"><span>${esc(label)}</span></div>`;

function barsChart(m, cfg, rows, ctx, avgV) {
  const goals = cfg.goal ? rows.map((r) => r[cfg.goal]).filter(has) : [];
  const goal = goals.length ? goals[goals.length - 1] : null;
  const max = cfg.fixed || Math.max(1, ...vals(rows, m.key), goal || 0, avgV || 0) * 1.08;
  const y = (v) => 100 - (v / max) * 100;
  const cols = columns(rows, ctx, (r) => {
    const v = r[m.key];
    if (!has(v)) return '<span class="wk-none">—</span>';
    const h = Math.max(1.5, (v / max) * 100);
    return `<span class="wk-bar" style="height:${h}%"></span><span class="wk-v" style="bottom:${h}%">${m.fmt(v)}</span>`;
  });
  return `<div class="wk-area">${has(avgV) ? hline(y(avgV), `média ${m.fmt(avgV)}`) : ""}${has(goal) ? hline(y(goal), `meta ${num(goal)}`, "goal") : ""}${cols}</div>`;
}

function kcalChart(m, rows, ctx, avgV) {
  const max = Math.max(1, ...vals(rows, "kcal")) * 1.08;
  const cols = columns(rows, ctx, (r) => {
    if (!has(r.kcal)) return '<span class="wk-none">—</span>';
    const h = (r.kcal / max) * 100, act = r.kcal ? ((r.kcalActive || 0) / r.kcal) * 100 : 0;
    return `<span class="wk-bar stack" style="height:${h}%"><i style="flex:${100 - act}" class="rest"></i><i style="flex:${act}" class="act"></i></span><span class="wk-v" style="bottom:${h}%">${num(r.kcal)}</span>`;
  });
  return `<div class="wk-area">${has(avgV) ? hline(100 - (avgV / max) * 100, `média ${num(avgV)}`) : ""}${cols}</div>`;
}

function stressChart(rows, ctx) {
  const SEG = [["rest", "s1"], ["low", "s2"], ["medium", "s3"], ["high", "s4"]];
  const cols = columns(rows, ctx, (r) => {
    if (r.stressAvg == null) return '<span class="wk-none">—</span>';
    const s = r.stressMin || {};
    return `<span class="wk-bar stack full">${SEG.map(([k, c]) => `<i class="${c}" style="flex:${s[k] || 0}"></i>`).join("")}</span><span class="wk-v" style="bottom:100%">${num(r.stressAvg)}</span>`;
  });
  return `<div class="wk-area">${cols}</div>`;
}

function rangeChart(m, cfg, rows, ctx) {
  const all = rows.flatMap((r) => [r[cfg.lo], r[cfg.hi]]).filter(has);
  if (!all.length) return '<div class="wk-area"></div>';
  let [lo, hi] = cfg.fixed || [Math.min(...all), Math.max(...all)];
  if (!cfg.fixed) { const p = (hi - lo) * 0.12 || 5; lo -= p; hi += p; }
  const y = (v) => 100 - ((v - lo) / (hi - lo)) * 100;
  const cols = columns(rows, ctx, (r) => {
    const a = r[cfg.lo], b = r[cfg.hi];
    if (!has(a) || !has(b)) return '<span class="wk-none">—</span>';
    const t = y(b), h = Math.max(2, y(a) - t);
    const dot = cfg.dot && has(r[cfg.dot]) ? `<span class="wk-dot" style="top:${y(r[cfg.dot])}%" title="Repouso ${num(r[cfg.dot])}"></span>` : "";
    return `<span class="wk-bar float" style="top:${t}%;height:${h}%"></span>${dot}<span class="wk-v" style="bottom:${100 - t}%">${num(b)}</span><span class="wk-v lo" style="top:${t + h}%">${num(a)}</span>`;
  });
  return `<div class="wk-area">${cols}</div>`;
}

function lineChart(m, cfg, rows, ctx, avgV) {
  const v = vals(rows, m.key);
  if (!v.length) return '<div class="wk-area"></div>';
  const bandRow = cfg.band ? [...rows].reverse().find((r) => r[cfg.band[0]] != null) : null;
  const band = bandRow ? [bandRow[cfg.band[0]], bandRow[cfg.band[1]]] : null;
  let lo = Math.min(...v, ...(band || [])), hi = Math.max(...v, ...(band || []));
  const p = (hi - lo) * 0.25 || 4; lo -= p; hi += p;
  const y = (x) => 100 - ((x - lo) / (hi - lo)) * 100;
  let d = "", pen = false;
  rows.forEach((r, i) => {
    if (!has(r[m.key])) { pen = false; return; }
    d += `${pen ? "L" : "M"}${(i + 0.5) * 100} ${y(r[m.key]).toFixed(2)}`;
    pen = true;
  });
  const cols = columns(rows, ctx, (r) => (has(r[m.key]) ? `<span class="wk-pt" style="top:${y(r[m.key])}%"></span><span class="wk-v" style="bottom:${100 - y(r[m.key])}%">${m.fmt(r[m.key])}</span>` : '<span class="wk-none">—</span>'));
  const bandHtml = band ? `<div class="wk-band" style="top:${y(band[1])}%;height:${y(band[0]) - y(band[1])}%"><span>faixa equilibrada</span></div>` : "";
  return `<div class="wk-area">${bandHtml}${has(avgV) && !band ? hline(y(avgV), `média ${m.fmt(avgV)}`) : ""}<svg class="wk-svg" viewBox="0 0 700 100" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>${cols}</div>`;
}

function sleepChart(rows, ctx) {
  const beds = rows.map((r) => night(r.bedtime)).filter(has), wakes = rows.map((r) => night(r.wake)).filter(has);
  if (!beds.length) return { area: '<div class="wk-area"></div>', axis: "" };
  const t0 = Math.floor(Math.min(...beds) / 60) * 60 - 60, t1 = Math.ceil(Math.max(...wakes) / 60) * 60 + 60;
  const y = (t) => ((t - t0) / (t1 - t0)) * 100;
  const step = t1 - t0 > 12 * 60 ? 180 : 120;
  let grid = "", axis = "";
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    grid += `<div class="wk-grid" style="top:${y(t)}%"></div>`;
    axis += `<span style="top:${y(t)}%">${fmtNight(t)}</span>`;
  }
  const cols = columns(rows, ctx, (r) => {
    const b = night(r.bedtime), w = night(r.wake);
    if (!has(b) || !has(w)) return '<span class="wk-none">—</span>';
    const t = y(b), h = Math.max(2, y(w) - t);
    return `<span class="wk-v" style="bottom:${100 - t}%">${sleepTime(r.sleepH)}</span><span class="wk-bar float" style="top:${t}%;height:${h}%"></span>`;
  });
  return { area: `<div class="wk-area">${grid}${cols}</div>`, axis: `<div class="wk-axis">${axis}</div>` };
}

// ---------------------------------------------------------------- montagem

/** rows: 7 dias seguidos. prev: os 7 anteriores. ctx: { sel, today, url(d), weekNav: { prev, next } } */
export function weekHtml(m, rows, prev, ctx, middle = "") {
  ctx = { ...ctx, metric: m };
  const cfg = WEEK[m.id] || { kind: m.kind === "line" ? "line" : "bars", avgLabel: "Média por dia" };
  const v = vals(rows, m.key), pv = vals(prev, m.key);
  const avgV = v.length ? avg(v) : null, prevAvg = pv.length ? avg(pv) : null;
  const delta = has(avgV) && has(prevAvg) ? m.delta(avgV - prevAvg) : "";

  let chart, axis = "", yaxis = false;
  if (cfg.kind === "sleep") { const s = sleepChart(rows, ctx); chart = s.area; axis = s.axis; yaxis = true; }
  else if (cfg.kind === "kcal") chart = kcalChart(m, rows, ctx, avgV);
  else if (cfg.kind === "stress") chart = stressChart(rows, ctx);
  else if (cfg.kind === "range") chart = rangeChart(m, cfg, rows, ctx);
  else if (cfg.kind === "line") chart = lineChart(m, cfg, rows, ctx, avgV);
  else chart = barsChart(m, cfg, rows, ctx, avgV);

  const xlab = rows.map((r) => {
    const sub = cfg.kind === "sleep" ? `<em>${r.sleepScore != null ? `nota ${r.sleepScore}` : "&nbsp;"}</em>` : "";
    return `<span class="${r.date === ctx.sel ? "on" : ""}${r.date > ctx.today ? " fut" : ""}"><b>${WD[parseDay(r.date).getDay()]}</b> ${parseDay(r.date).getDate()}${sub}</span>`;
  }).join("");

  const legend = cfg.kind === "stress"
    ? `<div class="legend"><span><i class="s1"></i>Repouso</span><span><i class="s2"></i>Baixo</span><span><i class="s3"></i>Médio</span><span><i class="s4"></i>Alto</span><span class="muted">número no topo: média do dia</span></div>`
    : cfg.kind === "kcal" ? `<div class="legend"><span><i class="act"></i>Ativas</span><span><i class="rest"></i>Em repouso</span></div>`
    : cfg.kind === "range" ? `<div class="legend"><span class="muted">Cada barra vai da mínima à máxima do dia${cfg.dot ? "; o ponto é a FC de repouso" : ""}.</span></div>`
    : cfg.kind === "sleep" ? `<div class="legend"><span class="muted">Cada barra vai da hora em que você dormiu até a hora em que acordou.</span></div>` : "";

  const sumList = (cfg.sum || defaultSum(m))(rows);
  const first = rows[0].date, last = rows[6].date;
  const range = `${fmtDay(first, { day: "numeric", month: "short" })} – ${fmtDay(last, { day: "numeric", month: "short", year: "numeric" })}`;

  const list = rows.filter((r) => r.date <= ctx.today).map((r) => `<button type="button" class="wk-row${r.date === ctx.sel ? " on" : ""}" data-go="${ctx.url(r.date)}" data-replace style="--c:${cfg.cols.length}"${r.date === ctx.sel ? ' aria-current="date"' : ""}>
      <span class="wk-day"><b>${WD[parseDay(r.date).getDay()]}</b> ${esc(fmtDay(r.date))}</span>
      ${cfg.cols.map(([, f]) => `<span class="num">${esc(f(r))}</span>`).join("")}</button>`).reverse().join("");

  return `
    <section class="card wk">
      <div class="wk-top">
        <div>
          <span class="muted">${esc(cfg.avgLabel || "Média")}</span>
          <div class="val"><b class="num">${has(avgV) ? m.fmt(avgV) : "—"}</b>${m.unit && has(avgV) ? `<small>${m.unit}</small>` : ""}</div>
          <span class="muted">${esc(range)}${delta ? ` · ${esc(delta)} vs. semana anterior` : ""}</span>
        </div>
        <div class="stepper">
          <button class="step" type="button" ${ctx.weekNav.prev ? `data-go="${ctx.weekNav.prev}" data-replace` : "disabled"} aria-label="Semana anterior">${icon("chevLeft")}</button>
          <button class="step" type="button" ${ctx.weekNav.next ? `data-go="${ctx.weekNav.next}" data-replace` : "disabled"} aria-label="Próxima semana">${icon("chevRight")}</button>
        </div>
      </div>
      <dl class="wk-sum">${sumList.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd class="num">${esc(val)}</dd></div>`).join("")}</dl>
      <div class="wk-plot${yaxis ? " yaxis" : ""} k-${cfg.kind}">${axis}${chart}</div>
      <div class="wk-x${yaxis ? " yaxis" : ""}">${xlab}</div>
      ${legend}
    </section>
    ${middle}
    <section class="card wk-days">
      <div class="section-head"><div><h2>Dia a dia</h2><p>Escolha um dia no gráfico ou nesta lista; os detalhes aparecem logo abaixo do gráfico.</p></div></div>
      <div class="wk-row head" style="--c:${cfg.cols.length}"><span>Dia</span>${cfg.cols.map(([l]) => `<span>${esc(l)}</span>`).join("")}</div>
      ${list}
    </section>`;
}
