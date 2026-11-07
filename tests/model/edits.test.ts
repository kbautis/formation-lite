import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOLD_BEATS,
  DEFAULT_HOLD_SECONDS,
  addDancer,
  addFormationAt,
  defaultSpot,
  editableFormationAt,
  moveDancer,
  removeDancer,
  removeFormation,
  renameFormation,
  renameRoutine,
  setSongInfo,
  setStageSize,
  setTempo,
  touchRoutine,
  updateDancer,
  updateFormationTiming,
} from "../../src/model/edits";
import { EditError } from "../../src/model/errors";
import { parseRoutine } from "../../src/model/validate";
import type { Routine } from "../../src/model/types";
import { validRoutineInput } from "../fixtures/routines";

// Fixture: 2 dancers; f-1 holds 0–2 s, f-2 holds 4–6 s; tempo 120 BPM from 0.5 s.
const base = validRoutineInput();
const untimed: Routine = { ...base, tempo: null };

function expectValid(routine: Routine): void {
  expect(parseRoutine(routine)).toEqual(routine);
}

describe("renameRoutine", () => {
  it("sets a trimmed name", () => {
    const renamed = renameRoutine(base, "  Nationals ");
    expect(renamed.name).toBe("Nationals");
    expect(base.name).toBe("Regionals 2027");
  });
  it("rejects a blank name", () => {
    expect(() => renameRoutine(base, " ")).toThrow(EditError);
  });
});

describe("touchRoutine", () => {
  it("stamps updatedAt with the given time in UTC", () => {
    expect(touchRoutine(base, new Date("2026-11-08T01:02:03.000Z")).updatedAt).toBe("2026-11-08T01:02:03.000Z");
  });
});

describe("addDancer", () => {
  const dancer = { id: "d-3", name: "Cam", color: "#4363d8" };

  it("appends the dancer and gives them a spot in every formation", () => {
    const next = addDancer(base, dancer);
    expect(next.dancers.map((d) => d.id)).toEqual(["d-1", "d-2", "d-3"]);
    for (const formation of next.formations) expect(formation.positions["d-3"]).toEqual(defaultSpot(2));
    expectValid(next);
  });
  it("rejects a duplicate id", () => {
    expect(() => addDancer(base, { ...dancer, id: "d-1" })).toThrow(EditError);
  });
  it("rejects a 41st dancer", () => {
    let routine: Routine = { ...base, dancers: [], formations: base.formations.map((f) => ({ ...f, positions: {} })) };
    for (let i = 0; i < 40; i++) routine = addDancer(routine, { id: `x-${i}`, name: `X${i}`, color: "#000000" });
    expect(() => addDancer(routine, dancer)).toThrow(EditError);
  });
});

describe("defaultSpot", () => {
  it("gives the first 20 dancers distinct on-stage spots", () => {
    const spots = Array.from({ length: 20 }, (_, i) => defaultSpot(i));
    expect(new Set(spots.map((s) => `${s.x},${s.y}`)).size).toBe(20);
    for (const spot of spots) {
      expect(spot.x).toBeGreaterThan(0);
      expect(spot.x).toBeLessThan(1);
      expect(spot.y).toBeGreaterThan(0);
      expect(spot.y).toBeLessThan(1);
    }
  });
});

describe("updateDancer", () => {
  it("changes name and color", () => {
    const next = updateDancer(base, "d-1", { name: " Ana R ", color: "#3cb44b" });
    expect(next.dancers[0]).toEqual({ id: "d-1", name: "Ana R", color: "#3cb44b" });
  });
  it("rejects an unknown dancer", () => {
    expect(() => updateDancer(base, "ghost", { name: "X" })).toThrow(EditError);
  });
  it("rejects an invalid color", () => {
    expect(() => updateDancer(base, "d-1", { color: "blue" })).toThrow(EditError);
  });
});

describe("removeDancer", () => {
  it("removes the dancer and their spot in every formation", () => {
    const next = removeDancer(base, "d-1");
    expect(next.dancers.map((d) => d.id)).toEqual(["d-2"]);
    for (const formation of next.formations) expect("d-1" in formation.positions).toBe(false);
    expectValid(next);
  });
  it("rejects an unknown dancer", () => {
    expect(() => removeDancer(base, "ghost")).toThrow(EditError);
  });
});

describe("addFormationAt", () => {
  it("copies what is on stage at that moment", () => {
    const next = addFormationAt(untimed, { id: "f-new", seconds: 3 });
    const added = next.formations.find((f) => f.id === "f-new")!;
    expect(added.startSeconds).toBe(3);
    expect(added.positions["d-1"]).toEqual({ x: 0.125, y: 0.25 });
    expectValid(next);
  });
  it("inserts in time order with a default name", () => {
    const next = addFormationAt(untimed, { id: "f-new", seconds: 10 });
    expect(next.formations.map((f) => f.id)).toEqual(["f-1", "f-2", "f-new"]);
    expect(next.formations[2]?.name).toBe("Formation 3");
  });
  it("holds for 2 seconds without a tempo", () => {
    const next = addFormationAt(untimed, { id: "f-new", seconds: 10 });
    expect(next.formations[2]?.holdSeconds).toBe(DEFAULT_HOLD_SECONDS);
  });
  it("snaps to the nearest beat and holds 4 counts with a tempo", () => {
    const next = addFormationAt(base, { id: "f-new", seconds: 10.2 });
    const added = next.formations[2]!;
    expect(added.startSeconds).toBe(10);
    expect(added.holdSeconds).toBe(DEFAULT_HOLD_BEATS * 0.5);
  });
  it("shortens the hold so it never overlaps the next formation", () => {
    const next = addFormationAt(untimed, { id: "f-new", seconds: 3 });
    expect(next.formations[1]?.holdSeconds).toBe(1);
  });
  it("rejects a time inside an existing hold", () => {
    expect(() => addFormationAt(untimed, { id: "f-new", seconds: 1 })).toThrow(EditError);
    expect(() => addFormationAt(untimed, { id: "f-new", seconds: 4 })).toThrow(EditError);
  });
  it("rejects a duplicate id", () => {
    expect(() => addFormationAt(untimed, { id: "f-1", seconds: 10 })).toThrow(EditError);
  });
});

describe("updateFormationTiming", () => {
  it("changes start and hold", () => {
    const next = updateFormationTiming(base, "f-2", { startSeconds: 3, holdSeconds: 1 });
    expect(next.formations[1]).toMatchObject({ startSeconds: 3, holdSeconds: 1 });
  });
  it("rejects a hold that would run into the next formation", () => {
    expect(() => updateFormationTiming(base, "f-1", { startSeconds: 0, holdSeconds: 5 })).toThrow(EditError);
  });
  it("rejects moving past a neighboring formation", () => {
    expect(() => updateFormationTiming(base, "f-2", { startSeconds: 0, holdSeconds: 0 })).toThrow(EditError);
  });
  it("rejects an unknown formation", () => {
    expect(() => updateFormationTiming(base, "ghost", { startSeconds: 0, holdSeconds: 0 })).toThrow(EditError);
  });
});

describe("renameFormation", () => {
  it("sets a trimmed name, allowing empty", () => {
    expect(renameFormation(base, "f-1", " Wedge ").formations[0]?.name).toBe("Wedge");
    expect(renameFormation(base, "f-1", "").formations[0]?.name).toBe("");
  });
});

describe("removeFormation", () => {
  it("removes the formation", () => {
    expect(removeFormation(base, "f-1").formations.map((f) => f.id)).toEqual(["f-2"]);
  });
  it("refuses to remove the last formation", () => {
    const single = removeFormation(base, "f-1");
    expect(() => removeFormation(single, "f-2")).toThrow(EditError);
  });
});

describe("moveDancer", () => {
  it("moves one dancer in one formation only", () => {
    const next = moveDancer(base, { formationId: "f-1", dancerId: "d-1", position: { x: 0.9, y: 0.1 } });
    expect(next.formations[0]?.positions["d-1"]).toEqual({ x: 0.9, y: 0.1 });
    expect(next.formations[1]?.positions["d-1"]).toEqual({ x: 0, y: 0 });
  });
  it("clamps to the wings", () => {
    const next = moveDancer(base, { formationId: "f-1", dancerId: "d-1", position: { x: 5, y: -5 } });
    expect(next.formations[0]?.positions["d-1"]).toEqual({ x: 1.1, y: -0.1 });
  });
  it("rejects an unknown dancer or formation", () => {
    expect(() => moveDancer(base, { formationId: "f-1", dancerId: "ghost", position: { x: 0, y: 0 } })).toThrow(EditError);
    expect(() => moveDancer(base, { formationId: "ghost", dancerId: "d-1", position: { x: 0, y: 0 } })).toThrow(EditError);
  });
});

describe("setStageSize", () => {
  it("sets a size without moving any dancer", () => {
    const next = setStageSize(base, { width: 12, depth: 10, unit: "m" });
    expect(next.stage.size).toEqual({ width: 12, depth: 10, unit: "m" });
    expect(next.formations).toEqual(base.formations);
  });
  it("returns to an open stage", () => {
    expect(setStageSize(base, null).stage.size).toBeNull();
  });
  it("rejects invalid dimensions", () => {
    expect(() => setStageSize(base, { width: 0, depth: 10, unit: "m" })).toThrow(EditError);
  });
});

describe("setTempo", () => {
  it("sets and clears the tempo without moving any formation", () => {
    const next = setTempo(base, { bpm: 100, firstBeatSeconds: 0.2 });
    expect(next.tempo).toEqual({ bpm: 100, firstBeatSeconds: 0.2 });
    expect(next.formations).toEqual(base.formations);
    expect(setTempo(base, null).tempo).toBeNull();
  });
  it("rejects an out-of-range BPM", () => {
    expect(() => setTempo(base, { bpm: 10, firstBeatSeconds: 0 })).toThrow(EditError);
  });
});

describe("setSongInfo", () => {
  it("sets and clears song metadata", () => {
    expect(setSongInfo(base, { fileName: "b.mp3", durationSeconds: 90 }).song).toEqual({ fileName: "b.mp3", durationSeconds: 90 });
    expect(setSongInfo(base, null).song).toBeNull();
  });
});

describe("editableFormationAt", () => {
  it("returns the formation being held", () => {
    expect(editableFormationAt(base, 1).id).toBe("f-1");
  });
  it("refuses mid-transition, where positions are not stored facts", () => {
    expect(() => editableFormationAt(base, 3)).toThrow(EditError);
  });
});
