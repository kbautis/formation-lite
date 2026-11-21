import { describe, expect, it } from "vitest";
import {
  OPEN_STAGE_ASPECT,
  POSITION_DECIMALS,
  clampToWings,
  roundPosition,
  gridLines,
  gridStep,
  stageAspect,
  stageToSvg,
  svgToStage,
  toViewCoords,
} from "../../src/model/stage";

const openStage = { size: null };
const fortyByThirty = { size: { width: 40, depth: 30, unit: "ft" as const } };

describe("stageAspect", () => {
  it("is 4:3 for an open stage", () => {
    expect(stageAspect(openStage)).toBe(OPEN_STAGE_ASPECT);
    expect(OPEN_STAGE_ASPECT).toBeCloseTo(4 / 3);
  });
  it("is width:depth for a sized stage", () => {
    expect(stageAspect({ size: { width: 12, depth: 8, unit: "m" } })).toBe(1.5);
  });
});

describe("gridStep", () => {
  it("picks the smallest step that keeps at most 20 cells across", () => {
    expect(gridStep({ width: 10, depth: 8, unit: "m" })).toBe(1);
    expect(gridStep({ width: 40, depth: 30, unit: "ft" })).toBe(2);
    expect(gridStep({ width: 100, depth: 60, unit: "ft" })).toBe(5);
    expect(gridStep({ width: 500, depth: 500, unit: "ft" })).toBe(25);
  });
  it("considers the deeper side when the stage is deeper than wide", () => {
    expect(gridStep({ width: 10, depth: 40, unit: "ft" })).toBe(2);
  });
});

describe("gridLines", () => {
  it("divides an open stage into 8 columns and 6 rows with center-out numbers", () => {
    const grid = gridLines(openStage);
    expect(grid.verticals.map((line) => line.position)).toEqual([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]);
    expect(grid.verticals.map((line) => line.label)).toEqual(["4", "3", "2", "1", "0", "1", "2", "3", "4"]);
    expect(grid.verticals.filter((line) => line.isCenter).map((line) => line.position)).toEqual([0.5]);
    expect(grid.horizontals).toHaveLength(7);
  });
  it("labels a sized stage in real units from the center line", () => {
    const grid = gridLines(fortyByThirty);
    expect(grid.verticals[0]).toEqual({ position: 0, label: "20", isCenter: false });
    expect(grid.verticals.find((line) => line.isCenter)).toEqual({ position: 0.5, label: "0", isCenter: true });
    expect(grid.verticals).toHaveLength(21);
    expect(grid.horizontals.map((line) => line.label).slice(0, 3)).toEqual(["0", "2", "4"]);
  });
  it("keeps lines inside the stage when the width is not a multiple of the step", () => {
    const grid = gridLines({ size: { width: 9, depth: 5, unit: "m" } });
    for (const line of grid.verticals) {
      expect(line.position).toBeGreaterThanOrEqual(0);
      expect(line.position).toBeLessThanOrEqual(1);
    }
    expect(grid.verticals.map((line) => line.label)).toEqual(["4", "3", "2", "1", "0", "1", "2", "3", "4"]);
  });
});

describe("toViewCoords", () => {
  it("leaves positions alone in the audience view", () => {
    expect(toViewCoords({ x: 0.2, y: 0.1 }, "audience")).toEqual({ x: 0.2, y: 0.1 });
  });
  it("turns the stage around in the dancer view", () => {
    expect(toViewCoords({ x: 0.2, y: 0.1 }, "dancer")).toEqual({ x: 0.8, y: 0.9 });
  });
  it("is its own inverse, so pointer input maps back the same way", () => {
    const original = { x: 0.3, y: 0.7 };
    const back = toViewCoords(toViewCoords(original, "dancer"), "dancer");
    expect(back.x).toBeCloseTo(original.x);
    expect(back.y).toBeCloseTo(original.y);
  });
});

describe("stageToSvg / svgToStage", () => {
  it("puts downstage at the bottom and scales width by the aspect", () => {
    expect(stageToSvg({ x: 0, y: 0 }, 1.5)).toEqual({ x: 0, y: 100 });
    expect(stageToSvg({ x: 1, y: 1 }, 1.5)).toEqual({ x: 150, y: 0 });
  });
  it("round-trips", () => {
    const back = svgToStage(stageToSvg({ x: 0.3, y: 0.6 }, 4 / 3), 4 / 3);
    expect(back.x).toBeCloseTo(0.3);
    expect(back.y).toBeCloseTo(0.6);
  });
});

describe("clampToWings", () => {
  it("keeps positions within the stage plus wings", () => {
    expect(clampToWings({ x: -0.5, y: 2 })).toEqual({ x: -0.1, y: 1.1 });
    expect(clampToWings({ x: 0.4, y: 0.6 })).toEqual({ x: 0.4, y: 0.6 });
  });
});

describe("roundPosition", () => {
  it("rounds x and y to POSITION_DECIMALS places", () => {
    expect(POSITION_DECIMALS).toBe(4);
    expect(roundPosition({ x: 0.123456789, y: 1 / 3 })).toEqual({ x: 0.1235, y: 0.3333 });
  });
  it("leaves already-round values unchanged", () => {
    expect(roundPosition({ x: 0.25, y: -0.1 })).toEqual({ x: 0.25, y: -0.1 });
  });
  it("never produces negative zero", () => {
    expect(Object.is(roundPosition({ x: -0.00001, y: 0 }).x, 0)).toBe(true);
  });
  it("serializes to at most four decimals", () => {
    const rounded = roundPosition({ x: 0.1 + 0.2, y: 2 / 3 });
    expect(JSON.stringify(rounded)).toBe('{"x":0.3,"y":0.6667}');
  });
});
