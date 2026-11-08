// Architecture note (Task 3 — timeline math)
// - positionsAt(routine, t) is the one question the whole app renders from: stage,
//   playback, and scrubbing all call it with song seconds and never cache its result.
// - Holds are inclusive at both ends; when a hold ends exactly where the next starts,
//   the later formation wins, so a zero-length transition never divides by zero.
// - Between holds dancers move in straight lines with smoothstep easing. With a ripple
//   (the destination formation's stagger), each dancer moves in their own slice of the
//   transition, ranked by the chosen order (docs/architecture.md §4.3.1).
// - Before the first formation and after the last, dancers sit at that formation.
// - tempo.ts (counts) and stage.ts (geometry) are separate pure modules; none of the
//   three touch the DOM, storage, or a clock.
import type { Dancer, Formation, Position, Routine, Stagger } from "./types";

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
  return interpolateTransition(formations[nextIndex - 1]!, formations[nextIndex]!, seconds, routine.dancers);
}

function interpolateTransition(from: Formation, to: Formation, seconds: number, dancers: readonly Dancer[]): Record<string, Position> {
  const departure = holdEnd(from);
  const progress = (seconds - departure) / (to.startSeconds - departure);
  const ranks = to.stagger ? staggerRanks(to.stagger, from, dancers) : null;
  const result: Record<string, Position> = {};
  for (const dancer of dancers) {
    const start = from.positions[dancer.id]!;
    const end = to.positions[dancer.id]!;
    const eased = smoothstep(ranks ? dancerProgress(progress, ranks.get(dancer.id)!, to.stagger!.spread) : progress);
    result[dancer.id] = {
      x: start.x + (end.x - start.x) * eased,
      y: start.y + (end.y - start.y) * eased,
    };
  }
  return result;
}

/** A dancer of rank r (0…1) moves during [r·spread, r·spread + (1 − spread)] of the transition. */
function dancerProgress(progress: number, rank: number, spread: number): number {
  const local = (progress - rank * spread) / (1 - spread);
  return Math.min(1, Math.max(0, local));
}

/** Ranks dancers 0…1 by where they stand in the formation they leave; ties keep list order (sort is stable since ES2019). */
export function staggerRanks(stagger: Stagger, from: Formation, dancers: readonly Dancer[]): Map<string, number> {
  const ordered = [...dancers].sort((a, b) => staggerKey(stagger, from, a) - staggerKey(stagger, from, b));
  const last = Math.max(1, ordered.length - 1);
  return new Map(ordered.map((dancer, index) => [dancer.id, index / last]));
}

function staggerKey(stagger: Stagger, from: Formation, dancer: Dancer): number {
  const position = from.positions[dancer.id]!;
  switch (stagger.order) {
    case "left-to-right":
      return position.x;
    case "right-to-left":
      return -position.x;
    case "front-to-back":
      return position.y;
    case "back-to-front":
      return -position.y;
    case "list-order":
      return 0;
  }
}

export function holdEnd(formation: Formation): number {
  return formation.startSeconds + formation.holdSeconds;
}

function assertFiniteTime(seconds: number): void {
  if (!Number.isFinite(seconds)) throw new RangeError(`time must be a finite number of seconds, got ${seconds}`);
}
