import { PencilSquareIcon } from "@heroicons/react/20/solid";
import { TruckIcon } from "@heroicons/react/24/outline";
import { useCallback, useMemo, useRef, useState } from "react";

import { EmptyState } from "./components/EmptyState";
import { ForecastSlider } from "./components/ForecastSlider";
import { PlanningProgress } from "./components/PlanningProgress";
import { RiskBadge } from "./components/RiskBadge";
import { RiskLegend } from "./components/RiskLegend";
import { RouteList } from "./components/RouteList";
import { RouteMap } from "./components/RouteMap";
import { TripDialog } from "./components/TripDialog";
import type { TripPreset } from "./components/TripForm";
import { usePlanTrip } from "./hooks/usePlanTrip";
import type { PlanRequest } from "./lib/api";
import { buildCorridorSegments } from "./lib/corridor";
import type { ExampleTrip } from "./lib/examples";
import { worstRiskAtEta, worstRiskByHour } from "./lib/explain";
import { formatDateTime } from "./lib/format";

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
  const [dialogOpen, setDialogOpen] = useState(true);
  const startedAt = useRef(0);

  const result = plan.data ?? null;
  const routes = useMemo(() => result?.routes ?? [], [result]);
  const activeId = selectedId ?? result?.recommended_route_id ?? null;
  const activeRoute = routes.find((r) => r.id === activeId) ?? null;

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
      setDialogOpen(false);
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

  const recommended = routes.find((r) => r.recommended) ?? null;

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1>
            <TruckIcon className="title-icon" aria-hidden />
            Weather-Aware Truck Routing
          </h1>
          <button type="button" className="secondary" onClick={() => setDialogOpen(true)}>
            <PencilSquareIcon className="btn-icon" aria-hidden />
            {result ? "Change trip" : "Plan a trip"}
          </button>
        </header>

        {plan.isPending && <PlanningProgress startedAt={startedAt.current} />}

        {plan.error && !plan.isPending && !result && (
          <div className="sidebar-error" role="alert">
            {plan.error.message}
          </div>
        )}

        {result && !plan.isPending && (
          <section className="results">
            <div className="results-header">
              <h2>
                {result.routes.length} route{result.routes.length === 1 ? "" : "s"}
                <small>
                  {result.query.origin.name.split(",")[0]} → {result.query.destination.name.split(",")[0]} ·{" "}
                  {formatDateTime(result.query.departure_time)} · {result.query.load_weight_lb.toLocaleString()} lb
                </small>
              </h2>
              {recommended && (
                <div className="results-worst" title="Worst checkpoint risk on the recommended route">
                  <RiskBadge level={worstRiskAtEta(recommended)} detail="worst on #1" />
                </div>
              )}
            </div>
            <RouteList routes={result.routes} selectedId={activeId ?? ""} onSelect={setSelectedId} />
            <p className="ranking-note">
              Ranked by fewest No Travel miles, then Severe miles, High miles, lowest average risk, shortest time.
            </p>
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

      <TripDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        isPending={plan.isPending}
        error={plan.error}
        preset={preset}
        onSubmit={submit}
      />
    </div>
  );
}
