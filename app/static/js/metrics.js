// Definição dos indicadores: o que cada um mede, como formatar e o que mostrar do dia.
import { num, sd, avg, sleepTime, minutesText, signed } from "./util.js";

export const QUALITY = { EXCELLENT: "excelente", GOOD: "boa", FAIR: "razoável", POOR: "ruim" };
const QUALITY_FILL = { EXCELLENT: 1, GOOD: 0.75, FAIR: 0.5, POOR: 0.25 };
const HRV_STATUS = { BALANCED: "equilibrada", UNBALANCED: "desequilibrada", LOW: "baixa", POOR: "baixa" };
const FEEDBACK = {
  POSITIVE_LONG_AND_RECOVERING: "Noite longa e restauradora.",
  POSITIVE_OPTIMAL_STRUCTURE: "Estrutura de sono ideal.",
  POSITIVE_RESTFUL_EVENING: "Noite tranquila antes de dormir.",
  POSITIVE_CALM: "Noite calma.",
  NEGATIVE_LONG_BUT_NOT_ENOUGH_REM: "Noite longa, mas com pouco REM.",
  NEGATIVE_LONG_BUT_LOTS_OF_RESTLESSNESS: "Noite longa, mas agitada.",
  NEGATIVE_SHORT: "Noite curta.",
  NEGATIVE_NOT_ENOUGH_REM: "Pouco REM.",
  NEGATIVE_NOT_ENOUGH_DEEP: "Pouco sono profundo.",
  NEGATIVE_RESTLESS: "Noite agitada.",
  NEGATIVE_STRESSFUL: "Noite com estresse alto.",
};
const NEED = { DECREASED: "reduzida", INCREASED: "aumentada", NO_CHANGE: "sem mudança" };

export const sleepFeedback = (k) => FEEDBACK[k] || "";

const withUnit = (v, unit) => (v == null ? "—" : unit ? `${num(v)} ${unit}` : num(v));
const pct = (v, total) => (total ? Math.round((v / total) * 100) : 0);
const group = (title, parts) => {
  const total = parts.reduce((t, x) => t + (x[1] || 0), 0);
  return { title, items: parts.map(([label, v, color]) => ({ label, value: v || 0, total, color, text: `${minutesText(v)} · ${pct(v || 0, total)}%` })) };
};

export const METRICS = {
  battery: {
    id: "battery", icon: "battery", label: "Body Battery", key: "bbMax", unit: "", better: "up", kind: "bars", max: 100,
    sub: "Pico do dia",
    about: "Nível de energia estimado pela Garmin, de 0 a 100. Aqui, o ponto mais alto de cada dia.",
    fmt: (v) => num(v),
    delta: (d) => signed(d),
    hint: (r) => (r.bbMin != null ? `mínimo ${num(r.bbMin)}` : ""),
    intraday: "bb",
    facts: (r) => [
      ["Máximo", num(r.bbMax)],
      ["Mínimo", num(r.bbMin)],
      ["Carregou", num(r.bbCharged)],
      ["Gastou", num(r.bbDrained)],
      ["Último valor", num(r.bbLatest)],
      ["Altitude média", r.altitude != null ? `${num(r.altitude)} m` : "—"],
    ],
    cols: [["Mínimo", (r) => num(r.bbMin)], ["Carregou", (r) => num(r.bbCharged)]],
  },

  hrv: {
    id: "hrv", icon: "pulse", label: "HRV", key: "hrv", unit: "ms", better: "up", kind: "line",
    sub: "Média da noite",
    about: "Variabilidade da frequência cardíaca durante a noite, comparada com a sua faixa equilibrada.",
    fmt: (v) => num(v),
    delta: (d) => `${signed(d)} ms`,
    hint: (r) => (r.hrvLow != null ? `faixa ${num(r.hrvLow)} a ${num(r.hrvHigh)} ms` : ""),
    intraday: "hrv",
    facts: (r) => [
      ["Média da noite", withUnit(r.hrv, "ms")],
      ["Maior pico de 5 min", withUnit(r.hrvPeak5, "ms")],
      ["Média de 7 dias", withUnit(r.hrvWeekly, "ms")],
      ["Faixa equilibrada", r.hrvLow != null ? `${num(r.hrvLow)} a ${num(r.hrvHigh)} ms` : "—"],
      ["Situação em 7 dias", r.hrvStatus ? HRV_STATUS[r.hrvStatus] || r.hrvStatus.toLowerCase() : "—"],
    ],
    cols: [["Média de 7 dias", (r) => withUnit(r.hrvWeekly, "ms")], ["Situação em 7 dias", (r) => (r.hrvStatus ? HRV_STATUS[r.hrvStatus] || r.hrvStatus.toLowerCase() : "—")]],
  },

  rhr: {
    id: "rhr", icon: "heart", label: "FC repouso", key: "restingHR", unit: "bpm", better: "down", kind: "line",
    sub: "Hoje",
    about: "Frequência cardíaca em repouso. Valores mais baixos costumam indicar melhor recuperação.",
    fmt: (v) => num(v),
    delta: (d) => `${signed(d)} bpm`,
    hint: (r) => (r.maxHR != null ? `máx. ${num(r.maxHR)} bpm no dia` : ""),
    intraday: "hr",
    facts: (r) => [
      ["Em repouso", withUnit(r.restingHR, "bpm")],
      ["Mínima do dia", withUnit(r.minHR, "bpm")],
      ["Máxima do dia", withUnit(r.maxHR, "bpm")],
      ["Média no sono", withUnit(r.sleepHR, "bpm")],
    ],
    cols: [["Máxima do dia", (r) => withUnit(r.maxHR, "bpm")], ["No sono", (r) => withUnit(r.sleepHR, "bpm")]],
  },

  sleep: {
    id: "sleep", icon: "moon", label: "Sono", key: "sleepH", unit: "", better: "up", kind: "bars",
    sub: "Noite passada",
    about: "Duração da noite, fases do sono e a nota calculada pela Garmin.",
    fmt: sleepTime,
    delta: (d) => `${d < 0 ? "−" : "+"}${sleepTime(Math.abs(d))}`,
    hint: (r) => (r.sleepScore != null ? `nota ${r.sleepScore} de 100` : ""),
    facts: (r) => [
      ["Dormiu às", r.bedtime ?? "—"],
      ["Acordou às", r.wake ?? "—"],
      ["Nota", r.sleepScore != null ? `${r.sleepScore}, ${QUALITY[r.sleepQuality] || "sem classificação"}` : "—"],
      ["Necessidade", r.sleepNeedMin ? minutesText(r.sleepNeedMin) : "—"],
      ["Necessidade-base", r.sleepBaselineMin ? minutesText(r.sleepBaselineMin) : "—"],
      ["Despertares", num(r.awakeCount)],
      ["FC média no sono", withUnit(r.sleepHR, "bpm")],
      ["Estresse no sono", num(r.sleepStress)],
      ["Respiração no sono", r.sleepRespAvg != null ? `${num(r.sleepRespAvg)} rpm (${num(r.sleepRespLow)} a ${num(r.sleepRespHigh)})` : "—"],
      ["Oxigênio (SpO2)", r.sleepSpo2 != null ? `${num(r.sleepSpo2)}%` : "sem medição"],
      ["Cochilos", r.napMin ? minutesText(r.napMin) : "nenhum"],
    ],
    note: (r) => [sleepFeedback(r.sleepFeedback), r.sleepNeedMin && r.sleepBaselineMin && r.sleepNeedMin !== r.sleepBaselineMin ? "A necessidade de hoje foi ajustada pela Garmin." : ""].filter(Boolean).join(" "),
    groups: (r) => {
      const out = [group("Fases do sono", [["Profundo", r.deepMin, "var(--s-deep)"], ["REM", r.remMin, "var(--s-rem)"], ["Leve", r.lightMin, "var(--s-light)"], ["Acordado", r.awakeMin, "var(--s-awake)"]])];
      const sub = r.sleepSub || {};
      const names = { totalDuration: "Duração", stress: "Estresse", awakeCount: "Despertares", remPercentage: "REM", lightPercentage: "Sono leve", deepPercentage: "Sono profundo", restlessness: "Agitação" };
      const items = Object.entries(names).filter(([k]) => sub[k]?.q).map(([k, label]) => ({ label, value: QUALITY_FILL[sub[k].q] || 0, total: 1, color: "var(--accent)", text: QUALITY[sub[k].q] || sub[k].q.toLowerCase() }));
      if (items.length) out.push({ title: "Como a Garmin avaliou cada parte", items });
      return out;
    },
    cols: [["Dormiu", (r) => (r.bedtime ? `${r.bedtime} – ${r.wake}` : "—")], ["Nota", (r) => num(r.sleepScore)]],
  },

  intensity: {
    id: "intensity", icon: "bolt", label: "Esforço", key: "intensity", unit: "min", better: "up", kind: "bars",
    sub: "Minutos de intensidade",
    about: "Minutos de atividade moderada ou vigorosa. Os vigorosos contam em dobro para a meta semanal da Garmin.",
    fmt: (v) => num(v),
    delta: (d) => `${signed(d)} min`,
    hint: (r) => (r.intensityGoal ? `meta semanal ${num(r.intensityGoal)} min` : ""),
    facts: (r) => [
      ["Pontos de intensidade", withUnit(r.intensity, "min")],
      ["Moderados", withUnit(r.moderateMin, "min")],
      ["Vigorosos", withUnit(r.vigorousMin, "min")],
      ["Meta semanal", withUnit(r.intensityGoal, "min")],
    ],
    cols: [["Moderados", (r) => withUnit(r.moderateMin, "min")], ["Vigorosos", (r) => withUnit(r.vigorousMin, "min")]],
  },

  hr: {
    id: "hr", icon: "heart", label: "Frequência cardíaca", key: "maxHR", unit: "bpm", kind: "line",
    sub: "Máxima do dia",
    about: "A máxima de cada dia. Abra um dia para ver a curva completa, minuto a minuto, e o tempo em cada zona.",
    fmt: (v) => num(v),
    delta: (d) => `${signed(d)} bpm`,
    hint: (r) => (r.minHR != null ? `mínima ${num(r.minHR)} bpm` : ""),
    intraday: "hr",
    facts: (r) => [
      ["Máxima", withUnit(r.maxHR, "bpm")],
      ["Mínima", withUnit(r.minHR, "bpm")],
      ["Em repouso", withUnit(r.restingHR, "bpm")],
      ["Média no sono", withUnit(r.sleepHR, "bpm")],
    ],
    cols: [["Em repouso", (r) => withUnit(r.restingHR, "bpm")], ["Mínima", (r) => withUnit(r.minHR, "bpm")]],
  },

  steps: {
    id: "steps", icon: "steps", label: "Passos", key: "steps", unit: "", better: "up", kind: "bars",
    sub: "Hoje",
    about: "Passos do dia contra a meta que a Garmin ajusta para você.",
    fmt: (v) => num(v),
    delta: (d) => signed(d),
    hint: (r) => (r.stepGoal ? `meta ${num(r.stepGoal)}` : ""),
    facts: (r) => [
      ["Passos", num(r.steps)],
      ["Meta", r.stepGoal ? `${num(r.stepGoal)} (${pct(r.steps || 0, r.stepGoal)}%)` : "—"],
      ["Distância", r.distanceKm != null ? `${num(r.distanceKm, 1)} km` : "—"],
      ["Andares subidos", r.floorsUp != null ? `${num(r.floorsUp)}${r.floorsGoal ? ` de ${num(r.floorsGoal)}` : ""}` : "—"],
      ["Andares descidos", num(r.floorsDown)],
      ["Minutos de intensidade", `${num((r.moderateMin || 0) + (r.vigorousMin || 0))} min`],
    ],
    cols: [["Meta", (r) => (r.stepGoal ? `${pct(r.steps || 0, r.stepGoal)}%` : "—")], ["Distância", (r) => (r.distanceKm != null ? `${num(r.distanceKm, 1)} km` : "—")]],
  },

  stress: {
    id: "stress", icon: "wave", label: "Estresse", key: "stressAvg", unit: "", better: "down", kind: "bars", max: 100,
    sub: "Média do dia",
    about: "Nível médio de estresse do dia, de 0 a 100, medido pela variabilidade da frequência cardíaca.",
    fmt: (v) => num(v),
    delta: (d) => signed(d),
    hint: (r) => (r.stressMin?.high != null ? `alto por ${minutesText(r.stressMin.high)}` : ""),
    facts: (r) => [
      ["Médio", num(r.stressAvg)],
      ["Máximo", num(r.stressMax)],
      ["Classificação", { balanced: "equilibrado", stressful: "estressante", very_stressful: "muito estressante", calm: "calmo" }[r.stressQualifier] || r.stressQualifier || "—"],
    ],
    groups: (r) => {
      const s = r.stressMin || {};
      return [group("Como o dia se dividiu", [["Repouso", s.rest, "var(--s-deep)"], ["Baixo", s.low, "var(--s-rem)"], ["Médio", s.medium, "var(--s-light)"], ["Alto", s.high, "#d0d0d0"], ["Atividade", s.activity, "var(--s-awake)"]])];
    },
    cols: [["Em repouso", (r) => (r.stressMin?.rest != null ? minutesText(r.stressMin.rest) : "—")], ["Alto", (r) => (r.stressMin?.high != null ? minutesText(r.stressMin.high) : "—")]],
  },

  resp: {
    id: "resp", icon: "wind", label: "Respiração", key: "respiration", unit: "rpm", kind: "line",
    sub: "Média do dia",
    about: "Respirações por minuto ao longo do dia, medidas pelo relógio.",
    fmt: (v) => num(v),
    delta: (d) => `${signed(d)} rpm`,
    hint: (r) => (r.respMin != null ? `de ${num(r.respMin)} a ${num(r.respMax)} rpm` : ""),
    facts: (r) => [
      ["Média do dia", withUnit(r.respiration, "rpm")],
      ["Mínima", withUnit(r.respMin, "rpm")],
      ["Máxima", withUnit(r.respMax, "rpm")],
      ["Média no sono", withUnit(r.sleepRespAvg, "rpm")],
    ],
    cols: [["Mínima", (r) => withUnit(r.respMin, "rpm")], ["Máxima", (r) => withUnit(r.respMax, "rpm")]],
  },

  calories: {
    id: "calories", icon: "flame", label: "Calorias", key: "kcal", unit: "kcal", better: "up", kind: "bars", stacked: true,
    sub: "Gastas no dia",
    about: "Calorias gastas no dia: o que o corpo gasta parado (repouso) mais o que vem do movimento (ativas).",
    fmt: (v) => num(v),
    delta: (d) => `${signed(d)} kcal`,
    hint: (r) => (r.kcalActive != null ? `${num(r.kcalActive)} ativas` : ""),
    facts: (r) => [
      ["Total", withUnit(r.kcal, "kcal")],
      ["Em repouso", withUnit(r.kcalRest, "kcal")],
      ["Ativas", withUnit(r.kcalActive, "kcal")],
    ],
    cols: [["Em repouso", (r) => withUnit(r.kcalRest, "kcal")], ["Ativas", (r) => withUnit(r.kcalActive, "kcal")]],
  },

  floors: {
    id: "floors", icon: "stairs", label: "Andares", key: "floorsUp", unit: "", better: "up", kind: "bars",
    sub: "Subidos no dia",
    about: "Andares subidos, medidos pelo altímetro do relógio. Cada andar equivale a cerca de 3 metros.",
    fmt: (v) => num(v),
    delta: (d) => signed(d),
    hint: (r) => (r.floorsGoal ? `meta ${num(r.floorsGoal)}` : ""),
    facts: (r) => [
      ["Subidos", num(r.floorsUp)],
      ["Meta", num(r.floorsGoal)],
      ["Descidos", num(r.floorsDown)],
    ],
    cols: [["Meta", (r) => num(r.floorsGoal)], ["Descidos", (r) => num(r.floorsDown)]],
  },
};

// Body Battery, sono, passos e estresse sempre vêm primeiro em qualquer lista ou grade.
export const ORDER = ["battery", "sleep", "steps", "stress", "hrv", "rhr", "intensity", "hr", "resp", "calories", "floors"];

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
export const NEED_TEXT = NEED;
