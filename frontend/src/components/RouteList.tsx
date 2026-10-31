import { CheckBadgeIcon, ExclamationTriangleIcon, InformationCircleIcon, SparklesIcon } from "@heroicons/react/20/solid";

import type { PlannedRoute } from "../lib/api";
import { explainRecommendation } from "../lib/explain";
import { formatDateTime, formatDuration, formatMiles } from "../lib/format";
import { riskColor, riskLabel, summaryBands } from "../lib/risk";

interface Props {
  routes: PlannedRoute[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function RouteList({ routes, selectedId, onSelect }: Props) {
  return (
    <ol className="route-list">
      {routes.map((route, index) => (
        <li key={route.id} className="route-item" style={{ animationDelay: `${index * 70}ms` }}>
          <button
            type="button"
            className={`route-card${route.id === selectedId ? " selected" : ""}`}
            onClick={() => onSelect(route.id)}
            aria-pressed={route.id === selectedId}
          >
            <div className="route-card-header">
              <span className="rank">#{route.rank}</span>
              <span className="route-title">
                <strong>{formatDuration(route.duration_seconds)}</strong>
                <span className="route-distance"> · {formatMiles(route.distance_miles)}</span>
              </span>
              {route.recommended && (
                <span className="badge recommended">
                  <CheckBadgeIcon className="badge-icon" aria-hidden />
                  Recommended
                </span>
              )}
            </div>

            <RiskStrip route={route} />

            <dl className="route-stats">
              <div>
                <dt>Arrives</dt>
                <dd>{formatDateTime(route.eta)}</dd>
              </div>
              <div>
                <dt>Severe mi</dt>
                <dd>{route.summary.severe_miles}</dd>
              </div>
              <div>
                <dt>High mi</dt>
                <dd>{route.summary.high_miles}</dd>
              </div>
              <div>
                <dt>Avg risk</dt>
                <dd>{route.summary.average_risk ?? "—"}</dd>
              </div>
            </dl>

            {route.recommended && (
              <p className="route-why">
                <SparklesIcon className="inline-icon" aria-hidden />
                {explainRecommendation(route, routes).join(" · ")}
              </p>
            )}
            {route.summary.no_travel_miles > 0 && (
              <p className="route-warning">
                <ExclamationTriangleIcon className="inline-icon" aria-hidden />
                {route.summary.no_travel_miles} mi classified <strong>No Travel</strong> at the truck's ETA.
              </p>
            )}
            {route.summary.unknown_miles > 0 && (
              <p className="route-note">
                <InformationCircleIcon className="inline-icon" aria-hidden />
                {route.summary.unknown_miles} mi without forecast data.
              </p>
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * Risk along the route in driving order: one segment per checkpoint, width = miles to
 * the next checkpoint, colour = risk at that checkpoint's ETA. Falls back to the
 * miles-by-level summary when checkpoints are not available.
 */
function RiskStrip({ route }: { route: PlannedRoute }) {
  const segments = route.checkpoints
    .filter((cp) => cp.segment_miles > 0)
    .map((cp) => ({ key: cp.index, miles: cp.segment_miles, level: cp.risk?.level ?? null, mile: cp.mile }));
  const bands = segments.length
    ? segments
    : summaryBands(route.summary).map((b, i) => ({ key: i, miles: b.miles, level: b.level, mile: null }));
  const total = bands.reduce((sum, band) => sum + band.miles, 0) || 1;

  return (
    <div
      className="risk-bar"
      role="img"
      aria-label={`Risk along the route: ${bands.map((b) => `${riskLabel(b.level)} for ${b.miles} mi`).join(", ")}`}
    >
      {bands.map((band) => (
        <span
          key={band.key}
          style={{ width: `${(band.miles / total) * 100}%`, background: riskColor(band.level) }}
          title={band.mile === null ? `${riskLabel(band.level)}: ${band.miles} mi` : `Mile ${band.mile}: ${riskLabel(band.level)}`}
        />
      ))}
    </div>
  );
}
