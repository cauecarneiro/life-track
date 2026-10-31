// Ponto de entrada: rotas, atalhos de teclado, dicas flutuantes e o botão de atualizar.
import { setupCharts, destroyCharts } from "./charts.js";
import { go, parseRoute } from "./nav.js";
import { refreshAll } from "./api.js";
import { emptyHtml, errorHtml } from "./ui.js";
import { renderHome } from "./views/home.js";
import { renderMetric, stepDay } from "./views/metric.js";
import { renderWorkouts } from "./views/workouts.js";
import { renderWorkout } from "./views/workout.js";

const view = document.getElementById("view");
let token = 0;
let lastPath = null;

function markNav(segs) {
  const section = segs[0] === "treinos" || segs[0] === "treino" ? "workouts" : "home";
  document.querySelectorAll("[data-nav]").forEach((a) =>
    a.dataset.nav === section ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
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
    if (!section) await renderHome(view, r, alive);
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
