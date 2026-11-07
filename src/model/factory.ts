// Constructors for new routines and dancers. Ids and the clock are injected so the
// model stays deterministic; the app passes crypto.randomUUID() and new Date().
import { EditError } from "./errors";
import { parseRoutine } from "./validate";
import { DANCER_NAME_MAX_LENGTH, ROUTINE_FORMAT, ROUTINE_VERSION, type Dancer, type Routine } from "./types";

/** 20 distinct colors that stay readable with white initials on both light and dark stages. */
export const COLOR_PALETTE: readonly string[] = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
  "#008080", "#f032e6", "#9a6324", "#800000", "#808000",
  "#000075", "#e4572e", "#17bebb", "#76b041", "#c2185b",
  "#5d4037", "#1976d2", "#7b1fa2", "#388e3c", "#455a64",
];

export const OPENING_FORMATION_NAME = "Opening";
export const OPENING_HOLD_SECONDS = 2;

interface CreateRoutineOptions {
  readonly name: string;
  readonly now: Date;
  readonly id: string;
  readonly firstFormationId: string;
}

export function createRoutine(options: CreateRoutineOptions): Routine {
  const timestamp = options.now.toISOString();
  return parseRoutine({
    format: ROUTINE_FORMAT,
    version: ROUTINE_VERSION,
    id: options.id,
    name: options.name,
    createdAt: timestamp,
    updatedAt: timestamp,
    stage: { size: null },
    song: null,
    tempo: null,
    dancers: [],
    formations: [
      {
        id: options.firstFormationId,
        name: OPENING_FORMATION_NAME,
        startSeconds: 0,
        holdSeconds: OPENING_HOLD_SECONDS,
        positions: {},
      },
    ],
  });
}

interface CreateDancerOptions {
  readonly id: string;
  readonly name: string;
  readonly existing: readonly Dancer[];
}

export function createDancer(options: CreateDancerOptions): Dancer {
  const name = options.name.trim();
  if (name.length === 0 || name.length > DANCER_NAME_MAX_LENGTH) {
    throw new EditError(`Dancer names must be 1–${DANCER_NAME_MAX_LENGTH} characters.`);
  }
  if (options.existing.some((dancer) => dancer.id === options.id)) {
    throw new EditError(`A dancer with id "${options.id}" already exists.`);
  }
  return { id: options.id, name, color: nextColor(options.existing) };
}

export function nextColor(existing: readonly Dancer[]): string {
  const used = new Set(existing.map((dancer) => dancer.color));
  const unused = COLOR_PALETTE.find((color) => !used.has(color));
  return unused ?? COLOR_PALETTE[existing.length % COLOR_PALETTE.length]!;
}
