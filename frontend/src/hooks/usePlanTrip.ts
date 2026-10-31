import { useMutation } from "@tanstack/react-query";

import { planTrip, type PlanRequest, type PlanResponse, ApiError } from "../lib/api";

export function usePlanTrip() {
  return useMutation<PlanResponse, ApiError, PlanRequest>({
    mutationFn: (request) => planTrip(request),
  });
}
