import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PlannedRoute } from "../lib/api";
import { RouteList } from "./RouteList";

function route(overrides: Partial<PlannedRoute> & { id: string; rank: number }): PlannedRoute {
  return {
    recommended: overrides.rank === 1,
    distance_miles: 519.4,
    duration_seconds: 9 * 3600 + 60,
    eta: "2026-11-01T19:01:00+00:00",
    geometry: [],
    summary: {
      no_travel_miles: 0,
      severe_miles: 0,
      high_miles: 0,
      moderate_miles: 0,
      low_miles: 519.4,
      unknown_miles: 0,
      average_risk: 0,
    },
    checkpoints: [],
    ...overrides,
  };
}

describe("RouteList", () => {
  it("renders ranked cards with the recommended badge on rank 1 only", () => {
    render(
      <RouteList
        routes={[route({ id: "route-1", rank: 1 }), route({ id: "route-0", rank: 2 })]}
        selectedId="route-1"
        onSelect={vi.fn()}
      />,
    );
    const cards = screen.getAllByRole("button");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText("Recommended")).toBeInTheDocument();
    expect(within(cards[1]!).queryByText("Recommended")).not.toBeInTheDocument();
    expect(cards[0]).toHaveAttribute("aria-pressed", "true");
    expect(cards[1]).toHaveAttribute("aria-pressed", "false");
    expect(within(cards[0]!).getByText("9h 1m")).toBeInTheDocument();
    expect(cards[0]).toHaveTextContent("519 mi");
  });

  it("shows the ranking numbers a reviewer needs to verify the recommendation", () => {
    const risky = route({
      id: "route-0",
      rank: 2,
      summary: {
        no_travel_miles: 0,
        severe_miles: 25,
        high_miles: 50,
        moderate_miles: 0,
        low_miles: 444.4,
        unknown_miles: 0,
        average_risk: 0.41,
      },
    });
    render(<RouteList routes={[risky]} selectedId="" onSelect={vi.fn()} />);
    expect(screen.getByText("Severe mi").nextElementSibling).toHaveTextContent("25");
    expect(screen.getByText("High mi").nextElementSibling).toHaveTextContent("50");
    expect(screen.getByText("Avg risk").nextElementSibling).toHaveTextContent("0.41");
  });

  it("flags No Travel miles and unknown miles explicitly", () => {
    const blocked = route({
      id: "route-2",
      rank: 3,
      summary: {
        no_travel_miles: 12.5,
        severe_miles: 0,
        high_miles: 0,
        moderate_miles: 0,
        low_miles: 400,
        unknown_miles: 30,
        average_risk: 0.12,
      },
    });
    render(<RouteList routes={[blocked]} selectedId="" onSelect={vi.fn()} />);
    expect(screen.getByText(/12\.5 mi classified/)).toHaveTextContent("No Travel");
    expect(screen.getByText(/30 mi without forecast data/)).toBeInTheDocument();
  });

  it("calls onSelect with the route id when a card is clicked", async () => {
    const onSelect = vi.fn();
    render(<RouteList routes={[route({ id: "route-0", rank: 1 })]} selectedId="" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("route-0");
  });
});
