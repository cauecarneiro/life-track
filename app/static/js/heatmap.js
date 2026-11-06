// Mapa de calor em estilo calendário (semanas em colunas, domingo no topo).
// Células vazias são hachuradas; os níveis 1 a 4 são uma escala de cinza.
import { esc, parseDay, addDays } from "./util.js?v=4";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Devolve uma função valor -> nível (0 = sem dado, 1 a 4 = quartis dos valores positivos). */
export function levelize(values) {
  const sorted = values.filter((v) => v != null && v > 0).sort((a, b) => a - b);
  if (!sorted.length) return () => 0;
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const [t1, t2, t3] = [at(0.25), at(0.5), at(0.75)];
  return (v) => (v == null || v <= 0 ? 0 : v <= t1 ? 1 : v <= t2 ? 2 : v <= t3 ? 3 : 4);
}

/**
 * from, to: intervalo visível ("AAAA-MM-DD").
 * cells: Map data -> { level, tip, href? }.
 * selected: data destacada. legend: [texto da esquerda, texto da direita].
 */
export function heatmap({ from, to, cells, selected, legend = ["Menos", "Mais"] }) {
  const start = addDays(from, -parseDay(from).getDay());
  const end = addDays(to, 6 - parseDay(to).getDay());
  const weeks = Math.round((parseDay(end) - parseDay(start)) / 864e5 + 1) / 7;

  let grid = "";
  const months = [];
  let lastLabel = -9;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const iso = addDays(start, w * 7 + d);
      if (iso < from || iso > to) { grid += '<span class="cell out"></span>'; continue; }
      const c = cells.get(iso) || { level: 0, tip: "" };
      const cur = iso === selected ? ' aria-current="true"' : "";
      const tip = c.tip ? ` data-tip="${esc(c.tip)}"` : "";
      const label = c.tip ? ` aria-label="${esc(c.tip)}"` : "";
      grid += c.href
        ? `<a class="cell" data-l="${c.level}" href="${esc(c.href)}"${c.replace ? " data-replace" : ""}${cur}${tip}${label}></a>`
        : `<span class="cell" data-l="${c.level}"${cur}${tip}></span>`;
    }
    // O rótulo do mês fica na coluna em que o dia 1 aparece (e na primeira coluna).
    for (let d = 0; d < 7; d++) {
      const iso = addDays(start, w * 7 + d);
      if (iso >= from && iso <= to && (parseDay(iso).getDate() === 1 || (w === 0 && iso === from))) {
        if (w - lastLabel >= 3) { months.push(`<span style="grid-column:${w + 1}">${MONTHS[parseDay(iso).getMonth()]}</span>`); lastLabel = w; }
        break;
      }
    }
  }

  const swatches = [0, 1, 2, 3, 4].map((l) => `<span class="cell" data-l="${l}"></span>`).join("");
  return `<div class="heat" style="--w:${weeks}">
    <div class="heat-scroll">
      <div class="heat-inner">
        <div class="heat-months">${months.join("")}</div>
        <div class="heat-wd"><span>Seg</span><span>Qua</span><span>Sex</span></div>
        <div class="heat-grid">${grid}</div>
      </div>
    </div>
    <div class="heat-legend"><span>${esc(legend[0])}</span>${swatches}<span>${esc(legend[1])}</span></div>
  </div>`;
}

/** Rola o mapa para o dia mais recente (à direita). */
export function scrollHeatToEnd(root) {
  root.querySelectorAll(".heat-scroll").forEach((el) => { el.scrollLeft = el.scrollWidth; });
}
