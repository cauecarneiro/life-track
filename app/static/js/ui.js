// Peças de interface compartilhadas entre as telas.
import { esc, addDays, num } from "./util.js?v=5";

export const loadingHtml = (text) => `<div class="empty"><p class="pulse">${esc(text)}</p></div>`;

/** Esqueleto da página enquanto os dados chegam: o leitor de tela ouve o aviso, a tela mostra a forma do que vem. */
export const skeletonHtml = (n = 8) => `<div class="page-head" role="status"><div><span class="sk sk-t"></span><span class="sk sk-s"></span><span class="sr">Buscando seus dados na Garmin</span></div></div>
  <div class="bento">${Array.from({ length: n }, () => '<div class="card sk-card"><span class="sk sk-s"></span><span class="sk sk-v"></span><span class="skel"></span></div>').join("")}</div>`;

export const emptyHtml = (title, text) => `<div class="empty"><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;

export const errorHtml = (e) =>
  emptyHtml(
    "Não foi possível buscar os dados na Garmin",
    `${e.message}. Confira se o servidor está rodando e se a chave ainda vale em Garmin Connect, Configurações, Chave de API pessoal. Depois clique em atualizar, no canto superior direito.`,
  );

/** Uma linha por dia entre start e end; dias sem dado viram { date }. */
export function fillDays(days, start, end) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(byDate.get(d) || { date: d });
  return out;
}

/** Lista de barras horizontais com rótulo, trilho e texto à direita. */
export const barsHtml = ({ title, items }) => `<div class="bars">
  ${title ? `<h3>${esc(title)}</h3>` : ""}
  ${items.map((i) => `<div class="bar-row"><span>${esc(i.label)}</span>
    <span class="track"><i style="width:${i.total ? Math.max(i.value ? 1.5 : 0, (i.value / i.total) * 100).toFixed(1) : 0}%;background:${i.color}"></i></span>
    <span class="num">${esc(i.text)}</span></div>`).join("")}
</div>`;

// ---------------------------------------------------------------- controle segmentado (estilo iOS)

const segPrev = new Map();

/** Botões de mesma largura com um "polegar" que desliza até a opção escolhida. */
export const segmented = (key, items, cur) => `<div class="seg" data-seg="${esc(key)}" style="--n:${items.length};--k:${cur}" role="group">
  <span class="seg-thumb" aria-hidden="true"></span>${items.map((it, i) => `<a href="${esc(it.href)}" data-replace${i === cur ? ' aria-current="true"' : ""}>${esc(it.label)}</a>`).join("")}</div>`;

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Depois de desenhar a tela: o polegar desliza da opção anterior e os números principais contam até o valor. */
export function settle(root) {
  root.querySelectorAll("[data-seg]").forEach((el) => {
    const key = el.dataset.seg, cur = el.style.getPropertyValue("--k");
    const prev = segPrev.get(key);
    segPrev.set(key, cur);
    if (prev == null || prev === cur || calm()) return;
    const thumb = el.querySelector(".seg-thumb");
    thumb.style.transition = "none";
    el.style.setProperty("--k", prev);
    thumb.getBoundingClientRect();
    thumb.style.transition = "";
    el.style.setProperty("--k", cur);
  });
  if (calm() || root.classList.contains("static")) return;
  root.querySelectorAll("[data-count]").forEach((el) => {
    const to = Number(el.dataset.count), d = Number(el.dataset.d || 0), t0 = performance.now(), dur = 700;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3;
      el.textContent = num(to * e, d);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
