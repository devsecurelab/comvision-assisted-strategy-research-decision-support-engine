export const MILESTONE_NOTIFY_AT = [100, 200, 300, 500] as const;
export type Milestone = (typeof MILESTONE_NOTIFY_AT)[number];

/** Returns only newly crossed milestones; persisted notified values make this restart-safe. */
export function milestonesToNotify(previousValid: number, currentValid: number, notified: Iterable<number> = []): Milestone[] {
  const sent = new Set(notified);
  return MILESTONE_NOTIFY_AT.filter((milestone) => milestone > previousValid && milestone <= currentValid && !sent.has(milestone));
}
