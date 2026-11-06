// Cartões da tela inicial e das páginas de resumo. Cada um mostra um dado, o dia escolhido e a tendência recente.
import { METRICS, QUALITY, normalRange, statusOf } from "./metrics.js";
import { esc, num, avg, fmtDay, addDays, minutesText, sleepTime, hhmm, cap, icon, parseDay, typeName, duration } from "./util.js";

const has = (v) => v != null && !Number.isNaN(v);
const WEEKDAY = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const ZONE_COLORS = ["#4a3328", "#8a4a26", "#d4571a", "#ff7a1f", "#ffb43a"];

/** Valor de um indicador no dia. Hoje, o que ainda acumula vem de row.live e é marcado como parcial. */
export function valueOf(m, row) {
  if (!row) return { v: null };
  if (has(row[m.key])) return { v: row[m.key] };
  const live = row.live?.[m.key];
  return has(live) ? { v: live, partial: true } : { v: null };
}

const when = (ctx, partial) => (ctx.isToday ? (partial ? "Hoje, até agora" : "Hoje") : cap(fmtDay(ctx.sel, { weekday: "short", day: "numeric", month: "short" })));

function head(title, { chip = "", go = true, ic = "pulse" } = {}) {
  return `<header class="card-h"><span class="tile">${icon(ic)}</span><h3>${esc(title)}</h3>${chip}${go ? `<span class="go">${icon("arrowUpRight")}</span>` : ""}</header>`;
}

function chipFor(v, mean) {
  if (!has(v) || !has(mean) || mean === 0) return "";
  const p = ((v - mean) / Math.abs(mean)) * 100;
  if (Math.abs(p) < 2) return '<span class="chip">Estável</span>';
  const d = Math.abs(p) < 10 ? 1 : 0;
  return `<span class="chip">${icon(p > 0 ? "arrowUp" : "arrowDown")}${num(Math.abs(p), d)}%</span>`;
}

const axis = (ctx) => `<div class="axis"><span>${esc(fmtDay(ctx.win[0].date))}</span><span>${ctx.isToday ? "Hoje" : esc(fmtDay(ctx.sel))}</span></div>`;
const letters = (rows, cls = "") => rows.map((r, i) => `<span class="${i === rows.length - 1 ? "on" : ""}">${WEEKDAY[parseDay(r.date).getDay()]}</span>`).join("");

function barsViz(m, vals, mean, ctx) {
  const max = Math.max(m.max || 0, ...vals.filter(has), 1);
  const bars = vals.map((v, i) => {
    const tip = `${fmtDay(ctx.win[i].date)}: ${has(v) ? `${m.fmt(v)}${m.unit ? ` ${m.unit}` : ""}` : "sem dado"}`;
    return `<i class="${i === vals.length - 1 ? "on" : ""}${has(v) ? "" : " nil"}" style="height:${has(v) ? Math.max(6, (v / max) * 100) : 5}%" data-tip="${esc(tip)}"></i>`;
  }).join("");
  const line = has(mean) ? `<div class="avg" style="bottom:${Math.min(100, (mean / max) * 100)}%"><span>média ${m.fmt(mean)}</span></div>` : "";
  return `<div class="viz"><div class="bars14">${line}${bars}</div>${axis(ctx)}</div>`;
}

function lineViz(m, vals, mean, ctx) {
  const have = vals.filter(has);
  if (have.length < 2) return `<div class="viz"><p class="muted">Poucos dias com dado.</p></div>`;
  let lo = Math.min(...have, has(mean) ? mean : Infinity), hi = Math.max(...have, has(mean) ? mean : -Infinity);
  if (hi === lo) { hi += 1; lo -= 1; }
  const padv = (hi - lo) * 0.18;
  lo -= padv; hi += padv;
  const x = (i) => (i / (vals.length - 1)) * 100;
  const y = (v) => 100 - ((v - lo) / (hi - lo)) * 100;
  let d = "", pen = false, last = null;
  vals.forEach((v, i) => {
    if (!has(v)) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`;
    pen = true;
    last = [x(i), y(v)];
  });
  const line = has(mean) ? `<div class="avg" style="top:${y(mean)}%"><span style="top:-18px;bottom:auto">média ${m.fmt(mean)}</span></div>` : "";
  const dot = last && has(vals[vals.length - 1]) ? `<span class="pt" style="left:${last[0]}%;top:${last[1]}%"></span>` : "";
  return `<div class="viz"><div class="line14"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>${line}${dot}</div>${axis(ctx)}</div>`;
}

function rangeViz(ctx, lo, hi, fixed) {
  const days = ctx.win.slice(-7);
  const pairs = days.map((r) => [r[lo] ?? null, r[hi] ?? null]);
  const flat = pairs.flat().filter(has);
  if (!flat.length) return "";
  const gmin = fixed ? fixed[0] : Math.min(...flat), gmax = fixed ? fixed[1] : Math.max(...flat);
  const span = Math.max(1, gmax - gmin);
  const cols = pairs.map(([a, b], i) => {
    const on = i === pairs.length - 1 ? " on" : "";
    if (!has(a) || !has(b)) return `<div class="rg-col${on}"><div class="rg-t"></div></div>`;
    const top = (1 - (b - gmin) / span) * 100, h = Math.max(9, ((b - a) / span) * 100);
    return `<div class="rg-col${on}" data-tip="${esc(`${fmtDay(days[i].date)}: ${num(a)} a ${num(b)}`)}"><div class="rg-t"><div class="rg-b" style="top:${Math.min(top, 100 - h)}%;height:${h}%"></div></div></div>`;
  }).join("");
  return `<div class="viz"><div class="rg">${cols}</div><div class="sblocks-l" style="margin-top:10px">${letters(days)}</div></div>`;
}

function stageExtra(row) {
  const parts = [["Profundo", row.deepMin, "var(--s-deep)"], ["REM", row.remMin, "var(--s-rem)"], ["Leve", row.lightMin, "var(--s-light)"]];
  const total = parts.reduce((t, p) => t + (p[1] || 0), 0);
  if (!total) return "";
  return `<div class="stages">${parts.map(([, v, c]) => `<i style="flex:${v || 0};background:${c}"></i>`).join("")}</div>
    <div class="legend">${parts.map(([l, v, c]) => `<span><i style="background:${c}"></i>${l} ${minutesText(v)}</span>`).join("")}</div>`;
}

function seriesFor(m, ctx) {
  const last = ctx.win[ctx.win.length - 1];
  const { v, partial } = valueOf(m, last);
  const vals = ctx.win.map((r, i) => (i === ctx.win.length - 1 ? v : r[m.key] ?? null));
  const prior = vals.slice(0, -1).filter(has);
  const mean = prior.length >= 3 ? avg(prior) : null;
  return { last, v, partial, vals, mean };
}

const RANGE_OF = { rhr: ["minHR", "maxHR", null], battery: ["bbMin", "bbMax", [0, 100]] };

export function metricCard(id, ctx, opts = {}) {
  if (id === "stress") return stressCard(ctx, opts);
  const m = METRICS[id];
  const { last, v, partial, vals, mean } = seriesFor(m, ctx);
  const cls = `card${opts.span ? ` ${opts.span}` : ""}`;
  const live = last.live && partial ? { ...last, ...last.live } : last;
  const hint = has(v) ? m.hint(live) : "";
  let body;
  if (!has(v)) {
    body = `<div class="val"><b>—</b></div><p class="sub">Sem dado neste dia.</p>`;
  } else {
    const sub = `<p class="sub">${esc(id === "sleep" || id === "hrv" ? m.sub : when(ctx, partial))}${hint ? ` · ${esc(hint)}` : ""}</p>`;
    const value = `<div class="val"><b class="num">${m.fmt(v)}</b>${m.unit ? `<small>${m.unit}</small>` : ""}</div>`;
    if (id === "steps") {
      const p = live.stepGoal ? Math.min(100, (v / live.stepGoal) * 100) : 0;
      body = `<div class="val-row">${value}<div class="ring"><i style="--p:${p.toFixed(0)}"></i><b class="num">${live.stepGoal ? `${Math.round(p)}%` : ""}</b></div></div>${sub}${barsViz(m, vals, mean, ctx)}`;
    } else if (RANGE_OF[id]) {
      const [lo, hi, fixed] = RANGE_OF[id];
      body = `${value}${sub}${rangeViz(ctx, lo, hi, fixed)}`;
    } else {
      body = `${value}${sub}${id === "sleep" ? stageExtra(last) : ""}${m.kind === "line" ? lineViz(m, vals, mean, ctx) : barsViz(m, vals, mean, ctx)}`;
    }
  }
  return `<article class="${cls}" data-go="#/m/${id}" tabindex="0" role="link" aria-label="${esc(m.label)}">${head(m.label, { ic: m.icon, chip: has(v) ? chipFor(v, mean) : "" })}${body}</article>`;
}

function stressCard(ctx, opts = {}) {
  const m = METRICS.stress;
  const { last, v, partial, mean } = seriesFor(m, ctx);
  const days = ctx.win.slice(-7);
  const SEG = [["rest", "rgba(255,255,255,.16)", "Repouso"], ["low", "#8a4a26", "Baixo"], ["medium", "#ff7a1f", "Médio"], ["high", "#ffc247", "Alto"]];
  const cols = days.map((r, i) => {
    const s = r.stressMin || {};
    const segs = SEG.map(([k, c]) => `<i style="flex:${s[k] || 0};background:${c}"></i>`).join("");
    return `<div class="col${i === days.length - 1 ? " on" : ""}" data-tip="${esc(`${fmtDay(r.date)}: alto por ${minutesText(s.high)}`)}">${segs}</div>`;
  }).join("");
  const hasDist = days.some((r) => r.stressMin);
  return `<article class="card${opts.span ? ` ${opts.span}` : ""}" data-go="#/m/stress" tabindex="0" role="link" aria-label="Estresse">
    ${head("Estresse", { ic: "wave", chip: has(v) ? chipFor(v, mean) : "" })}
    <div class="val"><b class="num">${has(v) ? num(v) : "—"}</b><small>média</small></div>
    <p class="sub">${esc(when(ctx, partial))}${has(v) && last.stressMin?.high != null ? ` · alto por ${minutesText((last.stressMin || {}).high)}` : ""}</p>
    ${hasDist ? `<div class="viz"><div class="sblocks">${cols}</div><div class="sblocks-l">${letters(days)}</div>
      <div class="legend">${SEG.map(([, c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join("")}</div></div>` : ""}
  </article>`;
}

// ---------------------------------------------------------------- gauge da Body Battery

const BB_STATE = (v) => (v >= 76 ? "alta" : v >= 51 ? "moderada" : v >= 26 ? "baixa" : "muito baixa");

export function gaugeCard(ctx, { span = "" } = {}) {
  const m = METRICS.battery;
  const row = ctx.win[ctx.win.length - 1];
  const v = ctx.isToday ? row.bbLatest ?? row.bbMax : row.bbMax;
  if (!has(v)) return `<article class="card hot${span ? ` ${span}` : ""}">${head("Energia", { ic: "battery", go: false })}<p class="note">Sem leituras de Body Battery neste dia.</p></article>`;
  const N = 44, cx = 150, cy = 150, r1 = 108, r2 = 132, a0 = -125, a1 = 125;
  let ticks = "";
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1), ang = ((a0 + (a1 - a0) * f) * Math.PI) / 180;
    const x1 = cx + r1 * Math.sin(ang), y1 = cy - r1 * Math.cos(ang), x2 = cx + r2 * Math.sin(ang), y2 = cy - r2 * Math.cos(ang);
    const on = f * 100 <= v ? ` f${f > 0.7 ? " hi" : ""}` : "";
    ticks += `<line class="t${on}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return `<article class="card hot${span ? ` ${span}` : ""}" data-go="#/m/battery" tabindex="0" role="link" aria-label="Body Battery">
    ${head("Energia", { ic: "battery", chip: `<span class="chip">${ctx.isToday ? "agora" : "pico do dia"}</span>` })}
    <div class="gauge-wrap"><svg viewBox="0 0 300 230" aria-hidden="true">${ticks}</svg>
      <div class="gauge-c"><b class="num">${num(v)}<small>/100</small></b><span>${esc(m.label)}</span></div></div>
    <p class="gauge-t">Energia e recuperação</p>
    <p class="gauge-s">Reserva ${BB_STATE(v)}${row.bbMin != null ? ` · mínimo do dia ${num(row.bbMin)}` : ""}</p>
    <div class="rows"><div class="r"><span>Carregou</span><b class="num">${num(row.bbCharged)}</b></div><div class="r"><span>Gastou</span><b class="num">${num(row.bbDrained)}</b></div></div>
    ${barsViz(m, ctx.win.map((r) => r.bbMax ?? null), null, ctx)}
  </article>`;
}

// ---------------------------------------------------------------- equilíbrio (indicadores no seu normal)

function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function wavePts(rows, key) {
  const v = rows.map((r) => r[key]);
  const have = v.filter(has);
  if (have.length < 3) return [];
  const lo = Math.min(...have), hi = Math.max(...have), s = Math.max(1e-6, hi - lo);
  return v.map((x, i) => (has(x) ? [(i / (rows.length - 1)) * 1000, 90 - ((x - lo) / s) * 80] : null)).filter(Boolean);
}

export function balanceCard(ctx, { span = "" } = {}) {
  const row = ctx.win[ctx.win.length - 1];
  let known = 0, inside = 0;
  for (const id of ["battery", "sleep", "steps", "stress", "hrv", "rhr"]) {
    const m = METRICS[id];
    const { v, partial } = valueOf(m, row);
    if (!has(v) || partial) continue;
    const st = statusOf(v, normalRange(m, ctx.all.filter((r) => r.date !== ctx.sel), row));
    if (!st) continue;
    known++;
    if (st === "in") inside++;
  }
  const score = known ? Math.round((inside / known) * 100) : null;
  const label = score == null ? "Sem histórico suficiente" : score >= 75 ? "Ótimo equilíbrio" : score >= 50 ? "Bom equilíbrio" : "Atenção aos sinais";
  const hrvP = smoothPath(wavePts(ctx.win, "hrv")), slP = smoothPath(wavePts(ctx.win, "sleepH"));
  const sleepAvg = avg(ctx.win.map((r) => r.sleepH)), bbAvg = avg(ctx.win.map((r) => r.bbMax));
  return `<article class="card bal${span ? ` ${span}` : ""}" data-go="#/vitais" tabindex="0" role="link" aria-label="Equilíbrio">
    ${head("Equilíbrio", { ic: "target", chip: '<span class="chip">14 dias</span>' })}
    <div class="bal-n num">${score == null ? "—" : score}</div>
    <div class="bal-t">${label}</div>
    <p class="sub">${known ? `${inside} de ${known} indicadores dentro do seu normal` : "Sincronize o relógio para calcular"}</p>
    <div class="waves"><svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path class="w2" d="${slP}"/><path class="w1" d="${hrvP}"/></svg></div>
    <div class="legend" style="justify-content:center"><span><i style="background:var(--accent-hi)"></i>HRV</span><span><i style="background:#fff"></i>Sono</span><span>cada linha na sua própria escala</span></div>
    <div class="trio"><div><span>Sono médio</span><b class="num">${has(sleepAvg) ? sleepTime(sleepAvg) : "—"}</b></div>
      <div class="mid"><span>Detalhes</span><a href="#/vitais" aria-label="Abrir sinais vitais">${icon("arrowUpRight")}</a></div>
      <div><span>Body Battery médio</span><b class="num">${has(bbAvg) ? num(bbAvg) : "—"}</b></div></div>
  </article>`;
}

// ---------------------------------------------------------------- batimentos do dia (onda) e curvas

export function curveHtml(points, { lo, hi, xMax = 1440, tall = false } = {}) {
  if (!points?.length) return "";
  const vs = points.map((p) => p[1]);
  lo ??= Math.min(...vs); hi ??= Math.max(...vs);
  if (hi === lo) { hi += 1; lo -= 1; }
  const span = hi - lo, top = lo - span * 0.1, bot = hi + span * 0.1;
  const X = (m) => (m / xMax) * 1000;
  const Y = (v) => 100 - ((v - top) / (bot - top)) * 100;
  const line = points.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(2)}`).join("");
  const area = `${line}L${X(points[points.length - 1][0]).toFixed(1)} 100L${X(points[0][0]).toFixed(1)} 100Z`;
  const end = points[points.length - 1];
  return `<div class="curve${tall ? " tall" : ""}"><svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:#ff6a1f" stop-opacity=".45"/><stop offset="1" style="stop-color:#ff6a1f" stop-opacity="0"/></linearGradient></defs>
    <path class="ar" d="${area}"/><path class="ln" d="${line}"/></svg>
    <span class="pt" style="left:${(X(end[0]) / 10).toFixed(2)}%;top:${Y(end[1]).toFixed(2)}%"></span></div>`;
}

export function hrCard(ctx, { span = "" } = {}) {
  return `<article class="card${span ? ` ${span}` : ""}" data-go="#/m/hr" tabindex="0" role="link" aria-label="Frequência cardíaca" data-fill="hr">
    ${head("Frequência cardíaca", { ic: "heart" })}<div class="skel"></div></article>`;
}

export function fillHr(el, day, ctx) {
  const h = day?.hr;
  const pts = h?.points || [];
  if (!pts.length) {
    el.innerHTML = `${head("Frequência cardíaca", { ic: "heart" })}<p class="note">Sem batimentos registrados neste dia.</p>`;
    return;
  }
  const B = 64, buckets = Array.from({ length: B }, () => []);
  for (const [m, v] of pts) buckets[Math.min(B - 1, Math.floor((m / 1440) * B))].push(v);
  const bv = buckets.map((b) => (b.length ? avg(b) : null));
  const have = bv.filter(has), lo = Math.min(...have), hi = Math.max(...have), s = Math.max(1, hi - lo);
  const peak = bv.indexOf(hi);
  const bars = bv.map((v, i) => `<i class="${i === peak ? "pk" : ""}" style="height:${has(v) ? 18 + ((v - lo) / s) * 82 : 5}%"${has(v) ? "" : ' data-empty'}></i>`).join("");
  const mean = avg(pts.map((p) => p[1]));
  el.innerHTML = `${head("Frequência cardíaca", { ic: "heart", chip: `<span class="chip">${esc(ctx.isToday ? "hoje" : fmtDay(ctx.sel))}</span>` })}
    <div class="val"><b class="num">${num(mean)}</b><small>bpm de média</small></div>
    <div class="viz"><div class="wave" role="img" aria-label="Batimentos ao longo do dia">${bars}</div>
      <div class="axis"><span>00:00</span><span>12:00</span><span>24:00</span></div></div>
    <div class="trio"><div><span>Mínima</span><b class="num">${num(h.min)}</b></div><div class="mid"><span>Em repouso</span><b class="num">${num(h.resting)}</b></div><div><span>Máxima</span><b class="num">${num(h.max)}</b></div></div>`;
}

// ---------------------------------------------------------------- insight do dia

export function insightText(ctx) {
  const r = ctx.win[ctx.win.length - 1];
  const parts = [];
  if (has(r.sleepH)) parts.push(`Você dormiu <b>${sleepTime(r.sleepH)}</b>${r.sleepScore != null ? `, com nota <b>${r.sleepScore}</b>` : ""}.`);
  const prior = ctx.win.slice(0, -1).map((x) => x.hrv).filter(has);
  if (has(r.hrv) && prior.length >= 3) {
    const p = ((r.hrv - avg(prior)) / avg(prior)) * 100;
    parts.push(Math.abs(p) < 3 ? "Seu HRV está na média dos últimos 14 dias." : `Seu HRV está <b>${num(Math.abs(p))}% ${p > 0 ? "acima" : "abaixo"}</b> da média dos últimos 14 dias.`);
  }
  const bb = ctx.isToday ? r.bbLatest ?? r.bbMax : r.bbMax;
  if (has(bb)) parts.push(`Body Battery em <b>${num(bb)}</b>.`);
  return parts.join(" ") || "Sincronize o relógio no Garmin Connect para ver o resumo do dia.";
}

// ---------------------------------------------------------------- calendário

export function calendarCard(ctx, acts, { span = "" } = {}) {
  const sel = parseDay(ctx.sel);
  const end = ctx.today < addDays(ctx.sel, 4) ? ctx.today : addDays(ctx.sel, 4);
  const dates = Array.from({ length: 10 }, (_, i) => addDays(end, i - 9));
  const strip = dates.map((d) => {
    const r = ctx.byDate.get(d);
    const data = r && (r.sleepH != null || r.hrv != null || r.restingHR != null);
    return `<button type="button" class="${data ? "has" : ""}" data-go="${ctx.url(d)}" data-replace ${d === ctx.sel ? 'aria-current="true"' : ""} aria-label="${esc(fmtDay(d, { weekday: "long", day: "numeric", month: "long" }))}">${WEEKDAY[parseDay(d).getDay()]}<span class="num">${parseDay(d).getDate()}</span><i></i></button>`;
  }).join("");
  const prev = addDays(ctx.sel, -1), next = addDays(ctx.sel, 1);
  const canNext = next <= ctx.today;
  const canPrev = ctx.byDate.has(prev) || prev >= ctx.firstDate;
  const wk = ctx.week;
  const latest = acts?.[0];
  return `<article class="card${span ? ` ${span}` : ""}">
    ${head("Calendário", { ic: "calendar", go: false })}
    <h2 class="cal-m">${cap(MONTHS[sel.getMonth()])} <span class="muted">${sel.getFullYear()}</span></h2>
    <div class="strip">${strip}</div>
    <div class="cal-nav">
      <button class="step" type="button" ${canPrev ? `data-go="${ctx.url(prev)}" data-replace` : "disabled"} aria-label="Dia anterior">${icon("chevLeft")}</button>
      <button class="step" type="button" ${canNext ? `data-go="${ctx.url(next)}" data-replace` : "disabled"} aria-label="Próximo dia">${icon("chevRight")}</button>
      ${ctx.isToday ? "" : `<a class="link" href="${ctx.url(ctx.today)}" data-replace>Voltar para hoje</a>`}
    </div>
    ${wk ? `<p class="cal-t">Treinos nos últimos 7 dias</p>
    <div class="mini3" style="margin-top:8px;padding-top:0"><div><b class="num">${wk.count}</b><span>treinos</span></div><div><b class="num">${wk.seconds ? duration(wk.seconds) : "0 min"}</b><span>de treino</span></div><div><b class="num">${num(wk.km, 1)}</b><span>km</span></div></div>` : ""}
    ${latest ? `<a class="last" href="#/treino/${latest.id}"><span class="list-main"><b>${esc(latest.name || typeName(latest.type))}</b><span class="muted">${esc(typeName(latest.type))}, ${esc(fmtDay(latest.start))}</span></span><span class="num">${latest.km ? `${num(latest.km, 1)} km` : duration(latest.durationS)}</span></a>` : ""}
  </article>`;
}

// ---------------------------------------------------------------- semana

const WEEK_ROWS = [
  ["battery", "Body Battery", ""], ["sleep", "Sono", ""], ["steps", "Passos", ""], ["stress", "Estresse", ""],
  ["hrv", "HRV", "ms"], ["rhr", "FC repouso", "bpm"], ["intensity", "Esforço", "min"],
];

export function weekCard(ctx) {
  const days = ctx.win.slice(-7);
  const head7 = days.map((r) => {
    const d = parseDay(r.date);
    return `<button type="button" class="h${r.date === ctx.sel ? " sel" : ""}" data-go="${ctx.url(r.date)}" data-replace><b>${cap(d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""))}</b> ${d.getDate()}</button>`;
  }).join("");
  const rows = WEEK_ROWS.map(([id, label, unit]) => {
    const m = METRICS[id];
    const vals = days.map((r) => valueOf(m, r).v);
    const max = Math.max(m.max || 0, ...vals.filter(has), 1);
    const cells = days.map((r, i) => {
      const v = vals[i];
      return `<button type="button" class="c${has(v) ? "" : " none"}${r.date === ctx.sel ? " sel" : ""}" data-go="#/m/${id}?d=${r.date}">${has(v) ? m.fmt(v) : "—"}<em><i style="width:${has(v) ? Math.max(4, (v / max) * 100) : 0}%"></i></em></button>`;
    }).join("");
    return `<div class="k">${esc(label)}${unit ? ` <small>${unit}</small>` : ""}</div>${cells}`;
  }).join("");
  return `<section class="section span4">
    <div class="section-head"><div><h2>Sua semana</h2><p>Clique em um dia para trocar a tela inteira, ou em um valor para abrir o indicador.</p></div></div>
    <div class="week-scroll"><div class="week"><div></div>${head7}${rows}</div></div>
  </section>`;
}

// ---------------------------------------------------------------- calorias, corpo e nutrição

export function caloriesCard(ctx, { span = "" } = {}) {
  const m = METRICS.calories;
  const last = ctx.win[ctx.win.length - 1];
  const { v, partial } = valueOf(m, last);
  const live = { ...last, ...(last.live || {}) };
  const share = has(v) && v ? Math.min(100, ((live.kcalActive || 0) / v) * 100) : 0;
  return `<article class="card${span ? ` ${span}` : ""}" data-go="#/m/calories" tabindex="0" role="link" aria-label="Calorias" data-fill="food">
    ${head("Calorias", { ic: "flame" })}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px">
      <div><span class="muted">Consumidas</span><div class="val" style="margin-top:6px"><b class="num" data-eaten style="font-size:34px">—</b><small>kcal</small></div></div>
      <div><span class="muted">Gastas${partial ? " até agora" : ""}</span><div class="val" style="margin-top:6px"><b class="num" style="font-size:34px">${has(v) ? num(v) : "—"}</b><small>kcal</small></div></div>
    </div>
    <span class="prog" aria-hidden="true"><i style="width:${share}%"></i></span>
    <div class="rows"><div class="r"><span>Em repouso</span><b class="num">${has(live.kcalRest) ? `${num(live.kcalRest)} kcal` : "—"}</b></div><div class="r"><span>Ativas</span><b class="num">${has(live.kcalActive) ? `${num(live.kcalActive)} kcal` : "—"}</b></div></div>
    <p class="note" data-foodnote>Consumo vem do diário alimentar do Garmin Connect.</p>
  </article>`;
}

export function fillFood(el, day) {
  const f = day?.food;
  const eaten = el.querySelector("[data-eaten]");
  const note = el.querySelector("[data-foodnote]");
  if (f?.kcal != null && eaten) eaten.textContent = num(f.kcal);
  if (note) note.textContent = f?.items?.length ? `${f.items.length} alimentos em ${f.meals || 1} refeições no diário.` : "Nenhum alimento registrado neste dia no diário do Garmin Connect.";
}

export function weightCard(ctx, { span = "" } = {}) {
  return `<article class="card${span ? ` ${span}` : ""}" data-go="#/corpo" tabindex="0" role="link" aria-label="Peso" data-fill="weight">${head("Peso", { ic: "scale" })}<div class="skel"></div></article>`;
}

export function fillWeight(el, profile, ctx) {
  const ws = profile?.weights || [];
  if (!ws.length) {
    el.innerHTML = `${head("Peso", { ic: "scale" })}<div class="val"><b>—</b></div><p class="sub">Nenhum peso registrado</p>
      <p class="empty-note">O Life Track só lê dados. Registre seu peso no Garmin Connect ou com uma balança Garmin.</p>`;
    return;
  }
  const last = ws[ws.length - 1];
  const delta = ws.length > 1 ? last.kg - ws[0].kg : null;
  el.innerHTML = `${head("Peso", { ic: "scale", chip: delta != null ? `<span class="chip">${icon(delta > 0 ? "arrowUp" : "arrowDown")}${num(Math.abs(delta), 1)} kg</span>` : "" })}
    <div class="val"><b class="num">${num(last.kg, 1)}</b><small>kg</small></div>
    <p class="sub">Último registro em ${esc(fmtDay(last.date, { day: "numeric", month: "short", year: "numeric" }))}</p>
    <div class="rows"><div class="r"><span>IMC</span><b class="num">${last.bmi != null ? num(last.bmi, 1) : profile?.fitnessAge?.bmi != null ? num(profile.fitnessAge.bmi, 1) : "—"}</b></div>
    <div class="r"><span>Gordura corporal</span><b class="num">${last.fat != null ? `${num(last.fat, 1)}%` : "sem medição"}</b></div>
    <div class="r"><span>Registros no último ano</span><b class="num">${ws.length}</b></div></div>`;
}

export function fitnessCard(span = "") {
  return `<article class="card${span ? ` ${span}` : ""}" data-go="#/corpo" tabindex="0" role="link" aria-label="Idade física" data-fill="fitness">${head("Idade física", { ic: "hourglass" })}<div class="skel"></div></article>`;
}

export function fillFitness(el, profile) {
  const f = profile?.fitnessAge;
  if (!f) { el.innerHTML = `${head("Idade física", { ic: "hourglass" })}<p class="note">A Garmin ainda não calculou a idade física.</p>`; return; }
  const diff = f.age != null && f.fitness != null ? f.age - f.fitness : null;
  const pctV = f.vigorousTarget ? Math.min(100, ((f.vigorousMinutes || 0) / f.vigorousTarget) * 100) : 0;
  el.innerHTML = `${head("Idade física", { ic: "hourglass" })}
    <div class="val"><b class="num">${num(f.fitness)}</b><small>anos</small></div>
    <p class="sub">Sua idade é ${num(f.age)}${diff ? `, ${num(Math.abs(diff))} anos ${diff > 0 ? "a menos" : "a mais"}` : ""}</p>
    <span class="prog" aria-hidden="true"><i style="width:${pctV}%"></i></span>
    <div class="rows"><div class="r"><span>Minutos vigorosos por semana</span><b class="num">${num(f.vigorousMinutes, 1)} de ${num(f.vigorousTarget)}</b></div>
    <div class="r"><span>Dias vigorosos por semana</span><b class="num">${num(f.vigorousDays, 1)} de ${num(f.vigorousDaysTarget)}</b></div>
    <div class="r"><span>FC de repouso usada</span><b class="num">${num(f.rhr)} bpm</b></div></div>`;
}

export function zonesCard(span = "") {
  return `<article class="card${span ? ` ${span}` : ""}" data-go="#/m/hr" tabindex="0" role="link" aria-label="Zonas de frequência cardíaca" data-fill="zones">${head("Zonas de FC", { ic: "target" })}<div class="skel"></div></article>`;
}

const ZONE_METHOD = { HR_MAX: "porcentagem da FC máxima", HRR: "reserva de FC", LTHR: "limiar de lactato" };

export function fillZones(el, profile) {
  const z = profile?.zones;
  if (!z) { el.innerHTML = `${head("Zonas de FC", { ic: "target" })}<p class="note">Zonas não disponíveis.</p>`; return; }
  const floors = z.floors, top = z.max;
  const rows = floors.map((f, i) => {
    const hi = i < 4 ? floors[i + 1] - 1 : top;
    const span = top - floors[0];
    const w = span ? ((hi - f + 1) / span) * 100 : 0, off = span ? ((f - floors[0]) / span) * 100 : 0;
    return `<div class="bar-row" style="grid-template-columns:64px minmax(0,1fr) auto;padding:6px 0"><span>Zona ${i + 1}</span><span class="track"><i style="margin-left:${off}%;width:${Math.min(100 - off, w)}%;background:${ZONE_COLORS[i]}"></i></span><span class="num">${f} a ${hi}</span></div>`;
  }).join("");
  el.innerHTML = `${head("Zonas de FC", { ic: "target" })}<p class="sub" style="margin-top:14px">Em bpm, por ${esc(ZONE_METHOD[z.method] || "método personalizado")}. Máxima ${num(top)}, repouso ${num(z.resting)}.</p><div class="bars" style="margin-top:8px">${rows}</div>`;
}

export function waterCard(span = "") {
  return `<article class="card${span ? ` ${span}` : ""}" tabindex="0" aria-label="Hidratação" data-fill="water">${head("Hidratação", { ic: "droplet", go: false })}<div class="skel"></div></article>`;
}

export function fillWater(el, profile, ctx) {
  const list = profile?.water || [];
  const e = list.find((x) => (x.calendarDate || x.date) === ctx.sel);
  const ml = e?.valueInML ?? e?.intakeInML ?? null;
  if (ml == null) {
    el.innerHTML = `${head("Hidratação", { ic: "droplet", go: false })}<div class="val"><b>—</b></div><p class="sub">${list.length ? "Nada registrado neste dia" : "Nenhum registro nos últimos 30 dias"}</p>
      <p class="empty-note">Registre a água no Garmin Connect ou no relógio e ela aparece aqui.</p>`;
    return;
  }
  const goal = e.goalInML;
  el.innerHTML = `${head("Hidratação", { ic: "droplet", go: false })}<div class="val"><b class="num">${num(ml / 1000, 1)}</b><small>litros</small></div><p class="sub">${goal ? `meta ${num(goal / 1000, 1)} L` : ""}</p>
    ${goal ? `<span class="prog"><i style="width:${Math.min(100, (ml / goal) * 100)}%"></i></span>` : ""}`;
}

export function spo2Card(span = "") {
  return `<article class="card${span ? ` ${span}` : ""}" tabindex="0" aria-label="Oxigênio no sangue" data-fill="spo2">${head("Oxigênio (SpO2)", { ic: "droplet", go: false })}<div class="skel"></div></article>`;
}

export function fillSpo2(el, day) {
  const s = day?.spo2;
  const v = s?.avg ?? s?.sleepAvg;
  if (v == null) {
    el.innerHTML = `${head("Oxigênio (SpO2)", { ic: "droplet", go: false })}<div class="val"><b>—</b></div><p class="sub">Sem medição neste dia</p>
      <p class="empty-note">O relógio não mediu oxigênio. Ative o Pulse Ox nas configurações do relógio para registrar.</p>`;
    return;
  }
  el.innerHTML = `${head("Oxigênio (SpO2)", { ic: "droplet", go: false })}<div class="val"><b class="num">${num(v)}</b><small>%</small></div>
    <p class="sub">${s.avg != null ? "Média do dia" : "Média no sono"} · mínima ${num(s.lowest)}%</p>`;
}

// ---------------------------------------------------------------- curvas dedicadas (páginas de vitais e corpo)

export function bbCurveCard(ctx, span = "") {
  return `<article class="card${span ? ` ${span}` : ""}" data-fill="bbcurve">${head("Body Battery ao longo do dia", { ic: "battery", go: false })}<div class="skel"></div></article>`;
}

const BB_EVENT = { SLEEP: "Sono", ACTIVITY: "Treino", NAP: "Cochilo", RECOVERY: "Recuperação", STRESS: "Estresse" };

export function fillBbCurve(el, day) {
  const b = day?.bb;
  const pts = b?.points || [];
  if (!pts.length) { el.innerHTML = `${head("Body Battery ao longo do dia", { ic: "battery", go: false })}<p class="note">Sem leituras neste dia.</p>`; return; }
  const events = (b.events || []).map((e) => `<div class="r"><span>${esc(BB_EVENT[e.type] || cap(String(e.type || "").toLowerCase()))}${e.minutes ? `, ${minutesText(e.minutes)}` : ""}</span><b class="num">${e.impact > 0 ? "+" : ""}${num(e.impact)}</b></div>`).join("");
  el.innerHTML = `${head("Body Battery ao longo do dia", { ic: "battery", go: false, chip: b.charged != null ? `<span class="chip">+${num(b.charged)} / −${num(b.drained)}</span>` : "" })}
    <p class="sub" style="margin-top:12px">Leituras do dia escolhido, de 0 a 100.</p>
    <div class="viz">${curveHtml(pts, { lo: 0, hi: 100, tall: true })}<div class="axis"><span>00:00</span><span>12:00</span><span>24:00</span></div></div>
    ${events ? `<div class="rows">${events}</div>` : ""}`;
}

export function hrvNightCard(ctx, span = "") {
  return `<article class="card${span ? ` ${span}` : ""}" data-go="#/m/hrv" tabindex="0" role="link" aria-label="HRV da noite" data-fill="hrvnight">${head("HRV durante a noite", { ic: "pulse" })}<div class="skel"></div></article>`;
}

export function fillHrvNight(el, day) {
  const h = day?.hrv;
  const r = h?.readings || [];
  if (!r.length) { el.innerHTML = `${head("HRV durante a noite", { ic: "pulse" })}<p class="note">Sem leituras de HRV nesta noite.</p>`; return; }
  const toMin = (t) => { const [a, b] = t.split(":").map(Number); const m = a * 60 + b; return a < 12 ? m + 1440 : m; };
  const pts = r.map((x) => [toMin(x.t), x.v]);
  const start = pts[0][0], end = pts[pts.length - 1][0];
  const norm = pts.map((p) => [p[0] - start, p[1]]);
  el.innerHTML = `${head("HRV durante a noite", { ic: "pulse", chip: h.status ? `<span class="chip">${{ BALANCED: "Equilibrada", UNBALANCED: "Desequilibrada", LOW: "Baixa", POOR: "Baixa" }[h.status] || esc(h.status)}</span>` : "" })}
    <div class="val"><b class="num">${num(h.lastNight)}</b><small>ms</small></div>
    <p class="sub">Média da noite · pico de 5 min ${num(h.peak5)} · faixa ${num(h.low)} a ${num(h.high)} ms</p>
    <div class="viz">${curveHtml(norm, { xMax: Math.max(1, end - start), tall: true })}<div class="axis"><span>${hhmm(start)}</span><span>${hhmm(end)}</span></div></div>`;
}

export function foodCard(ctx, span = "") {
  return `<article class="card${span ? ` ${span}` : ""}" data-fill="foodlog">${head("Diário alimentar", { ic: "fork", go: false })}<div class="skel"></div></article>`;
}

export function fillFoodLog(el, day) {
  const f = day?.food;
  if (!f?.items?.length) {
    el.innerHTML = `${head("Diário alimentar", { ic: "fork", go: false })}<div class="val"><b>—</b></div><p class="sub">Nada registrado neste dia</p>
      <p class="empty-note">As refeições vêm do diário alimentar do Garmin Connect. Quando você registrar, calorias, proteínas, carboidratos e gorduras aparecem aqui.</p>`;
    return;
  }
  const macro = (label, v) => `<div class="r"><span>${label}</span><b class="num">${v != null ? `${num(v)} g` : "—"}</b></div>`;
  el.innerHTML = `${head("Diário alimentar", { ic: "fork", go: false })}<div class="val"><b class="num">${num(f.kcal)}</b><small>kcal</small></div><p class="sub">${f.items.length} alimentos</p>
    <div class="rows">${macro("Proteínas", f.protein)}${macro("Carboidratos", f.carbs)}${macro("Gorduras", f.fat)}</div>
    <div class="rows">${f.items.slice(0, 6).map((i) => `<div class="r"><span>${esc(i.name || "Alimento")}</span><b class="num">${i.kcal != null ? `${num(i.kcal)} kcal` : "—"}</b></div>`).join("")}</div>`;
}

export const qualityText = (q) => QUALITY[q] || q;
export { sleepTime };
