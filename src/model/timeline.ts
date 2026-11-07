// Timeline length and ruler spacing. With a song the timeline is the song; without one
// it reaches past the last formation so there is always room to add the next.
import { holdEnd } from "./interpolate";
import type { Routine } from "./types";

export const MIN_TIMELINE_SECONDS = 30;
export const TIMELINE_TAIL_SECONDS = 8;
export const MIN_RULER_LABEL_SPACING_PIXELS = 60;

const RULER_STEPS_SECONDS = [1, 2, 5, 10, 15, 30, 60, 120] as const;

export function timelineDurationSeconds(routine: Routine): number {
  const lastHoldEnd = holdEnd(routine.formations[routine.formations.length - 1]!);
  if (routine.song) return Math.max(routine.song.durationSeconds, lastHoldEnd);
  return Math.max(MIN_TIMELINE_SECONDS, lastHoldEnd + TIMELINE_TAIL_SECONDS);
}

export function rulerStepSeconds(pixelsPerSecond: number): number {
  if (!(pixelsPerSecond > 0)) throw new RangeError(`zoom must be positive, got ${pixelsPerSecond}`);
  const step = RULER_STEPS_SECONDS.find((candidate) => candidate * pixelsPerSecond >= MIN_RULER_LABEL_SPACING_PIXELS);
  return step ?? RULER_STEPS_SECONDS[RULER_STEPS_SECONDS.length - 1]!;
}
