import { Switch } from "@headlessui/react";
import { ClockIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef } from "react";

import { formatDateTime } from "../lib/format";

interface Props {
  hours: string[];
  hour: number;
  showHeatmap: boolean;
  onHourChange: (hour: number) => void;
  onToggleHeatmap: (visible: boolean) => void;
}

export function ForecastSlider({ hours, hour, showHeatmap, onHourChange, onToggleHeatmap }: Props) {
  const frame = useRef<number | null>(null);
  const pending = useRef(hour);

  // Coalesce rapid drag events into one state update per animation frame.
  const handleInput = useCallback(
    (value: number) => {
      pending.current = value;
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        onHourChange(pending.current);
      });
    },
    [onHourChange],
  );

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const maxHour = Math.max(hours.length - 1, 0);
  const label = hours[hour];
  const percent = maxHour ? (hour / maxHour) * 100 : 0;

  return (
    <div className="forecast-slider">
      <div className="slider-header">
        <Switch.Group>
          <div className="toggle">
            <Switch checked={showHeatmap} onChange={onToggleHeatmap} className="switch">
              <span className="switch-thumb" aria-hidden />
            </Switch>
            <Switch.Label className="toggle-label">Weather heatmap</Switch.Label>
          </div>
        </Switch.Group>
        <span className="slider-value">
          <ClockIcon className="inline-icon" aria-hidden />+{hour}h{label ? ` · ${formatDateTime(label)}` : ""}
        </span>
      </div>
      <input
        type="range"
        className="slider"
        style={{ "--pct": `${percent}%` } as React.CSSProperties}
        min={0}
        max={maxHour}
        step={1}
        value={hour}
        disabled={!showHeatmap}
        onChange={(e) => handleInput(Number(e.target.value))}
        aria-label="Forecast hour from departure"
      />
      <div className="slider-scale">
        <span>Departure</span>
        <span>+24h</span>
        <span>+48h</span>
      </div>
      <p className="slider-note">
        Corridor colours show the forecast at this hour; checkpoint markers show risk at each checkpoint's ETA.
      </p>
    </div>
  );
}
