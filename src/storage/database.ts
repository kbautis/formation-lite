// Architecture note (Task 5 — storage)
// - src/storage/ is the only code that touches IndexedDB (docs/architecture.md §4.4).
//   Every operation is a named function taking the open IDBDatabase, so the UI never
//   sees a request, cursor, or transaction.
// - openDatabase takes the IDBFactory as a parameter: the app passes window.indexedDB,
//   tests pass a fresh fake-indexeddb factory.
// - Stores: "routines" (keyPath "id") holds routine documents; "songs" (out-of-line key =
//   routine id) holds { fileName, mimeType, durationSeconds, bytes: ArrayBuffer }.
// - Everything read back is validated (parseRoutine / readStoredSong); nothing unchecked
//   leaves this folder. Writes resolve when the transaction commits, not when the
//   request succeeds, so "saved" means durable.
// - Schema changes bump DATABASE_VERSION and add a step in upgrade(); never edit a step.

export const DATABASE_NAME = "formation-lite";
export const DATABASE_VERSION = 1;
export const ROUTINES_STORE = "routines";
export const SONGS_STORE = "songs";

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

export function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StorageError(`Could not open device storage: ${request.error?.message ?? "unknown error"}`));
    request.onblocked = () => reject(new StorageError("Device storage is in use by another tab with an older version. Close other tabs and reload."));
  });
}

function upgrade(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(ROUTINES_STORE)) database.createObjectStore(ROUTINES_STORE, { keyPath: "id" });
  if (!database.objectStoreNames.contains(SONGS_STORE)) database.createObjectStore(SONGS_STORE);
}

/** Resolves with a request's result once its transaction has committed. */
export function runRequest<T>(
  database: IDBDatabase,
  storeNames: string | string[],
  mode: IDBTransactionMode,
  makeRequest: (transaction: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, mode);
    const request = makeRequest(transaction);
    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(new StorageError(`Device storage failed: ${transaction.error?.message ?? "unknown error"}`));
    transaction.onabort = () => reject(new StorageError(`Device storage was interrupted: ${transaction.error?.message ?? "aborted"}`));
  });
}
