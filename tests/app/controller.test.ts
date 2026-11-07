import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Controller } from "../../src/app/controller";
import { openDatabase } from "../../src/storage/database";
import { listRoutines, saveRoutine } from "../../src/storage/routines";
import { addDancer, renameRoutine, setSongInfo } from "../../src/model/edits";
import { validRoutineInput } from "../fixtures/routines";

let database: IDBDatabase;
let idCounter: number;

function makeController(canEdit = true): Controller {
  return new Controller({
    database,
    audio: document.createElement("audio"),
    newId: () => `id-${++idCounter}`,
    now: () => new Date("2026-11-07T12:00:00.000Z"),
    nowMilliseconds: () => 0,
    canEdit,
  });
}

beforeEach(async () => {
  localStorage.clear();
  idCounter = 0;
  database = await openDatabase(new IDBFactory());
});

describe("Controller.start", () => {
  it("creates and saves exactly one routine on a fresh device", async () => {
    const controller = makeController();
    await controller.start();
    const listing = await listRoutines(database);
    expect(listing.routines).toHaveLength(1);
    expect(listing.routines[0]?.id).toBe(controller.store.getState().routine.id);
  });

  it("reopens a saved routine without saving a stray new one", async () => {
    await saveRoutine(database, validRoutineInput());
    const controller = makeController();
    await controller.start();
    expect(controller.store.getState().routine.id).toBe("routine-1");
    expect((await listRoutines(database)).routines).toHaveLength(1);
  });
});

describe("Controller.deleteCurrentRoutine", () => {
  it("does not re-save the deleted routine", async () => {
    await saveRoutine(database, validRoutineInput());
    await saveRoutine(database, { ...validRoutineInput(), id: "routine-2", name: "Other" });
    const controller = makeController();
    await controller.start();
    const deletedId = controller.store.getState().routine.id;
    controller.edit((routine) => renameRoutine(routine, "Pending edit"));
    await controller.deleteCurrentRoutine();
    const ids = (await listRoutines(database)).routines.map((routine) => routine.id);
    expect(ids).not.toContain(deletedId);
    expect(ids).toHaveLength(1);
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

  it("records one drag as one undo step", async () => {
    const controller = makeController();
    await controller.start();
    controller.edit((routine) => addDancer(routine, { id: "d-1", name: "Ana", color: "#e6194b" }));
    const before = controller.store.getState().routine.formations[0]!.positions["d-1"];
    expect(controller.beginDrag("d-1")).toBe(true);
    controller.dragTo({ x: 0.1, y: 0.1 });
    controller.dragTo({ x: 0.2, y: 0.2 });
    controller.endDrag();
    expect(controller.store.getState().routine.formations[0]!.positions["d-1"]).toEqual({ x: 0.2, y: 0.2 });
    controller.undo();
    expect(controller.store.getState().routine.formations[0]!.positions["d-1"]).toEqual(before);
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

  it("keeps the current song info across undo", async () => {
    const controller = makeController();
    await controller.start();
    controller.edit((routine) => renameRoutine(routine, "Edited"));
    // Song info arrives as metadata (as loadSongFile does), not as an undoable edit.
    const withSong = setSongInfo(controller.store.getState().routine, { fileName: "mix.mp3", durationSeconds: 100 });
    controller.store.setState({ routine: withSong });
    controller.undo();
    expect(controller.store.getState().routine.name).toBe("Untitled routine");
    expect(controller.store.getState().routine.song?.fileName).toBe("mix.mp3");
  });
});

describe("Controller.seek", () => {
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
    expect(controller.store.getState().routine.name).toBe("Untitled routine");
    expect(controller.store.getState().notice?.text).toContain("view-only");
  });
});
