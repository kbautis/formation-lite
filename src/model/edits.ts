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
import { MAX_DANCERS, type Dancer, type Formation, type Position, type Routine, type SongInfo, type StageSize, type Tempo } from "./types";
import { parseRoutine } from "./validate";

export const DEFAULT_HOLD_SECONDS = 2;
export const DEFAULT_HOLD_BEATS = 4;

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
    holdSeconds: next ? Math.min(defaultHold, next.startSeconds - startSeconds) : defaultHold,
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
  if (!Number.isFinite(endSeconds)) throw new EditError("A formation's end must be a time in the song.");
  const end = routine.tempo ? snapToBeat(routine.tempo, endSeconds) : endSeconds;
  const next = routine.formations.find((candidate) => candidate.startSeconds > formation.startSeconds);
  const longestHold = next ? next.startSeconds - formation.startSeconds : Number.POSITIVE_INFINITY;
  return Math.min(longestHold, Math.max(0, end - formation.startSeconds));
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
