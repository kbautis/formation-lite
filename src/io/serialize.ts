// The share-file contract (docs/architecture.md §4.1, §4.5). Pure: no DOM.
import { RoutineFormatError } from "../model/errors";
import type { Routine } from "../model/types";
import { parseRoutine } from "../model/validate";

export const ROUTINE_FILE_EXTENSION = ".formation.json";
export const SONG_DURATION_TOLERANCE_SECONDS = 1;

const FILE_NAME_MAX_LENGTH = 60;
const FALLBACK_FILE_NAME = "routine";

export function serializeRoutine(routine: Routine): string {
  return `${JSON.stringify(parseRoutine(routine), null, 2)}\n`;
}

export function parseRoutineFile(text: string): Routine {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RoutineFormatError("file", "this is not a formation-lite routine file (it isn't valid JSON)");
  }
  return parseRoutine(data);
}

export function routineFileName(routine: Routine): string {
  const slug = routine.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, FILE_NAME_MAX_LENGTH)
    .replace(/-+$/, "");
  return `${slug || FALLBACK_FILE_NAME}${ROUTINE_FILE_EXTENSION}`;
}

/** True when two song files are close enough in length to be the same cut. */
export function songDurationsMatch(expectedSeconds: number, actualSeconds: number): boolean {
  return Math.abs(expectedSeconds - actualSeconds) <= SONG_DURATION_TOLERANCE_SECONDS;
}
