import { describe, expect, it } from "vitest";
import { SONG_DURATION_TOLERANCE_SECONDS, parseRoutineFile, routineFileName, serializeRoutine, songDurationsMatch } from "../../src/io/serialize";
import { RoutineFormatError } from "../../src/model/errors";
import { validRoutineInput } from "../fixtures/routines";

describe("serializeRoutine / parseRoutineFile", () => {
  it("round-trips a routine exactly", () => {
    const routine = validRoutineInput();
    expect(parseRoutineFile(serializeRoutine(routine))).toEqual(routine);
  });

  it("writes readable, versioned JSON", () => {
    const text = serializeRoutine(validRoutineInput());
    expect(text).toContain('\n  "format": "formation-lite/routine"');
    expect(text).toContain('"version": 1');
    expect(text.endsWith("\n")).toBe(true);
  });

  it("refuses to serialize an invalid routine", () => {
    expect(() => serializeRoutine({ ...validRoutineInput(), name: "" })).toThrow(RoutineFormatError);
  });

  it("rejects text that is not JSON with a file-level error", () => {
    try {
      parseRoutineFile("not json {");
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(RoutineFormatError);
      expect((error as RoutineFormatError).path).toBe("file");
    }
  });

  it("rejects JSON that is not a routine", () => {
    expect(() => parseRoutineFile('{"hello": 1}')).toThrow(RoutineFormatError);
  });
});

describe("routineFileName", () => {
  it("slugs the routine name", () => {
    expect(routineFileName({ ...validRoutineInput(), name: "Regionals 2027: Hip-Hop!" })).toBe("regionals-2027-hip-hop.formation.json");
  });
  it("falls back when the name has no letters or digits", () => {
    expect(routineFileName({ ...validRoutineInput(), name: "!!!" })).toBe("routine.formation.json");
  });
  it("keeps file names short", () => {
    const name = routineFileName({ ...validRoutineInput(), name: "a".repeat(80) });
    expect(name).toBe(`${"a".repeat(60)}.formation.json`);
  });
});

describe("songDurationsMatch", () => {
  it(`allows up to ${SONG_DURATION_TOLERANCE_SECONDS} s of difference between song files`, () => {
    expect(songDurationsMatch(180, 180.9)).toBe(true);
    expect(songDurationsMatch(180, 181.5)).toBe(false);
  });
});
