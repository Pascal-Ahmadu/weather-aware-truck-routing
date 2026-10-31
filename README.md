# Weather-Aware Truck Routing

[![CI](https://github.com/Pascal-Ahmadu/weather-aware-truck-routing/actions/workflows/ci.yml/badge.svg)](https://github.com/Pascal-Ahmadu/weather-aware-truck-routing/actions/workflows/ci.yml)

A React + Django web app that helps a truck driver pick the safest route. Enter an
origin, destination, departure time and load weight; the app fetches up to three
routes, samples the forecast at every checkpoint **at the hour the truck will
actually be there**, classifies each checkpoint with the wind / rain / snow / load
rules, ranks the routes, and shows everything on a map with a 0–48 h weather
heatmap slider.

## How it works

```
origin/destination ─▶ geocode ─▶ OSRM routes (≤3) ─▶ checkpoints every 10/25/50 mi
                                                             │ ETA per checkpoint from
                                                             │ the router's segment durations
                                                             ▼
                      rank routes ◀─ classify risk ◀─ Open-Meteo hourly forecast
                                                       (one call per location, 0–48 h+)
```

1. **Routing** — OSRM returns the fastest route (and sometimes alternatives) with
   per-segment distance and duration. Because OSRM's own alternatives are often
   empty on long interstate trips, the client also requests routes through detour
   waypoints offset to either side of the primary route and keeps candidates that
   are genuinely different (< 80 % shared road), at most 1.5× the primary's
   duration, and not out-and-back spurs — until it has three. Checkpoints are
   interpolated along the road geometry at mile 0, every N miles, and the
   destination; each checkpoint's ETA is the cumulative router duration to that
   point, so a slow mountain stretch pushes later ETAs back.
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
| Routing profile | OSRM's public server uses a car profile — no truck height/weight restrictions. The client is a thin wrapper so a truck-aware provider can be swapped in by URL. |

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
docs/ENGINEERING_GUIDELINES.md   the standards this code is held to
docs/DESIGN_GUIDE.md             tokens, components and map-card spec the UI follows
infra/aws/deploy.sh              one-shot App Runner + Amplify deployment
```

## Running locally

Prerequisites: Python 3.12, Node 20+. No API keys are needed — all providers are keyless.

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
```

CI (`.github/workflows/ci.yml`) runs exactly these plus a Django boot check.

## API

`POST /api/trips/plan/`

```json
{
  "origin": "Denver, CO",
  "destination": "Salt Lake City, UT",
  "departure_time": "2026-11-01T14:00:00Z",
  "load_weight_lb": 42000,
  "checkpoint_interval_miles": 25
}
```

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

## Deployment (AWS)

The API runs as a container on **AWS App Runner** (HTTPS, autoscaling, health-checked
on `/api/health/`) and the frontend is a static build on **AWS Amplify Hosting**.
Nothing is persisted, so no database is provisioned; the weather cache is
in-process (set `DATABASE_URL` + `CACHE_URL=dbcache://weather_cache` to share it
across instances).

**From GitHub Actions (recommended):** `.github/workflows/deploy.yml` assumes an
IAM role via OIDC (no stored AWS keys) and runs the deploy script on every push
to `main` that touches the app, or on demand from the Actions tab. One-time setup:

1. IAM → Identity providers: add `token.actions.githubusercontent.com` (audience `sts.amazonaws.com`).
2. IAM → Roles → Create role → Web identity: org `Pascal-Ahmadu`, repo
   `weather-aware-truck-routing`, branch `main`. Attach
   `AmazonEC2ContainerRegistryPowerUser`, `AWSAppRunnerFullAccess`,
   `AdministratorAccess-Amplify`, plus an inline policy allowing
   `iam:CreateRole`, `iam:GetRole`, `iam:AttachRolePolicy`, `iam:PassRole` on
   `arn:aws:iam::<account>:role/weather-routing-*`.
3. Repo → Settings → Secrets and variables → Actions: variable
   `AWS_DEPLOY_ROLE_ARN` (the role's ARN), secrets `DJANGO_SECRET_KEY` and
   `NOMINATIM_USER_AGENT`.

**From a laptop** (needs `aws` CLI v2 with credentials, `docker`, `npm`):

```bash
./infra/aws/deploy.sh          # API to App Runner, then frontend to Amplify
./infra/aws/deploy.sh api      # redeploy the API only
./infra/aws/deploy.sh web      # rebuild + redeploy the frontend only
```

What it creates: an ECR repository, an IAM role App Runner uses to pull the
image, the App Runner service `weather-routing-api` (0.25 vCPU / 0.5 GB), and an
Amplify app `weather-routing` with a `main` branch. Environment variables
(`SECRET_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `NOMINATIM_USER_AGENT`)
are set on the App Runner service; `VITE_API_BASE_URL` is baked into the
frontend build. Set `NOMINATIM_USER_AGENT="weather-routing (you@example.com)"`
before running — Nominatim's policy requires a contact.

Also included: `backend/Dockerfile` (used by the script), `backend/apprunner.yaml`
(source-based App Runner deploy from GitHub, no Docker), `amplify.yml`
(Amplify CI from GitHub, monorepo-aware) and `render.yaml` as a non-AWS alternative.

## Known limitations

- OSRM's public demo server is rate-limited, uses a car profile, and does not
  support `exclude=` classes. Where even detour waypoints cannot produce three
  distinct, reasonable routes (e.g. a single road through a canyon), the app
  honestly shows fewer rather than padding with near-duplicates.
- Nominatim allows one request per second; the app makes two per plan.
- Forecasts are limited to Open-Meteo's horizon, so departures must be within 14 days.
- The heatmap blends overlapping checkpoints additively (a property of
  density heatmaps); markers and route summaries carry the exact classification.
