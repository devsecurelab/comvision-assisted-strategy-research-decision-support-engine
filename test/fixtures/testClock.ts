const DEFAULT_TEST_NOW = '2026-10-14T10:00:00.000Z'; // Wednesday, FX open.

/** Offset Date.now to a chosen market-clock instant while preserving elapsed time for scheduler tests. */
export function installFixedTestClock(): number {
  const requested = process.env.COMVISION_TEST_NOW?.trim() || DEFAULT_TEST_NOW;
  const nowMs = Date.parse(requested);
  if (!Number.isFinite(nowMs)) throw new Error(`Invalid COMVISION_TEST_NOW: ${requested}`);
  const realNow = Date.now.bind(Date);
  const realStartMs = realNow();
  Date.now = () => nowMs + (realNow() - realStartMs);
  console.log(`=== FIXED TEST Date.now: ${new Date(nowMs).toISOString()} ===`);
  return nowMs;
}
