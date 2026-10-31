import { TruckIcon } from "@heroicons/react/24/outline";
import { useCallback, useMemo, useState } from "react";

import { ForecastSlider } from "./components/ForecastSlider";
import { RiskLegend } from "./components/RiskLegend";
import { RouteList } from "./components/RouteList";
import { RouteMap } from "./components/RouteMap";
import { TripForm } from "./components/TripForm";
import { usePlanTrip } from "./hooks/usePlanTrip";
import type { PlanRequest } from "./lib/api";
import { buildCorridorSegments } from "./lib/corridor";
import { formatDateTime } from "./lib/format";

export default function App() {
  const plan = usePlanTrip();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hour, setHour] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(true);

  const result = plan.data ?? null;
  const routes = useMemo(() => result?.routes ?? [], [result]);
  const activeId = selectedId ?? result?.recommended_route_id ?? null;

  // Selected route last so its corridor paints on top where routes share a road.
  const corridor = useMemo(
    () =>
      [...routes]
        .sort((a, b) => Number(a.id === activeId) - Number(b.id === activeId))
        .flatMap(buildCorridorSegments),
    [routes, activeId],
  );

  const submit = useCallback(
    (request: PlanRequest) => {
      setSelectedId(null);
      setHour(0);
      plan.mutate(request);
    },
    [plan],
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1>
            <TruckIcon className="title-icon" aria-hidden />
            Weather-Aware Truck Routing
          </h1>
          <p>Compare routes by forecast risk at the hour your truck actually arrives at each checkpoint.</p>
        </header>

        <TripForm isPending={plan.isPending} error={plan.error} onSubmit={submit} />

        {plan.isPending && (
          <div className="status" role="status">
            <span className="spinner" /> Routing, then sampling the forecast at every checkpoint…
          </div>
        )}

        {result && (
          <section className="results">
            <h2>
              {result.routes.length} route{result.routes.length === 1 ? "" : "s"}
              <small>
                {result.query.origin.name.split(",")[0]} → {result.query.destination.name.split(",")[0]} ·{" "}
                {formatDateTime(result.query.departure_time)} · {result.query.load_weight_lb.toLocaleString()} lb
              </small>
            </h2>
            <RouteList routes={result.routes} selectedId={activeId ?? ""} onSelect={setSelectedId} />
            <p className="ranking-note">
              Ranked by fewest No Travel miles, then Severe miles, High miles, lowest average risk, shortest time.
            </p>
          </section>
        )}
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
              onHourChange={setHour}
              onToggleHeatmap={setShowHeatmap}
            />
          </div>
        )}
        {!result && !plan.isPending && (
          <div className="map-overlay center empty-state">
            Enter a trip to see routes, checkpoints and the weather heatmap.
          </div>
        )}
      </main>
    </div>
  );
}
