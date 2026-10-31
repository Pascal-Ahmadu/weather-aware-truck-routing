import { Switch } from "@headlessui/react";
import { PauseIcon, PlayIcon } from "@heroicons/react/20/solid";
import { ClockIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RiskLevelValue } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { riskColor, riskLabel } from "../lib/risk";

interface Props {
  hours: string[];
  hour: number;
  showHeatmap: boolean;
  /** Worst risk anywhere on the selected route for each hour; drives the sparkline. */
  riskByHour: (RiskLevelValue | null)[];
  onHourChange: (hour: number) => void;
  onToggleHeatmap: (visible: boolean) => void;
}

const PLAY_STEP_MS = 220;

export function ForecastSlider({ hours, hour, showHeatmap, riskByHour, onHourChange, onToggleHeatmap }: Props) {
  const frame = useRef<number | null>(null);
  const pending = useRef(hour);
  const [playing, setPlaying] = useState(false);

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

  useEffect(() => {
    if (!playing || !showHeatmap) return;
    const timer = setInterval(() => onHourChange(hour >= maxHour ? 0 : hour + 1), PLAY_STEP_MS);
    return () => clearInterval(timer);
  }, [playing, showHeatmap, hour, maxHour, onHourChange]);

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

      <div className="slider-row">
        <button
          type="button"
          className="play-button"
          onClick={() => setPlaying((p) => !p)}
          disabled={!showHeatmap}
          aria-label={playing ? "Pause forecast playback" : "Play forecast through 48 hours"}
          aria-pressed={playing}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="slider-track">
          <div className="risk-sparkline" aria-label="Worst risk on the selected route by hour" role="img">
            {riskByHour.map((level, h) => (
              <button
                key={h}
                type="button"
                className={`spark${h === hour ? " current" : ""}`}
                style={{ background: level === null ? "#e5e7eb" : riskColor(level) }}
                title={`+${h}h: ${riskLabel(level)}`}
                aria-label={`Jump to +${h}h (${riskLabel(level)})`}
                onClick={() => onHourChange(h)}
                tabIndex={-1}
              />
            ))}
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
            <span>+12h</span>
            <span>+24h</span>
            <span>+36h</span>
            <span>+48h</span>
          </div>
        </div>
      </div>
      <p className="slider-note">
        Corridor colours show the forecast at this hour; markers show risk at each checkpoint's ETA.
      </p>
    </div>
  );
}
