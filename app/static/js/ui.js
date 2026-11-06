// Peças de interface compartilhadas entre as telas.
import { esc, addDays } from "./util.js?v=3";

export const loadingHtml = (text) => `<div class="empty"><p class="pulse">${esc(text)}</p></div>`;

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
