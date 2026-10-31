import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { MapPinIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { suggestLocations, type LocationSuggestion } from "../../lib/api";

export interface LocationValue {
  text: string;
  /** Set only when the text came from a picked suggestion. */
  coords: [number, number] | null;
}

interface Props {
  id: string;
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  placeholder?: string;
}

interface Option {
  name: string;
  lat: number | null;
  lon: number | null;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

export function LocationField({ id, value, onChange, placeholder }: Props) {
  // Search only what the user has typed; prefilled defaults never trigger requests.
  const [typed, setTyped] = useState("");
  const query = useDebounced(typed.trim(), DEBOUNCE_MS);
  const enabled = value.coords === null && query.length >= MIN_QUERY_LENGTH;

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ["suggest", query.toLowerCase()],
    queryFn: ({ signal }) => suggestLocations(query, signal),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });

  // Keep the combobox value in step with the free text so Headless UI never resets the input.
  const selected: Option = { name: value.text, lat: value.coords?.[0] ?? null, lon: value.coords?.[1] ?? null };

  function pick(option: Option | null) {
    if (option && option.lat !== null && option.lon !== null) {
      setTyped("");
      onChange({ text: option.name, coords: [option.lat, option.lon] });
    }
  }

  return (
    <Combobox value={selected} onChange={pick} by="name" immediate>
      <div className="input-wrap">
        <MapPinIcon className="input-icon" aria-hidden />
        <ComboboxInput
          id={id}
          aria-labelledby={`${id}-label`}
          autoComplete="off"
          placeholder={placeholder}
          displayValue={(option: Option) => option.name}
          onChange={(event) => {
            setTyped(event.target.value);
            onChange({ text: event.target.value, coords: null });
          }}
        />
        {isFetching && <span className="spinner small" aria-label="Searching" />}
      </div>
      {enabled && suggestions.length > 0 && (
        <ComboboxOptions anchor={{ to: "bottom start", gap: 4 }} className="listbox-options combobox-options">
          {suggestions.map((suggestion: LocationSuggestion) => (
            <ComboboxOption key={`${suggestion.lat},${suggestion.lon}`} value={suggestion} className="listbox-option">
              <MapPinIcon className="option-icon" aria-hidden />
              <span className="option-label">{suggestion.name}</span>
            </ComboboxOption>
          ))}
        </ComboboxOptions>
      )}
    </Combobox>
  );
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
