// Architecture note (Task 4 — edits and history)
// - Every edit is a pure function (routine, args) → new routine; nothing is mutated.
// - Every result goes back through parseRoutine, so an edit can never produce a routine
//   that storage or another device would reject. A RoutineFormatError from that check is
//   re-thrown as EditError, the one error type the UI shows for a refused edit.
// - Preconditions from docs/architecture.md §9 throw EditError up front with a message
//   written for the choreographer, not the developer.
// - Edits never touch updatedAt; the controller calls touchRoutine once before saving.
// - history.ts keeps whole-routine snapshots (routines are tens of kB, so diffs are not
//   worth their complexity).
import { EditError, RoutineFormatError } from "./errors";
import { activeFormationAt, holdEnd, positionsAt } from "./interpolate";
import { clampToWings } from "./stage";
import { beatsToSeconds, snapToBeat } from "./tempo";
import { MAX_DANCERS, type Dancer, type Formation, type Position, type Routine, type SongInfo, type StageSize, type Stagger, type Tempo } from "./types";
import { parseRoutine } from "./validate";

export const DEFAULT_HOLD_SECONDS = 2;
export const DEFAULT_HOLD_BEATS = 4;
/** Edge drags and new formations always leave this much time for dancers to move. */
export const MIN_TRANSITION_BEATS = 1;
export const MIN_TRANSITION_SECONDS = 0.5;

const DEFAULT_SPOT_COLUMNS = 5;
const DEFAULT_SPOT_ROWS = 4;
const DEFAULT_SPOT_LAYER_OFFSET = 0.05;

export function renameRoutine(routine: Routine, name: string): Routine {
  return validated({ ...routine, name });
}

export function touchRoutine(routine: Routine, now: Date): Routine {
  return { ...routine, updatedAt: now.toISOString() };
}

export function addDancer(routine: Routine, dancer: Dancer): Routine {
  if (routine.dancers.length >= MAX_DANCERS) throw new EditError(`A routine can have at most ${MAX_DANCERS} dancers.`);
  if (routine.dancers.some((existing) => existing.id === dancer.id)) {
    throw new EditError(`A dancer with id "${dancer.id}" already exists.`);
  }
  const spot = defaultSpot(routine.dancers.length);
  return validated({
    ...routine,
    dancers: [...routine.dancers, dancer],
    formations: routine.formations.map((formation) => ({
      ...formation,
      positions: { ...formation.positions, [dancer.id]: spot },
    })),
  });
}

/** Spreads new dancers over a 5 × 4 block mid-stage; dancers past 20 are nudged so they never stack exactly. */
export function defaultSpot(index: number): Position {
  const column = index % DEFAULT_SPOT_COLUMNS;
  const row = Math.floor(index / DEFAULT_SPOT_COLUMNS) % DEFAULT_SPOT_ROWS;
  const layer = Math.floor(index / (DEFAULT_SPOT_COLUMNS * DEFAULT_SPOT_ROWS)) * DEFAULT_SPOT_LAYER_OFFSET;
  return {
    x: (column + 1) / (DEFAULT_SPOT_COLUMNS + 1) + layer,
    y: (row + 1) / (DEFAULT_SPOT_ROWS + 1) + layer,
  };
}

export function updateDancer(routine: Routine, dancerId: string, changes: Partial<Pick<Dancer, "name" | "color">>): Routine {
  requireDancer(routine, dancerId);
  return validated({
    ...routine,
    dancers: routine.dancers.map((dancer) => (dancer.id === dancerId ? { ...dancer, ...changes } : dancer)),
  });
}

export function removeDancer(routine: Routine, dancerId: string): Routine {
  requireDancer(routine, dancerId);
  return validated({
    ...routine,
    dancers: routine.dancers.filter((dancer) => dancer.id !== dancerId),
    formations: routine.formations.map((formation) => {
      const { [dancerId]: _removed, ...positions } = formation.positions;
      return { ...formation, positions };
    }),
  });
}

interface AddFormationOptions {
  readonly id: string;
  readonly seconds: number;
}

export function addFormationAt(routine: Routine, options: AddFormationOptions): Routine {
  if (routine.formations.some((formation) => formation.id === options.id)) {
    throw new EditError(`A formation with id "${options.id}" already exists.`);
  }
  const startSeconds = routine.tempo ? snapToBeat(routine.tempo, options.seconds) : options.seconds;
  const occupied = routine.formations.find(
    (formation) => formation.startSeconds === startSeconds || (formation.startSeconds <= startSeconds && startSeconds < holdEnd(formation)),
  );
  if (occupied) {
    throw new EditError(`That moment is inside "${formationLabel(routine, occupied)}". Move past its hold to add a new formation.`);
  }
  const next = routine.formations.find((formation) => formation.startSeconds > startSeconds);
  const defaultHold = routine.tempo ? beatsToSeconds(routine.tempo, DEFAULT_HOLD_BEATS) : DEFAULT_HOLD_SECONDS;
  const formation: Formation = {
    id: options.id,
    name: `Formation ${routine.formations.length + 1}`,
    startSeconds,
    holdSeconds: next ? Math.min(defaultHold, Math.max(0, next.startSeconds - startSeconds - minimumTransitionSeconds(routine))) : defaultHold,
    stagger: null,
    positions: positionsAt(routine, startSeconds),
  };
  const formations = [...routine.formations, formation].sort((a, b) => a.startSeconds - b.startSeconds);
  return validated({ ...routine, formations });
}

interface FormationTiming {
  readonly startSeconds: number;
  readonly holdSeconds: number;
}

export function updateFormationTiming(routine: Routine, formationId: string, timing: FormationTiming): Routine {
  requireFormation(routine, formationId);
  return validated(
    replaceFormation(routine, formationId, (formation) => ({ ...formation, ...timing })),
    "Formations can't overlap or move past each other. Shorten a hold or pick a time between the neighbors.",
  );
}

export function renameFormation(routine: Routine, formationId: string, name: string): Routine {
  requireFormation(routine, formationId);
  return validated(replaceFormation(routine, formationId, (formation) => ({ ...formation, name })));
}

export function removeFormation(routine: Routine, formationId: string): Routine {
  requireFormation(routine, formationId);
  if (routine.formations.length === 1) throw new EditError("A routine needs at least one formation.");
  return validated({ ...routine, formations: routine.formations.filter((formation) => formation.id !== formationId) });
}

interface MoveDancerOptions {
  readonly formationId: string;
  readonly dancerId: string;
  readonly position: Position;
}

export function moveDancer(routine: Routine, options: MoveDancerOptions): Routine {
  requireFormation(routine, options.formationId);
  requireDancer(routine, options.dancerId);
  const position = clampToWings(options.position);
  return validated(
    replaceFormation(routine, options.formationId, (formation) => ({
      ...formation,
      positions: { ...formation.positions, [options.dancerId]: position },
    })),
  );
}

/**
 * The hold a formation gets when its end is dragged to endSeconds: snapped to the nearest
 * beat when there is a tempo, never negative, and never running into the next formation.
 */
export function holdSecondsForEnd(routine: Routine, formationId: string, endSeconds: number): number {
  const formation = requireFormation(routine, formationId);
  const end = snapForDrag(routine, endSeconds);
  const next = nextFormation(routine, formation);
  // Keep a minimum transition before the next formation, unless the gap is already
  // smaller (typed in the sidebar): then the drag may only shrink the hold.
  const latestEnd = next
    ? Math.max(next.startSeconds - minimumTransitionSeconds(routine), Math.min(holdEnd(formation), next.startSeconds))
    : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(latestEnd, end) - formation.startSeconds);
}

/**
 * The start a formation gets when its left edge is dragged to startSeconds; its end stays
 * put. Snapped to the beat with a tempo, never after its own end, never before 0, and
 * keeping a minimum transition after the previous formation (unless that gap is already
 * smaller, in which case the drag may only widen it).
 */
export function startSecondsForDrag(routine: Routine, formationId: string, startSeconds: number): number {
  const formation = requireFormation(routine, formationId);
  const start = snapForDrag(routine, startSeconds);
  const previous = previousFormation(routine, formation);
  const earliestStart = previous
    ? Math.min(holdEnd(previous) + minimumTransitionSeconds(routine), formation.startSeconds)
    : 0;
  return Math.min(holdEnd(formation), Math.max(earliestStart, start));
}

export function minimumTransitionSeconds(routine: Routine): number {
  return routine.tempo ? beatsToSeconds(routine.tempo, MIN_TRANSITION_BEATS) : MIN_TRANSITION_SECONDS;
}

/** Time dancers have to move into this formation; null for the first formation. */
export function transitionInSeconds(routine: Routine, formationId: string): number | null {
  const formation = requireFormation(routine, formationId);
  const previous = previousFormation(routine, formation);
  return previous ? formation.startSeconds - holdEnd(previous) : null;
}

/**
 * Sets how long dancers take to move into this formation by changing when the previous
 * formation releases. This formation's start, which is pinned to the music, never moves.
 */
export function setTransitionIn(routine: Routine, formationId: string, seconds: number): Routine {
  const formation = requireFormation(routine, formationId);
  const previous = previousFormation(routine, formation);
  if (!previous) throw new EditError("The first formation has no transition into it.");
  if (!Number.isFinite(seconds) || seconds < 0) throw new EditError("A transition can't be negative.");
  const previousHold = formation.startSeconds - seconds - previous.startSeconds;
  if (previousHold < 0) {
    throw new EditError("That's longer than the time since the previous formation started. Move this formation later first.");
  }
  return updateFormationTiming(routine, previous.id, { startSeconds: previous.startSeconds, holdSeconds: previousHold });
}

/** Sets the ripple for the transition into this formation (null = everyone moves together). */
export function setStagger(routine: Routine, formationId: string, stagger: Stagger | null): Routine {
  requireFormation(routine, formationId);
  return validated(replaceFormation(routine, formationId, (formation) => ({ ...formation, stagger })));
}

function snapForDrag(routine: Routine, seconds: number): number {
  if (!Number.isFinite(seconds)) throw new EditError("A formation's edge must be a time in the song.");
  return routine.tempo ? snapToBeat(routine.tempo, seconds) : seconds;
}

function previousFormation(routine: Routine, formation: Formation): Formation | null {
  const index = routine.formations.indexOf(formation);
  return index > 0 ? routine.formations[index - 1]! : null;
}

function nextFormation(routine: Routine, formation: Formation): Formation | null {
  return routine.formations[routine.formations.indexOf(formation) + 1] ?? null;
}

/** The formation a drag at this moment edits; throws when the playhead is mid-transition. */
export function editableFormationAt(routine: Routine, seconds: number): Formation {
  const formation = activeFormationAt(routine, seconds);
  if (!formation) throw new EditError("Dancers are moving here. Jump to a formation to change positions.");
  return formation;
}

export function setStageSize(routine: Routine, size: StageSize | null): Routine {
  return validated({ ...routine, stage: { size } });
}

export function setTempo(routine: Routine, tempo: Tempo | null): Routine {
  return validated({ ...routine, tempo });
}

export function setSongInfo(routine: Routine, song: SongInfo | null): Routine {
  return validated({ ...routine, song });
}

function replaceFormation(routine: Routine, formationId: string, change: (formation: Formation) => Formation): Routine {
  return {
    ...routine,
    formations: routine.formations.map((formation) => (formation.id === formationId ? change(formation) : formation)),
  };
}

function requireDancer(routine: Routine, dancerId: string): Dancer {
  const dancer = routine.dancers.find((candidate) => candidate.id === dancerId);
  if (!dancer) throw new EditError(`No dancer with id "${dancerId}".`);
  return dancer;
}

function requireFormation(routine: Routine, formationId: string): Formation {
  const formation = routine.formations.find((candidate) => candidate.id === formationId);
  if (!formation) throw new EditError(`No formation with id "${formationId}".`);
  return formation;
}

function formationLabel(routine: Routine, formation: Formation): string {
  return formation.name || `Formation ${routine.formations.indexOf(formation) + 1}`;
}

function validated(routine: Routine, friendlyMessage?: string): Routine {
  try {
    return parseRoutine(routine);
  } catch (error) {
    if (error instanceof RoutineFormatError) throw new EditError(friendlyMessage ?? error.message);
    throw error;
  }
}
