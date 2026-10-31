# Weather-Aware Truck Routing — Engineering Guidelines

> Adapted from `maizube-erp-backend/docs/ENGINEERING_GUIDELINES.md` (30 Oct 2026) —
> the quality bar, 12-factor, DRY/SOLID and concurrency principles are
> project-agnostic and carry over unchanged; the specifics below are translated
> from NestJS/TypeORM/Next.js into how they manifest in a **Django + DRF**
> backend and a **React** frontend built around a routing/weather/risk domain
> instead of an ERP domain. Where the ERP guidelines say "lock the stock row",
> this project says "don't re-fetch a weather checkpoint you already paid an
> API call for"; where they say "transaction + ledger entry", this project says
> "idempotent route computation, cached per (route, checkpoint, hour)". The goal
> is the same: correct under concurrency, configurable, cheap to change.

**Stack:** Django + Django REST Framework + PostgreSQL (backend) · React +
TypeScript + TanStack Query, a map library (Leaflet/Mapbox/Google Maps) and a
charting/heatmap layer (frontend). Third-party routing, geocoding, and weather
APIs are external dependencies, not things this repo re-implements.

---

## ⭐ The Quality Bar — 9/10, at all times (non-negotiable)

This codebase must sit at **9/10 or above on every dimension, on every commit**
— not as a one-off cleanup, but as the standing state. A change that would
drop any dimension below 9 is **not done**, regardless of whether the feature
"works".

**The rule:** if you can't keep it at 9, don't merge it. Fix the gap in the
same change, or don't make the change.

### What 9/10 requires per dimension

| Dimension | The 9/10 bar | Enforced by |
|---|---|---|
| **Build & types** | Backend: no bare `except:`, no untyped public service function without a docstring/type hints. Frontend: `tsc --noEmit` and the production build (`vite build` / equivalent) are clean. **Zero** `any` without a commented, justified boundary cast. | CI: type-check + build |
| **Tests** | The risk/load classification engine (§5.1) and the route recommendation ranking (§5.2) have unit tests covering every threshold boundary in the spec table, not just happy-path values. A bug fix adds a test that fails before and passes after. Coverage never drops. | CI: `pytest` + frontend test runner |
| **Runtime correctness** | The app **boots** and a full "generate routes → sample weather → classify risk → recommend" request succeeds end-to-end against mocked third-party responses. No double-submit of a route-generation request; weather sampling is deterministic for the same input. | CI boot smoke + integration test |
| **Security** | No API key, credential, or third-party URL in source — all via env, fail-fast validated (§4). DRF views default-deny unauthenticated access where the spec implies a user-scoped action; inputs validated at the serializer boundary. | env config + review |
| **Schema** | Every model change has a Django migration; migrations are self-contained (run clean on an empty DB). | CI migrate-on-fresh-DB |
| **DRY / SOLID** | No copy-pasted risk-threshold logic or weather-fetch logic; shared backend code lives in a `core`/`common` app, shared frontend code in `src/lib/`. One responsibility per module (routing client vs. weather client vs. risk engine vs. recommendation engine stay separate). | review |
| **Config / 12-factor** | All 12 factors hold (see §4). Stateless processes; structured logs. | review + CI |
| **Docs** | This file stays accurate. A change that alters the risk/load thresholds or the recommendation priority order updates §5.1/§5.2 in the same PR. | review |

### How we hold the line
- **CI is the floor, not the ceiling.** Green CI (type-check → build → migrate-on-fresh-DB → backend tests → frontend tests → boot smoke) is the *minimum* to merge.
- **"Compiles" ≠ "works."** Run the real flow against mocked third-party APIs — a risk engine that type-checks but misclassifies a boundary value (e.g. exactly 25 mph wind) is not done.
- **Leave it ≥9.** Touched a module that's below bar? Bring it up as part of your change.
- **No silent debt.** If something must temporarily drop below 9 (e.g. a third-party API's rate limit forces a shortcut), it's a tracked, dated item with a removal condition — never an unremarked regression.

---

## 0. Definition of Done (the checklist)

A change is **not done** until all of these are true:

- [ ] Backend compiles/imports cleanly; `python manage.py check` passes.
- [ ] Lint passes (backend: `ruff`/`flake8`/`black --check`; frontend: `eslint`).
- [ ] **Any risk/load threshold or recommendation-ranking change is covered by a
      boundary-value test** (see §5.1/§5.2) — not just a value comfortably inside
      a bucket.
- [ ] **No new config, secret, API key, or third-party URL is hardcoded** — it
      comes from env (see §4).
- [ ] No business logic was copy-pasted — shared code lives in the backend
      `core`/`common` app or `src/lib/` on the frontend (see §3).
- [ ] Inputs are validated at the boundary (DRF serializer on the backend, a
      schema — e.g. `zod` — per form on the frontend). Never trust client input.
- [ ] Errors use typed exceptions/structured DRF error responses, never
      swallowed; a failed third-party call surfaces as a clear error, not a
      silently wrong route.
- [ ] New endpoints are documented (docstring / OpenAPI schema if drf-spectacular
      or similar is in use).
- [ ] If it triggers a third-party API call: it's **not re-fetched needlessly**
      — duplicate checkpoints (same route, same ~hour bucket) reuse one call
      (see §5.3).

---

## 1. Architecture

Keep this a small, modular monolith — one Django project, a handful of apps,
a single-page React frontend. Don't split into microservices or separate
deploys until there's a measured reason to.

### 1.1 Backend app boundaries (suggested)
- `routing/` — talks to the routing API, returns N candidate routes with
  geometry + distance/duration.
- `geocoding/` — origin/destination → coordinates.
- `weather/` — samples the forecast at checkpoints (10/25/50 mi spacing) for a
  given coordinate + ETA; owns the 0–48h forecast fetch for the heatmap.
- `risk/` — pure functions implementing the risk/load classification table
  (§5.1). No I/O — takes weather values + load weight, returns a risk level.
  This module should be trivially unit-testable without mocking any network
  call.
- `recommendation/` — ranks the N routes per §5.2 using `risk/` output.
- `trips/` (or similar) — orchestrates the above into one request/response for
  the frontend; this is the only layer that knows the end-to-end flow.

**Cross-app calls go through an exported service/function, never direct model
access into another app's tables.**

### 1.2 Layering & dependency direction
```
View (DRF)  →  Service/orchestrator  →  Client (routing/weather API) or pure logic (risk/recommendation)
  (HTTP)          (business)                    (I/O or computation)
```
- **Views** are thin: validate input via serializer, call one orchestrator
  function, return. No business logic, no direct third-party SDK calls.
- **Risk and recommendation logic are pure functions** — same input always
  produces the same output, no hidden network/DB access. This is what makes
  §5.1/§5.2 cheap to test exhaustively.
- Dependencies point **inward only**. A client/service never imports a view.

### 1.3 Standard files per backend app
`apps.py`, `models.py` (only where persistence is actually needed —
e.g. caching/history), `serializers.py`, `views.py`, `services.py` (or
`client.py` for third-party wrappers), `tests.py`/`tests/`.

---

## 2. SOLID (applied to Django/DRF + React)

- **S — Single Responsibility:** a service function does one thing. Fetching
  weather, classifying risk, and ranking routes are three collaborators, not
  one 200-line view.
- **O — Open/Closed:** add a new risk condition (e.g. ice) as a new
  classifier function registered alongside wind/rain/snow, not by editing a
  long `if/elif` chain in five places.
- **L — Liskov:** if routing/weather providers are swapped (e.g. a mock
  provider for tests, a real one for prod), both must satisfy the same
  interface/contract — no provider silently returning a different shape.
- **I — Interface Segregation:** a component that only reads route risk
  shouldn't depend on the full trip-orchestration surface.
- **D — Dependency Inversion:** the risk/recommendation engines depend on
  plain data (weather readings, load weight) passed in, not on reaching out
  to fetch their own inputs — this is what makes them unit-testable in
  isolation and swappable behind a mock in CI.

---

## 3. DRY — one source of truth

- **Shared backend code lives in a `core`/`common` app** — the pagination
  helper, API-error response shape, shared enums (risk levels, load
  thresholds), env-config access. Don't redefine the risk threshold table in
  more than one place — it lives in `risk/` and everything else imports it.
- **Shared frontend code lives in `src/lib/`** — the API client, TanStack
  Query hooks, formatters, the risk-level → color mapping used by both the
  route list and the heatmap legend.
- Rule of three: the second copy is a warning, the third is a refactor —
  extract before the third.
- A constant (risk thresholds, checkpoint spacing, forecast window) is
  declared **once** and imported — never re-typed as a magic number at a call
  site.

---

## 4. The Twelve Factors (https://12factor.net)

| Factor | Rule for this repo |
|---|---|
| **III Config** | **Nothing environment-specific in source.** Routing/geocoding/weather API keys, the DB URL, allowed CORS origins — all from env (`django-environ` or equivalent). No string-literal fallback for a secret. **Fail fast:** if a required API key is missing, the app should refuse to start/serve rather than silently calling a provider with an empty key. |
| **I Codebase** | One repo, tracked in git, backend and frontend as sibling directories. `.env` is **never** committed (keep it in `.gitignore`). Commit `.env.example` with keys and dummy values. |
| **II Dependencies** | Pin via `requirements.txt`/`poetry.lock` (backend) and `package-lock.json`/`pnpm-lock.yaml` (frontend). No globally-assumed binaries. |
| **IV Backing services** | The routing/geocoding/weather APIs and the database are attached resources addressed by URL/key from env — swappable (e.g. mock provider in tests) without code change. |
| **V Build/release/run** | Build (`vite build`, `collectstatic`) is separate from run. No code edits on the deployed instance. |
| **VI Processes** | Backend is **stateless** per request. If weather responses are cached, the cache is a backing service (DB table or Redis), not in-process memory that a second instance wouldn't see. |
| **VII Port binding** | Backend binds `PORT` from env; frontend's build output is served as static assets (or its own `PORT` in dev). |
| **VIII Concurrency** | Scale by running more stateless backend instances — which is exactly why §5.3 (shared caching, not per-instance memoization) matters once there's more than one instance. |
| **IX Disposability** | Fast startup; handle `SIGTERM` gracefully if running under a process manager; no long-lived in-request work that can't be interrupted. |
| **X Dev/prod parity** | Django migrations are the schema source of truth — never hand-edit the prod schema. Use the same DB engine (Postgres) in dev and prod where practical; if SQLite is used for quick local dev, keep migrations Postgres-compatible. |
| **XI Logs** | Structured logs to stdout; use Django's `logging` module, never bare `print`. Log third-party API failures with enough context to debug (which provider, which checkpoint) without logging the API key itself. |
| **XII Admin processes** | Seed/one-off scripts are Django management commands in the same codebase, run against the same release. |

---

## 5. Correctness-Critical Domain Rules (mandatory)

> This section is what 40% of the evaluation ("Routes, Weather, risk &
> recommendation logic") hinges on. Treat §5.1 and §5.2 as the spec — any
> change to them is a deliberate, tested, documented change, not a drive-by
> tweak.

### 5.1 Risk classification table (source of truth)

| Condition | Low | Moderate | High | Severe | No Travel |
|---|---|---|---|---|---|
| Wind | < 25 mph | 25–34 | 35–44 | 45–54 | ≥ 55 mph |
| Rain | < 0.10 in/hr | 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | > 1.00 in/hr |
| Snow | < 0.5 in/hr | 0.5–1.0 | 1.0–2.0 | 2.0–3.0 | > 3.0 in/hr |

A checkpoint's overall risk is the **worst** of its wind/rain/snow
classification (don't average bucket levels — take the max severity).

**Boundary values are inclusive on the lower bound of each bucket** (e.g.
exactly 25 mph wind is Moderate, not Low; exactly 55 mph is No Travel). Write
a test per boundary (24.9/25/34.9/35/… mph, and the equivalent for rain and
snow) — this is the easiest place to introduce an off-by-one that still
"looks right" in a demo.

**Load rules override/compound the wind classification:**
- Wind ≥ 55 mph → **No Travel**, regardless of load.
- Wind 45–54 mph **and** load > 30,000 lb → **No Travel**.
- Wind 35–44 mph **and** load > 40,000 lb → **Severe** (overrides the plain
  wind-only classification for that checkpoint).

Implement this as a pure function `classify_checkpoint(wind, rain, snow,
load_weight) -> RiskLevel` with no side effects, so it can be table-tested
exhaustively without mocking a weather API.

### 5.2 Route recommendation (source of truth)

Rank candidate routes by, in order, until a tiebreaker resolves it:
1. Fewest **Severe**-classified miles.
2. Fewest **High**-classified miles.
3. Lowest **average risk** (e.g. mean of a numeric risk score across
   checkpoints).
4. Shortest travel time.

A route containing any **No Travel** checkpoint should be flagged distinctly
(e.g. excluded from "recommended" or surfaced with a clear warning) rather
than silently ranked by the same criteria as a travelable route — the spec
treats No Travel as a hard constraint, not just the worst bucket.

Implement ranking as a pure function over `(route, checkpoints_with_risk) ->
ranked_routes`, separate from the code that fetches weather, so the ranking
logic can be tested with synthetic checkpoint data.

### 5.3 Don't re-fetch what you've already sampled
Checkpoints at 10/25/50 mi spacing on overlapping route segments (or repeated
requests for the same trip while a user adjusts the forecast slider) can ask
for the same `(lat, lon, hour-bucket)` weather sample more than once in a
request. Third-party weather/routing APIs are rate-limited and billed —
**memoize within a request, and cache across requests** (DB-backed or
Redis-backed, keyed by coordinate rounded to a sensible precision + hour
bucket) rather than re-calling the provider for an input already fetched
recently. This is a performance/cost concern, not a correctness one, but a
heatmap with a 0–48h slider will multiply calls quickly if unmanaged.

### 5.4 Idempotency / double-submit on the frontend
- Route generation is a potentially slow, costly request (routing + N
  checkpoints × weather). **Disable the "Generate routes" control while the
  request is `isPending`** to stop double-submission via TanStack Query's
  mutation state.
- The forecast slider (0–48h) should **debounce** requests rather than firing
  one per pixel of drag.

---

## 6. Validation, Errors, Security

- **Validate at the boundary.** Backend: a DRF serializer validates
  origin/destination/departure time/load weight (e.g. load weight is a
  positive number) before any third-party call is made. Frontend: a schema
  (e.g. `zod`) per form. Never trust client input.
- **Errors:** raise/return typed, structured errors (DRF's exception handling
  with a clear error code/message) — never swallow a failed third-party call
  and silently return an empty or default risk level. If weather data is
  unavailable for a checkpoint, surface that explicitly (e.g. "unknown" risk,
  not "low").
- **Secrets:** only from env. No API key in a log line, error message, or git
  history.
- **Third-party failures are expected, not exceptional:** a routing or
  weather provider can time out or rate-limit — handle it with a clear
  user-facing error or partial-result state, not an unhandled 500.

---

## 7. Frontend Standards (React)

- **Data layer:** all server data through TanStack Query hooks in `src/lib/`
  (or `src/hooks/`) — no `fetch` scattered across components. One typed API
  client for the Django backend.
- **No business logic in components:** risk-level → color/label mapping,
  distance/ETA formatting, and the 0–48h slider's time math live in
  `src/lib/` utilities, reused across the route list, map, and heatmap.
- **Map & heatmap performance:** avoid re-rendering the full map/heatmap layer
  on every slider tick — throttle/debounce slider-driven updates, and prefer
  updating a layer's data in place over remounting the map component.
- **Forms:** controlled by a single source (form lib + schema), submit
  disabled while pending, errors surfaced inline.
- **Loading / empty / error states:** every async view (route list, map,
  heatmap) handles all three explicitly — a slow third-party weather call
  should show a loading state, not a blank map.

---

## 8. Testing

- **Unit-test `risk/` and `recommendation/` exhaustively** — every boundary in
  the §5.1 table, every load-rule override, and the §5.2 ranking priority
  order (construct synthetic routes where criterion 1 ties and criterion 2
  decides, etc.).
- **Integration-test the end-to-end flow** (origin/destination/weight →
  recommended route) against mocked routing/weather API responses — real
  third-party calls don't belong in CI.
- Test validation rejects bad input (negative load weight, malformed
  coordinates, departure time in the past if that's disallowed).
- A bug fix ships with a test that fails before and passes after.

---

## 9. Conventions

- Backend: PEP 8, type hints on public service functions, `black`/`ruff`
  formatting. Frontend: TypeScript strict; no `any` except a justified,
  commented boundary cast (e.g. a third-party SDK with poor types).
- Naming: `PascalCase` React components, `camelCase` frontend
  vars/functions, `snake_case` Python, `kebab-case` non-Python files,
  `UPPER_SNAKE` for constants/enum-like values (risk level thresholds).
- Comments explain **why**, not what. Match the surrounding code's density.
- Commits: imperative, scoped (`feat(risk): add load-weight override rules`,
  `fix(weather): dedupe checkpoint fetches`).
