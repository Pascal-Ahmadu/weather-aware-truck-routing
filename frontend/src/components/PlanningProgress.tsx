import { CheckIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";

const STEPS = [
  { label: "Locating origin and destination", until: 1.5 },
  { label: "Finding up to three routes", until: 6 },
  { label: "Sampling the forecast at every checkpoint ETA", until: 13 },
  { label: "Classifying risk and ranking", until: Infinity },
];

/** Time-based stage indicator for the single plan request, with skeleton cards below unless compact. */
export function PlanningProgress({ startedAt, compact = false }: { startedAt: number; compact?: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 200);
    return () => clearInterval(timer);
  }, [startedAt]);

  const current = STEPS.findIndex((step) => elapsed < step.until);

  return (
    <section className="planning" role="status" aria-live="polite">
      <ol className="planning-steps">
        {STEPS.map((step, index) => {
          const state = index < current ? "done" : index === current ? "active" : "todo";
          return (
            <li key={step.label} className={`planning-step ${state}`}>
              <span className="planning-dot" aria-hidden>
                {state === "done" ? <CheckIcon /> : null}
              </span>
              {step.label}
            </li>
          );
        })}
      </ol>
      {!compact && (
        <div className="skeleton-cards" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 120}ms` }}>
              <span className="skeleton-line w-60" />
              <span className="skeleton-line bar" />
              <span className="skeleton-line w-90" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
