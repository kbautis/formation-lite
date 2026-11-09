// @vitest-environment node
// Node provides structuredClone, which fake-indexeddb needs and jsdom may not.
import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { DATABASE_NAME, ROUTINES_STORE, StorageError, isStorageFailure, openDatabase } from "../../src/storage/database";
import { deleteRoutineWithSong, listRoutines, saveRoutine } from "../../src/storage/routines";
import { loadSong, saveSong } from "../../src/storage/songs";
import { RoutineFormatError } from "../../src/model/errors";
import { renameRoutine, touchRoutine } from "../../src/model/edits";
import { validRoutineInput } from "../fixtures/routines";

let factory: IDBFactory;
let database: IDBDatabase;

beforeEach(async () => {
  factory = new IDBFactory();
  database = await openDatabase(factory);
});

/** Reads one routine back the way the app does: through listRoutines. */
async function savedRoutine(id: string, from: IDBDatabase = database) {
  return (await listRoutines(from)).routines.find((routine) => routine.id === id);
}

function song(byteLength = 4) {
  return { fileName: "mix.mp3", mimeType: "audio/mpeg", durationSeconds: 183.42, bytes: new Uint8Array(byteLength).fill(7).buffer };
}

async function putRaw(value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(ROUTINES_STORE, "readwrite");
    transaction.objectStore(ROUTINES_STORE).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

describe("openDatabase", () => {
  it("creates the formation-lite database with routine and song stores", () => {
    expect(database.name).toBe(DATABASE_NAME);
    expect([...database.objectStoreNames].sort()).toEqual(["routines", "songs"]);
  });
});

describe("routines", () => {
  it("round-trips a routine", async () => {
    const routine = validRoutineInput();
    await saveRoutine(database, routine);
    expect(await savedRoutine(routine.id)).toEqual(routine);
  });

  it("overwrites on save with the same id", async () => {
    const routine = validRoutineInput();
    await saveRoutine(database, routine);
    await saveRoutine(database, renameRoutine(routine, "Renamed"));
    expect((await savedRoutine(routine.id))?.name).toBe("Renamed");
  });

  it("refuses to save an invalid routine", async () => {
    await expect(saveRoutine(database, { ...validRoutineInput(), name: "" })).rejects.toThrow(RoutineFormatError);
  });

  it("reports a corrupt record instead of returning it", async () => {
    await putRaw({ ...validRoutineInput(), version: 99 });
    const listing = await listRoutines(database);
    expect(listing.routines).toEqual([]);
    expect(listing.corrupt).toEqual([{ id: "routine-1", message: expect.stringContaining("version") }]);
  });

  it("lists routines newest first and reports corrupt records separately", async () => {
    const older = validRoutineInput();
    const newer = touchRoutine({ ...validRoutineInput(), id: "routine-2" }, new Date("2026-12-01T00:00:00.000Z"));
    await saveRoutine(database, older);
    await saveRoutine(database, newer);
    await putRaw({ id: "broken", format: "nope" });
    const listing = await listRoutines(database);
    expect(listing.routines.map((routine) => routine.id)).toEqual(["routine-2", "routine-1"]);
    expect(listing.corrupt).toHaveLength(1);
    expect(listing.corrupt[0]?.id).toBe("broken");
    expect(listing.corrupt[0]?.message).toContain("format");
  });

  it("deletes a routine together with its song", async () => {
    const routine = validRoutineInput();
    await saveRoutine(database, routine);
    await saveSong(database, routine.id, song());
    await deleteRoutineWithSong(database, routine.id);
    expect(await savedRoutine(routine.id)).toBeUndefined();
    expect(await loadSong(database, routine.id)).toBeNull();
  });

  it("persists across reopening the database", async () => {
    await saveRoutine(database, validRoutineInput());
    database.close();
    const reopened = await openDatabase(factory);
    expect((await savedRoutine("routine-1", reopened))?.name).toBe("Regionals 2027");
  });
});

describe("songs", () => {
  it("round-trips song bytes and metadata", async () => {
    await saveSong(database, "routine-1", song(16));
    const loaded = await loadSong(database, "routine-1");
    expect(loaded?.fileName).toBe("mix.mp3");
    expect(loaded?.mimeType).toBe("audio/mpeg");
    expect(loaded?.durationSeconds).toBe(183.42);
    expect(new Uint8Array(loaded!.bytes)).toEqual(new Uint8Array(16).fill(7));
  });

  it("returns null when no song is stored for the routine", async () => {
    expect(await loadSong(database, "routine-1")).toBeNull();
  });

  it("rejects an empty song", async () => {
    await expect(saveSong(database, "routine-1", song(0))).rejects.toThrow(StorageError);
  });

});

describe("isStorageFailure", () => {
  it("is true for our storage errors and the browser's DOMExceptions, false for bugs", () => {
    expect(isStorageFailure(new StorageError("full"))).toBe(true);
    expect(isStorageFailure(new DOMException("quota", "QuotaExceededError"))).toBe(true);
    expect(isStorageFailure(new TypeError("bug"))).toBe(false);
    expect(isStorageFailure(new RoutineFormatError("id", "bad"))).toBe(false);
  });
});
