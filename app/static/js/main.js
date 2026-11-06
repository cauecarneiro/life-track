// Ponto de entrada: rotas, atalhos de teclado, dicas flutuantes e o botão de atualizar.
import { setupCharts, destroyCharts } from "./charts.js?v=3";
import { go, parseRoute } from "./nav.js?v=3";
import { refreshAll } from "./api.js?v=3";
import { emptyHtml, errorHtml } from "./ui.js?v=3";
import { icon } from "./util.js?v=3";
import { METRICS, ORDER } from "./metrics.js?v=3";
import { renderHub } from "./views/hub.js?v=3";
import { renderMetric, stepDay } from "./views/metric.js?v=3";
import { renderWorkouts } from "./views/workouts.js?v=3";
import { renderWorkout } from "./views/workout.js?v=3";

const view = document.getElementById("view");
let token = 0;
let lastPath = null;

const NAV = [
  ["home", "#/", "Início", "home"],
  ["vitais", "#/vitais", "Sinais vitais", "pulse"],
  ["corpo", "#/corpo", "Corpo", "body"],
  ["nutricao", "#/nutricao", "Nutrição", "fork"],
  ["sleep", "#/m/sleep", "Sono", "moon"],
  ["workouts", "#/treinos", "Treinos", "dumbbell"],
];
document.getElementById("nav").innerHTML = NAV.map(([id, href, label, ic]) => `<a href="${href}" data-nav="${id}" data-tip="${label}" aria-label="${label}">${icon(ic)}</a>`).join("");

function markNav(segs) {
  const [a, b] = segs;
  const section = a === "treinos" || a === "treino" ? "workouts" : a === "m" && b === "sleep" ? "sleep" : ["vitais", "corpo", "nutricao"].includes(a) ? a : a === "m" && ["hrv", "rhr", "hr", "resp", "stress"].includes(b) ? "vitais" : a === "m" && ["battery", "floors"].includes(b) ? "corpo" : a === "m" && b === "calories" ? "nutricao" : "home";
  document.querySelectorAll("[data-nav]").forEach((el) =>
    el.dataset.nav === section ? el.setAttribute("aria-current", "page") : el.removeAttribute("aria-current"));
}

async function route() {
  const mine = ++token;
  const alive = () => mine === token;
  const r = parseRoute();
  destroyCharts();
  markNav(r.segs);
  if (r.path !== lastPath) { window.scrollTo(0, 0); lastPath = r.path; }

  try {
    const [section, arg] = r.segs;
    if (!section) await renderHub(view, r, alive, "home");
    else if (["vitais", "corpo", "nutricao"].includes(section)) await renderHub(view, r, alive, section);
    else if (section === "m") await renderMetric(view, { id: arg, q: r.q }, alive);
    else if (section === "treinos") await renderWorkouts(view, r, alive);
    else if (section === "treino" && arg) await renderWorkout(view, { id: arg }, alive);
    else view.innerHTML = emptyHtml("Página não encontrada", "Volte para a página inicial.");
  } catch (e) {
    if (alive()) view.innerHTML = errorHtml(e);
  }
}

// Cliques em elementos com data-go e em links marcados com data-replace.
document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const el = e.target.closest("[data-go], a[data-replace]");
  if (!el || el.disabled || e.target.closest("a:not([data-replace])")) return;
  e.preventDefault();
  go(el.dataset.go || el.getAttribute("href"), { replace: el.hasAttribute("data-replace") });
});

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
  if (parseRoute().segs[0] !== "m") return;
  if (e.key === "ArrowLeft") { e.preventDefault(); stepDay(-1); }
  if (e.key === "ArrowRight") { e.preventDefault(); stepDay(1); }
});

// Dica flutuante para qualquer elemento com data-tip (usada pelo mapa de calor).
const tip = document.getElementById("tip");
const place = (e) => {
  const pad = 12, w = tip.offsetWidth, h = tip.offsetHeight;
  const x = Math.min(window.innerWidth - w - pad, Math.max(pad, e.clientX - w / 2));
  const y = e.clientY - h - 16 < pad ? e.clientY + 20 : e.clientY - h - 16;
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
};
document.addEventListener("pointerover", (e) => {
  const el = e.target.closest("[data-tip]");
  if (!el) return;
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  place(e);
});
document.addEventListener("pointermove", (e) => { if (!tip.hidden) place(e); });
document.addEventListener("pointerout", (e) => {
  if (e.target.closest("[data-tip]") && !e.relatedTarget?.closest?.("[data-tip]")) tip.hidden = true;
});

document.getElementById("refresh").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.setAttribute("aria-busy", "true");
  try { await refreshAll(); await route(); } catch (err) { view.innerHTML = errorHtml(err); } finally { btn.removeAttribute("aria-busy"); }
});

window.addEventListener("hashchange", route);
window.addEventListener("app:route", route);
setupCharts();
route();

// Cartões inteiros são clicáveis: Enter abre, como em um link.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.target.getAttribute?.("role") !== "link" || !e.target.dataset.go) return;
  go(e.target.dataset.go);
});

// Busca: encontra um indicador ou uma página pelo nome.
const input = document.getElementById("q");
const found = document.getElementById("found");
const norm = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const INDEX = [
  ...ORDER.map((id) => [METRICS[id].label, `#/m/${id}`, "Indicador", METRICS[id].about]),
  ["Sinais vitais", "#/vitais", "Página", "coração respiração oxigênio spo2 estresse"],
  ["Corpo", "#/corpo", "Página", "peso idade física zonas energia bateria"],
  ["Nutrição", "#/nutricao", "Página", "calorias comida alimentação água hidratação"],
  ["Treinos", "#/treinos", "Página", "corrida caminhada trilha atividades"],
  ["Peso", "#/corpo", "Corpo", ""], ["Idade física", "#/corpo", "Corpo", ""], ["Zonas de FC", "#/corpo", "Corpo", ""],
  ["Água", "#/nutricao", "Nutrição", "hidratação"], ["Oxigênio (SpO2)", "#/vitais", "Sinais vitais", "pulse ox"],
  ["Pontos de intensidade", "#/m/intensity", "Indicador", "esforço minutos"],
];
function search() {
  const t = norm(input.value.trim());
  const hits = t ? INDEX.filter(([l, , , k]) => norm(`${l} ${k}`).includes(t)).slice(0, 6) : [];
  found.innerHTML = hits.map(([l, h, kind], i) => `<li><a href="${h}" ${i === 0 ? 'aria-selected="true"' : ""}>${l}<span>${kind}</span></a></li>`).join("");
  found.hidden = !hits.length;
}
input.addEventListener("input", search);
input.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { input.value = ""; search(); input.blur(); }
  if (e.key === "Enter") { const a = found.querySelector("a"); if (a) { go(a.getAttribute("href")); input.value = ""; search(); input.blur(); } }
});
found.addEventListener("click", () => { input.value = ""; search(); });
document.addEventListener("click", (e) => { if (!e.target.closest(".search")) found.hidden = true; });
