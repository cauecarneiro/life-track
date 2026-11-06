// Um treino: números, percurso, gráficos ao longo da distância, zonas e voltas.
import { loadActivities, loadFit, hasFit } from "../api.js?v=4";
import { mount, baseOptions, onCleanup, css } from "../charts.js?v=4";
import { loadingHtml, barsHtml } from "../ui.js?v=4";
import { esc, num, avg, duration, minutesText, pace, fmtDay, typeName, signed, RUNS, icon } from "../util.js?v=4";

const TE_LABEL = {
  RECOVERY: "recuperação", AEROBIC_BASE: "base aeróbica", TEMPO: "ritmo", LACTATE_THRESHOLD: "limiar",
  VO2MAX: "VO2 máx.", ANAEROBIC_CAPACITY: "anaeróbico", SPRINT: "tiro",
};
const ZONE_COLORS = ["#48484a", "#636366", "#8e8e93", "#c7c7cc", "#ffffff"];

const smooth = (values, w) => values.map((_, i) => avg(values.slice(Math.max(0, i - w), i + w + 1)));
const kpi = (label, value, unit = "", note = "") =>
  `<div class="kpi"><span class="kpi-label">${esc(label)}</span><span class="kpi-value num">${value}${unit ? `<small>${esc(unit)}</small>` : ""}</span>${note ? `<span class="muted">${esc(note)}</span>` : ""}</div>`;

export async function renderWorkout(root, { id }, alive) {
  if (!hasFit(id)) root.innerHTML = loadingHtml("Lendo o arquivo do treino");
  const [acts, fit] = await Promise.all([loadActivities(), loadFit(id)]);
  if (!alive()) return;

  const a = acts.find((x) => String(x.id) === String(id)) || {};
  const pts = fit.points;
  const s = fit.session || {};
  const hasGps = pts.some((p) => p.lat != null);
  const hasDist = pts.some((p) => p.d);
  const hasAlt = pts.some((p) => p.alt != null);
  const hasCad = pts.some((p) => p.cad);
  const hasPw = pts.some((p) => p.pw);
  const isRun = RUNS.has(a.type) || String(fit.sport).includes("running");
  const zoneTotal = (a.zones || []).reduce((t, z) => t + (z || 0), 0);

  const kpis = [
    a.km ? kpi("Distância", num(a.km, 2), "km") : "",
    kpi("Tempo", duration(a.durationS), "", a.movingS ? `em movimento ${duration(a.movingS)}` : ""),
    a.km && isRun ? kpi("Ritmo médio", pace(a.avgSpeed), "/km") : "",
    kpi("FC média", num(a.avgHR), "bpm", `máxima ${num(a.maxHR)} bpm`),
    a.elevGain ? kpi("Subida", num(a.elevGain), "m", s.descent ? `descida ${num(s.descent)} m` : "") : "",
    a.cadence ? kpi("Cadência", num(a.cadence), "ppm") : "",
    a.te != null ? kpi("Efeito aeróbico", num(a.te, 1), "de 5", TE_LABEL[a.teLabel] || "") : "",
    a.kcal ? kpi("Gasto", num(a.kcal), "kcal") : "",
  ].join("");

  const more = [
    a.maxSpeed && ["Velocidade máxima", isRun ? `${pace(a.maxSpeed)} /km` : `${num(a.maxSpeed * 3.6, 1)} km/h`],
    a.elevLoss != null && ["Descida", `${num(a.elevLoss)} m`],
    a.minElev != null && ["Altitude", `${num(a.minElev)} a ${num(a.maxElev)} m`],
    a.minTemp != null && ["Temperatura", `${num(a.minTemp)} a ${num(a.maxTemp)} °C`],
    a.steps && ["Passos", num(a.steps)],
    a.maxCadence && ["Cadência máxima", `${num(a.maxCadence)} ppm`],
    a.stride && ["Passada média", `${num(a.stride / 100, 2)} m`],
    (a.moderateMin || a.vigorousMin) && ["Minutos de intensidade", `${num(a.moderateMin || 0)} moderados, ${num(a.vigorousMin || 0)} vigorosos`],
    a.teAnaerobic != null && ["Efeito anaeróbico", `${num(a.teAnaerobic, 1)} de 5`],
    a.bbDiff != null && ["Body Battery", signed(a.bbDiff)],
    a.waterMl && ["Perda de líquido estimada", `${num(a.waterMl)} mL`],
    a.bmrKcal && ["Calorias de repouso no período", `${num(a.bmrKcal)} kcal`],
  ].filter(Boolean);

  const dyn = [
    s.avgPower && ["Potência média", `${num(s.avgPower)} W`],
    s.normalizedPower && ["Potência normalizada", `${num(s.normalizedPower)} W`],
    s.avgStanceMs && ["Contato com o solo", `${num(s.avgStanceMs)} ms`],
    s.avgVertOscMm && ["Oscilação vertical", `${num(s.avgVertOscMm / 10, 1)} cm`],
    s.avgVertRatio && ["Razão vertical", `${num(s.avgVertRatio, 1)} %`],
    s.avgStepLengthMm && ["Passada", `${num(s.avgStepLengthMm / 1000, 2)} m`],
    s.avgTemp != null && ["Temperatura", `${num(s.avgTemp)} °C`],
  ].filter(Boolean);

  const speeds = fit.laps.map((l) => l.v || 0).filter(Boolean);
  const maxV = Math.max(0, ...speeds), floorV = Math.min(...speeds, maxV) * 0.85;
  const lapRows = fit.laps.map((l) => `<tr>
    <td class="muted">${l.n}</td><td class="num">${l.dist ? `${num(l.dist / 1000, 2)} km` : "—"}</td><td class="num">${duration(l.timeS)}</td>
    <td class="num">${isRun ? `<span class="pace"><span class="pbar"><i style="width:${maxV > floorV ? Math.max(4, (((l.v || 0) - floorV) / (maxV - floorV)) * 100) : 0}%"></i></span>${pace(l.v)}</span>` : "—"}</td>
    <td class="r num">${num(l.hr)}</td><td class="r num">${num(l.maxHR)}</td><td class="r num">${num(l.cad)}</td>
    <td class="r num">${l.ascent != null ? `${num(l.ascent)} m` : "—"}</td><td class="r num">${l.power ? `${num(l.power)} W` : "—"}</td></tr>`).join("");

  const plot = (cid, title, note, small = false) =>
    `<section class="section"><div class="section-head"><div><h2>${title}</h2>${note ? `<p>${note}</p>` : ""}</div></div><div class="plot${small ? " sm" : ""}"><canvas id="${cid}" role="img" aria-label="${esc(title)}"></canvas></div></section>`;
  const where = hasDist ? "Ao longo da distância, em quilômetros." : "Ao longo do tempo.";

  root.innerHTML = `
    <a class="crumb" href="#/treinos">${icon("chevLeft")} Treinos</a>
    <div class="page-head"><div>
      <h1>${esc(a.name || typeName(a.type) || "Treino")}</h1>
      <p class="muted">${esc(typeName(a.type))}${a.start ? `, ${esc(fmtDay(a.start, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))} às ${esc(a.start.slice(11, 16))}` : ""}${a.location ? `, ${esc(a.location)}` : ""}</p>
    </div></div>

    <section class="kpis kpis-4">${kpis}</section>
    ${more.length ? `<section class="section"><div class="section-head"><div><h2>Mais números</h2><p>Tudo o que a Garmin registrou deste treino.</p></div></div>
      <dl class="facts">${more.map(([k, v]) => `<div class="fact"><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`).join("")}</dl></section>` : ""}
    ${hasGps ? '<div id="map" role="img" aria-label="Mapa do percurso"></div>' : ""}
    ${plot("c-pace", isRun ? "Ritmo" : "Velocidade", `${where} Quanto mais alto no gráfico, mais rápido.`)}
    ${plot("c-hr", "Frequência cardíaca", where, true)}
    ${hasAlt && hasGps ? plot("c-alt", "Altimetria", "Altitude em metros.", true) : ""}
    <div class="pair">
      ${hasCad ? plot("c-cad", "Cadência", isRun ? "Passos por minuto." : "Rotações por minuto.", true) : ""}
      ${hasPw ? plot("c-pw", "Potência", "Watts.", true) : ""}
    </div>

    ${zoneTotal || dyn.length ? `<section class="section split">
      ${zoneTotal ? `<div><div class="section-head"><div><h2>Zonas de frequência</h2><p>Tempo em cada zona, da 1 (leve) à 5 (máxima).</p></div></div>
        ${barsHtml({ items: (a.zones || []).map((z, i) => ({ label: `Zona ${i + 1}`, value: z || 0, total: zoneTotal, color: ZONE_COLORS[i], text: `${minutesText((z || 0) / 60)} · ${Math.round(((z || 0) / zoneTotal) * 100)}%` })) })}</div>` : "<div></div>"}
      ${dyn.length ? `<div><div class="section-head"><div><h2>Dinâmica de corrida</h2><p>Médias do treino inteiro.</p></div></div>
        <dl class="facts one">${dyn.map(([k, v]) => `<div class="fact"><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`).join("")}</dl></div>` : "<div></div>"}
    </section>` : ""}

    ${fit.laps.length > 1 ? `<section class="section"><div class="section-head"><div><h2>Voltas</h2><p>${fit.laps.length} voltas registradas.</p></div></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Volta</th><th>Distância</th><th>Tempo</th><th>${isRun ? "Ritmo" : "Velocidade"}</th><th class="r">FC média</th><th class="r">FC máx.</th><th class="r">Cadência</th><th class="r">Subida</th><th class="r">Potência</th></tr></thead>
        <tbody>${lapRows}</tbody></table></div></section>` : ""}`;

  // ---------------------------------------------------------------- mapa
  if (hasGps) {
    const line = pts.filter((p) => p.lat != null).map((p) => [p.lat, p.lon]);
    const map = L.map("map", { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap", className: "tiles-dark" }).addTo(map);
    const path = L.polyline(line, { color: "#ffffff", weight: 3 }).addTo(map);
    L.circleMarker(line[0], { radius: 6, color: "#000", weight: 2, fillColor: "#2aadbb", fillOpacity: 1 }).bindTooltip("Início").addTo(map);
    L.circleMarker(line[line.length - 1], { radius: 6, color: "#2aadbb", weight: 2, fillColor: "#000", fillOpacity: 1 }).bindTooltip("Fim").addTo(map);
    map.fitBounds(path.getBounds(), { padding: [24, 24] });
    onCleanup(() => map.remove());
  }

  // ---------------------------------------------------------------- gráficos (um eixo por gráfico)
  const labels = pts.map((p) => (hasDist ? num((p.d || 0) / 1000, 1) : duration(p.t)));
  const text = css("--ink");
  const series = (cid, label, data, extra = {}, scaleExtra = {}, fmt = (v) => num(v)) =>
    mount(cid, {
      type: "line",
      data: { labels, datasets: [{ label, data, borderColor: text, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3, tension: 0, spanGaps: true, ...extra }] },
      options: baseOptions({
        scales: { x: { ticks: { maxTicksLimit: 9 } }, y: { ...scaleExtra } },
        plugins: { crosshair: { enabled: true }, tooltip: { callbacks: { title: (i) => (hasDist ? `${i[0].label} km` : i[0].label), label: (c) => `${label}: ${fmt(c.raw)}` } } },
      }),
    });

  const speed = smooth(pts.map((p) => (p.v && p.v > 0.5 ? p.v : null)), 5);
  if (isRun) {
    series("c-pace", "Ritmo", speed.map((v) => (v ? 1000 / v / 60 : null)), {}, {
      reverse: true,
      ticks: { callback: (v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}` },
    }, (v) => `${pace(1000 / (v * 60))} /km`);
  } else {
    series("c-pace", "Velocidade", speed.map((v) => (v ? v * 3.6 : null)), {}, { ticks: { callback: (v) => `${v} km/h` } }, (v) => `${num(v, 1)} km/h`);
  }
  series("c-hr", "FC", pts.map((p) => p.hr), {}, { ticks: { callback: (v) => `${v}` } }, (v) => `${num(v)} bpm`);
  if (hasAlt && hasGps) series("c-alt", "Altitude", pts.map((p) => p.alt), { fill: "origin" }, { beginAtZero: false, ticks: { callback: (v) => `${v} m` } }, (v) => `${num(v)} m`);
  if (hasCad) series("c-cad", "Cadência", smooth(pts.map((p) => p.cad || null), 3), {}, { beginAtZero: false }, (v) => `${num(v)} ${isRun ? "ppm" : "rpm"}`);
  if (hasPw) series("c-pw", "Potência", smooth(pts.map((p) => p.pw || null), 3), {}, { beginAtZero: false, ticks: { callback: (v) => `${v} W` } }, (v) => `${num(v)} W`);
}
