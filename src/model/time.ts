// Formats song time for the timeline and inspector as m:ss.t (tenths, truncated).
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError(`cannot format time ${seconds}`);
  const tenths = Math.floor(seconds * 10 + 1e-6);
  const minutes = Math.floor(tenths / 600);
  const wholeSeconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}.${tenths % 10}`;
}
