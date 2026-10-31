import { describe, expect, it } from "vitest";

import { formatDuration, formatMiles } from "./format";

describe("formatDuration", () => {
  it.each([
    [0, "0 min"],
    [45 * 60, "45 min"],
    [3600, "1h"],
    [9 * 3600 + 60, "9h 1m"],
    [26 * 3600, "1d 2h"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe("formatMiles", () => {
  it("rounds and adds a thousands separator", () => {
    expect(formatMiles(519.4)).toBe("519 mi");
    expect(formatMiles(1234.6)).toBe("1,235 mi");
  });
});
