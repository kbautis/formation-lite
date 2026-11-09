import { describe, expect, it } from "vitest";
import { COLOR_PALETTE, createDancer, createRoutine, nextColor } from "../../src/model/factory";
import { parseRoutine } from "../../src/model/validate";
import { EditError } from "../../src/model/errors";

const NOW = new Date("2026-11-07T18:00:00.000Z");

describe("createRoutine", () => {
  it("creates a valid routine with an open stage, no song, no tempo, and one opening formation", () => {
    const routine = createRoutine({ name: "Spring Show", now: NOW, id: "r-1", firstFormationId: "f-1" });
    expect(parseRoutine(routine)).toEqual(routine);
    expect(routine.stage.size).toBeNull();
    expect(routine.song).toBeNull();
    expect(routine.tempo).toBeNull();
    expect(routine.dancers).toEqual([]);
    expect(routine.formations).toHaveLength(1);
    expect(routine.formations[0]?.startSeconds).toBe(0);
    expect(routine.formations[0]?.stagger).toBeNull();
    expect(routine.version).toBe(2);
    expect(routine.createdAt).toBe("2026-11-07T18:00:00.000Z");
    expect(routine.updatedAt).toBe(routine.createdAt);
  });

  it("rejects a blank name", () => {
    expect(() => createRoutine({ name: " ", now: NOW, id: "r-1", firstFormationId: "f-1" })).toThrow();
  });
});

describe("nextColor", () => {
  it("has 20 distinct #rrggbb colors", () => {
    expect(new Set(COLOR_PALETTE).size).toBe(20);
    for (const color of COLOR_PALETTE) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns the first palette color not yet used", () => {
    const dancers = [{ id: "a", name: "A", color: COLOR_PALETTE[0]! }];
    expect(nextColor(dancers)).toBe(COLOR_PALETTE[1]);
  });

  it("cycles through the palette once every color is used", () => {
    const dancers = COLOR_PALETTE.map((color, i) => ({ id: `d${i}`, name: `D${i}`, color }));
    expect(nextColor(dancers)).toBe(COLOR_PALETTE[0]);
  });
});

describe("createDancer", () => {
  it("creates a dancer with a trimmed name and the next free color", () => {
    const dancer = createDancer({ id: "d-1", name: "  Ana ", existing: [] });
    expect(dancer).toEqual({ id: "d-1", name: "Ana", color: COLOR_PALETTE[0] });
  });

  it("rejects a blank name", () => {
    expect(() => createDancer({ id: "d-1", name: "  ", existing: [] })).toThrow(EditError);
  });

  it("rejects an id that already exists", () => {
    const existing = [{ id: "d-1", name: "Ana", color: COLOR_PALETTE[0]! }];
    expect(() => createDancer({ id: "d-1", name: "Ben", existing })).toThrow(EditError);
  });
});
