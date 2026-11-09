// Architecture note (close encounters — docs/architecture.md §4.3.1)
// - Pure: samples positionsAt across a transition, so ripple timing is included for free.
// - Distances are measured in stage proportions: real feet/metres on a sized stage, and
//   on an open stage a 4:3 stage whose depth is 1.
// - A pair is flagged only when it is apart at both ends of the transition but comes
//   closer than the threshold in between; partners who start or end close are intended.
// - Sampling (ENCOUNTER_SAMPLES per transition) can miss a pass shorter than one sample
//   interval; that limit is accepted and documented rather than solved with geometry.
// - Results are derived data, cached twice: per routine object (WeakMap), so every view
//   reading the same routine shares one computation; and per transition by content
//   (timing, ripple, positions, dancers, stage), because every edit rebuilds the routine
//   through parseRoutine. A dancer drag therefore recomputes only the two transitions
//   next to the edited formation.
import { EditError } from "./errors";
import { holdEnd, positionsInTransition, staggerRanks } from "./interpolate";
import { OPEN_STAGE_ASPECT } from "./stage";
import type { Formation, LengthUnit, Position, Routine, Stage } from "./types";

/** Closer than this mid-transition counts as a collision risk. */
export const CLOSE_DISTANCE: Readonly<Record<LengthUnit, number>> = { ft: 2, m: 0.6 };
/** On an open stage (no units), the same idea as a fraction of the stage depth. */
export const OPEN_STAGE_CLOSE_DISTANCE = 1 / 15;
export const ENCOUNTER_SAMPLES = 48;
/** Distinct transitions remembered; plenty for undo history and drags, bounded for memory. */
const TRANSITION_CACHE_LIMIT = 4000;

const byRoutine = new WeakMap<Routine, Map<string, Encounter[]>>();
const byTransition = new Map<string, Encounter[]>();

export interface Encounter {
  /** The formation the dancers are moving into. */
  readonly formationId: string;
  readonly dancerIds: readonly [string, string];
  /** When they are closest. */
  readonly atSeconds: number;
  /** Their closest distance, in `unit` (or fractions of the depth on an open stage). */
  readonly distance: number;
  readonly unit: LengthUnit | null;
}

interface Measure {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly threshold: number;
  readonly unit: LengthUnit | null;
}

/** Close encounters during the transition into this formation, earliest first. */
export function closeEncounters(routine: Routine, formationId: string): Encounter[] {
  const index = routine.formations.findIndex((formation) => formation.id === formationId);
  if (index === -1) throw new EditError(`No formation with id "${formationId}".`);
  if (index === 0) return [];
  return transitionEncounters(routine, routine.formations[index - 1]!, routine.formations[index]!);
}

/** Every transition's encounters, keyed by the formation moved into; transitions without any are omitted. */
export function encountersFor(routine: Routine): Map<string, Encounter[]> {
  const cached = byRoutine.get(routine);
  if (cached) return cached;
  const result = new Map<string, Encounter[]>();
  routine.formations.forEach((to, index) => {
    if (index === 0) return;
    const encounters = transitionEncounters(routine, routine.formations[index - 1]!, to);
    if (encounters.length > 0) result.set(to.id, encounters);
  });
  byRoutine.set(routine, result);
  return result;
}

function transitionEncounters(routine: Routine, from: Formation, to: Formation): Encounter[] {
  const key = transitionKey(routine, from, to);
  const cached = byTransition.get(key);
  if (cached) return cached;
  const encounters = computeEncounters(routine, from, to);
  if (byTransition.size >= TRANSITION_CACHE_LIMIT) byTransition.clear();
  byTransition.set(key, encounters);
  return encounters;
}

/** Everything a transition's encounters depend on, as a string. */
function transitionKey(routine: Routine, from: Formation, to: Formation): string {
  const ids = routine.dancers.map((dancer) => dancer.id);
  return JSON.stringify([
    to.id,
    holdEnd(from),
    to.startSeconds,
    to.stagger,
    routine.stage.size,
    ids,
    ids.map((id) => from.positions[id]),
    ids.map((id) => to.positions[id]),
  ]);
}

function computeEncounters(routine: Routine, from: Formation, to: Formation): Encounter[] {
  const departure = holdEnd(from);
  const arrival = to.startSeconds;
  if (arrival <= departure) return [];
  const formationId = to.id;

  const measure = measureFor(routine.stage);
  const ranks = to.stagger ? staggerRanks(to.stagger, from, routine.dancers) : null;
  const samples = Array.from({ length: ENCOUNTER_SAMPLES - 1 }, (_, step) => {
    const seconds = departure + ((arrival - departure) * (step + 1)) / ENCOUNTER_SAMPLES;
    return { seconds, positions: positionsInTransition(from, to, seconds, routine.dancers, ranks) };
  });

  const encounters: Encounter[] = [];
  const ids = routine.dancers.map((dancer) => dancer.id);
  for (let first = 0; first < ids.length; first++) {
    for (let second = first + 1; second < ids.length; second++) {
      const a = ids[first]!;
      const b = ids[second]!;
      const apart = (positions: Readonly<Record<string, Position>>) => distance(positions[a]!, positions[b]!, measure);
      if (apart(from.positions) < measure.threshold || apart(to.positions) < measure.threshold) continue;
      let closest = { seconds: departure, distance: Number.POSITIVE_INFINITY };
      for (const sample of samples) {
        const sampleDistance = apart(sample.positions);
        if (sampleDistance < closest.distance) closest = { seconds: sample.seconds, distance: sampleDistance };
      }
      if (closest.distance < measure.threshold) {
        encounters.push({ formationId, dancerIds: [a, b], atSeconds: closest.seconds, distance: closest.distance, unit: measure.unit });
      }
    }
  }
  return encounters.sort((x, y) => x.atSeconds - y.atSeconds);
}

function measureFor(stage: Stage): Measure {
  if (!stage.size) return { scaleX: OPEN_STAGE_ASPECT, scaleY: 1, threshold: OPEN_STAGE_CLOSE_DISTANCE, unit: null };
  return { scaleX: stage.size.width, scaleY: stage.size.depth, threshold: CLOSE_DISTANCE[stage.size.unit], unit: stage.size.unit };
}

function distance(a: Position, b: Position, measure: Measure): number {
  return Math.hypot((a.x - b.x) * measure.scaleX, (a.y - b.y) * measure.scaleY);
}
