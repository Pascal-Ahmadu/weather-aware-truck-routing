import { CheckBadgeIcon, ExclamationTriangleIcon, InformationCircleIcon } from "@heroicons/react/20/solid";

import type { PlannedRoute } from "../lib/api";
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
      {routes.map((route) => (
        <li key={route.id}>
          <button
            type="button"
            className={`route-card${route.id === selectedId ? " selected" : ""}`}
            onClick={() => onSelect(route.id)}
            aria-pressed={route.id === selectedId}
          >
            <div className="route-card-header">
              <span className="rank">#{route.rank}</span>
              <span className="route-title">
                {formatMiles(route.distance_miles)} · {formatDuration(route.duration_seconds)}
              </span>
              {route.recommended && (
                <span className="badge recommended">
                  <CheckBadgeIcon className="badge-icon" aria-hidden />
                  Recommended
                </span>
              )}
            </div>

            <RiskBar route={route} />

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

function RiskBar({ route }: { route: PlannedRoute }) {
  const bands = summaryBands(route.summary);
  const total = bands.reduce((sum, band) => sum + band.miles, 0) || 1;
  return (
    <div className="risk-bar" role="img" aria-label={bands.map((b) => `${riskLabel(b.level)} ${b.miles} mi`).join(", ")}>
      {bands.map((band) => (
        <span
          key={String(band.level)}
          style={{ width: `${(band.miles / total) * 100}%`, background: riskColor(band.level) }}
          title={`${riskLabel(band.level)}: ${band.miles} mi`}
        />
      ))}
    </div>
  );
}
