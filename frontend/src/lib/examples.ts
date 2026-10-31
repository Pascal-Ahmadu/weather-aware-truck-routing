export interface ExampleTrip {
  label: string;
  origin: string;
  destination: string;
  loadWeightLb: number;
}

export const EXAMPLE_TRIPS: ExampleTrip[] = [
  { label: "Denver → Salt Lake City", origin: "Denver, CO", destination: "Salt Lake City, UT", loadWeightLb: 42000 },
  { label: "Amarillo → Albuquerque", origin: "Amarillo, TX", destination: "Albuquerque, NM", loadWeightLb: 36000 },
  { label: "Cheyenne → Rapid City", origin: "Cheyenne, WY", destination: "Rapid City, SD", loadWeightLb: 44000 },
  { label: "Chicago → Minneapolis", origin: "Chicago, IL", destination: "Minneapolis, MN", loadWeightLb: 30000 },
];
