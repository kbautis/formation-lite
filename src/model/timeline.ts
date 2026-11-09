// Timeline length, zoom, and label spacing. With a song the timeline is the song; without
// one it reaches past the last formation so there is always room to add the next. By
// default the timeline is zoomed to fit the window (fitPixelsPerSecond), so a long song
// shrinks to fit instead of scrolling; labels thin out (rulerStepSeconds, countLabelEvery)
// so they stay readable at any zoom.
import { holdEnd } from "./interpolate";
import type { Routine } from "./types";

export const MIN_TIMELINE_SECONDS = 30;
export const TIMELINE_TAIL_SECONDS = 8;
export const MIN_RULER_LABEL_SPACING_PIXELS = 60;
export const MIN_COUNT_LABEL_SPACING_PIXELS = 20;

const RULER_STEPS_SECONDS = [1, 2, 5, 10, 15, 30, 60, 120] as const;
const COUNT_LABEL_STEPS = [1, 2, 4, 8, 16, 32, 64] as const;

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

/** The zoom at which the whole timeline exactly fills the given width. */
export function fitPixelsPerSecond(durationSeconds: number, widthPixels: number): number {
  if (!(durationSeconds > 0)) throw new RangeError(`duration must be positive, got ${durationSeconds}`);
  if (!(widthPixels > 0)) throw new RangeError(`width must be positive, got ${widthPixels}`);
  return widthPixels / durationSeconds;
}

/** Label every Nth 8-count (1, 2, 4, …) so labels are at least MIN_COUNT_LABEL_SPACING_PIXELS apart. */
export function countLabelEvery(eightCountSpacingPixels: number): number {
  if (!(eightCountSpacingPixels > 0)) throw new RangeError(`spacing must be positive, got ${eightCountSpacingPixels}`);
  const step = COUNT_LABEL_STEPS.find((candidate) => candidate * eightCountSpacingPixels >= MIN_COUNT_LABEL_SPACING_PIXELS);
  return step ?? COUNT_LABEL_STEPS[COUNT_LABEL_STEPS.length - 1]!;
}
