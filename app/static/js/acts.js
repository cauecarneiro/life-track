// Agregações de treinos usadas na home e na página de treinos.
import { levelize } from "./heatmap.js?v=4";
import { addDays, fmtDay, minutesText, typeName, num } from "./util.js?v=4";

/** Células do mapa de calor: minutos de treino por dia, com link para o treino mais longo do dia. */
export function trainingCells(acts, from, to) {
  const byDay = new Map();
  for (const a of acts) {
    const d = a.start.slice(0, 10);
    if (d < from || d > to) continue;
    const e = byDay.get(d) || { minutes: 0, items: [] };
    e.minutes += (a.durationS || 0) / 60;
    e.items.push(a);
    byDay.set(d, e);
  }
  const level = levelize([...byDay.values()].map((e) => e.minutes));
  const cells = new Map();
  for (const [d, e] of byDay) {
    const main = [...e.items].sort((a, b) => b.durationS - a.durationS)[0];
    const names = e.items.map((a) => `${typeName(a.type)}${a.km ? ` ${num(a.km, 1)} km` : ""}`).join(", ");
    cells.set(d, { level: level(e.minutes), tip: `${fmtDay(d)}: ${minutesText(e.minutes)}, ${names}`, href: `#/treino/${main.id}` });
  }
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!cells.has(d)) cells.set(d, { level: 0, tip: `${fmtDay(d)}: sem treino` });
  }
  return cells;
}

export function totals(list) {
  const weighted = list.filter((a) => a.avgHR && a.durationS);
  const t = weighted.reduce((s, a) => s + a.durationS, 0);
  return {
    count: list.length,
    km: list.reduce((s, a) => s + (a.km || 0), 0),
    seconds: list.reduce((s, a) => s + (a.durationS || 0), 0),
    hr: t ? weighted.reduce((s, a) => s + a.avgHR * a.durationS, 0) / t : null,
  };
}

export const between = (acts, from, to) => acts.filter((a) => a.start.slice(0, 10) >= from && a.start.slice(0, 10) <= to);
