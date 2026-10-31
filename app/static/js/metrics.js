// Definição dos indicadores: o que cada um mede, como formatar e o que mostrar do dia.
import { num, sd, avg, sleepTime, minutesText, signed } from "./util.js";

const QUALITY = { EXCELLENT: "excelente", GOOD: "boa", FAIR: "razoável", POOR: "ruim" };
const HRV_STATUS = { BALANCED: "equilibrada", UNBALANCED: "desequilibrada", LOW: "baixa", POOR: "baixa" };

const withUnit = (v, unit) => (v == null ? "—" : unit ? `${num(v)} ${unit}` : num(v));
const pct = (v, total) => (total ? Math.round((v / total) * 100) : 0);

export const METRICS = {
  sleep: {
    id: "sleep", label: "Sono", key: "sleepH", unit: "", better: "up",
    about: "Duração da noite, fases do sono e a nota calculada pela Garmin.",
    fmt: sleepTime,
    delta: (d) => `${d < 0 ? "−" : "+"}${sleepTime(Math.abs(d))}`,
    hint: (r) => (r.sleepScore != null ? `nota ${r.sleepScore} de 100` : ""),
    facts: (r) => [
      ["Dormiu às", r.bedtime ?? "—"],
      ["Acordou às", r.wake ?? "—"],
      ["Nota", r.sleepScore != null ? `${r.sleepScore}, ${QUALITY[r.sleepQuality] || "sem classificação"}` : "—"],
      ["Necessidade", r.sleepNeedMin ? minutesText(r.sleepNeedMin) : "—"],
      ["FC média no sono", withUnit(r.sleepHR, "bpm")],
      ["Estresse no sono", num(r.sleepStress)],
    ],
    bars: (r) => {
      const stages = [
        ["Profundo", r.deepMin, "var(--s-deep)"], ["REM", r.remMin, "var(--s-rem)"],
        ["Leve", r.lightMin, "var(--s-light)"], ["Acordado", r.awakeMin, "var(--s-awake)"],
      ];
      const total = stages.reduce((s, x) => s + (x[1] || 0), 0);
      return { title: "Fases do sono", items: stages.map(([label, v, color]) => ({ label, value: v || 0, total, color, text: `${minutesText(v)} · ${pct(v || 0, total)}%` })) };
    },
    cols: [["Dormiu", (r) => (r.bedtime ? `${r.bedtime} – ${r.wake}` : "—")], ["Nota", (r) => num(r.sleepScore)]],
  },

  hrv: {
    id: "hrv", label: "HRV", key: "hrv", unit: "ms", better: "up",
    about: "Variabilidade da frequência cardíaca durante a noite, comparada com a sua faixa equilibrada.",
    fmt: (v) => num(v),
    delta: (d) => `${signed(d)} ms`,
    hint: (r) => (r.hrvLow != null ? `faixa ${num(r.hrvLow)} a ${num(r.hrvHigh)} ms` : ""),
    facts: (r) => [
      ["Média da noite", withUnit(r.hrv, "ms")],
      ["Média de 7 dias", withUnit(r.hrvWeekly, "ms")],
      ["Faixa equilibrada", r.hrvLow != null ? `${num(r.hrvLow)} a ${num(r.hrvHigh)} ms` : "—"],
      ["Situação em 7 dias", r.hrvStatus ? HRV_STATUS[r.hrvStatus] || r.hrvStatus.toLowerCase() : "—"],
    ],
    cols: [["Média de 7 dias", (r) => withUnit(r.hrvWeekly, "ms")], ["Situação em 7 dias", (r) => (r.hrvStatus ? HRV_STATUS[r.hrvStatus] || r.hrvStatus.toLowerCase() : "—")]],
  },

  rhr: {
    id: "rhr", label: "Repouso", key: "restingHR", unit: "bpm", better: "down",
    about: "Frequência cardíaca em repouso. Valores mais baixos costumam indicar melhor recuperação.",
    fmt: (v) => num(v),
    delta: (d) => `${signed(d)} bpm`,
    hint: (r) => (r.maxHR != null ? `máx. ${num(r.maxHR)} bpm no dia` : ""),
    facts: (r) => [
      ["Em repouso", withUnit(r.restingHR, "bpm")],
      ["Máxima do dia", withUnit(r.maxHR, "bpm")],
      ["Média no sono", withUnit(r.sleepHR, "bpm")],
      ["Respiração média", withUnit(r.respiration, "rpm")],
    ],
    cols: [["Máxima do dia", (r) => withUnit(r.maxHR, "bpm")], ["No sono", (r) => withUnit(r.sleepHR, "bpm")]],
  },

  battery: {
    id: "battery", label: "Body Battery", key: "bbMax", unit: "", better: "up",
    about: "Nível de energia estimado pela Garmin, de 0 a 100. Aqui, o ponto mais alto de cada dia.",
    fmt: (v) => num(v),
    delta: (d) => signed(d),
    hint: (r) => (r.bbMin != null ? `mínimo ${num(r.bbMin)}` : ""),
    facts: (r) => [
      ["Máximo", num(r.bbMax)],
      ["Mínimo", num(r.bbMin)],
      ["Carregou", num(r.bbCharged)],
      ["Gastou", num(r.bbDrained)],
    ],
    cols: [["Mínimo", (r) => num(r.bbMin)], ["Carregou", (r) => num(r.bbCharged)]],
  },

  steps: {
    id: "steps", label: "Passos", key: "steps", unit: "", better: "up",
    about: "Passos do dia contra a meta que a Garmin ajusta para você.",
    fmt: (v) => num(v),
    delta: (d) => signed(d),
    hint: (r) => (r.stepGoal ? `meta ${num(r.stepGoal)}` : ""),
    facts: (r) => [
      ["Passos", num(r.steps)],
      ["Meta", r.stepGoal ? `${num(r.stepGoal)} (${pct(r.steps || 0, r.stepGoal)}%)` : "—"],
      ["Distância", r.distanceKm != null ? `${num(r.distanceKm, 1)} km` : "—"],
      ["Minutos de intensidade", `${num((r.moderateMin || 0) + (r.vigorousMin || 0))} min`],
      ["Calorias ativas", withUnit(r.kcalActive, "kcal")],
      ["Calorias totais", withUnit(r.kcal, "kcal")],
    ],
    cols: [["Meta", (r) => (r.stepGoal ? `${pct(r.steps || 0, r.stepGoal)}%` : "—")], ["Distância", (r) => (r.distanceKm != null ? `${num(r.distanceKm, 1)} km` : "—")]],
  },

  stress: {
    id: "stress", label: "Estresse", key: "stressAvg", unit: "", better: "down",
    about: "Nível médio de estresse do dia, de 0 a 100, medido pela variabilidade da frequência cardíaca.",
    fmt: (v) => num(v),
    delta: (d) => signed(d),
    hint: (r) => (r.stressMin?.high != null ? `alto por ${minutesText(r.stressMin.high)}` : ""),
    facts: (r) => [
      ["Médio", num(r.stressAvg)],
      ["Respiração média", withUnit(r.respiration, "rpm")],
    ],
    bars: (r) => {
      const s = r.stressMin || {};
      const parts = [["Repouso", s.rest, "var(--s-deep)"], ["Baixo", s.low, "var(--s-rem)"], ["Médio", s.medium, "var(--s-light)"], ["Alto", s.high, "var(--text)"], ["Atividade", s.activity, "var(--s-awake)"]];
      const total = parts.reduce((t, x) => t + (x[1] || 0), 0);
      return { title: "Como o dia se dividiu", items: parts.map(([label, v, color]) => ({ label, value: v || 0, total, color, text: `${minutesText(v)} · ${pct(v || 0, total)}%` })) };
    },
    cols: [["Em repouso", (r) => (r.stressMin?.rest != null ? minutesText(r.stressMin.rest) : "—")], ["Alto", (r) => (r.stressMin?.high != null ? minutesText(r.stressMin.high) : "—")]],
  },
};

export const ORDER = ["sleep", "hrv", "rhr", "battery", "steps", "stress"];

/** Faixa "normal" do dia: a faixa da Garmin para o HRV, média ± desvio da janela para o resto. */
export function normalRange(m, windowRows, row) {
  if (m.id === "hrv" && row?.hrvLow != null) return [row.hrvLow, row.hrvHigh];
  const v = windowRows.map((r) => r[m.key]).filter((x) => x != null);
  if (v.length < 7) return [null, null];
  const mean = avg(v), s = sd(v);
  return [mean - s, mean + s];
}

export function statusOf(value, [lo, hi]) {
  if (value == null || lo == null) return null;
  return value < lo ? "below" : value > hi ? "above" : "in";
}

/** good, bad ou flat (neutro). */
export function toneOf(m, status) {
  if (!status) return "flat";
  if (status === "in") return "good";
  if (!m.better) return "flat";
  return (m.better === "up") === (status === "above") ? "good" : "bad";
}

export const STATUS_TEXT = { in: "Dentro do seu normal", above: "Acima do seu normal", below: "Abaixo do seu normal" };
