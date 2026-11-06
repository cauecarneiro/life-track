// Resumo e páginas de categoria. O dia vem de ?d=AAAA-MM-DD.
// Dados que exigem outra chamada (curva do dia, perfil) entram depois, sem travar a tela.
import { loadOverview, loadActivities, loadDay, loadProfile, hasOverview, hasActivities } from "../api.js?v=5";
import * as C from "../cards.js?v=5";
import { heatmap, scrollHeatToEnd } from "../heatmap.js?v=5";
import { trainingCells, totals, between } from "../acts.js?v=5";
import { fillDays, settle, skeletonHtml } from "../ui.js?v=5";
import { esc, num, fmtDay, today, addDays, diffDays, duration, typeName, icon, cap } from "../util.js?v=5";

// Categorias, na ordem da barra lateral. Body Battery e estresse (Recuperação), sono e passos (Atividade) vêm primeiro.
export const CATEGORIES = {
  recuperacao: { title: "Recuperação", icon: "battery", about: "Energia, estresse e quanto do seu corpo está no normal.", metrics: ["battery", "stress", "balance", "resp"],
    cards: (ctx) => [C.bbCurveCard(ctx, "span2"), C.metricCard("stress", ctx), C.metricCard("balance", ctx)] },
  atividade: { title: "Atividade", icon: "steps", about: "Passos, calorias, minutos de intensidade e andares.", metrics: ["steps", "calories", "intensity", "floors"],
    cards: (ctx) => ["steps", "calories", "intensity", "floors"].map((id) => C.metricCard(id, ctx)), workouts: true },
  coracao: { title: "Coração", icon: "heart", about: "Frequência cardíaca, variabilidade, oxigênio e zonas.", metrics: ["hr", "rhr", "hrv"],
    cards: (ctx) => [C.hrCard(ctx, { span: "span2" }), C.hrvNightCard(ctx, "span2"), C.metricCard("rhr", ctx), C.metricCard("hrv", ctx), C.zonesCard(), C.spo2Card()] },
  corpo: { title: "Corpo", icon: "body", about: "Peso, idade física e hidratação.", metrics: [],
    cards: (ctx) => [C.weightCard(ctx, { span: "c4" }), C.fitnessCard("c4"), C.waterCard("c4")] },
};
export const LEGACY = { vitais: "coracao", nutricao: "corpo" };

// Cartões que podem ficar no resumo, na ordem em que aparecem. Quem escolhe quais aparecem é você ("Editar").
const HOME = [
  ["battery", "Body Battery"], ["sleep", "Sono"], ["steps", "Passos"], ["stress", "Estresse"], ["calories", "Calorias"],
  ["balance", "Equilíbrio"], ["hr", "Frequência cardíaca"], ["hrv", "HRV"], ["rhr", "FC de repouso"], ["intensity", "Intensidade"],
  ["resp", "Respiração"], ["weight", "Peso"], ["fitness", "Idade física"], ["zones", "Zonas de FC"], ["water", "Hidratação"], ["spo2", "Oxigênio (SpO2)"],
];
const DEFAULT_HIDDEN = ["fitness", "zones", "water", "spo2"];
const STORE = "lifetrack.hidden";
function hiddenCards() {
  try { const v = JSON.parse(localStorage.getItem(STORE)); return Array.isArray(v) ? v : DEFAULT_HIDDEN; } catch { return DEFAULT_HIDDEN; }
}
function saveHidden(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); } catch { /* sem armazenamento: vale só nesta visita */ } }
const homeCard = (id, ctx) => ({ hr: () => C.hrCard(ctx), weight: () => C.weightCard(ctx), fitness: () => C.fitnessCard(), zones: () => C.zonesCard(), water: () => C.waterCard(), spo2: () => C.spo2Card() }[id] || (() => C.metricCard(id, ctx)))();

const DAY_FILL = ["hr", "spo2", "bbcurve", "hrvnight"];
const PROFILE_FILL = ["weight", "fitness", "zones", "water"];
const hasAny = (r) => r && (r.sleepH != null || r.hrv != null);

function datePill(ctx, base) {
  const prev = addDays(ctx.sel, -1), next = addDays(ctx.sel, 1);
  return `<div class="head-r">${ctx.isToday ? "" : `<a class="btn plain" href="${ctx.url(ctx.today)}" data-replace>Hoje</a>`}<div class="stepper">
      <button class="step" type="button" data-go="${ctx.url(prev)}" data-replace aria-label="Dia anterior">${icon("chevLeft")}</button>
      <button class="when pickable" type="button" data-pick aria-label="Escolher o dia, agora ${esc(fmtDay(ctx.sel, { day: "numeric", month: "long" }))}">${esc(ctx.isToday ? "Hoje" : fmtDay(ctx.sel, { weekday: "short", day: "numeric", month: "short" }))}</button>
      <input class="pick" type="date" tabindex="-1" aria-hidden="true" data-base="${base}" data-today="${ctx.today}" min="${ctx.firstDate}" max="${ctx.today}" value="${ctx.sel}">
      <button class="step" type="button" ${next <= ctx.today ? `data-go="${ctx.url(next)}" data-replace` : "disabled"} aria-label="Próximo dia">${icon("chevRight")}</button>
    </div></div>`;
}

/** Marca discreta ao lado da data quando o relógio não sincroniza há mais de um dia. */
function staleNotice(ctx, latest) {
  if (!latest || diffDays(ctx.today, latest) < 2) return "";
  const n = diffDays(ctx.today, latest);
  return `<span class="fresh" role="status" title="Os dados mais recentes são de ${esc(fmtDay(latest, { day: "numeric", month: "long" }))}. Abra o app Garmin Connect no celular, com o relógio por perto, para sincronizar."><i aria-hidden="true"></i>relógio sem sincronizar há ${n} dias</span>`;
}

function editSheet(hidden) {
  return `<dialog class="sheet" id="edit" aria-labelledby="edit-t">
    <form method="dialog">
      <header><h2 id="edit-t">Editar resumo</h2><button class="btn" value="ok">OK</button></header>
      <p class="muted">Escolha quais cartões aparecem no resumo. Os outros continuam nas categorias.</p>
      <ul>${HOME.map(([id, label]) => `<li><label><span>${esc(label)}</span><input type="checkbox" role="switch" name="${id}"${hidden.includes(id) ? "" : " checked"}></label></li>`).join("")}</ul>
    </form>
  </dialog>`;
}

function workoutsTable(acts) {
  return `<section class="section span4"><div class="section-head"><div><h2>Atividades recentes</h2><p>Os últimos treinos registrados pelo relógio.</p></div><a class="link" href="#/treinos">Ver todos ${icon("arrowRight")}</a></div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Atividade</th><th>Data</th><th>Hora</th><th class="r">Distância</th><th class="r">Duração</th><th class="r">FC média</th><th class="r">Efeito aeróbico</th></tr></thead>
    <tbody>${acts.slice(0, 6).map((a) => `<tr data-go="#/treino/${a.id}"><td><a href="#/treino/${a.id}"><b>${esc(a.name || typeName(a.type))}</b></a> <span class="muted">${esc(typeName(a.type))}</span></td><td>${esc(fmtDay(a.start))}</td><td class="num muted">${esc(a.start.slice(11, 16))}</td><td class="r num">${a.km ? `${num(a.km, 1)} km` : "—"}</td><td class="r num">${duration(a.durationS)}</td><td class="r num">${a.avgHR ? `${num(a.avgHR)} bpm` : "—"}</td><td class="r">${a.te != null ? `<span class="badge">${num(a.te, 1)}</span>` : "—"}</td></tr>`).join("")}</tbody></table></div></section>`;
}

export async function renderHub(root, route, alive, page = "home") {
  const cat = CATEGORIES[page];
  const now = today();
  const wanted = /^\d{4}-\d{2}-\d{2}$/.test(route.q.d || "") && route.q.d <= now ? route.q.d : null;
  const span = wanted && diffDays(now, wanted) > 25 ? 365 : 30;
  const needActs = page === "home" || cat?.workouts;
  if (!hasOverview(span) || (needActs && !hasActivities())) root.innerHTML = skeletonHtml(page === "home" ? 8 : 4);
  const [ov, acts] = await Promise.all([loadOverview(span), needActs ? loadActivities() : null]);
  if (!alive()) return;
  loadOverview(365).catch(() => {}); // aquece o cache para abrir os indicadores rápido

  const byDate = new Map(ov.days.map((d) => [d.date, d]));
  const latest = [...ov.days].reverse().find(hasAny)?.date;
  const sel = wanted || (hasAny(byDate.get(now)) ? now : latest || now);
  const base = page === "home" ? "#/" : `#/c/${page}`;
  const ctx = {
    sel, today: now, isToday: sel === now, byDate, firstDate: ov.start,
    win: fillDays(ov.days, addDays(sel, -13), sel),
    all: fillDays(ov.days, addDays(sel, -29), sel),
    url: (d) => (d === now ? base : `${base}?d=${d}`),
    week: acts ? totals(between(acts, addDays(now, -6), now)) : null,
  };
  const dateLine = cap(fmtDay(sel, { weekday: "long", day: "numeric", month: "long" }));

  let html;
  if (page === "home") {
    const hidden = hiddenCards();
    const from = addDays(now, -364);
    const yt = totals(between(acts, from, now));
    html = `<header class="page-head"><div><h1>Resumo</h1><p class="muted">${esc(dateLine)}${staleNotice(ctx, latest)}</p><p class="insight">${C.insightText(ctx)}</p></div>
        <div class="head-r"><button class="btn plain" type="button" data-edit>Editar</button>${datePill(ctx, base)}</div></header>
      <div class="bento">${HOME.filter(([id]) => !hidden.includes(id)).map(([id]) => homeCard(id, ctx)).join("")}
        ${C.weekCard(ctx)}
        <section class="section span4"><div class="section-head"><div><h2>Treinos</h2><p>${yt.count} treinos e ${duration(yt.seconds)} nos últimos 12 meses. Clique em um dia para abrir o treino.</p></div><a class="link" href="#/treinos">Todos os treinos ${icon("arrowRight")}</a></div>
          ${heatmap({ from, to: now, cells: trainingCells(acts, from, now) })}</section>
        ${workoutsTable(acts)}
      </div>${editSheet(hidden)}`;
  } else {
    html = `<header class="page-head"><div><h1>${esc(cat.title)}</h1><p class="muted">${esc(cat.about)}${staleNotice(ctx, latest)}</p></div>${datePill(ctx, base)}</header>
      <div class="bento">${cat.metrics.length ? C.metricList(cat.metrics, ctx) : ""}${cat.cards(ctx).join("")}${cat.workouts ? workoutsTable(acts) : ""}</div>`;
  }

  root.innerHTML = html;
  root.classList.remove("static");
  root.querySelectorAll(".bento > *").forEach((el, i) => { el.classList.add("rise"); el.style.setProperty("--i", Math.min(i, 12)); });
  scrollHeatToEnd(root);
  settle(root);

  // "Editar": ao fechar a folha, grava a escolha e redesenha o resumo.
  const sheet = root.querySelector("#edit");
  if (sheet) {
    root.querySelector("[data-edit]").addEventListener("click", () => sheet.showModal());
    sheet.addEventListener("close", () => {
      const off = HOME.map(([id]) => id).filter((id) => !sheet.querySelector(`[name="${id}"]`).checked);
      saveHidden(off);
      window.dispatchEvent(new Event("app:route"));
    });
  }

  // Preenchimento tardio: cada cartão troca o esqueleto pelo dado quando ele chega.
  const el = (name) => [...root.querySelectorAll(`[data-fill="${name}"]`)];
  const fail = (names) => (e) => {
    if (!alive()) return;
    names.flatMap(el).forEach((n) => { n.querySelector(".skel")?.replaceWith(Object.assign(document.createElement("p"), { className: "note", textContent: `Não foi possível carregar: ${e.message}` })); });
  };
  const dayNames = DAY_FILL.filter((n) => el(n).length);
  if (dayNames.length) {
    loadDay(sel).then((day) => {
      if (!alive()) return;
      el("hr").forEach((n) => C.fillHr(n, day, ctx));
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
