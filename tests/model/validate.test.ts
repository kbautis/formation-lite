import { describe, expect, it } from "vitest";
import { parseRoutine } from "../../src/model/validate";
import { RoutineFormatError } from "../../src/model/errors";
import { validRoutineInput } from "../fixtures/routines";

// Applies a mutation to a fresh valid routine and returns it as untyped input.
function mutated(mutate: (routine: any) => void): unknown {
  const routine: any = validRoutineInput();
  mutate(routine);
  return routine;
}

function expectRejected(input: unknown, path: string): void {
  try {
    parseRoutine(input);
  } catch (error) {
    expect(error).toBeInstanceOf(RoutineFormatError);
    expect((error as RoutineFormatError).path).toBe(path);
    return;
  }
  throw new Error(`expected parseRoutine to reject at ${path}`);
}

describe("parseRoutine", () => {
  it("accepts a valid routine and returns an equal copy", () => {
    const input = validRoutineInput();
    const parsed = parseRoutine(input);
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
  });

  it("drops unknown fields instead of carrying them along", () => {
    const parsed = parseRoutine(mutated((r) => (r.extra = "x")));
    expect("extra" in parsed).toBe(false);
  });

  it("trims routine, dancer, and formation names", () => {
    const parsed = parseRoutine(
      mutated((r) => {
        r.name = "  Regionals  ";
        r.dancers[0].name = " Ana ";
        r.formations[0].name = " Opening ";
      }),
    );
    expect(parsed.name).toBe("Regionals");
    expect(parsed.dancers[0]?.name).toBe("Ana");
    expect(parsed.formations[0]?.name).toBe("Opening");
  });

  it("rejects input that is not an object", () => {
    expectRejected("hello", "routine");
    expectRejected(null, "routine");
    expectRejected([], "routine");
  });

  describe("format and version", () => {
    it("rejects the wrong format marker", () => {
      expectRejected(mutated((r) => (r.format = "other-app")), "format");
    });
    it("rejects unknown versions instead of guessing", () => {
      expectRejected(mutated((r) => (r.version = 2)), "version");
    });
  });

  describe("identity and timestamps", () => {
    it("rejects an empty id", () => {
      expectRejected(mutated((r) => (r.id = "")), "id");
    });
    it("rejects a name that is blank after trimming", () => {
      expectRejected(mutated((r) => (r.name = "   ")), "name");
    });
    it("rejects a name over 80 characters", () => {
      expectRejected(mutated((r) => (r.name = "x".repeat(81))), "name");
    });
    it("accepts an 80 character name", () => {
      expect(parseRoutine(mutated((r) => (r.name = "x".repeat(80)))).name).toHaveLength(80);
    });
    it("rejects a timestamp that is not ISO-8601 UTC", () => {
      expectRejected(mutated((r) => (r.createdAt = "2026-11-07 18:00")), "createdAt");
      expectRejected(mutated((r) => (r.updatedAt = "2026-11-07T18:00:00+02:00")), "updatedAt");
      expectRejected(mutated((r) => (r.updatedAt = "2026-13-45T18:00:00Z")), "updatedAt");
    });
  });

  describe("stage", () => {
    it("accepts an open stage", () => {
      expect(parseRoutine(mutated((r) => (r.stage = { size: null }))).stage.size).toBeNull();
    });
    it("accepts metres", () => {
      const parsed = parseRoutine(mutated((r) => (r.stage.size.unit = "m")));
      expect(parsed.stage.size?.unit).toBe("m");
    });
    it("rejects a missing stage", () => {
      expectRejected(mutated((r) => delete r.stage), "stage");
    });
    it("rejects non-positive or oversized dimensions", () => {
      expectRejected(mutated((r) => (r.stage.size.width = 0)), "stage.size.width");
      expectRejected(mutated((r) => (r.stage.size.depth = 501)), "stage.size.depth");
    });
    it("accepts the 500 unit maximum", () => {
      expect(parseRoutine(mutated((r) => (r.stage.size.width = 500))).stage.size?.width).toBe(500);
    });
    it("rejects an unknown unit", () => {
      expectRejected(mutated((r) => (r.stage.size.unit = "yd")), "stage.size.unit");
    });
  });

  describe("song", () => {
    it("accepts no song", () => {
      expect(parseRoutine(mutated((r) => (r.song = null))).song).toBeNull();
    });
    it("rejects an empty file name", () => {
      expectRejected(mutated((r) => (r.song.fileName = "")), "song.fileName");
    });
    it("rejects a non-positive duration", () => {
      expectRejected(mutated((r) => (r.song.durationSeconds = 0)), "song.durationSeconds");
    });
  });

  describe("tempo", () => {
    it("accepts no tempo", () => {
      expect(parseRoutine(mutated((r) => (r.tempo = null))).tempo).toBeNull();
    });
    it("rejects a BPM outside 40–300", () => {
      expectRejected(mutated((r) => (r.tempo.bpm = 39)), "tempo.bpm");
      expectRejected(mutated((r) => (r.tempo.bpm = 301)), "tempo.bpm");
    });
    it("accepts the BPM bounds", () => {
      expect(parseRoutine(mutated((r) => (r.tempo.bpm = 40))).tempo?.bpm).toBe(40);
      expect(parseRoutine(mutated((r) => (r.tempo.bpm = 300))).tempo?.bpm).toBe(300);
    });
    it("rejects a negative first beat", () => {
      expectRejected(mutated((r) => (r.tempo.firstBeatSeconds = -0.1)), "tempo.firstBeatSeconds");
    });
    it("rejects non-finite numbers", () => {
      expectRejected(mutated((r) => (r.tempo.bpm = Number.NaN)), "tempo.bpm");
    });
  });

  describe("dancers", () => {
    it("accepts zero dancers when formations hold no positions", () => {
      const parsed = parseRoutine(
        mutated((r) => {
          r.dancers = [];
          for (const formation of r.formations) formation.positions = {};
        }),
      );
      expect(parsed.dancers).toEqual([]);
    });
    it("rejects more than 40 dancers", () => {
      expectRejected(
        mutated((r) => {
          r.dancers = Array.from({ length: 41 }, (_, i) => ({ id: `d-${i}`, name: `D${i}`, color: "#000000" }));
        }),
        "dancers",
      );
    });
    it("rejects duplicate dancer ids", () => {
      expectRejected(mutated((r) => (r.dancers[1].id = "d-1")), "dancers[1].id");
    });
    it("rejects a blank or over-long dancer name", () => {
      expectRejected(mutated((r) => (r.dancers[0].name = " ")), "dancers[0].name");
      expectRejected(mutated((r) => (r.dancers[0].name = "x".repeat(41))), "dancers[0].name");
    });
    it("rejects a color that is not #rrggbb", () => {
      expectRejected(mutated((r) => (r.dancers[0].color = "red")), "dancers[0].color");
      expectRejected(mutated((r) => (r.dancers[0].color = "#fff")), "dancers[0].color");
    });
  });

  describe("formations", () => {
    it("rejects a routine with no formations", () => {
      expectRejected(mutated((r) => (r.formations = [])), "formations");
    });
    it("rejects duplicate formation ids", () => {
      expectRejected(mutated((r) => (r.formations[1].id = "f-1")), "formations[1].id");
    });
    it("rejects a formation name over 40 characters", () => {
      expectRejected(mutated((r) => (r.formations[0].name = "x".repeat(41))), "formations[0].name");
    });
    it("accepts an empty formation name", () => {
      expect(parseRoutine(mutated((r) => (r.formations[0].name = ""))).formations[0]?.name).toBe("");
    });
    it("rejects a negative start or hold", () => {
      expectRejected(mutated((r) => (r.formations[0].startSeconds = -1)), "formations[0].startSeconds");
      expectRejected(mutated((r) => (r.formations[0].holdSeconds = -1)), "formations[0].holdSeconds");
    });
    it("rejects formations out of time order", () => {
      expectRejected(
        mutated((r) => r.formations.reverse()),
        "formations[1].startSeconds",
      );
    });
    it("rejects a hold that overlaps the next formation", () => {
      expectRejected(mutated((r) => (r.formations[0].holdSeconds = 4.01)), "formations[0].holdSeconds");
    });
    it("accepts a hold that ends exactly where the next formation starts", () => {
      expect(parseRoutine(mutated((r) => (r.formations[0].holdSeconds = 4))).formations[0]?.holdSeconds).toBe(4);
    });
  });

  describe("positions", () => {
    it("rejects a formation missing a dancer", () => {
      expectRejected(mutated((r) => delete r.formations[0].positions["d-2"]), "formations[0].positions.d-2");
    });
    it("rejects a position for an unknown dancer", () => {
      expectRejected(
        mutated((r) => (r.formations[0].positions["ghost"] = { x: 0.5, y: 0.5 })),
        "formations[0].positions.ghost",
      );
    });
    it("rejects coordinates outside the wings", () => {
      expectRejected(mutated((r) => (r.formations[0].positions["d-1"].x = 1.11)), "formations[0].positions.d-1.x");
      expectRejected(mutated((r) => (r.formations[0].positions["d-1"].y = -0.11)), "formations[0].positions.d-1.y");
    });
    it("accepts coordinates at the edge of the wings", () => {
      const parsed = parseRoutine(mutated((r) => (r.formations[0].positions["d-1"] = { x: -0.1, y: 1.1 })));
      expect(parsed.formations[0]?.positions["d-1"]).toEqual({ x: -0.1, y: 1.1 });
    });
  });
});
