import { ExclamationCircleIcon } from "@heroicons/react/16/solid";
import { ScaleIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { useEffect, useState, type FormEvent } from "react";

import type { ApiError, PlanRequest } from "../lib/api";
import { validateTripForm, type TripFormErrors } from "../lib/schema";
import { DateTimeField } from "./ui/DateTimeField";
import { Field } from "./ui/Field";
import { LocationField, type LocationValue } from "./ui/LocationField";
import { SelectField } from "./ui/SelectField";

export interface TripPreset {
  origin: string;
  destination: string;
  loadWeightLb: number;
  /** Changes on every pick so the same preset can be applied twice. */
  token: number;
}

interface Props {
  isPending: boolean;
  error: ApiError | null;
  preset?: TripPreset | null;
  onSubmit: (request: PlanRequest) => void;
}

type Interval = 10 | 25 | 50;

const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
  { value: 10, label: "10 miles" },
  { value: 25, label: "25 miles" },
  { value: 50, label: "50 miles" },
];

const MAX_DAYS_AHEAD = 14;

function defaultDeparture(): Date {
  const next = new Date();
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return next;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function TripForm({ isPending, error, preset, onSubmit }: Props) {
  const [origin, setOrigin] = useState<LocationValue>({ text: "Denver, CO", coords: null });
  const [destination, setDestination] = useState<LocationValue>({ text: "Salt Lake City, UT", coords: null });
  const [departure, setDeparture] = useState<Date>(defaultDeparture);
  const [loadWeightLb, setLoadWeightLb] = useState("42000");
  const [intervalMiles, setIntervalMiles] = useState<Interval>(25);
  const [errors, setErrors] = useState<TripFormErrors>({});

  useEffect(() => {
    if (!preset) return;
    setOrigin({ text: preset.origin, coords: null });
    setDestination({ text: preset.destination, coords: null });
    setLoadWeightLb(String(preset.loadWeightLb));
    setErrors({});
  }, [preset]);

  const minDate = startOfToday();
  const maxDate = new Date(minDate);
  maxDate.setDate(maxDate.getDate() + MAX_DAYS_AHEAD);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const { values, errors: validationErrors } = validateTripForm({
      origin: origin.text,
      destination: destination.text,
      departure,
      loadWeightLb,
      intervalMiles,
    });
    setErrors(validationErrors);
    if (!values) return;
    onSubmit({
      origin: values.origin,
      destination: values.destination,
      origin_coords: origin.coords,
      destination_coords: destination.coords,
      departure_time: values.departure.toISOString(),
      load_weight_lb: values.loadWeightLb,
      checkpoint_interval_miles: values.intervalMiles,
    });
  }

  const serverFieldError = (field: string) => error?.fieldErrors[field]?.[0];

  return (
    <form className="card trip-form" onSubmit={handleSubmit} noValidate>
      <div className="card-header">
        <h2 className="card-title">Plan a trip</h2>
      </div>

      <div className="card-body">
      <Field id="origin" label="Origin" error={errors.origin ?? serverFieldError("origin")}>
        <LocationField id="origin" value={origin} onChange={setOrigin} placeholder="Search a city or address" />
      </Field>

      <Field id="destination" label="Destination" error={errors.destination ?? serverFieldError("destination")}>
        <LocationField
          id="destination"
          value={destination}
          onChange={setDestination}
          placeholder="Search a city or address"
        />
      </Field>

      <Field id="departure" label="Departure" error={errors.departure ?? serverFieldError("departure_time")}>
        <DateTimeField
          value={departure}
          onChange={setDeparture}
          minDate={minDate}
          maxDate={maxDate}
          labelId="departure-label"
        />
      </Field>

      <div className="field-row">
        <Field id="load" label="Load weight (lb)" error={errors.loadWeightLb ?? serverFieldError("load_weight_lb")}>
          <div className="input-wrap">
            <ScaleIcon className="input-icon" aria-hidden />
            <input
              id="load"
              aria-labelledby="load-label"
              type="text"
              inputMode="numeric"
              value={loadWeightLb}
              onChange={(e) => setLoadWeightLb(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
        </Field>
        <Field id="interval" label="Checkpoint every" error={serverFieldError("checkpoint_interval_miles")}>
          <SelectField
            value={intervalMiles}
            options={INTERVAL_OPTIONS}
            onChange={setIntervalMiles}
            labelId="interval-label"
            icon={Squares2X2Icon}
          />
        </Field>
      </div>

      {error && Object.keys(error.fieldErrors).length === 0 && (
        <p className="form-error" role="alert">
          <ExclamationCircleIcon className="error-icon" aria-hidden />
          {error.message}
        </p>
      )}
      </div>

      <div className="card-footer">
        <button type="submit" className="primary" disabled={isPending}>
          {isPending ? "Checking weather along routes…" : "Find safest route"}
        </button>
      </div>
    </form>
  );
}
