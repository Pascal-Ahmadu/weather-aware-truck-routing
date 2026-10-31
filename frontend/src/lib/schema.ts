import { z } from "zod";

export const tripFormSchema = z.object({
  origin: z.string().trim().min(2, "Enter an origin."),
  destination: z.string().trim().min(2, "Enter a destination."),
  departure: z.date({ invalid_type_error: "Choose a departure time." }),
  loadWeightLb: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce
      .number({ invalid_type_error: "Enter the load weight.", required_error: "Enter the load weight." })
      .int("Whole pounds only.")
      .min(1, "Load weight must be positive.")
      .max(200_000, "Load weight must be 200,000 lb or less."),
  ),
  intervalMiles: z.union([z.literal(10), z.literal(25), z.literal(50)]),
});

export type TripFormValues = z.infer<typeof tripFormSchema>;
export type TripFormErrors = Partial<Record<keyof TripFormValues, string>>;

export function validateTripForm(raw: Record<keyof TripFormValues, unknown>): {
  values?: TripFormValues;
  errors: TripFormErrors;
} {
  const result = tripFormSchema.safeParse(raw);
  if (result.success) return { values: result.data, errors: {} };
  const errors: TripFormErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof TripFormValues | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { errors };
}
