import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Controller, type ReplaceDetails, type ShareNavigator } from "../../src/app/controller";
import { decodeShareLink, encodeShareLink, readShareFragment } from "../../src/io/shareLink";
import type { Routine } from "../../src/model/types";
import { openDatabase } from "../../src/storage/database";
import { listRoutines, saveRoutine } from "../../src/storage/routines";
import { addDancer, removeDancer, renameRoutine } from "../../src/model/edits";
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

/** A navigator whose share sheet and clipboard the test scripts. */
class FakeNavigator implements ShareNavigator {
  shared: ShareData[] = [];
  copied: string[] = [];
  shareSheet: "accept" | "cancel" | "fail" | "absent" = "absent";
  clipboardWorks = true;
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
  readonly clipboard = {
    writeText: async (text: string) => {
      if (!this.clipboardWorks) throw new DOMException("Write permission denied.", "NotAllowedError");
      this.copied.push(text);
    },
  };
  useShareSheet(mode: "accept" | "cancel" | "fail"): void {
    this.shareSheet = mode;
    this.canShare = () => true;
    this.share = async (data) => {
      if (this.shareSheet === "cancel") throw new DOMException("Share canceled", "AbortError");
      if (this.shareSheet === "fail") throw new DOMException("Not allowed", "NotAllowedError");
      this.shared.push(data);
    };
  }
}

let shareNavigator: FakeNavigator;
const APP_URL = "https://example.github.io/formation-lite/";
const NOW = "2026-11-07T12:00:00.000Z";

function makeController(canEdit = true): Controller {
  return new Controller({
    database,
    songs,
    navigator: shareNavigator,
    appUrl: () => APP_URL,
    newId: () => `id-${++idCounter}`,
    now: () => new Date(NOW),
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
  shareNavigator = new FakeNavigator();
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

  it("keeps the pending autosave when the delete fails, so the last edit is still saved", async () => {
    await saveRoutine(database, validRoutineInput());
    const controller = makeController();
    await controller.start();
    controller.edit((routine) => renameRoutine(routine, "Edited just before delete"));
    // Only the delete (a transaction over both stores) fails; ordinary saves still work.
    const transaction = database.transaction.bind(database);
    database.transaction = ((names: string | string[], mode?: IDBTransactionMode) => {
      if (Array.isArray(names)) throw new DOMException("blocked", "InvalidStateError");
      return transaction(names, mode);
    }) as IDBDatabase["transaction"];
    await controller.deleteCurrentRoutine();
    await controller.flushPendingSave();
    expect(controller.store.getState().saveStatus).toBe("saved");
    expect((await listRoutines(database)).routines[0]?.name).toBe("Edited just before delete");
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

  it("records an edit made mid-drag as its own undo step and keeps the drag going", async () => {
    const controller = makeController();
    await controller.start();
    controller.edit((routine) => addDancer(routine, { id: "d-1", name: "Ana", color: "#e6194b" }));
    const start = controller.routine.formations[0]!.positions["d-1"];
    controller.beginDrag("d-1");
    controller.dragTo({ x: 0.3, y: 0.3 });
    expect(controller.edit((routine) => renameRoutine(routine, "Renamed"))).toBe(true);
    controller.dragTo({ x: 0.4, y: 0.4 });
    controller.endDrag();
    const position = () => controller.routine.formations[0]!.positions["d-1"];
    expect(controller.routine.name).toBe("Renamed");
    expect(position()).toEqual({ x: 0.4, y: 0.4 });
    controller.undo();
    expect([controller.routine.name, position()]).toEqual(["Renamed", { x: 0.3, y: 0.3 }]);
    controller.undo();
    expect([controller.routine.name, position()]).toEqual(["Untitled routine", { x: 0.3, y: 0.3 }]);
    controller.undo();
    expect([controller.routine.name, position()]).toEqual(["Untitled routine", start]);
  });

  it("ends the drag when an edit mid-drag removes what is being dragged", async () => {
    const controller = makeController();
    await controller.start();
    controller.edit((routine) => addDancer(routine, { id: "d-1", name: "Ana", color: "#e6194b" }));
    controller.beginDrag("d-1");
    controller.edit((routine) => removeDancer(routine, "d-1"));
    expect(() => controller.dragTo({ x: 0.5, y: 0.5 })).not.toThrow();
    controller.endDrag();
    expect(controller.routine.dancers).toEqual([]);
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

/** Records every replace prompt and answers it. */
function answering(answer: boolean): { prompts: ReplaceDetails[]; confirm: (details: ReplaceDetails) => boolean } {
  const prompts: ReplaceDetails[] = [];
  return { prompts, confirm: (details) => (prompts.push(details), answer) };
}

async function storedRoutine(id: string): Promise<Routine | undefined> {
  return (await listRoutines(database)).routines.find((routine) => routine.id === id);
}

describe("Controller.importRoutine", () => {
  it("opens and saves a new routine without asking, keeping its edit time", async () => {
    const controller = makeController();
    await controller.start();
    const { prompts, confirm } = answering(true);
    expect(await controller.importRoutine(validRoutineInput(), confirm)).toBe(true);
    expect(prompts).toHaveLength(0);
    expect(controller.routine.id).toBe("routine-1");
    expect((await storedRoutine("routine-1"))?.updatedAt).toBe(validRoutineInput().updatedAt);
  });

  it("asks before replacing, with the incoming edit time, and says when it is newer", async () => {
    await saveRoutine(database, validRoutineInput());
    const controller = makeController();
    await controller.start();
    const incoming = { ...validRoutineInput(), name: "Newer", updatedAt: "2026-11-09T10:00:00.000Z" };
    const { prompts, confirm } = answering(true);
    expect(await controller.importRoutine(incoming, confirm)).toBe(true);
    expect(prompts).toEqual([{ existingName: "Regionals 2027", incomingUpdatedAt: "2026-11-09T10:00:00.000Z", isOlderThanStored: false }]);
    expect((await storedRoutine("routine-1"))?.name).toBe("Newer");
  });

  it("flags an incoming copy older than the one on this device", async () => {
    await saveRoutine(database, validRoutineInput());
    const controller = makeController();
    await controller.start();
    const { prompts, confirm } = answering(true);
    await controller.importRoutine({ ...validRoutineInput(), updatedAt: "2026-11-01T00:00:00.000Z" }, confirm);
    expect(prompts[0]?.isOlderThanStored).toBe(true);
  });

  it("changes nothing when the user keeps their copy", async () => {
    await saveRoutine(database, validRoutineInput());
    const controller = makeController();
    await controller.start();
    const { confirm } = answering(false);
    expect(await controller.importRoutine({ ...validRoutineInput(), name: "Theirs" }, confirm)).toBe(false);
    expect(controller.routine.name).toBe("Regionals 2027");
    expect((await storedRoutine("routine-1"))?.name).toBe("Regionals 2027");
  });
});

describe("Controller.importShareLink", () => {
  it("opens the routine in a link", async () => {
    const controller = makeController();
    await controller.start();
    const fragment = readShareFragment(new URL(await encodeShareLink(validRoutineInput(), APP_URL)).hash)!;
    expect(await controller.importShareLink(fragment, answering(true).confirm)).toBe(true);
    expect(controller.routine).toEqual(validRoutineInput());
    expect(controller.store.getState().notice?.text).toContain("Regionals 2027");
  });

  it("rejects a tampered link with a clear message and changes nothing", async () => {
    await saveRoutine(database, validRoutineInput());
    const controller = makeController();
    await controller.start();
    const before = await listRoutines(database);
    const fragment = readShareFragment(new URL(await encodeShareLink({ ...validRoutineInput(), name: "Theirs" }, APP_URL)).hash)!;
    const { prompts, confirm } = answering(true);
    expect(await controller.importShareLink(`${fragment.slice(0, 40)}${fragment.slice(41)}`, confirm)).toBe(false);
    expect(prompts).toHaveLength(0);
    expect(controller.store.getState().notice).toMatchObject({ kind: "error" });
    expect(controller.store.getState().notice?.text).toMatch(/^Couldn't open this link\./);
    expect(controller.routine.name).toBe("Regionals 2027");
    expect(await listRoutines(database)).toEqual(before);
  });
});

describe("Controller.shareCurrentRoutine", () => {
  async function sharedRoutine(url: string): Promise<Routine> {
    return decodeShareLink(readShareFragment(new URL(url).hash)!);
  }

  it("uses the share sheet when the browser accepts the link", async () => {
    await saveRoutine(database, validRoutineInput());
    shareNavigator.useShareSheet("accept");
    const controller = makeController();
    await controller.start();
    expect(await controller.shareCurrentRoutine()).toBe("shared");
    const [data] = shareNavigator.shared;
    expect(data?.title).toBe("Regionals 2027");
    const routine = await sharedRoutine(data!.url!);
    expect(routine).toEqual({ ...validRoutineInput(), updatedAt: NOW });
    expect(shareNavigator.copied).toHaveLength(0);
  });

  it("stamps the shared time on the copy kept on this device", async () => {
    await saveRoutine(database, validRoutineInput());
    shareNavigator.useShareSheet("accept");
    const controller = makeController();
    await controller.start();
    await controller.shareCurrentRoutine();
    expect((await storedRoutine("routine-1"))?.updatedAt).toBe(NOW);
    expect(controller.routine.updatedAt).toBe(NOW);
  });

  it("does nothing more when the share sheet is cancelled", async () => {
    shareNavigator.useShareSheet("cancel");
    const controller = makeController();
    await controller.start();
    expect(await controller.shareCurrentRoutine()).toBe("cancelled");
    expect(shareNavigator.copied).toHaveLength(0);
    expect(controller.store.getState().manualShareLink).toBeNull();
  });

  it("copies the link when there is no share sheet", async () => {
    const controller = makeController();
    await controller.start();
    expect(await controller.shareCurrentRoutine()).toBe("copied");
    expect(shareNavigator.copied).toHaveLength(1);
    expect((await sharedRoutine(shareNavigator.copied[0]!)).id).toBe(controller.routine.id);
    expect(controller.store.getState().notice?.text).toMatch(/copied/i);
  });

  it("copies the link when the share sheet fails for another reason", async () => {
    shareNavigator.useShareSheet("fail");
    const controller = makeController();
    await controller.start();
    expect(await controller.shareCurrentRoutine()).toBe("copied");
  });

  it("shows the link to copy by hand when the clipboard is refused", async () => {
    shareNavigator.clipboardWorks = false;
    const controller = makeController();
    await controller.start();
    expect(await controller.shareCurrentRoutine()).toBe("manual");
    const link = controller.store.getState().manualShareLink;
    expect(link?.startsWith(`${APP_URL}#share=1.`)).toBe(true);
    controller.dismissManualShareLink();
    expect(controller.store.getState().manualShareLink).toBeNull();
  });

  it("refuses a routine too large for a link and points to Export", async () => {
    const dancers = Array.from({ length: 40 }, (_, index) => ({ id: `d-${index}`, name: `Dancer ${index}`, color: "#e4572e" }));
    let seed = 7;
    const random = () => (seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647;
    const formations = Array.from({ length: 500 }, (_, index) => ({
      id: `f-${index}`,
      name: "",
      startSeconds: index * 4,
      holdSeconds: 2,
      stagger: null,
      positions: Object.fromEntries(dancers.map((dancer) => [dancer.id, { x: random(), y: random() }])),
    }));
    await saveRoutine(database, { ...validRoutineInput(), dancers, formations });
    shareNavigator.useShareSheet("accept");
    const controller = makeController();
    await controller.start();
    expect(await controller.shareCurrentRoutine()).toBe("too-large");
    expect(controller.store.getState().notice?.text).toMatch(/Export/);
    expect(shareNavigator.shared).toHaveLength(0);
    expect(shareNavigator.copied).toHaveLength(0);
  });
});
