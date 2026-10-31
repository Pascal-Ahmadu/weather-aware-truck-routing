import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api";
import { TripForm } from "./TripForm";

describe("TripForm", () => {
  it("submits the trip with an ISO departure and numeric load", async () => {
    const onSubmit = vi.fn();
    render(<TripForm isPending={false} error={null} onSubmit={onSubmit} />);

    await userEvent.clear(screen.getByLabelText("Origin"));
    await userEvent.type(screen.getByLabelText("Origin"), "Seattle, WA");
    await userEvent.clear(screen.getByLabelText("Load weight (lb)"));
    await userEvent.type(screen.getByLabelText("Load weight (lb)"), "36000");
    await userEvent.click(screen.getByRole("button", { name: /find safest route/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const request = onSubmit.mock.calls[0]![0];
    expect(request.origin).toBe("Seattle, WA");
    expect(request.destination).toBe("Salt Lake City, UT");
    expect(request.load_weight_lb).toBe(36000);
    expect(request.checkpoint_interval_miles).toBe(25);
    expect(new Date(request.departure_time).getTime()).toBeGreaterThan(Date.now());
  });

  it("blocks submission and shows inline errors for invalid input", async () => {
    const onSubmit = vi.fn();
    render(<TripForm isPending={false} error={null} onSubmit={onSubmit} />);

    await userEvent.clear(screen.getByLabelText("Origin"));
    await userEvent.clear(screen.getByLabelText("Load weight (lb)"));
    await userEvent.click(screen.getByRole("button", { name: /find safest route/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Enter an origin.")).toBeInTheDocument();
    expect(screen.getByText("Enter the load weight.")).toBeInTheDocument();
  });

  it("strips non-digits from the load weight as you type", async () => {
    render(<TripForm isPending={false} error={null} onSubmit={vi.fn()} />);
    const load = screen.getByLabelText("Load weight (lb)");
    await userEvent.clear(load);
    await userEvent.type(load, "4a2,000");
    expect(load).toHaveValue("42000");
  });

  it("disables the button while a plan is pending", () => {
    render(<TripForm isPending error={null} onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /checking weather/i })).toBeDisabled();
  });

  it("shows server field errors under the matching field and general errors above the button", () => {
    const fieldError = new ApiError(400, "invalid", "Departure time must not be in the past.", {
      departure_time: ["Departure time must not be in the past."],
    });
    const { rerender } = render(<TripForm isPending={false} error={fieldError} onSubmit={vi.fn()} />);
    expect(screen.getByText("Departure time must not be in the past.")).toBeInTheDocument();

    const generalError = new ApiError(503, "upstream_unavailable", "Routing service is unavailable.");
    rerender(<TripForm isPending={false} error={generalError} onSubmit={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Routing service is unavailable.");
  });
});
