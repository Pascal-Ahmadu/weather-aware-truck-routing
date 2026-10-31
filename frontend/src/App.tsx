import { ListBulletIcon } from "@heroicons/react/20/solid";
import { TruckIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "./components/EmptyState";
import { ForecastSlider } from "./components/ForecastSlider";
import { PlanningProgress } from "./components/PlanningProgress";
import { ResultsDialog } from "./components/ResultsDialog";
import { RiskBadge } from "./components/RiskBadge";
import { RiskLegend } from "./components/RiskLegend";
import { RouteMap } from "./components/RouteMap";
import { TripForm, type TripPreset } from "./components/TripForm";
import { usePlanTrip } from "./hooks/usePlanTrip";
import type { PlanRequest } from "./lib/api";
import { buildCorridorSegments } from "./lib/corridor";
import type { ExampleTrip } from "./lib/examples";
import { explainRecommendation, worstRiskAtEta, worstRiskByHour } from "./lib/explain";
import { formatDuration, formatMiles } from "./lib/format";

function defaultDepartureIso(): string {
  const next = new Date();
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return next.toISOString();
}

export default function App() {
  const plan = usePlanTrip();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hour, setHour] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [preset, setPreset] = useState<TripPreset | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const startedAt = useRef(0);

  const result = plan.data ?? null;
  const routes = useMemo(() => result?.routes ?? [], [result]);
  const activeId = selectedId ?? result?.recommended_route_id ?? null;
  const activeRoute = routes.find((r) => r.id === activeId) ?? null;
  const recommended = routes.find((r) => r.recommended) ?? null;

  // Show the ranked routes as soon as a plan arrives.
  useEffect(() => {
    if (result) setResultsOpen(true);
  }, [result]);

  // Selected route last so its corridor paints on top where routes share a road.
  const corridor = useMemo(
    () =>
      [...routes]
        .sort((a, b) => Number(a.id === activeId) - Number(b.id === activeId))
        .flatMap(buildCorridorSegments),
    [routes, activeId],
  );

  const riskByHour = useMemo(
    () => (activeRoute && result ? worstRiskByHour(activeRoute, result.forecast_hours.length) : []),
    [activeRoute, result],
  );

  const submit = useCallback(
    (request: PlanRequest) => {
      setResultsOpen(false);
      setSelectedId(null);
      setHour(0);
      startedAt.current = Date.now();
      plan.mutate(request);
    },
    [plan],
  );

  const pickExample = useCallback(
    (trip: ExampleTrip) => {
      setPreset({ origin: trip.origin, destination: trip.destination, loadWeightLb: trip.loadWeightLb, token: Date.now() });
      submit({
        origin: trip.origin,
        destination: trip.destination,
        departure_time: defaultDepartureIso(),
        load_weight_lb: trip.loadWeightLb,
        checkpoint_interval_miles: 25,
      });
    },
    [submit],
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1>
            <TruckIcon className="title-icon" aria-hidden />
            Weather-Aware Truck Routing
          </h1>
        </header>

        <TripForm isPending={plan.isPending} error={plan.error} preset={preset} onSubmit={submit} />

        {plan.isPending && <PlanningProgress startedAt={startedAt.current} compact />}

        {result && recommended && !plan.isPending && (
          <section className="summary" aria-label="Plan summary">
            <div className="summary-head">
              <span className="summary-title">
                {result.routes.length} route{result.routes.length === 1 ? "" : "s"} · recommended #1
              </span>
              <RiskBadge level={worstRiskAtEta(recommended)} detail="worst" />
            </div>
            <p className="summary-line">
              <strong>{formatDuration(recommended.duration_seconds)}</strong> · {formatMiles(recommended.distance_miles)} ·{" "}
              {explainRecommendation(recommended, routes)[0]}
            </p>
            <button type="button" className="secondary" onClick={() => setResultsOpen(true)}>
              <ListBulletIcon className="btn-icon" aria-hidden />
              View all routes
            </button>
          </section>
        )}

        {!result && !plan.isPending && <EmptyState onPick={pickExample} />}
      </aside>

      <main className="map-panel">
        <RouteMap
          routes={routes}
          selectedId={activeId}
          corridor={corridor}
          hour={hour}
          showHeatmap={showHeatmap && !!result}
          endpoints={result ? { origin: result.query.origin, destination: result.query.destination } : null}
          onSelect={setSelectedId}
        />
        <div className="map-overlay top-right">
          <RiskLegend />
        </div>
        {result && (
          <div className="map-overlay bottom">
            <ForecastSlider
              hours={result.forecast_hours}
              hour={hour}
              showHeatmap={showHeatmap}
              riskByHour={riskByHour}
              onHourChange={setHour}
              onToggleHeatmap={setShowHeatmap}
            />
          </div>
        )}
        {!result && !plan.isPending && (
          <div className="map-overlay center map-hint">Routes, checkpoints and the weather corridor appear here.</div>
        )}
      </main>

      {result && (
        <ResultsDialog
          open={resultsOpen}
          result={result}
          selectedId={activeId ?? ""}
          onSelect={setSelectedId}
          onClose={() => setResultsOpen(false)}
        />
      )}
    </div>
  );
}
