import { CloseButton, Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { ChevronLeftIcon, ChevronRightIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { CalendarDaysIcon, ClockIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef } from "react";
import { DayPicker, type ChevronProps } from "react-day-picker";

import { formatDateTime } from "../../lib/format";
import { SelectField } from "./SelectField";

interface Props {
  value: Date;
  onChange: (value: Date) => void;
  minDate: Date;
  maxDate: Date;
  labelId?: string;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => ({ value: hour, label: String(hour).padStart(2, "0") }));
const MINUTES = [0, 15, 30, 45].map((minute) => ({ value: minute, label: String(minute).padStart(2, "0") }));

/** Mounted with the panel: brings the opened calendar into view inside the scrolling sidebar. */
function RevealOnMount() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current?.closest(".inline-panel")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  return <span ref={ref} hidden />;
}

function Chevron({ orientation, className }: ChevronProps) {
  const Icon = orientation === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return <Icon className={className} aria-hidden />;
}

export function DateTimeField({ value, onChange, minDate, maxDate, labelId }: Props) {
  function pickDay(day: Date | undefined) {
    if (!day) return;
    const next = new Date(day);
    next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    onChange(next);
  }

  function pickTime(hours: number, minutes: number) {
    const next = new Date(value);
    next.setHours(hours, minutes, 0, 0);
    onChange(next);
  }

  return (
    <Popover>
      <PopoverButton className="control" aria-labelledby={labelId}>
        <CalendarDaysIcon className="input-icon" aria-hidden />
        <span className="control-value">{formatDateTime(value.toISOString())}</span>
        <ChevronUpDownIcon className="control-chevron" aria-hidden />
      </PopoverButton>
      {/* Inline (not floating) so it can never be clipped by a short viewport; the sidebar scrolls instead. */}
      <PopoverPanel className="popover-panel inline-panel datetime-panel">
        <RevealOnMount />
        <DayPicker
          mode="single"
          selected={value}
          onSelect={pickDay}
          defaultMonth={value}
          weekStartsOn={1}
          disabled={{ before: minDate, after: maxDate }}
          showOutsideDays
          components={{ Chevron }}
        />
        <div className="time-row">
          <ClockIcon className="input-icon" aria-hidden />
          <span className="time-label">Depart at</span>
          <SelectField compact value={value.getHours()} options={HOURS} onChange={(h) => pickTime(h, value.getMinutes())} />
          <span className="time-colon">:</span>
          <SelectField
            compact
            value={MINUTES.some((m) => m.value === value.getMinutes()) ? value.getMinutes() : 0}
            options={MINUTES}
            onChange={(m) => pickTime(value.getHours(), m)}
          />
          <CloseButton className="link-button">Done</CloseButton>
        </div>
      </PopoverPanel>
    </Popover>
  );
}
