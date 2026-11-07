// Architecture note (Task 3 — timeline math)
// - positionsAt(routine, t) is the one question the whole app renders from: stage,
//   playback, and scrubbing all call it with song seconds and never cache its result.
// - Holds are inclusive at both ends; when a hold ends exactly where the next starts,
//   the later formation wins, so a zero-length transition never divides by zero.
// - Between holds dancers move in straight lines with smoothstep easing.
// - Before the first formation and after the last, dancers sit at that formation.
// - tempo.ts (counts) and stage.ts (geometry) are separate pure modules; none of the
//   three touch the DOM, storage, or a clock.
import type { Formation, Position, Routine } from "./types";

export function smoothstep(progress: number): number {
  if (!(progress >= 0 && progress <= 1)) throw new RangeError(`progress must be within 0–1, got ${progress}`);
  return progress * progress * (3 - 2 * progress);
}

export function activeFormationAt(routine: Routine, seconds: number): Formation | null {
  assertFiniteTime(seconds);
  for (let index = routine.formations.length - 1; index >= 0; index--) {
    const formation = routine.formations[index]!;
    if (formation.startSeconds <= seconds && seconds <= holdEnd(formation)) return formation;
  }
  return null;
}

export function positionsAt(routine: Routine, seconds: number): Record<string, Position> {
  const active = activeFormationAt(routine, seconds);
  if (active) return { ...active.positions };
  const formations = routine.formations;
  const nextIndex = formations.findIndex((formation) => seconds < formation.startSeconds);
  if (nextIndex === -1) return { ...formations[formations.length - 1]!.positions };
  if (nextIndex === 0) return { ...formations[0]!.positions };
  return interpolateTransition(formations[nextIndex - 1]!, formations[nextIndex]!, seconds);
}

function interpolateTransition(from: Formation, to: Formation, seconds: number): Record<string, Position> {
  const departure = holdEnd(from);
  const progress = smoothstep((seconds - departure) / (to.startSeconds - departure));
  const result: Record<string, Position> = {};
  for (const dancerId of Object.keys(to.positions)) {
    const start = from.positions[dancerId]!;
    const end = to.positions[dancerId]!;
    result[dancerId] = {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    };
  }
  return result;
}

export function holdEnd(formation: Formation): number {
  return formation.startSeconds + formation.holdSeconds;
}

function assertFiniteTime(seconds: number): void {
  if (!Number.isFinite(seconds)) throw new RangeError(`time must be a finite number of seconds, got ${seconds}`);
}
