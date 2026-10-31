import { EXAMPLE_TRIPS, type ExampleTrip } from "../lib/examples";

export function EmptyState({ onPick }: { onPick: (trip: ExampleTrip) => void }) {
  return (
    <div className="empty-state">
      <p className="empty-sub">Try an example:</p>
      <div className="example-chips">
        {EXAMPLE_TRIPS.map((trip) => (
          <button key={trip.label} type="button" className="chip" onClick={() => onPick(trip)}>
            {trip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
