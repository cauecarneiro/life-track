"""Servidor local do Life Track.

Busca na API Pessoal da Garmin sob demanda e entrega JSON pronto para a tela.
Não grava nada em disco: o cache fica só na memória e some ao reiniciar.
"""

import io
import math
import threading
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fitparse import FitFile
from garmin_personal_api import (
    GarminPersonalApiClient,
    GarminPersonalApiError,
    HttpError,
    PersonalApiAuthenticator,
)
from garmin_personal_api.api_keys import resolve_api_key

STATIC_DIR = Path(__file__).parent / "static"
CHUNK_DAYS = 31
TTL_OVERVIEW = 300
TTL_ACTIVITIES = 300
TTL_DETAIL = 3600
SEMICIRCLE = 180 / 2**31


class Garmin:
    """Cliente da Garmin com renovação automática do token (válido por 24 h)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._client: GarminPersonalApiClient | None = None

    def _login(self, force: bool = False) -> GarminPersonalApiClient:
        key = resolve_api_key()
        with PersonalApiAuthenticator() as auth:
            token = auth.obtain_token(key, force_refresh=force)
        self._client = GarminPersonalApiClient(token.access_token)
        return self._client

    def call(self, method: str, *args, **kwargs):
        with self._lock:
            client = self._client or self._login()
        try:
            return getattr(client, method)(*args, **kwargs)
        except HttpError as exc:
            if exc.status_code != 401:
                raise
        with self._lock:
            client = self._login(force=True)
        return getattr(client, method)(*args, **kwargs)


garmin = Garmin()
_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()


def cached(key: str, ttl: int, build):
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < ttl:
            return hit[1]
    value = build()
    with _cache_lock:
        _cache[key] = (now, value)
    return value


def windows(start: date, end: date):
    cursor = start
    while cursor <= end:
        stop = min(cursor + timedelta(days=CHUNK_DAYS - 1), end)
        yield cursor, stop
        cursor = stop + timedelta(days=1)


def clock(ms: int | None) -> str | None:
    """Garmin manda o horário local como se fosse UTC, em milissegundos."""
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%H:%M")


def get(d: dict | None, *path):
    for step in path:
        if not isinstance(d, dict):
            return None
        d = d.get(step)
    return d


def minutes(seconds: float | None) -> int | None:
    return None if seconds is None else round(seconds / 60)


# ---------------------------------------------------------------- visão geral


def build_overview(start: date, end: date) -> dict:
    jobs = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for a, b in windows(start, end):
            jobs.append(
                (
                    pool.submit(garmin.call, "get_daily_sleep_summaries", a, b),
                    pool.submit(garmin.call, "get_daily_hrv_summaries", a, b),
                    pool.submit(garmin.call, "get_daily_summaries", a, b),
                )
            )
        results = [tuple(f.result() for f in trio) for trio in jobs]

    rows: dict[str, dict] = {}

    def row(day: str) -> dict:
        return rows.setdefault(day, {"date": day})

    for sleep, hrv, daily in results:
        for s in sleep or []:
            if not s.get("sleepTimeSeconds"):
                continue
            r = row(s["calendarDate"])
            r.update(
                sleepH=round(s["sleepTimeSeconds"] / 3600, 2),
                deepMin=minutes(s.get("deepSleepSeconds")),
                lightMin=minutes(s.get("lightSleepSeconds")),
                remMin=minutes(s.get("remSleepSeconds")),
                awakeMin=minutes(s.get("awakeSleepSeconds")),
                sleepScore=get(s, "sleepScores", "overall", "value"),
                sleepQuality=get(s, "sleepScores", "overall", "qualifierKey"),
                bedtime=clock(s.get("sleepStartTimestampLocal")),
                wake=clock(s.get("sleepEndTimestampLocal")),
                sleepHR=s.get("avgHeartRate"),
                sleepStress=s.get("avgSleepStress"),
                sleepNeedMin=get(s, "sleepNeed", "actual"),
                sleepBaselineMin=get(s, "sleepNeed", "baseline"),
                napMin=minutes(s.get("napTimeSeconds")),
                awakeCount=s.get("awakeCount"),
                sleepRespAvg=s.get("averageRespirationValue"),
                sleepRespLow=s.get("lowestRespirationValue"),
                sleepRespHigh=s.get("highestRespirationValue"),
                sleepSpo2=s.get("averageSpO2Value"),
                sleepSpo2Low=s.get("lowestSpO2Value"),
                sleepFeedback=s.get("sleepScoreFeedback"),
                sleepSub={
                    k: {"value": get(s, "sleepScores", k, "value"), "q": get(s, "sleepScores", k, "qualifierKey")}
                    for k in ("totalDuration", "stress", "awakeCount", "remPercentage", "lightPercentage", "deepPercentage", "restlessness")
                },
            )
        for h in (hrv or {}).get("hrvSummaries", []):
            if h.get("lastNightAvg") is None:
                continue
            r = row(h["calendarDate"])
            r.update(
                hrv=h["lastNightAvg"],
                hrvWeekly=h.get("weeklyAvg"),
                hrvPeak5=h.get("lastNight5MinHigh"),
                hrvStatus=h.get("status"),
                hrvLow=get(h, "baseline", "balancedLow"),
                hrvHigh=get(h, "baseline", "balancedUpper"),
            )
        for d in (daily or {}).get("data", []):
            r = row(d["calendarDate"])
            r.update(
                restingHR=get(d, "heartRate", "restingValue"),
                maxHR=get(d, "heartRate", "maxValue"),
                steps=get(d, "movement", "steps", "value"),
                stepGoal=get(d, "movement", "steps", "goal"),
                distanceKm=round((get(d, "movement", "steps", "distanceInMeters") or 0) / 1000, 2),
                stressAvg=(lambda v: v if v is not None and v >= 0 else None)(get(d, "stress", "avgLevel")),
                stressMin={
                    name: minutes((get(d, "stress", key) or 0) / 1000)
                    for name, key in (
                        ("rest", "restDurationInMillis"),
                        ("low", "lowStressDurationInMillis"),
                        ("medium", "mediumStressDurationInMillis"),
                        ("high", "highStressDurationInMillis"),
                        ("activity", "activityDurationInMillis"),
                    )
                },
                bbMax=get(d, "bodyBattery", "maxValue"),
                bbMin=get(d, "bodyBattery", "minValue"),
                bbCharged=get(d, "bodyBattery", "chargedValue"),
                bbDrained=get(d, "bodyBattery", "drainedValue"),
                minHR=get(d, "heartRate", "minValue"),
                kcal=get(d, "calories", "burnedTotal"),
                kcalActive=get(d, "calories", "burnedActive"),
                kcalRest=get(d, "calories", "burnedResting"),
                respiration=get(d, "respiration", "avgValue"),
                respMax=get(d, "respiration", "maxValue"),
                respMin=get(d, "respiration", "minValue"),
                moderateMin=get(d, "intensityMinutes", "moderate"),
                vigorousMin=get(d, "intensityMinutes", "vigorous"),
                intensityGoal=get(d, "intensityMinutes", "goal"),
                floorsUp=get(d, "movement", "floorsAscended", "value"),
                floorsDown=get(d, "movement", "floorsDescended", "value"),
                floorsGoal=get(d, "movement", "floorsAscended", "goal"),
                stressMax=get(d, "stress", "maxLevel"),
                stressQualifier=get(d, "stress", "qualifier"),
                bbLatest=get(d, "bodyBattery", "latestValue"),
                altitude=get(d, "pulseOx", "avgAltitudeInMeters"),
            )
            mod, vig = get(d, "intensityMinutes", "moderate"), get(d, "intensityMinutes", "vigorous")
            if mod is not None or vig is not None:
                r["intensity"] = (mod or 0) + 2 * (vig or 0)  # vigorosos contam em dobro na meta da Garmin

    days = sorted(rows.values(), key=lambda r: r["date"])
    return {"start": start.isoformat(), "end": end.isoformat(), "days": days}


# --------------------------------------------------------------------- treinos


def slim_activity(a: dict) -> dict:
    km = (a.get("distance") or 0) / 1000
    return {
        "id": a["activityId"],
        "name": a.get("activityName"),
        "type": get(a, "activityType", "typeKey"),
        "start": a.get("startTimeLocal"),
        "km": round(km, 2),
        "durationS": a.get("duration"),
        "movingS": a.get("movingDuration"),
        "avgHR": a.get("averageHR"),
        "maxHR": a.get("maxHR"),
        "avgSpeed": a.get("averageSpeed"),
        "cadence": a.get("averageRunningCadenceInStepsPerMinute"),
        "stride": a.get("avgStrideLength"),
        "elevGain": a.get("elevationGain"),
        "kcal": a.get("calories"),
        "te": a.get("aerobicTrainingEffect"),
        "teAnaerobic": a.get("anaerobicTrainingEffect"),
        "teLabel": a.get("trainingEffectLabel"),
        "bbDiff": a.get("differenceBodyBattery"),
        "location": a.get("locationName"),
        "maxSpeed": a.get("maxSpeed"),
        "elevLoss": a.get("elevationLoss"),
        "minElev": a.get("minElevation"),
        "maxElev": a.get("maxElevation"),
        "minTemp": a.get("minTemperature"),
        "maxTemp": a.get("maxTemperature"),
        "steps": a.get("steps"),
        "maxCadence": a.get("maxRunningCadenceInStepsPerMinute"),
        "bmrKcal": a.get("bmrCalories"),
        "waterMl": a.get("waterEstimated"),
        "moderateMin": a.get("moderateIntensityMinutes"),
        "vigorousMin": a.get("vigorousIntensityMinutes"),
        "teMsg": a.get("aerobicTrainingEffectMessage"),
        "teAnMsg": a.get("anaerobicTrainingEffectMessage"),
        "zones": [a.get(f"hrTimeInZone_{i}") for i in range(1, 6)],
    }


def build_activities(start: date, end: date) -> list[dict]:
    found: list[dict] = []
    offset = 0
    while True:
        page = garmin.call(
            "search_activities", start=offset, limit=100, start_date=start, end_date=end
        )
        found += page
        if len(page) < 100:
            break
        offset += 100
    return [slim_activity(a) for a in found]


def downsample(rows: list[dict], sport: str | None, target: int = 700) -> list[dict]:
    if not rows:
        return []
    step = max(1, math.ceil(len(rows) / target))
    t0 = rows[0]["timestamp"]
    cad_factor = 2 if sport and "running" in sport else 1
    out = []
    for i in range(0, len(rows), step):
        chunk = rows[i : i + step]

        def avg(key: str, digits: int = 2):
            vals = [r[key] for r in chunk if r.get(key) is not None]
            return round(sum(vals) / len(vals), digits) if vals else None

        lat = next((r["position_lat"] for r in chunk if r.get("position_lat") is not None), None)
        lon = next((r["position_long"] for r in chunk if r.get("position_long") is not None), None)
        cad = avg("cadence")
        speeds = [r.get("enhanced_speed") or r.get("speed") for r in chunk]
        speeds = [v for v in speeds if v is not None]
        out.append(
            {
                "t": int((chunk[0]["timestamp"] - t0).total_seconds()),
                "d": avg("distance", 1),
                "hr": avg("heart_rate", 0),
                "v": round(sum(speeds) / len(speeds), 3) if speeds else None,
                "alt": avg("enhanced_altitude", 1),
                "cad": None if cad is None else round(cad * cad_factor),
                "pw": avg("power", 0),
                "gct": avg("stance_time", 0),
                "vo": avg("vertical_oscillation", 1),
                "lat": None if lat is None else round(lat * SEMICIRCLE, 6),
                "lon": None if lon is None else round(lon * SEMICIRCLE, 6),
            }
        )
    return out


def parse_fit(zip_bytes: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".fit"))
        data = z.read(name)

    records, laps, session = [], [], {}
    for m in FitFile(io.BytesIO(data)).get_messages():
        if m.name == "record":
            records.append(m.get_values())
        elif m.name == "lap":
            laps.append(m.get_values())
        elif m.name == "session":
            session = m.get_values()

    sport = session.get("sport")
    cad_factor = 2 if sport and "running" in str(sport) else 1
    return {
        "sport": sport,
        "points": downsample(records, str(sport) if sport else None),
        "laps": [
            {
                "n": i + 1,
                "dist": lap.get("total_distance"),
                "timeS": lap.get("total_timer_time"),
                "hr": lap.get("avg_heart_rate"),
                "maxHR": lap.get("max_heart_rate"),
                "v": lap.get("enhanced_avg_speed")
                or lap.get("avg_speed")
                or (
                    lap["total_distance"] / lap["total_timer_time"]
                    if lap.get("total_distance") and lap.get("total_timer_time")
                    else None
                ),
                "cad": (lap.get("avg_running_cadence") or lap.get("avg_cadence") or 0) * cad_factor
                or None,
                "ascent": lap.get("total_ascent"),
                "power": lap.get("avg_power"),
            }
            for i, lap in enumerate(laps)
        ],
        "session": {
            "normalizedPower": session.get("normalized_power"),
            "avgPower": session.get("avg_power"),
            "avgStanceMs": session.get("avg_stance_time"),
            "avgVertOscMm": session.get("avg_vertical_oscillation"),
            "avgVertRatio": session.get("avg_vertical_ratio"),
            "avgStepLengthMm": session.get("avg_step_length"),
            "avgTemp": session.get("avg_temperature"),
            "ascent": session.get("total_ascent"),
            "descent": session.get("total_descent"),
        },
    }


# ------------------------------------------------------------------------ rotas

app = FastAPI(title="Life Track")


# ------------------------------------------------------------------ detalhe de um dia


def iso_ms(text: str | None) -> float | None:
    """'2026-11-01T03:00:00.0' (UTC) para milissegundos."""
    if not text:
        return None
    return datetime.strptime(text[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp() * 1000


def safe(fn, *args):
    """Cada dado é independente: se um falhar, os outros continuam."""
    try:
        return fn(*args)
    except GarminPersonalApiError:
        return None


def curve(rows, midnight_ms: float | None, step: int = 1):
    """[[timestamp, valor]] para [[minuto do dia, valor]], sem os vazios."""
    if not rows or midnight_ms is None:
        return []
    out = []
    for i, r in enumerate(rows):
        if i % step or r[1] is None:
            continue
        out.append([round((r[0] - midnight_ms) / 60000), r[1]])
    return out


def food_summary(log: dict | None) -> dict:
    """Refeições do diário alimentar. O formato só foi visto vazio; lê os nomes mais prováveis dos campos."""
    foods = (log or {}).get("loggedFoodsWithServingSizes") or []
    items = []
    for f in foods:
        n = f.get("nutritionContents") or f
        items.append(
            {
                "name": f.get("foodName") or f.get("name"),
                "kcal": n.get("calories"),
                "protein": n.get("protein"),
                "carbs": n.get("carbs") or n.get("carbohydrate"),
                "fat": n.get("fat"),
            }
        )
    total = lambda k: round(sum(i[k] or 0 for i in items), 1) if items else None
    return {
        "meals": len((log or {}).get("mealDetails") or []),
        "items": items,
        "kcal": total("kcal"),
        "protein": total("protein"),
        "carbs": total("carbs"),
        "fat": total("fat"),
    }


def build_day(day: date) -> dict:
    with ThreadPoolExecutor(max_workers=6) as pool:
        f = {
            "hr": pool.submit(safe, garmin.call, "get_daily_heart_rate", day),
            "bb": pool.submit(safe, garmin.call, "get_daily_body_battery", day, day),
            "hrv": pool.submit(safe, garmin.call, "get_daily_hrv", day),
            "spo2": pool.submit(safe, garmin.call, "get_daily_spo2", day),
            "food": pool.submit(safe, garmin.call, "get_daily_food_logs", day),
            "water": pool.submit(safe, garmin.call, "get_daily_hydration", day, day),
        }
        r = {k: v.result() for k, v in f.items()}

    hr = r["hr"] or {}
    hr_mid = iso_ms(hr.get("startTimestampGMT"))
    hr_points = curve(hr.get("heartRateValues"), hr_mid)

    bb = (r["bb"] or [{}])[0] if isinstance(r["bb"], list) else {}
    bb_mid = iso_ms(bb.get("startTimestampGMT"))
    events = [
        {
            "type": e.get("eventType"),
            "start": round(((iso_ms(e.get("eventStartTimeGmt")) or 0) - (bb_mid or 0)) / 60000),
            "minutes": minutes((e.get("durationInMilliseconds") or 0) / 1000),
            "impact": e.get("bodyBatteryImpact"),
        }
        for e in bb.get("bodyBatteryActivityEvent") or []
    ]

    hrv = r["hrv"] or {}
    readings = [
        {"t": (x.get("readingTimeLocal") or "")[11:16], "v": x.get("hrvValue")}
        for x in hrv.get("hrvReadings") or []
        if x.get("hrvValue") is not None
    ]

    sp = r["spo2"] or {}
    spo2_hourly = [
        [round((x[0] - (iso_ms(sp.get("startTimestampGMT")) or 0)) / 60000), x[1]]
        for x in sp.get("spO2HourlyAverages") or []
        if x[1] is not None
    ]

    water = r["water"] if isinstance(r["water"], list) else []
    return {
        "date": day.isoformat(),
        "hr": {
            "points": hr_points,
            "min": hr.get("minHeartRate"),
            "max": hr.get("maxHeartRate"),
            "resting": hr.get("restingHeartRate"),
            "avgResting7": hr.get("lastSevenDaysAvgRestingHeartRate"),
        },
        "bb": {
            "points": curve(bb.get("bodyBatteryValuesArray"), bb_mid),
            "charged": bb.get("charged"),
            "drained": bb.get("drained"),
            "events": events,
            "level": get(bb, "endOfDayBodyBatteryDynamicFeedbackEvent", "bodyBatteryLevel"),
        },
        "hrv": {
            "readings": readings,
            "lastNight": get(hrv, "hrvSummary", "lastNightAvg"),
            "peak5": get(hrv, "hrvSummary", "lastNight5MinHigh"),
            "weekly": get(hrv, "hrvSummary", "weeklyAvg"),
            "status": get(hrv, "hrvSummary", "status"),
            "low": get(hrv, "hrvSummary", "baseline", "balancedLow"),
            "high": get(hrv, "hrvSummary", "baseline", "balancedUpper"),
        },
        "spo2": {
            "avg": sp.get("averageSpO2"),
            "lowest": sp.get("lowestSpO2"),
            "sleepAvg": sp.get("avgSleepSpO2"),
            "hourly": spo2_hourly,
        },
        "food": food_summary(r["food"]),
        "water": water,
    }


# --------------------------------------------------------------- corpo e perfil


def build_profile() -> dict:
    today = date.today()
    with ThreadPoolExecutor(max_workers=5) as pool:
        f = {
            "zones": pool.submit(safe, garmin.call, "get_heart_rate_zones"),
            "age": pool.submit(safe, garmin.call, "get_fitness_age", today - timedelta(days=1)),
            "weight": pool.submit(safe, garmin.call, "get_weight_measurements", today - timedelta(days=365), today),
            "goals": pool.submit(safe, garmin.call, "get_effective_weight_goals", today - timedelta(days=365), today),
            "water": pool.submit(safe, garmin.call, "get_daily_hydration", today - timedelta(days=29), today),
        }
        r = {k: v.result() for k, v in f.items()}

    zones = (r["zones"] or [{}])[0] if isinstance(r["zones"], list) and r["zones"] else {}
    age = r["age"] or {}
    weights = []
    for w in get(r["weight"], "dailyWeightSummaries") or []:
        m = (w.get("latestWeight") or (w.get("allWeightMetrics") or [{}])[0]) or {}
        grams = m.get("weight")
        if grams:
            weights.append(
                {
                    "date": w.get("summaryDate") or m.get("calendarDate"),
                    "kg": round(grams / 1000, 1),
                    "bmi": m.get("bmi"),
                    "fat": m.get("bodyFat"),
                    "water": m.get("bodyWater"),
                    "muscleKg": round(m["muscleMass"] / 1000, 1) if m.get("muscleMass") else None,
                    "boneKg": round(m["boneMass"] / 1000, 1) if m.get("boneMass") else None,
                }
            )
    weights.sort(key=lambda x: x["date"] or "")
    return {
        "zones": {
            "method": zones.get("trainingMethod"),
            "floors": [zones.get(f"zone{i}Floor") for i in range(1, 6)],
            "max": zones.get("maxHeartRateUsed"),
            "resting": zones.get("restingHeartRateUsed"),
        }
        if zones
        else None,
        "fitnessAge": {
            "age": age.get("chronologicalAge"),
            "fitness": age.get("fitnessAge"),
            "rhr": get(age, "components", "rhr", "value"),
            "bmi": get(age, "components", "bmi", "value"),
            "bmiDate": get(age, "components", "bmi", "lastMeasurementDate"),
            "vigorousMinutes": get(age, "components", "vigorousMinutesAvg", "value"),
            "vigorousTarget": get(age, "components", "vigorousMinutesAvg", "targetValue"),
            "vigorousDays": get(age, "components", "vigorousDaysAvg", "value"),
            "vigorousDaysTarget": get(age, "components", "vigorousDaysAvg", "targetValue"),
        }
        if age
        else None,
        "weights": weights,
        "weightGoals": len(get(r["goals"], "userGoals") or []),
        "water": r["water"] if isinstance(r["water"], list) else [],
    }


@app.exception_handler(GarminPersonalApiError)
def garmin_error(_, exc: GarminPersonalApiError):
    from fastapi.responses import JSONResponse

    status = getattr(exc, "status_code", None) or 502
    return JSONResponse({"error": str(exc)}, status_code=status)


@app.get("/api/overview")
def overview(days: int = Query(30, ge=7, le=365)):
    end = date.today()
    start = end - timedelta(days=days - 1)
    return cached(f"overview:{days}:{end}", TTL_OVERVIEW, lambda: build_overview(start, end))


@app.get("/api/activities")
def activities(days: int = Query(90, ge=1, le=3650)):
    end = date.today()
    start = end - timedelta(days=days - 1)
    return cached(f"acts:{days}:{end}", TTL_ACTIVITIES, lambda: build_activities(start, end))


@app.get("/api/activities/{activity_id}")
def activity_detail(activity_id: int):
    def build():
        try:
            return parse_fit(garmin.call("download_activity", activity_id))
        except HttpError as exc:
            if exc.status_code == 404:
                raise HTTPException(404, "Atividade não encontrada") from exc
            raise

    return cached(f"act:{activity_id}", TTL_DETAIL, build)


@app.get("/api/day/{day}")
def day_detail(day: date):
    ttl = TTL_ACTIVITIES if day >= date.today() else TTL_DETAIL
    return cached(f"day:{day}", ttl, lambda: build_day(day))


@app.get("/api/profile")
def profile():
    return cached("profile", TTL_DETAIL, build_profile)


@app.post("/api/refresh")
def refresh():
    with _cache_lock:
        _cache.clear()
    return {"ok": True}


class FreshStaticFiles(StaticFiles):
    """Painel local: sempre entrega a versão atual dos arquivos, sem cache do navegador."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store"
        return response


app.mount("/", FreshStaticFiles(directory=STATIC_DIR, html=True), name="static")
