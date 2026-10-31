import L from "leaflet";
import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";

import type { Checkpoint, LocationInfo, PlannedRoute } from "../lib/api";
import type { CorridorSegment } from "../lib/corridor";
import { formatDateTime, formatTime } from "../lib/format";
import { riskColor } from "../lib/risk";
import { CorridorHeatLayer } from "./CorridorHeatLayer";
import { RiskBadge } from "./RiskBadge";
import { ZoomControl } from "./ZoomControl";

interface Props {
  routes: PlannedRoute[];
  selectedId: string | null;
  corridor: CorridorSegment[];
  hour: number;
  showHeatmap: boolean;
  endpoints: { origin: LocationInfo; destination: LocationInfo } | null;
  onSelect: (id: string) => void;
}

const US_CENTER: [number, number] = [39.5, -98.35];
const TRANSPARENT_TILE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// Request tiles only when movement ends: aborted mid-animation loads otherwise leave a
// scaled parent tile (a giant blurry label) stuck on screen until the next pan.
const TILE_LOADING = { updateWhenZooming: false, updateWhenIdle: true, keepBuffer: 3, errorTileUrl: TRANSPARENT_TILE };

export function RouteMap({ routes, selectedId, corridor, hour, showHeatmap, endpoints, onSelect }: Props) {
  return (
    <MapContainer center={US_CENTER} zoom={4} className="map" preferCanvas scrollWheelZoom zoomControl={false}>
      <TileLayer
        attribution="Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
        {...TILE_LOADING}
      />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
        pane="shadowPane"
        {...TILE_LOADING}
      />
      <ZoomControl />
      <FitToRoutes routes={routes} />
      <CorridorHeatLayer segments={corridor} hour={hour} visible={showHeatmap} />

      {routes
        .filter((route) => route.id !== selectedId)
        .map((route) => (
          <RouteLayer key={route.id} route={route} selected={false} onSelect={onSelect} />
        ))}
      {routes
        .filter((route) => route.id === selectedId)
        .map((route) => (
          <RouteLayer key={route.id} route={route} selected onSelect={onSelect} />
        ))}

      {endpoints && (
        <>
          <EndpointPin location={endpoints.origin} label="Origin" />
          <EndpointPin location={endpoints.destination} label="Destination" pulse />
        </>
      )}
    </MapContainer>
  );
}

function RouteLayer({
  route,
  selected,
  onSelect,
}: {
  route: PlannedRoute;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {selected && (
        <Polyline
          positions={route.geometry}
          interactive={false}
          pathOptions={{ color: "#ffffff", weight: 11, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
        />
      )}
      <Polyline
        positions={route.geometry}
        pathOptions={{
          color: selected ? "#11899a" : "#8a8884",
          weight: selected ? 6 : 4,
          opacity: selected ? 0.95 : 0.55,
          lineCap: "round",
          lineJoin: "round",
        }}
        eventHandlers={{ click: () => onSelect(route.id) }}
      >
        {!selected && (
          <Tooltip sticky direction="top" opacity={1} className="card-tooltip">
            <div className="card-title">Route #{route.rank}</div>
            <div className="card-subtitle">Click to compare</div>
          </Tooltip>
        )}
      </Polyline>
      {route.checkpoints.map((checkpoint) => (
        <CheckpointMarker key={checkpoint.index} checkpoint={checkpoint} selected={selected} />
      ))}
    </>
  );
}

function CheckpointMarker({ checkpoint, selected }: { checkpoint: Checkpoint; selected: boolean }) {
  const level = checkpoint.risk?.level ?? null;
  const weather = checkpoint.weather;
  const detail = weather ? `${weather.wind_mph.toFixed(0)} mph wind` : undefined;

  return (
    <CircleMarker
      center={[checkpoint.lat, checkpoint.lon]}
      radius={selected ? 7 : 4}
      pathOptions={{
        color: "#ffffff",
        weight: selected ? 2 : 1,
        fillColor: riskColor(level),
        fillOpacity: selected ? 1 : 0.6,
      }}
    >
      <Tooltip direction="top" offset={[0, -8]} opacity={1} className="card-tooltip">
        <div className="card-title">
          Mile {checkpoint.mile} · {formatTime(checkpoint.eta)}
        </div>
        <RiskBadge level={level} detail={detail} />
      </Tooltip>
      <Popup className="card-popup" closeButton={false}>
        <div className="card-title">Mile {checkpoint.mile}</div>
        <div className="card-subtitle">ETA {formatDateTime(checkpoint.eta)}</div>
        <RiskBadge level={level} />
        {weather ? (
          <dl className="card-readings">
            <div>
              <dt>Wind</dt>
              <dd>{weather.wind_mph.toFixed(0)} mph</dd>
            </div>
            <div>
              <dt>Rain</dt>
              <dd>{weather.rain_in_hr.toFixed(2)} in/hr</dd>
            </div>
            <div>
              <dt>Snow</dt>
              <dd>{weather.snow_in_hr.toFixed(2)} in/hr</dd>
            </div>
          </dl>
        ) : (
          <div className="card-subtitle">No forecast available for this hour.</div>
        )}
      </Popup>
    </CircleMarker>
  );
}

const PIN_SVG = `
<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 35C14 35 27 21.5 27 13.5C27 6.3 21.2 1 14 1C6.8 1 1 6.3 1 13.5C1 21.5 14 35 14 35Z" fill="#344a4d" stroke="#ffffff" stroke-width="2"/>
  <circle cx="14" cy="13.5" r="4.5" fill="#ffffff"/>
</svg>`;

function pinIcon(pulse: boolean) {
  return L.divIcon({
    className: `pin-icon${pulse ? " pin-pulse" : ""}`,
    html: PIN_SVG,
    iconSize: [28, 36],
    iconAnchor: [14, 35],
    tooltipAnchor: [0, -30],
  });
}

const PIN = pinIcon(false);
const PIN_PULSING = pinIcon(true);

function EndpointPin({ location, label, pulse = false }: { location: LocationInfo; label: string; pulse?: boolean }) {
  return (
    <Marker position={[location.lat, location.lon]} icon={pulse ? PIN_PULSING : PIN} zIndexOffset={1000}>
      <Tooltip direction="top" opacity={1} className="card-tooltip">
        <div className="card-title">{label}</div>
        <div className="card-subtitle">{location.name.split(",").slice(0, 2).join(",")}</div>
      </Tooltip>
    </Marker>
  );
}

function FitToRoutes({ routes }: { routes: PlannedRoute[] }) {
  const map = useMap();
  const bounds = useMemo(() => {
    const points = routes.flatMap((route) => route.geometry);
    return points.length ? L.latLngBounds(points) : null;
  }, [routes]);

  useEffect(() => {
    // Instant fit: an animated fly shows scaled, blurry tiles for its whole duration on a slow tile server.
    if (bounds) map.fitBounds(bounds, { padding: [48, 48], animate: false });
  }, [map, bounds]);

  return null;
}
