// Routine documents in the "routines" store. Saves and loads both pass through
// parseRoutine, so a bad document can neither get in nor come out.
import { RoutineFormatError } from "../model/errors";
import type { Routine } from "../model/types";
import { parseRoutine } from "../model/validate";
import { ROUTINES_STORE, SONGS_STORE, runRequest } from "./database";

export interface CorruptRecord {
  readonly id: string;
  readonly message: string;
}

export interface RoutineListing {
  /** Newest updatedAt first. */
  readonly routines: readonly Routine[];
  readonly corrupt: readonly CorruptRecord[];
}

export async function saveRoutine(database: IDBDatabase, routine: Routine): Promise<void> {
  const checked = parseRoutine(routine);
  await runRequest(database, ROUTINES_STORE, "readwrite", (transaction) => transaction.objectStore(ROUTINES_STORE).put(checked));
}

export async function listRoutines(database: IDBDatabase): Promise<RoutineListing> {
  const records = (await runRequest<unknown[]>(database, ROUTINES_STORE, "readonly", (transaction) =>
    transaction.objectStore(ROUTINES_STORE).getAll(),
  )) ?? [];
  const routines: Routine[] = [];
  const corrupt: CorruptRecord[] = [];
  for (const record of records) {
    try {
      routines.push(parseRoutine(record));
    } catch (error) {
      if (!(error instanceof RoutineFormatError)) throw error;
      corrupt.push({ id: recordId(record), message: error.message });
    }
  }
  routines.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { routines, corrupt };
}

export async function deleteRoutineWithSong(database: IDBDatabase, id: string): Promise<void> {
  await runRequest(database, [ROUTINES_STORE, SONGS_STORE], "readwrite", (transaction) => {
    transaction.objectStore(ROUTINES_STORE).delete(id);
    transaction.objectStore(SONGS_STORE).delete(id);
  });
}

function recordId(record: unknown): string {
  const id = typeof record === "object" && record !== null ? (record as { id?: unknown }).id : undefined;
  return typeof id === "string" ? id : "(unknown id)";
}
