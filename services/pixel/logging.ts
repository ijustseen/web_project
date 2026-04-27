export type PlacementLogEvent = {
  event: "pixel_placement";
  timestamp: number;
  playerId: string | null;
  ipAddress: string;
  status: number;
  result: string;
  x: number | null;
  y: number | null;
  color: string | null;
  details?: string;
};

export function logPlacementEvent(event: PlacementLogEvent): void {
  console.info(JSON.stringify(event));
}
