// Páginas de resumo (início, sinais vitais, corpo, nutrição): cartões do dia escolhido.
// O dia vem de ?d=AAAA-MM-DD. Dados que exigem outra chamada (curva do dia, perfil) entram depois, sem travar a tela.
import { loadOverview, loadActivities, loadDay, loadProfile, hasOverview, hasActivities } from "../api.js?v=3";
import * as C from "../cards.js?v=3";
import { heatmap, scrollHeatToEnd } from "../heatmap.js?v=3";
import { trainingCells, totals, between } from "../acts.js?v=3";
import { loadingHtml, fillDays } from "../ui.js?v=3";
import { esc, num, fmtDay, today, addDays, diffDays, duration, typeName, icon, cap } from "../util.js?v=3";

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

// Body Battery, sono, passos e estresse vêm primeiro em toda grade em que aparecem.
function layout(page, ctx, acts) {
  const m = (id, o) => C.metricCard(id, ctx, o);
  switch (page) {
    case "vitais":
      return [m("stress"), m("hrv"), m("rhr"), C.spo2Card(),
        C.hrCard(ctx, { span: "span2" }), C.hrvNightCard(ctx, "span2"),
        m("resp"), m("intensity"), C.zonesCard(), C.fitnessCard()];
    case "corpo":
      return [m("battery"), m("sleep"), m("steps"), C.weightCard(ctx),
        C.bbCurveCard(ctx, "span3"), m("floors"),
        C.fitnessCard(), C.zonesCard(), C.caloriesCard(ctx), C.waterCard()];
    case "nutricao":
      return [m("steps"), C.caloriesCard(ctx, { span: "c5" }), C.foodCard(ctx, "c4"),
        C.waterCard("c4"), C.weightCard(ctx, { span: "c4" }), m("intensity", { span: "c4" })];
    default:
      return [C.gaugeCard(ctx, { span: "rows2" }), m("sleep"), m("steps"), m("stress"),
        C.balanceCard(ctx, { span: "c5" }), C.hrCard(ctx, { span: "c4" }),
        m("hrv"), m("rhr"), m("battery"), m("intensity"),
        m("resp"), m("calories"), C.weightCard(ctx), C.fitnessCard(),
        C.calendarCard(ctx, acts, { span: "c4" }), C.zonesCard("c4"), C.waterCard("c4")];
  }
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };

function datePill(ctx) {
  const prev = addDays(ctx.sel, -1), next = addDays(ctx.sel, 1);
  return `<div class="hero-r"><div class="datepill">
      <button class="step" type="button" data-go="${ctx.url(prev)}" data-replace aria-label="Dia anterior">${icon("chevLeft")}</button>
      <span class="when">${esc(ctx.isToday ? "Hoje" : fmtDay(ctx.sel, { weekday: "short", day: "numeric", month: "short" }))}</span>
      <button class="step" type="button" ${next <= ctx.today ? `data-go="${ctx.url(next)}" data-replace` : "disabled"} aria-label="Próximo dia">${icon("chevRight")}</button>
    </div>${ctx.isToday ? "" : `<a class="pilllink" href="${ctx.url(ctx.today)}" data-replace>Voltar para hoje</a>`}</div>`;
}

function hero(ctx, chosen) {
  const title = ctx.isToday || !chosen ? greeting() : cap(fmtDay(ctx.sel, { weekday: "long", day: "numeric", month: "long" }));
  return `<section class="hero"><div><h1>${esc(title)}</h1><p class="insight">${C.insightText(ctx)}</p></div>${datePill(ctx)}</section>`;
}

function dayBar(page, ctx) {
  const p = PAGES[page];
  return `<div class="page-head"><div><h1>${esc(p.title)}</h1><p class="muted">${esc(p.about)}</p></div>${datePill(ctx)}</div>`;
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
    all: fillDays(ov.days, addDays(sel, -29), sel),
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
      <section class="section span4"><div class="section-head"><div><h2>Atividades recentes</h2><p>Os últimos treinos registrados pelo relógio.</p></div><a class="link" href="#/treinos">Ver todos ${icon("arrowRight")}</a></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Atividade</th><th>Data</th><th>Hora</th><th class="r">Distância</th><th class="r">Duração</th><th class="r">FC média</th><th class="r">Efeito</th></tr></thead>
        <tbody>${acts.slice(0, 6).map((a) => `<tr data-go="#/treino/${a.id}"><td><b>${esc(a.name || typeName(a.type))}</b> <span class="muted">${esc(typeName(a.type))}</span></td><td>${esc(fmtDay(a.start))}</td><td class="num muted">${esc(a.start.slice(11, 16))}</td><td class="r num">${a.km ? `${num(a.km, 1)} km` : "—"}</td><td class="r num">${duration(a.durationS)}</td><td class="r num">${a.avgHR ? `${num(a.avgHR)} bpm` : "—"}</td><td class="r">${a.te != null ? `<span class="badge"><i></i>${num(a.te, 1)}</span>` : "—"}</td></tr>`).join("")}</tbody></table></div></section>`;
  } else {
    tail = C.weekCard(ctx);
  }

  root.innerHTML = `${page === "home" ? hero(ctx, !!wanted) : dayBar(page, ctx)}<div class="bento">${cards.join("")}${tail}</div>`;
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
      el("hr").forEach((n) => C.fillHr(n, day, ctx));
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
