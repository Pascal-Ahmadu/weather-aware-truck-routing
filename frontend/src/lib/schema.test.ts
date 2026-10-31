import { describe, expect, it } from "vitest";

import { validateTripForm } from "./schema";

const valid = {
  origin: "Denver, CO",
  destination: "Salt Lake City, UT",
  departure: new Date("2026-11-01T14:00:00Z"),
  loadWeightLb: "42000",
  intervalMiles: 25,
};

describe("validateTripForm", () => {
  it("accepts a complete form and coerces the load weight to a number", () => {
    const { values, errors } = validateTripForm(valid);
    expect(errors).toEqual({});
    expect(values?.loadWeightLb).toBe(42000);
    expect(values?.intervalMiles).toBe(25);
  });

  it("reports one message per invalid field", () => {
    const { values, errors } = validateTripForm({
      ...valid,
      origin: "",
      loadWeightLb: "-5",
      intervalMiles: 30,
    });
    expect(values).toBeUndefined();
    expect(errors.origin).toBe("Enter an origin.");
    expect(errors.loadWeightLb).toBe("Load weight must be positive.");
    expect(errors.intervalMiles).toBeDefined();
  });

  it("rejects loads over the 200,000 lb ceiling and fractional pounds", () => {
    expect(validateTripForm({ ...valid, loadWeightLb: "250000" }).errors.loadWeightLb).toMatch(/200,000/);
    expect(validateTripForm({ ...valid, loadWeightLb: "100.5" }).errors.loadWeightLb).toBe("Whole pounds only.");
  });
});
