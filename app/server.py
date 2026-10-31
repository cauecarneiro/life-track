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
            )
        for h in (hrv or {}).get("hrvSummaries", []):
            if h.get("lastNightAvg") is None:
                continue
            r = row(h["calendarDate"])
            r.update(
                hrv=h["lastNightAvg"],
                hrvWeekly=h.get("weeklyAvg"),
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
                stressAvg=get(d, "stress", "avgLevel"),
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
                kcal=get(d, "calories", "burnedTotal"),
                kcalActive=get(d, "calories", "burnedActive"),
                respiration=get(d, "respiration", "avgValue"),
                moderateMin=get(d, "intensityMinutes", "moderate"),
                vigorousMin=get(d, "intensityMinutes", "vigorous"),
            )

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


@app.post("/api/refresh")
def refresh():
    with _cache_lock:
        _cache.clear()
    return {"ok": True}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
