import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Controller } from "../../src/app/controller";
import { openDatabase } from "../../src/storage/database";
import { listRoutines, saveRoutine } from "../../src/storage/routines";
import { addDancer, renameRoutine } from "../../src/model/edits";
import type { SongSource } from "../../src/playback/songLoader";
import { SongLoadCancelledError } from "../../src/playback/songLoader";
import { validRoutineInput } from "../fixtures/routines";

let database: IDBDatabase;
let idCounter: number;

/** A song loader whose loads the test finishes (or not) by hand. */
class FakeSongs {
  readonly audio = document.createElement("audio");
  pending: { resolve: (duration: number) => void; reject: (error: Error) => void } | null = null;
  load(_song: SongSource): Promise<number> {
    this.unload();
    return new Promise((resolve, reject) => (this.pending = { resolve, reject }));
  }
  unload(): void {
    this.pending?.reject(new SongLoadCancelledError());
    this.pending = null;
  }
  finish(duration: number): void {
    const pending = this.pending;
    this.pending = null;
    pending?.resolve(duration);
  }
}

let songs: FakeSongs;

function makeController(canEdit = true): Controller {
  return new Controller({
    database,
    songs,
    newId: () => `id-${++idCounter}`,
    now: () => new Date("2026-11-07T12:00:00.000Z"),
    nowMilliseconds: () => 0,
    canEdit,
  });
}

/** Lets pending promise callbacks (file reads, IndexedDB) run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function songFile(name = "mix.mp3"): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: "audio/mpeg" });
}

beforeEach(async () => {
  localStorage.clear();
  idCounter = 0;
  songs = new FakeSongs();
  database = await openDatabase(new IDBFactory());
});

describe("Controller.start", () => {
  it("creates and saves exactly one routine on a fresh device", async () => {
    const controller = makeController();
    await controller.start();
    const listing = await listRoutines(database);
    expect(listing.routines).toHaveLength(1);
    expect(listing.routines[0]?.id).toBe(controller.routine.id);
  });

  it("reopens a saved routine without saving a stray new one", async () => {
    await saveRoutine(database, validRoutineInput());
    const controller = makeController();
    await controller.start();
    expect(controller.routine.id).toBe("routine-1");
    expect((await listRoutines(database)).routines).toHaveLength(1);
  });
});

describe("Controller.deleteCurrentRoutine", () => {
  it("does not re-save the deleted routine", async () => {
    await saveRoutine(database, validRoutineInput());
    await saveRoutine(database, { ...validRoutineInput(), id: "routine-2", name: "Other" });
    const controller = makeController();
    await controller.start();
    const deletedId = controller.routine.id;
    controller.edit((routine) => renameRoutine(routine, "Pending edit"));
    await controller.deleteCurrentRoutine();
    const ids = (await listRoutines(database)).routines.map((routine) => routine.id);
    expect(ids).not.toContain(deletedId);
    expect(ids).toHaveLength(1);
  });

  it("tells the user and keeps the routine open when device storage fails", async () => {
    await saveRoutine(database, validRoutineInput());
    const controller = makeController();
    await controller.start();
    database.close();
    await controller.deleteCurrentRoutine();
    expect(controller.routine.id).toBe("routine-1");
    expect(controller.store.getState().notice).toEqual({ kind: "error", text: expect.stringContaining("Couldn't delete") });
  });
});

describe("Controller edits", () => {
  it("autosaves after an edit", async () => {
    const controller = makeController();
    await controller.start();
    controller.edit((routine) => renameRoutine(routine, "Nationals"));
    expect(controller.store.getState().saveStatus).toBe("pending");
    await controller.flushPendingSave();
    expect((await listRoutines(database)).routines[0]?.name).toBe("Nationals");
    expect(controller.store.getState().saveStatus).toBe("saved");
  });

  it("shows a refused edit as a notice instead of throwing", async () => {
    const controller = makeController();
    await controller.start();
    expect(controller.edit((routine) => renameRoutine(routine, " "))).toBe(false);
    expect(controller.store.getState().notice?.kind).toBe("error");
  });

  it("adds a formation at the playhead", async () => {
    await saveRoutine(database, { ...validRoutineInput(), tempo: null });
    const controller = makeController();
    await controller.start();
    controller.seek(10);
    expect(controller.addFormationAtPlayhead()).toBe(true);
    expect(controller.routine.formations.map((formation) => formation.startSeconds)).toEqual([0, 4, 10]);
  });
});

describe("Controller dancer drag", () => {
  it("records one drag as one undo step", async () => {
    const controller = makeController();
    await controller.start();
    controller.edit((routine) => addDancer(routine, { id: "d-1", name: "Ana", color: "#e6194b" }));
    const before = controller.routine.formations[0]!.positions["d-1"];
    expect(controller.beginDrag("d-1")).toBe(true);
    controller.dragTo({ x: 0.1, y: 0.1 });
    controller.dragTo({ x: 0.2, y: 0.2 });
    controller.endDrag();
    expect(controller.routine.formations[0]!.positions["d-1"]).toEqual({ x: 0.2, y: 0.2 });
    controller.undo();
    expect(controller.routine.formations[0]!.positions["d-1"]).toEqual(before);
  });

  it("ignores undo in the middle of a drag, so the drag can't edit a restored routine", async () => {
    const controller = makeController();
    await controller.start();
    controller.edit((routine) => renameRoutine(routine, "Edited"));
    controller.edit((routine) => addDancer(routine, { id: "d-1", name: "Ana", color: "#e6194b" }));
    controller.beginDrag("d-1");
    controller.dragTo({ x: 0.3, y: 0.3 });
    controller.undo();
    expect(controller.routine.dancers).toHaveLength(1);
    controller.endDrag();
    controller.undo();
    expect(controller.routine.formations[0]!.positions["d-1"]).not.toEqual({ x: 0.3, y: 0.3 });
    expect(controller.routine.dancers).toHaveLength(1);
  });

  it("refuses to start a drag mid-transition", async () => {
    await saveRoutine(database, validRoutineInput());
    const controller = makeController();
    await controller.start();
    controller.seek(3);
    expect(controller.beginDrag("d-1")).toBe(false);
  });

  it("refuses to start a drag in the view-only layout", async () => {
    await saveRoutine(database, validRoutineInput());
    const controller = makeController(false);
    await controller.start();
    expect(controller.beginDrag("d-1")).toBe(false);
  });

  it("refuses a second drag while one is in progress", async () => {
    await saveRoutine(database, validRoutineInput());
    const controller = makeController();
    await controller.start();
    expect(controller.beginDrag("d-1")).toBe(true);
    expect(controller.beginEdgeDrag("f-1", "end")).toBe(false);
  });
});

describe("Controller edge drag", () => {
  it("lengthens a hold live from the right edge and records the whole drag as one undo step", async () => {
    await saveRoutine(database, { ...validRoutineInput(), tempo: null });
    const controller = makeController();
    await controller.start();
    expect(controller.beginEdgeDrag("f-1", "end")).toBe(true);
    controller.dragEdgeTo(2.5);
    controller.dragEdgeTo(3.2);
    expect(controller.routine.formations[0]?.holdSeconds).toBeCloseTo(3.2);
    controller.endDrag();
    controller.undo();
    expect(controller.routine.formations[0]?.holdSeconds).toBe(2);
  });

  it("moves the start from the left edge and keeps the end", async () => {
    await saveRoutine(database, { ...validRoutineInput(), tempo: null });
    const controller = makeController();
    await controller.start();
    controller.beginEdgeDrag("f-2", "start");
    controller.dragEdgeTo(5);
    controller.endDrag();
    const formation = controller.routine.formations[1]!;
    expect(formation.startSeconds).toBe(5);
    expect(formation.startSeconds + formation.holdSeconds).toBe(6);
  });

  it("moves the playhead into the formation so the sidebar shows it", async () => {
    await saveRoutine(database, { ...validRoutineInput(), tempo: null });
    const controller = makeController();
    await controller.start();
    controller.seek(3);
    controller.beginEdgeDrag("f-2", "end");
    expect(controller.store.getState().playheadSeconds).toBe(4);
    controller.endDrag();
  });

  it("keeps the playhead inside the formation while its start is dragged later", async () => {
    await saveRoutine(database, { ...validRoutineInput(), tempo: null });
    const controller = makeController();
    await controller.start();
    controller.beginEdgeDrag("f-2", "start");
    controller.dragEdgeTo(5.5);
    expect(controller.store.getState().playheadSeconds).toBe(5.5);
    controller.endDrag();
  });

  it("refuses an unknown formation with a notice, like a dancer drag", async () => {
    const controller = makeController();
    await controller.start();
    expect(controller.beginEdgeDrag("gone", "end")).toBe(false);
    expect(controller.store.getState().notice?.kind).toBe("info");
  });

  it("is refused in the view-only layout", async () => {
    await saveRoutine(database, validRoutineInput());
    const controller = makeController(false);
    await controller.start();
    expect(controller.beginEdgeDrag("f-1", "end")).toBe(false);
  });
});

describe("Controller song", () => {
  it("keeps the song info across undo", async () => {
    const controller = makeController();
    await controller.start();
    controller.edit((routine) => renameRoutine(routine, "Edited"));
    const loading = controller.loadSongFile(songFile());
    await settle();
    songs.finish(100);
    await loading;
    controller.undo();
    expect(controller.routine.name).toBe("Untitled routine");
    expect(controller.routine.song).toEqual({ fileName: "mix.mp3", durationSeconds: 100 });
  });

  it("drops a song still loading when the user switches routines", async () => {
    await saveRoutine(database, { ...validRoutineInput(), song: null });
    await saveRoutine(database, { ...validRoutineInput(), id: "routine-2", name: "Other", song: null });
    const controller = makeController();
    await controller.start();
    const firstId = controller.routine.id;
    const loading = controller.loadSongFile(songFile());
    await settle();
    const otherId = firstId === "routine-1" ? "routine-2" : "routine-1";
    await controller.openRoutine(otherId);
    songs.finish(100);
    await loading;
    expect(controller.routine.id).toBe(otherId);
    expect(controller.routine.song).toBeNull();
    expect(controller.store.getState().loadedSong).toBeNull();
  });

  it("refuses a song file over the size limit", async () => {
    const controller = makeController();
    await controller.start();
    const huge = { name: "huge.wav", size: 101 * 1024 * 1024, type: "audio/wav" } as File;
    await controller.loadSongFile(huge);
    expect(controller.store.getState().notice?.text).toContain("too large");
    expect(songs.pending).toBeNull();
  });
});

describe("Controller seek", () => {
  it("clamps to the timeline", async () => {
    const controller = makeController();
    await controller.start();
    controller.seek(-5);
    expect(controller.store.getState().playheadSeconds).toBe(0);
    controller.seek(10_000);
    expect(controller.store.getState().playheadSeconds).toBe(controller.timelineDuration());
  });
});

describe("Controller in the view-only layout", () => {
  it("refuses edits and says why", async () => {
    const controller = makeController(false);
    await controller.start();
    expect(controller.edit((routine) => renameRoutine(routine, "Nope"))).toBe(false);
    expect(controller.routine.name).toBe("Untitled routine");
    expect(controller.store.getState().notice?.text).toContain("view-only");
  });
});

describe("Controller timeline zoom", () => {
  it("starts fitted to the window", async () => {
    const controller = makeController();
    await controller.start();
    expect(controller.store.getState().zoom).toEqual({ mode: "fit" });
  });

  it("zooms by hand from the scale on screen, and returns to fit on request", async () => {
    const controller = makeController();
    await controller.start();
    controller.zoomBy(2, 10);
    expect(controller.store.getState().zoom).toEqual({ mode: "manual", pixelsPerSecond: 20 });
    controller.zoomToFit();
    expect(controller.store.getState().zoom).toEqual({ mode: "fit" });
  });
});

describe("Controller paths", () => {
  it("shows paths by default and toggles them", async () => {
    const controller = makeController();
    await controller.start();
    expect(controller.store.getState().showPaths).toBe(true);
    controller.togglePaths();
    expect(controller.store.getState().showPaths).toBe(false);
  });
});

describe("Controller collision check", () => {
  it("is on by default", async () => {
    const controller = makeController();
    await controller.start();
    expect(controller.store.getState().checkCollisions).toBe(true);
  });

  it("can be turned off, and this device remembers it", async () => {
    const controller = makeController();
    await controller.start();
    controller.toggleCollisionCheck();
    expect(controller.store.getState().checkCollisions).toBe(false);
    const reopened = makeController();
    expect(reopened.store.getState().checkCollisions).toBe(false);
    reopened.toggleCollisionCheck();
    expect(makeController().store.getState().checkCollisions).toBe(true);
  });
});
