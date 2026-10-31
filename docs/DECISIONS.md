# Decisions

The judgment calls behind this build, in the order a reviewer is likely to ask
about them. Each one says what was decided, what the alternative was, and why.

## Risk engine

**Boundary values go to the more severe bucket.** The spec writes wind as
`<25 | 25–34 | 35–44 | 45–54 | ≥55`, so 25 mph is Moderate and 55 is No Travel.
Rain and snow are written with shared endpoints (`0.10–0.25`, `0.25–0.50`), so the
same rule is applied consistently: 0.25 in/hr is High. The one exception is in the
spec itself — rain/snow No Travel is written as strictly `>1.00` / `>3.0`, so
1.00 in/hr stays Severe. Alternative: treat every shared endpoint as belonging to the
lower bucket. Rejected because it is less conservative for a safety tool and
contradicts how the wind row is written. Every one of these boundaries is a test.

**A checkpoint's level is the worst of wind, rain and snow; load rules only ever
escalate.** `45–54 mph + >30,000 lb → No Travel` and `35–44 mph + >40,000 lb →
Severe` are applied after the worst-of step and can never lower a level — heavy
snow at 40 mph with a 50,000 lb load stays No Travel.

**Load weight means the payload the driver enters.** For routing, gross weight is
payload + a 33,000 lb tare (configurable), which is a typical tractor + empty
trailer. The brief gives no vehicle dimensions, so height, width and length are not
sent as routing restrictions.

## Sampling and ETAs

**"Every 10 / 25 / 50 miles" is a user-selectable spacing, default 25.** The other
reading — three simultaneous samplings — would triple the weather calls for no
decision the driver can act on. Spacing is a control in the form.

**Checkpoint ETAs come from the router's per-step durations, not an average
speed.** A slow mountain section pushes every later ETA back, which changes which
forecast hour each checkpoint reads. This is the single most important
correctness detail in the brief.

**Each checkpoint's weather is the forecast hour nearest its ETA.** The entire
0–48 h series per checkpoint is also classified server-side, so the heatmap slider
is an array lookup on the client and never fetches.

**Missing forecast data is reported as Unknown, excluded from averages, and never
defaulted to Low.** Defaulting to Low would be a safety bug.

## Ranking

**Strict lexicographic order, exactly as specified:** fewest Severe miles, then
High miles, then lowest distance-weighted average risk, then shortest time. No
weighted score, because a score would let a lot of High miles outrank a few Severe
ones, which the spec forbids.

**No Travel miles are a hard gate ranked before the four criteria.** The spec
calls the band "No Travel"; treating it as merely "worse than Severe" would let a
blocked route win on time.

**"Severe miles" = the miles from a Severe checkpoint to the next checkpoint.**
The destination checkpoint covers zero miles. Alternative: half the segment on
either side. Rejected as harder to explain for no accuracy gain at 10–50 mile
spacing.

**The recommendation explains itself from the same numbers the ranker used**
("Fewest Severe miles (10 vs 40)"), so the explanation cannot disagree with the
ranking.

## Routing

**OpenRouteService `driving-hgv` when a key is configured, OSRM car as the
keyless fallback.** The response and UI say which profile was used. HGV speeds
make Denver → Salt Lake City 11.3 h instead of 9 h, which changes every ETA and
therefore the weather each checkpoint sees.

**Alternatives are found with detour waypoints and filtered.** Routers rarely
return three distinct routes on long interstate trips (ORS only offers built-in
alternatives under 100 km). The client requests routes through points offset to
either side of the primary route and keeps candidates that share < 80 % of their
road with any existing route, take at most 1.5× the primary's time, and are not
out-and-back spurs (measured as retraced grid cells relative to the primary).
Where that still yields fewer than three, the app shows fewer rather than padding
with near-duplicates.

## Data providers

**Open-Meteo for weather** — keyless, returns `mph` and `inch` natively, and gives
the whole hourly window in one call per location, which is deduplicated on a
~1 km grid, batched and cached for 30 minutes.

**Photon for type-ahead, Nominatim for final geocoding.** Nominatim's usage
policy forbids autocomplete; Photon is built for it. Results are biased toward
the US and US matches are listed first because the product uses mph and lb.

## Interface

**One screen.** The form in the sidebar (bottom sheet on phones), results in a
modal, the map everywhere else. The brief asks for correctness and clarity over
features; there is no login, history, or second page.

**Heatmap colours are exact, not additive.** A density heatmap stacks overlapping
checkpoints so a Low corridor can render as Severe. The corridor is painted per
road segment in the risk colour for the selected hour instead.

**Map motion is pan-only.** Animated zooms show scaled, blurry tiles on a slow
tile server, so fit-to-route is instant and only route selection pans.

## Scope deliberately left out

Truck dimensions and hazmat as inputs, a database-backed weather cache, a
second truck-routing provider, saved trips, authentication. Each is a sensible
next step and none is asked for by the brief.
