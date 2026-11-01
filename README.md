# Weather-Aware Truck Routing

[![CI](https://github.com/Pascal-Ahmadu/weather-aware-truck-routing/actions/workflows/ci.yml/badge.svg)](https://github.com/Pascal-Ahmadu/weather-aware-truck-routing/actions/workflows/ci.yml)

A React + Django web app that helps a truck driver pick the safest route. Enter an
origin, destination, departure time and load weight; the app fetches up to three
routes, samples the forecast at every checkpoint **at the hour the truck will
actually be there**, classifies each checkpoint with the wind / rain / snow / load
rules, ranks the routes, and shows everything on a map with a 0–48 h weather
heatmap slider.

- **Live app:** https://frontend-ashy-mu-27.vercel.app
- **API:** https://52-45-175-85.sslip.io/api/health/ (Django on AWS EC2 behind Caddy TLS)

## How it works

```
origin/destination ─▶ geocode ─▶ OSRM routes (≤3) ─▶ checkpoints every 10/25/50 mi
                                                             │ ETA per checkpoint from
                                                             │ the router's segment durations
                                                             ▼
                      rank routes ◀─ classify risk ◀─ Open-Meteo hourly forecast
                                                       (one call per location, 0–48 h+)
```

1. **Routing** — **OpenRouteService's `driving-hgv` profile** when an `ORS_API_KEY`
   is configured: the truck's gross weight (load + a configurable 33,000 lb
   tractor/trailer tare) is sent as a restriction so weight-limited roads are
   avoided, and HGV speed limits drive the ETAs (Denver → Salt Lake City is 11.3 h
   by truck vs 9 h by car). Without a key — or if ORS is down — it falls back to
   OSRM's keyless car profile. Routers rarely return three distinct routes on long
   interstate trips (ORS only offers built-in alternatives under 100 km), so the
   client also requests routes through detour waypoints offset to either side of
   the primary and keeps candidates that are genuinely different (< 80 % shared
   road), at most 1.5× the primary's duration, and not out-and-back spurs — until it
   has three. Checkpoints are interpolated along the road geometry at mile 0, every
   N miles, and the destination; each checkpoint's ETA comes from the router's
   per-step durations, so a slow mountain stretch pushes later ETAs back.
2. **Weather** — Open-Meteo returns hourly `wind_speed_10m` (mph), `rain` and
   `snowfall` (inches) for the whole trip window in one call per unique location
   (deduplicated on a ~1 km grid, batched, cached for 30 min).
3. **Risk** — a pure function classifies each hour of each checkpoint with the
   threshold table and load rules below. The checkpoint's headline risk is the
   hour nearest its ETA; the full 49-hour series feeds the heatmap slider.
4. **Recommendation** — routes are ranked by No Travel miles, then Severe miles,
   High miles, distance-weighted average risk, and finally duration.

### Risk rules

| Condition | Low | Moderate | High | Severe | No Travel |
|---|---|---|---|---|---|
| Wind | < 25 mph | 25–34 | 35–44 | 45–54 | ≥ 55 |
| Rain | < 0.10 in/hr | 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | > 1.00 |
| Snow | < 0.5 in/hr | 0.5–1.0 | 1.0–2.0 | 2.0–3.0 | > 3.0 |

Load rules (escalations only): wind ≥ 55 → No Travel for any load; wind 45–54 and
load > 30,000 lb → No Travel; wind 35–44 and load > 40,000 lb → Severe.

A checkpoint's level is the **worst** of wind/rain/snow, then load rules. Every
threshold boundary has a unit test (`backend/risk/tests/test_engine.py`).

### Assumptions (where the brief left room)

| Topic | Decision |
|---|---|
| "Every 10 / 25 / 50 miles" | A user-selectable checkpoint spacing (default 25 mi), not three simultaneous samplings. |
| Shared boundary values | Belong to the more severe bucket: 25 mph is Moderate, 0.25 in/hr rain is High. The spec writes rain/snow No Travel as strictly `>`, so 1.00 in/hr rain and 3.0 in/hr snow stay Severe. |
| "Severe miles" | A checkpoint's risk applies to the miles from that checkpoint to the next one. The destination checkpoint covers 0 mi. |
| Average risk | Distance-weighted mean of the numeric level (Low 0 … No Travel 4) over segments with data. |
| No Travel | Treated as a hard constraint and ranked before the four spec criteria, and flagged on the route card. |
| Missing forecast | Reported as **Unknown** (grey), excluded from the average, never defaulted to Low. |
| Heatmap window | 0–48 h from the departure hour; weather is also fetched past 48 h if the trip runs longer so late checkpoints still get an ETA reading. |
| Routing profile | OpenRouteService `driving-hgv` with gross weight = load + 33,000 lb tare (`TRUCK_TARE_LB`); height/width are not sent because the brief gives no vehicle dimensions. OSRM (car profile) is the keyless fallback and is labelled as such in the response and UI. |

## Repository layout

```
backend/            Django + DRF
  risk/             pure classification (threshold table + load rules) and its tests
  recommendation/   pure ranking and its tests
  geocoding/ routing/ weather/   thin third-party clients (Nominatim, OSRM, Open-Meteo)
  trips/            POST /api/trips/plan/ — orchestration, checkpoint sampling, serializer, integration tests
  core/             geo helpers, API error shape
  config/           settings (12-factor, env-driven), urls
frontend/           React 19 + TypeScript + Vite · TanStack Query · react-leaflet · Headless UI + Heroicons · react-day-picker
  src/lib/          API client/types, risk colours, corridor segment builder (+ tests), form schema
  src/components/   TripForm (+ ui/ DateTimeField, SelectField, Field), RouteList, RouteMap, CorridorHeatLayer,
                    ForecastSlider, RiskLegend, RiskBadge
infra/aws/ec2-setup.sh           one-command EC2 provisioning (Docker + Caddy TLS) — the live setup
infra/aws/deploy.sh              alternative: one-shot App Runner + Amplify deployment
```

## Running locally

Prerequisites: Python 3.12, Node 20+. Everything runs keyless; add a free
[OpenRouteService](https://openrouteservice.org) key as `ORS_API_KEY` to get
truck-aware routing instead of the OSRM car fallback.

```bash
# Backend
cd backend
python -m venv .venv && .venv/Scripts/activate      # or: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                                 # set SECRET_KEY to anything locally
python manage.py migrate
python manage.py runserver                           # http://localhost:8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev                                          # http://localhost:5173 (proxies /api to :8000)
```

Try: Denver, CO → Salt Lake City, UT, 42,000 lb, 25-mile checkpoints. Origins and
destinations also accept `lat,lon`.

### Tests and checks

```bash
cd backend && pytest -q && ruff check . && ruff format --check .
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
cd frontend && npx playwright install chromium && npm run e2e   # browser flows against the production build, API mocked
```

CI (`.github/workflows/ci.yml`) runs exactly these plus a Django boot check. The
end-to-end suite covers the plan → results → select → slider flow, location
search with picked coordinates, client-side validation, and the phone layout.

## API

`GET /api/geocode/suggest/?q=denv` — type-ahead suggestions (Photon, cached 10 min):

```json
{ "results": [{ "name": "Denver, Colorado, United States", "lat": 39.7392, "lon": -104.9903 }] }
```

`POST /api/trips/plan/`

```json
{
  "origin": "Denver, CO",
  "destination": "Salt Lake City, UT",
  "origin_coords": [39.7392, -104.9903],
  "destination_coords": null,
  "departure_time": "2026-11-01T14:00:00Z",
  "load_weight_lb": 42000,
  "checkpoint_interval_miles": 25
}
```

`*_coords` are optional `[lat, lon]` pairs from a picked suggestion; when present the
label is used as-is and not re-geocoded. Free text (or `lat,lon`) still works.

Response (abridged):

```json
{
  "query": { "origin": {"name", "lat", "lon"}, "destination": {...}, "departure_time", "load_weight_lb", "checkpoint_interval_miles" },
  "forecast_hours": ["2026-11-01T14:00:00+00:00", "... 49 entries"],
  "recommended_route_id": "route-1",
  "routes": [
    {
      "id": "route-1", "rank": 1, "recommended": true,
      "distance_miles": 525.3, "duration_seconds": 29870, "eta": "...",
      "geometry": [[lat, lon], ...],
      "summary": { "no_travel_miles": 0, "severe_miles": 0, "high_miles": 50, "moderate_miles": 125, "low_miles": 350.3, "unknown_miles": 0, "average_risk": 0.62 },
      "checkpoints": [
        {
          "index": 2, "mile": 50, "lat": 40.1, "lon": -105.9, "eta": "...", "segment_miles": 25,
          "weather": { "wind_mph": 38.2, "rain_in_hr": 0.0, "snow_in_hr": 0.0 },
          "risk": { "level": 3, "label": "Severe" },
          "forecast": { "wind_mph": [...49], "rain_in_hr": [...], "snow_in_hr": [...], "risk": [...49] }
        }
      ]
    }
  ]
}
```

Errors are `{ "error": { "code", "detail" } }` with 400 (validation / location not
found), 422 (no route), 503 (provider unavailable), 429 (rate limited).

## Deployment

**Live setup:** the API runs in Docker on a single **AWS EC2** instance behind
**Caddy** (automatic Let's Encrypt TLS, security headers); the frontend is a static
build on **Vercel**. Nothing is persisted, so no database is provisioned; the
weather cache is in-process (set `DATABASE_URL` + `CACHE_URL=dbcache://weather_cache`
to share it across instances).

### API on EC2

On a fresh Ubuntu instance (t3.micro is plenty) with inbound 80/443 open:

```bash
curl -fsSL https://raw.githubusercontent.com/Pascal-Ahmadu/weather-aware-truck-routing/main/infra/aws/ec2-setup.sh \
  | sudo bash -s -- <public-ip> https://<frontend-origin> you@example.com
```

`infra/aws/ec2-setup.sh` installs Docker and Caddy, builds the API image from
this repo, runs it with `--restart unless-stopped`, and serves it over HTTPS at
`https://<ip-with-dashes>.sslip.io` with an automatic certificate (no domain
purchase needed). Settings live in `/etc/weather-routing.env` (add `ORS_API_KEY`
there for truck routing). Re-run the same command to update; it pulls `main`,
rebuilds and restarts.

### Frontend on Vercel

Import the repo, root directory `frontend`, framework Vite. Set
`VITE_API_BASE_URL=https://<api-host>` — or leave it unset and let
`frontend/vercel.json` proxy `/api/*` to the API (same-origin, no CORS).

### Alternatives in the repo

- `infra/aws/deploy.sh` — one-shot **App Runner + Amplify** deployment (ECR image,
  pull role, App Runner service, Amplify app). Needs `aws` CLI v2, `docker`, `npm`.
- `backend/apprunner.yaml` — source-based App Runner deploy from GitHub, no Docker.
- `amplify.yml` — Amplify CI from GitHub, monorepo-aware.
- `render.yaml` — Render blueprint.
- `backend/vercel.json` — run the Django API as a Vercel Python function (expect a
  1–2 s cold start; the in-process cache does not persist between invocations).

### Vercel for both halves (zero infrastructure)

Importing the repo into Vercel detects two projects. Configure them as:

| Project | Root directory | Environment variables |
|---|---|---|
| API | `backend` | `SECRET_KEY`, `DEBUG=False`, `ALLOWED_HOSTS=.vercel.app`, `CORS_ALLOWED_ORIGIN_REGEXES=^https://weather-aware-truck-routing.*\.vercel\.app$`, `NOMINATIM_USER_AGENT` |
| Web | `frontend` | `VITE_API_BASE_URL=https://<api-project>.vercel.app` — or leave it unset and let `frontend/vercel.json` proxy `/api/*` to the API (same-origin, no CORS) |

`backend/vercel.json` routes every path to Django's WSGI app as a Python
function. Expect a 1–2 s cold start after idle; the in-process weather cache
does not persist between invocations (correctness is unaffected).

## Decisions

The judgment calls behind the build, each with the alternative and why it lost.

**Risk engine**
- Shared boundary values go to the more severe bucket (25 mph is Moderate, 0.25 in/hr
  rain is High), matching how the wind row is written. The spec writes rain/snow No
  Travel as strictly `>`, so 1.00 in/hr stays Severe. Every boundary is a test.
- A checkpoint is the worst of wind, rain and snow; the load rules only ever escalate
  — heavy snow at 40 mph with a 50,000 lb load stays No Travel.
- Load weight is the payload the driver enters; routing uses payload + a 33,000 lb
  tractor/trailer tare (`TRUCK_TARE_LB`). Height/width are not sent because the brief
  gives no vehicle dimensions.

**Sampling and ETAs**
- "Every 10 / 25 / 50 miles" is a selectable spacing (default 25), not three
  simultaneous samplings, which would triple the weather calls for no extra decision.
- ETAs come from the router's per-step durations, so a slow mountain stretch pushes
  every later ETA back and changes which forecast hour each checkpoint reads.
- Each checkpoint reads the forecast hour nearest its ETA; the whole 0–48 h series is
  classified server-side so the slider is an array lookup and never fetches.
- Missing forecast data is Unknown, excluded from averages, never defaulted to Low.

**Ranking**
- Strict lexicographic order as specified — Severe miles, High miles, average risk,
  time — rather than a weighted score, which would let many High miles outrank a few
  Severe ones.
- No Travel miles are a hard gate ahead of the four criteria; "No Travel" is not
  merely "worse than Severe".
- A checkpoint's risk applies to the miles until the next checkpoint; the destination
  covers zero. Simpler to explain than half-segments either side, with no accuracy
  gain at 10–50 mile spacing.
- The recommendation's one-line reason is generated from the same numbers the ranker
  used, so it cannot disagree with the ranking.

**Routing and data**
- OpenRouteService `driving-hgv` with the gross weight as a restriction; OSRM car as
  the keyless fallback, labelled as such in the response and UI.
- Alternatives come from detour waypoints filtered for overlap (< 80 % shared road),
  duration (≤ 1.5× primary) and out-and-back spurs; fewer than three are shown
  honestly rather than padded.
- Open-Meteo returns mph/inch natively and the full hourly window per location in one
  call. Photon for type-ahead (Nominatim's policy forbids autocomplete), Nominatim for
  final geocoding.

**Interface**
- One screen; no login, history or second page.
- The heatmap paints each road segment in the exact risk colour for the selected hour
  — a density heatmap stacks overlapping checkpoints and can render a Low corridor as
  Severe.
- Map fit is instant and selection only pans, because animated zooms show scaled,
  blurry tiles on a slow tile server.

## Known limitations

- ORS's free tier allows ~2,000 directions requests/day (a plan uses up to 11);
  the OSRM fallback is a rate-limited public demo with a car profile. Where even
  detour waypoints cannot produce three distinct, reasonable routes (e.g. a single
  road through a canyon), the app honestly shows fewer rather than padding with
  near-duplicates.
- Nominatim allows one request per second; the app makes two per plan.
- Forecasts are limited to Open-Meteo's horizon, so departures must be within 14 days.
- The heatmap blends overlapping checkpoints additively (a property of
  density heatmaps); markers and route summaries carry the exact classification.
