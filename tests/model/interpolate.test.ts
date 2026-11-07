import { describe, expect, it } from "vitest";
import { activeFormationAt, positionsAt, smoothstep } from "../../src/model/interpolate";
import type { Routine } from "../../src/model/types";
import { validRoutineInput } from "../fixtures/routines";

// Fixture: f-1 holds 0–2 s (d-1 at 0.25,0.5), transition 2–4 s, f-2 holds 4–6 s (d-1 at 0,0).
const routine = validRoutineInput();

function withFormations(formations: Routine["formations"]): Routine {
  return { ...routine, formations };
}

describe("smoothstep", () => {
  it("eases from 0 to 1 through 0.5 at the midpoint", () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.25)).toBeLessThan(0.25);
  });
  it("rejects progress outside 0–1", () => {
    expect(() => smoothstep(-0.1)).toThrow();
    expect(() => smoothstep(1.1)).toThrow();
  });
});

describe("activeFormationAt", () => {
  it("returns the formation whose hold contains the time", () => {
    expect(activeFormationAt(routine, 1)?.id).toBe("f-1");
    expect(activeFormationAt(routine, 5)?.id).toBe("f-2");
  });
  it("includes both ends of the hold", () => {
    expect(activeFormationAt(routine, 0)?.id).toBe("f-1");
    expect(activeFormationAt(routine, 2)?.id).toBe("f-1");
    expect(activeFormationAt(routine, 6)?.id).toBe("f-2");
  });
  it("returns null during a transition and after the last hold", () => {
    expect(activeFormationAt(routine, 3)).toBeNull();
    expect(activeFormationAt(routine, 7)).toBeNull();
  });
  it("prefers the later formation when one hold ends exactly where the next starts", () => {
    const touching = withFormations([
      { ...routine.formations[0]!, holdSeconds: 4 },
      routine.formations[1]!,
    ]);
    expect(activeFormationAt(touching, 4)?.id).toBe("f-2");
  });
  it("rejects a non-finite time", () => {
    expect(() => activeFormationAt(routine, Number.NaN)).toThrow();
  });
});

describe("positionsAt", () => {
  it("holds dancers exactly on their marks during a formation", () => {
    expect(positionsAt(routine, 1)["d-1"]).toEqual({ x: 0.25, y: 0.5 });
    expect(positionsAt(routine, 4.5)["d-2"]).toEqual({ x: 1, y: 1 });
  });
  it("moves dancers halfway at the middle of a transition", () => {
    expect(positionsAt(routine, 3)["d-1"]).toEqual({ x: 0.125, y: 0.25 });
  });
  it("eases rather than moving linearly", () => {
    const quarter = positionsAt(routine, 2.5)["d-2"]!;
    // linear would be x = 0.75 + 0.25 * 0.25 = 0.8125
    expect(quarter.x).toBeGreaterThan(0.75);
    expect(quarter.x).toBeLessThan(0.8125);
  });
  it("arrives exactly at the next formation's start", () => {
    expect(positionsAt(routine, 4)["d-1"]).toEqual({ x: 0, y: 0 });
  });
  it("shows the first formation before it starts", () => {
    const late = withFormations([{ ...routine.formations[0]!, startSeconds: 1, holdSeconds: 1 }, routine.formations[1]!]);
    expect(positionsAt(late, 0)["d-1"]).toEqual({ x: 0.25, y: 0.5 });
  });
  it("shows the last formation after it ends", () => {
    expect(positionsAt(routine, 99)["d-1"]).toEqual({ x: 0, y: 0 });
  });
  it("handles a zero-length transition without dividing by zero", () => {
    const touching = withFormations([{ ...routine.formations[0]!, holdSeconds: 4 }, routine.formations[1]!]);
    expect(positionsAt(touching, 4)["d-1"]).toEqual({ x: 0, y: 0 });
    expect(positionsAt(touching, 3.999)["d-1"]).toEqual({ x: 0.25, y: 0.5 });
  });
  it("returns one position per dancer", () => {
    expect(Object.keys(positionsAt(routine, 3)).sort()).toEqual(["d-1", "d-2"]);
  });
});
