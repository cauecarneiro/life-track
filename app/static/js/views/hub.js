// Páginas de resumo (início, sinais vitais, corpo, nutrição): cartões do dia escolhido.
// O dia vem de ?d=AAAA-MM-DD. Dados que exigem outra chamada (curva do dia, perfil) entram depois, sem travar a tela.
import { loadOverview, loadActivities, loadDay, loadProfile, hasOverview, hasActivities } from "../api.js";
import * as C from "../cards.js";
import { heatmap, scrollHeatToEnd } from "../heatmap.js";
import { trainingCells, totals, between } from "../acts.js";
import { loadingHtml, fillDays } from "../ui.js";
import { esc, num, fmtDay, today, addDays, diffDays, duration, typeName, icon, cap } from "../util.js";

const PAGES = {
  home: { base: "#/", title: null },
  vitais: { base: "#/vitais", title: "Sinais vitais", about: "Coração, respiração, oxigênio e estresse, do dia escolhido." },
  corpo: { base: "#/corpo", title: "Corpo", about: "Energia, peso, idade física e zonas de frequência cardíaca." },
  nutricao: { base: "#/nutricao", title: "Nutrição", about: "Calorias gastas e consumidas, hidratação e diário alimentar." },
};

const DAY_FILL = { hr: "hr", food: "food", foodlog: "foodlog", spo2: "spo2", bbcurve: "bbcurve", hrvnight: "hrvnight" };
const PROFILE_FILL = ["weight", "fitness", "zones", "water"];

// O dia só vale como padrão quando a noite já sincronizou; senão a home abriria vazia.
const hasAny = (r) => r && (r.sleepH != null || r.hrv != null);

function layout(page, ctx, acts) {
  const m = (id, o) => C.metricCard(id, ctx, o);
  switch (page) {
    case "vitais":
      return [m("hrv"), m("rhr", { hi: true }), m("resp"), C.spo2Card(),
        C.hrCard(ctx, { span: "span2" }), C.hrvNightCard(ctx, "span2"),
        m("stress"), m("intensity"), C.zonesCard(), C.fitnessCard()];
    case "corpo":
      return [m("battery", { hi: true }), C.weightCard(ctx), C.fitnessCard(), C.zonesCard(),
        C.bbCurveCard(ctx, "span3"), m("floors"),
        m("steps"), C.caloriesCard(ctx), C.waterCard(), m("sleep")];
    case "nutricao":
      return [C.caloriesCard(ctx, { span: "span2" }), C.foodCard(ctx, "span2"),
        C.waterCard(), C.weightCard(ctx), m("steps"), m("intensity")];
    default:
      return [m("battery", { hi: true }), m("hrv"), m("rhr"), C.calendarCard(ctx, acts),
        m("sleep", { hi: true }), m("intensity"), C.hrCard(ctx),
        m("steps"), m("stress"), m("resp"), C.caloriesCard(ctx),
        C.weightCard(ctx), C.fitnessCard(), C.zonesCard(), C.waterCard()];
  }
}

function dayBar(page, ctx) {
  const p = PAGES[page];
  const prev = addDays(ctx.sel, -1), next = addDays(ctx.sel, 1);
  return `<div class="page-head">
    <div><h1>${esc(p.title)}</h1><p class="muted">${esc(p.about)}</p></div>
    <div class="daynav">
      <button class="step" type="button" data-go="${ctx.url(prev)}" data-replace aria-label="Dia anterior">${icon("chevLeft")}</button>
      <span class="when">${esc(ctx.isToday ? "Hoje" : fmtDay(ctx.sel, { weekday: "long", day: "numeric", month: "long" }))}</span>
      <button class="step" type="button" ${next <= ctx.today ? `data-go="${ctx.url(next)}" data-replace` : "disabled"} aria-label="Próximo dia">${icon("chevRight")}</button>
      ${ctx.isToday ? "" : `<a class="link" href="${ctx.url(ctx.today)}" data-replace>Hoje</a>`}
    </div></div>`;
}

export async function renderHub(root, route, alive, page = "home") {
  const now = today();
  const wanted = /^\d{4}-\d{2}-\d{2}$/.test(route.q.d || "") && route.q.d <= now ? route.q.d : null;
  const span = wanted && diffDays(now, wanted) > 25 ? 365 : 30;
  const homeNeeds = page === "home";
  if (!hasOverview(span) || (homeNeeds && !hasActivities())) root.innerHTML = loadingHtml("Buscando seus dados na Garmin");
  const [ov, acts] = await Promise.all([loadOverview(span), homeNeeds ? loadActivities() : null]);
  if (!alive()) return;
  loadOverview(365).catch(() => {}); // aquece o cache para abrir os indicadores rápido

  const byDate = new Map(ov.days.map((d) => [d.date, d]));
  let sel = wanted;
  if (!sel) {
    sel = now;
    if (!hasAny(byDate.get(now))) {
      const last = [...ov.days].reverse().find(hasAny);
      if (last) sel = last.date;
    }
  }
  const base = PAGES[page].base;
  const ctx = {
    sel, today: now, isToday: sel === now, byDate, firstDate: ov.start,
    win: fillDays(ov.days, addDays(sel, -13), sel),
    url: (d) => (d === now ? base : `${base}?d=${d}`),
    week: acts ? totals(between(acts, addDays(now, -6), now)) : null,
  };

  const cards = layout(page, ctx, acts);
  let tail = "";
  if (page === "home") {
    const from = addDays(now, -364);
    const yt = totals(between(acts, from, now));
    tail = `${C.weekCard(ctx)}
      <section class="section span4"><div class="section-head"><div><h2>Treinos</h2><p>${yt.count} treinos e ${duration(yt.seconds)} nos últimos 12 meses. Clique em um dia para abrir o treino.</p></div><a class="link" href="#/treinos">Todos os treinos ${icon("arrowRight")}</a></div>
        ${heatmap({ from, to: now, cells: trainingCells(acts, from, now) })}</section>
      <section class="section span4"><div class="section-head"><div><h2>Últimos treinos</h2></div><a class="link" href="#/treinos">Ver todos ${icon("arrowRight")}</a></div>
        <ul class="list">${acts.slice(0, 5).map((a) => `<li><a href="#/treino/${a.id}"><span class="list-main"><b>${esc(a.name || typeName(a.type))}</b><span class="muted">${esc(typeName(a.type))}, ${esc(fmtDay(a.start))}</span></span><span class="num">${a.km ? `${num(a.km, 1)} km` : duration(a.durationS)}</span></a></li>`).join("")}</ul></section>`;
  } else {
    tail = C.weekCard(ctx);
  }

  root.innerHTML = `${page === "home" ? "" : dayBar(page, ctx)}<div class="bento">${cards.join("")}${tail}</div>`;
  root.querySelectorAll(".bento > article, .bento > section").forEach((el, i) => { el.classList.add("rise"); el.style.setProperty("--i", i); });
  scrollHeatToEnd(root);

  // Preenchimento tardio: cada cartão troca o esqueleto pelo dado quando ele chega.
  const el = (name) => [...root.querySelectorAll(`[data-fill="${name}"]`)];
  const fail = (names) => (e) => {
    if (!alive()) return;
    names.flatMap(el).forEach((n) => { n.querySelector(".skel")?.replaceWith(Object.assign(document.createElement("p"), { className: "note", textContent: `Não foi possível carregar: ${e.message}` })); });
  };
  const dayNames = Object.keys(DAY_FILL).filter((n) => el(n).length);
  if (dayNames.length) {
    loadDay(sel).then((day) => {
      if (!alive()) return;
      el("hr").forEach((n) => C.fillHr(n, day, ctx, n.classList.contains("span2")));
      el("food").forEach((n) => C.fillFood(n, day));
      el("foodlog").forEach((n) => C.fillFoodLog(n, day, ctx));
      el("spo2").forEach((n) => C.fillSpo2(n, day, ctx));
      el("bbcurve").forEach((n) => C.fillBbCurve(n, day, ctx));
      el("hrvnight").forEach((n) => C.fillHrvNight(n, day));
    }).catch(fail(dayNames));
  }
  const profNames = PROFILE_FILL.filter((n) => el(n).length);
  if (profNames.length) {
    loadProfile().then((p) => {
      if (!alive()) return;
      el("weight").forEach((n) => C.fillWeight(n, p, ctx));
      el("fitness").forEach((n) => C.fillFitness(n, p));
      el("zones").forEach((n) => C.fillZones(n, p));
      el("water").forEach((n) => C.fillWater(n, p, ctx));
    }).catch(fail(profNames));
  }
}
