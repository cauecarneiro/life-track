// Ponto de entrada: rotas, barra lateral, atalhos de teclado, busca, dicas flutuantes e atualização.
import { setupCharts, destroyCharts } from "./charts.js?v=5";
import { go, parseRoute, back } from "./nav.js?v=5";
import { refreshAll } from "./api.js?v=5";
import { emptyHtml, errorHtml } from "./ui.js?v=5";
import { icon } from "./util.js?v=5";
import { METRICS, ORDER } from "./metrics.js?v=5";
import { renderHub, CATEGORIES, LEGACY } from "./views/hub.js?v=5";
import { renderMetric, stepDay, leaveMetric } from "./views/metric.js?v=5";
import { renderWorkouts } from "./views/workouts.js?v=5";
import { renderWorkout } from "./views/workout.js?v=5";

const view = document.getElementById("view");
let token = 0;
let lastPath = null;

// ---------------------------------------------------------------- barra lateral: Resumo, categorias, Treinos

const CAT_ORDER = ["recuperacao", "sono", "atividade", "coracao", "corpo"];
// A qual item da barra cada indicador pertence (para marcar onde você está).
const METRIC_HOME = { battery: "recuperacao", stress: "recuperacao", balance: "recuperacao", resp: "recuperacao", sleep: "sono", steps: "atividade", calories: "atividade", intensity: "atividade", floors: "atividade", hr: "coracao", rhr: "coracao", hrv: "coracao" };
const link = (id, href, label, ic) => `<a href="${href}" data-nav="${id}">${icon(ic)}<span>${label}</span></a>`;
document.getElementById("nav").innerHTML = `
  ${link("home", "#/", "Resumo", "home")}
  <p class="nav-h">Categorias</p>
  ${CAT_ORDER.map((id) => (id === "sono" ? link("sono", "#/m/sleep", "Sono", "moon") : link(id, `#/c/${id}`, CATEGORIES[id].title, CATEGORIES[id].icon))).join("")}
  <p class="nav-h">Registros</p>
  ${link("workouts", "#/treinos", "Treinos", "dumbbell")}`;

function sectionOf(segs) {
  const [a, b] = segs;
  if (a === "treinos" || a === "treino") return "workouts";
  if (a === "c") return b;
  if (a === "m") return METRIC_HOME[b] || "home";
  return "home";
}

function markNav(segs) {
  const s = sectionOf(segs);
  document.querySelectorAll("[data-nav]").forEach((el) => (el.dataset.nav === s ? el.setAttribute("aria-current", "page") : el.removeAttribute("aria-current")));
}

/** Guarda de onde você veio, para o "voltar" da página do indicador levar de volta ao mesmo lugar. */
function rememberOrigin(r) {
  const [a, b] = r.segs;
  if (!a) Object.assign(back, { href: location.hash || "#/", label: "Resumo" });
  else if (a === "c" && CATEGORIES[b]) Object.assign(back, { href: location.hash, label: CATEGORIES[b].title });
  else if (a === "treinos") Object.assign(back, { href: location.hash, label: "Treinos" });
}

async function route() {
  const mine = ++token;
  const alive = () => mine === token;
  let r = parseRoute();
  // Endereços antigos continuam funcionando.
  const old = { vitais: "coracao", nutricao: "corpo" }[r.segs[0]];
  if (old) { go(`#/c/${old}${location.hash.includes("?") ? `?${location.hash.split("?")[1]}` : ""}`, { replace: true }); return; }
  destroyCharts();
  markNav(r.segs);
  rememberOrigin(r);
  if (r.path !== lastPath) { window.scrollTo(0, 0); lastPath = r.path; }
  if (r.segs[0] !== "m") { view.classList.remove("static"); leaveMetric(); }

  try {
    const [section, arg] = r.segs;
    if (!section) await renderHub(view, r, alive, "home");
    else if (section === "c" && CATEGORIES[arg]) await renderHub(view, r, alive, arg);
    else if (section === "m") await renderMetric(view, { id: arg, q: r.q }, alive);
    else if (section === "treinos") await renderWorkouts(view, r, alive);
    else if (section === "treino" && arg) await renderWorkout(view, { id: arg }, alive);
    else view.innerHTML = emptyHtml("Página não encontrada", "Use a barra lateral para voltar ao resumo.");
    if (alive()) document.title = `${view.querySelector("h1")?.textContent || "Resumo"} · Life Track`;
  } catch (e) {
    if (alive()) view.innerHTML = errorHtml(e);
  }
}

// ---------------------------------------------------------------- cliques, teclado e seletor de data

document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const pick = e.target.closest("[data-pick]");
  if (pick) {
    const input = pick.parentElement.querySelector("input.pick");
    try { input.showPicker(); } catch { input.focus(); }
    return;
  }
  if (e.target.closest("[data-refresh]")) { refresh(); return; }
  const el = e.target.closest("[data-go], a[data-replace]");
  if (!el || el.disabled || e.target.closest("a:not([data-replace])")) return;
  e.preventDefault();
  go(el.dataset.go || el.getAttribute("href"), { replace: el.hasAttribute("data-replace") });
});

document.addEventListener("change", (e) => {
  const input = e.target.closest("input.pick");
  if (!input || !input.value) return;
  const { base, today } = input.dataset;
  go(input.value === today ? base : `${base}?d=${input.value}`, { replace: true });
});

document.addEventListener("keydown", (e) => {
  // ⌘K ou Ctrl+K: buscar um dado, como no Spotlight.
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.focus(); input.select(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(e.target.tagName) || document.querySelector("dialog[open]")) return;
  if (parseRoute().segs[0] !== "m") return;
  // ← → trocam de dia; com Shift, trocam de semana.
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    if (e.shiftKey) document.querySelector(`[aria-label="${e.key === "ArrowLeft" ? "Semana anterior" : "Próxima semana"}"]:not(:disabled)`)?.click();
    else stepDay(e.key === "ArrowLeft" ? -1 : 1);
  }
});

document.querySelector(".skip").addEventListener("click", () => view.focus());

// ---------------------------------------------------------------- dica flutuante (data-tip)

const tip = document.getElementById("tip");
const place = (e) => {
  const pad = 12, w = tip.offsetWidth, h = tip.offsetHeight;
  const x = Math.min(window.innerWidth - w - pad, Math.max(pad, e.clientX - w / 2));
  const y = e.clientY - h - 16 < pad ? e.clientY + 20 : e.clientY - h - 16;
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
};
document.addEventListener("pointerover", (e) => {
  const el = e.target.closest("[data-tip]");
  if (!el || e.pointerType === "touch") return;
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  place(e);
});
document.addEventListener("pointermove", (e) => { if (!tip.hidden) place(e); });
document.addEventListener("pointerout", (e) => {
  if (e.target.closest("[data-tip]") && !e.relatedTarget?.closest?.("[data-tip]")) tip.hidden = true;
});

// ---------------------------------------------------------------- atualizar, com retorno visível

const toast = document.getElementById("toast");
const stamp = document.getElementById("stamp");
const clock = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
let toastTimer = 0;
function say(text) {
  toast.textContent = text;
  toast.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("on"), 2600);
}
async function refresh() {
  const btn = document.getElementById("refresh");
  if (btn.getAttribute("aria-busy")) return;
  btn.setAttribute("aria-busy", "true");
  try {
    await refreshAll();
    await route();
    stamp.textContent = `Atualizado às ${clock()}`;
    say("Dados atualizados");
  } catch (err) {
    say(`Não foi possível atualizar: ${err.message}`);
  } finally { btn.removeAttribute("aria-busy"); }
}
document.getElementById("refresh").addEventListener("click", refresh);
stamp.textContent = `Atualizado às ${clock()}`;

window.addEventListener("hashchange", route);
window.addEventListener("app:route", route);
setupCharts();
route();

// ---------------------------------------------------------------- busca (combobox: setas, Enter, Esc)

const input = document.getElementById("q");
const found = document.getElementById("found");
const norm = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const INDEX = [
  ...ORDER.map((id) => [METRICS[id].label, `#/m/${id}`, "Indicador", METRICS[id].about]),
  ["Resumo", "#/", "Página", "início hoje"],
  ...Object.entries(CATEGORIES).map(([id, c]) => [c.title, `#/c/${id}`, "Categoria", c.about]),
  ["Treinos", "#/treinos", "Registros", "corrida caminhada trilha atividades"],
  ["Peso", "#/c/corpo", "Corpo", "imc gordura"], ["Idade física", "#/c/corpo", "Corpo", ""], ["Zonas de FC", "#/c/coracao", "Coração", ""],
  ["Água", "#/c/corpo", "Corpo", "hidratação beber"], ["Oxigênio (SpO2)", "#/c/coracao", "Coração", "pulse ox"],
  ["Minutos de intensidade", "#/m/intensity", "Indicador", "esforço pontos"],
];
let active = 0;
function paint() {
  const items = [...found.querySelectorAll("[role=option]")];
  items.forEach((a, i) => a.setAttribute("aria-selected", String(i === active)));
  input.setAttribute("aria-activedescendant", items[active]?.id || "");
}
function search() {
  const t = norm(input.value.trim());
  const hits = t ? INDEX.filter(([l, , , k]) => norm(`${l} ${k}`).includes(t)).slice(0, 7) : [];
  found.innerHTML = hits.length ? hits.map(([l, h, kind], i) => `<li><a id="opt-${i}" role="option" href="${h}">${l}<span>${kind}</span></a></li>`).join("") : t ? '<li class="none">Nada encontrado</li>' : "";
  found.hidden = !t;
  input.setAttribute("aria-expanded", String(!!t));
  active = 0;
  paint();
}
const close = () => { input.value = ""; search(); };
input.addEventListener("input", search);
input.addEventListener("keydown", (e) => {
  const n = found.querySelectorAll("[role=option]").length;
  if (e.key === "ArrowDown" && n) { e.preventDefault(); active = (active + 1) % n; paint(); }
  if (e.key === "ArrowUp" && n) { e.preventDefault(); active = (active - 1 + n) % n; paint(); }
  if (e.key === "Escape") { close(); input.blur(); }
  if (e.key === "Enter") { const a = found.querySelectorAll("[role=option]")[active]; if (a) { e.preventDefault(); go(a.getAttribute("href")); close(); input.blur(); } }
});
found.addEventListener("click", close);
document.addEventListener("click", (e) => { if (!e.target.closest(".search")) { found.hidden = true; input.setAttribute("aria-expanded", "false"); } });
