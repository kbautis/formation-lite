import { describe, expect, it } from "vitest";
import { CLOSE_DISTANCE, closeEncounters, encountersFor } from "../../src/model/collisions";
import { moveDancer } from "../../src/model/edits";
import type { Formation, Routine } from "../../src/model/types";
import { validRoutineInput } from "../fixtures/routines";

// Two dancers, f-1 holds 0–2 s, transition 2–4 s, f-2 holds 4–6 s, on a 40 × 30 ft stage.
function routineWith(fromPositions: Formation["positions"], toPositions: Formation["positions"], size = validRoutineInput().stage.size): Routine {
  const routine = validRoutineInput();
  return {
    ...routine,
    stage: { size },
    formations: [
      { ...routine.formations[0]!, positions: fromPositions },
      { ...routine.formations[1]!, positions: toPositions },
    ],
  };
}

const swap = routineWith(
  { "d-1": { x: 0.25, y: 0.5 }, "d-2": { x: 0.75, y: 0.5 } },
  { "d-1": { x: 0.75, y: 0.5 }, "d-2": { x: 0.25, y: 0.5 } },
);

describe("closeEncounters", () => {
  it("flags two dancers who swap places through each other, at the moment they meet", () => {
    const [encounter, ...rest] = closeEncounters(swap, "f-2");
    expect(rest).toEqual([]);
    expect(encounter?.dancerIds).toEqual(["d-1", "d-2"]);
    expect(encounter?.atSeconds).toBeCloseTo(3, 1);
    expect(encounter?.distance).toBeCloseTo(0, 1);
    expect(encounter?.unit).toBe("ft");
  });

  it("does not flag dancers moving side by side", () => {
    const parallel = routineWith(
      { "d-1": { x: 0.25, y: 0.3 }, "d-2": { x: 0.75, y: 0.3 } },
      { "d-1": { x: 0.25, y: 0.7 }, "d-2": { x: 0.75, y: 0.7 } },
    );
    expect(closeEncounters(parallel, "f-2")).toEqual([]);
  });

  it("does not flag partners who start or end close together", () => {
    const partners = routineWith(
      { "d-1": { x: 0.5, y: 0.5 }, "d-2": { x: 0.51, y: 0.5 } },
      { "d-1": { x: 0.2, y: 0.5 }, "d-2": { x: 0.8, y: 0.5 } },
    );
    expect(closeEncounters(partners, "f-2")).toEqual([]);
  });

  it(`measures in real units on a sized stage (${CLOSE_DISTANCE.ft} ft)`, () => {
    // Paths cross the stage in opposite directions, 1 ft apart (1/30 of the 30 ft depth), then 3 ft apart.
    const oneFoot = routineWith(
      { "d-1": { x: 0.1, y: 0.5 }, "d-2": { x: 0.9, y: 0.5 + 1 / 30 } },
      { "d-1": { x: 0.9, y: 0.5 }, "d-2": { x: 0.1, y: 0.5 + 1 / 30 } },
    );
    const threeFeet = routineWith(
      { "d-1": { x: 0.1, y: 0.5 }, "d-2": { x: 0.9, y: 0.5 + 3 / 30 } },
      { "d-1": { x: 0.9, y: 0.5 }, "d-2": { x: 0.1, y: 0.5 + 3 / 30 } },
    );
    expect(closeEncounters(oneFoot, "f-2")).toHaveLength(1);
    expect(closeEncounters(oneFoot, "f-2")[0]?.distance).toBeCloseTo(1, 1);
    expect(closeEncounters(threeFeet, "f-2")).toEqual([]);
  });

  it("uses a fraction of the depth on an open stage", () => {
    const open = { ...swap, stage: { size: null } };
    const [encounter] = closeEncounters(open, "f-2");
    expect(encounter?.unit).toBeNull();
  });

  it("has nothing to check for the first formation or an instant change", () => {
    expect(closeEncounters(swap, "f-1")).toEqual([]);
    const instant = { ...swap, formations: [{ ...swap.formations[0]!, holdSeconds: 4 }, swap.formations[1]!] };
    expect(closeEncounters(instant, "f-2")).toEqual([]);
  });
});

describe("encountersFor", () => {
  it("collects encounters for every transition, keyed by the formation moved into", () => {
    const map = encountersFor(swap);
    expect(map.get("f-2")).toHaveLength(1);
    expect(map.has("f-1")).toBe(false);
  });

  it("computes once per routine: the same routine gives the same result object", () => {
    expect(encountersFor(swap)).toBe(encountersFor(swap));
  });

  it("only recomputes transitions next to an edited formation", () => {
    // Four formations; moving a dancer in f-2 changes transitions into f-2 and f-3, not f-4.
    const routine = validRoutineInput();
    const later = (id: string, start: number) => ({ ...routine.formations[1]!, id, startSeconds: start, positions: swap.formations[id === "f-3" ? 0 : 1]!.positions });
    const four: Routine = { ...swap, formations: [...swap.formations, later("f-3", 8), later("f-4", 12)] };
    const before = encountersFor(four);
    const edited = moveDancer(four, { formationId: "f-2", dancerId: "d-1", position: { x: 0.7, y: 0.5 } });
    const after = encountersFor(edited);
    expect(after.get("f-4")).toBe(before.get("f-4"));
    expect(after.get("f-3")).not.toBe(before.get("f-3"));
  });
});
