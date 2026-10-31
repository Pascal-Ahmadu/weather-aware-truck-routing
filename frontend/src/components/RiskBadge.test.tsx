import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RiskBadge } from "./RiskBadge";

describe("RiskBadge", () => {
  it.each([
    [0, "Low"],
    [1, "Moderate"],
    [2, "High"],
    [3, "Severe"],
    [4, "No Travel"],
  ] as const)("labels level %i as %s", (level, label) => {
    render(<RiskBadge level={level} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("never presents missing data as Low", () => {
    render(<RiskBadge level={null} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.queryByText("Low")).not.toBeInTheDocument();
  });

  it("appends a detail when given", () => {
    render(<RiskBadge level={2} detail="38 mph wind" />);
    expect(screen.getByText(/38 mph wind/)).toBeInTheDocument();
  });
});
