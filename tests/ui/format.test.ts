import { describe, expect, it } from "vitest";
import { formatDuration, initials } from "../../src/ui/format";

describe("initials", () => {
  it("uses the first letter of the first two words", () => {
    expect(initials("Ana Reyes")).toBe("AR");
    expect(initials("ana maria reyes")).toBe("AM");
  });
  it("uses up to two letters of a single name", () => {
    expect(initials("Ben")).toBe("BE");
    expect(initials("J")).toBe("J");
  });
  it("ignores extra whitespace", () => {
    expect(initials("  Cam   Lee ")).toBe("CL");
  });
});

describe("formatDuration", () => {
  const tempo = { bpm: 120, firstBeatSeconds: 0 };
  it("uses counts when there is a tempo", () => {
    expect(formatDuration(0.5, tempo)).toBe("1 count");
    expect(formatDuration(2, tempo)).toBe("4 counts");
    expect(formatDuration(1.25, tempo)).toBe("2.5 counts");
  });
  it("uses seconds without a tempo", () => {
    expect(formatDuration(1.5, null)).toBe("1.5 s");
    expect(formatDuration(2, null)).toBe("2 s");
  });
  it("calls a zero-length transition instant", () => {
    expect(formatDuration(0, tempo)).toBe("instant");
    expect(formatDuration(0, null)).toBe("instant");
  });
});
