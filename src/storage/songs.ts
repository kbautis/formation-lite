// Song audio in the "songs" store, keyed by routine id. Bytes are stored as an
// ArrayBuffer plus MIME type rather than a Blob (see docs/architecture.md §4.4).
import { SONGS_STORE, StorageError, runRequest } from "./database";

export interface StoredSong {
  readonly fileName: string;
  readonly mimeType: string;
  readonly durationSeconds: number;
  readonly bytes: ArrayBuffer;
}

export async function saveSong(database: IDBDatabase, routineId: string, song: StoredSong): Promise<void> {
  const checked = readStoredSong(song);
  await runRequest(database, SONGS_STORE, "readwrite", (transaction) => transaction.objectStore(SONGS_STORE).put(checked, routineId));
}

/** Returns null when this device has no song for the routine; that is a normal state. */
export async function loadSong(database: IDBDatabase, routineId: string): Promise<StoredSong | null> {
  const record = await runRequest<unknown>(database, SONGS_STORE, "readonly", (transaction) =>
    transaction.objectStore(SONGS_STORE).get(routineId),
  );
  return record === undefined ? null : readStoredSong(record);
}

function readStoredSong(value: unknown): StoredSong {
  const song = value as Partial<StoredSong> | null;
  if (
    !song ||
    typeof song.fileName !== "string" ||
    song.fileName.length === 0 ||
    typeof song.mimeType !== "string" ||
    typeof song.durationSeconds !== "number" ||
    !(song.durationSeconds > 0) ||
    !(song.bytes instanceof ArrayBuffer)
  ) {
    throw new StorageError("The stored song is damaged. Load the song file again.");
  }
  if (song.bytes.byteLength === 0) throw new StorageError("The song file is empty.");
  return { fileName: song.fileName, mimeType: song.mimeType, durationSeconds: song.durationSeconds, bytes: song.bytes };
}
