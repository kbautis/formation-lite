import { describe, expect, it } from "vitest";
import { formatDuration, formatEditTime, initials, replacePromptText } from "../../src/ui/format";

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

describe("formatEditTime", () => {
  it("shows the month, day and time in the given zone", () => {
    expect(formatEditTime("2026-11-12T23:40:00.000Z", "en-US", "UTC")).toBe("Nov 12, 11:40 PM");
    expect(formatEditTime("2026-11-12T23:40:00.000Z", "en-US", "America/Los_Angeles")).toBe("Nov 12, 3:40 PM");
  });
});

describe("replacePromptText", () => {
  const details = { existingName: "Regionals", incomingUpdatedAt: "2026-11-12T23:40:00.000Z", isOlderThanStored: false };
  const formatTime = () => "Nov 12, 3:40 PM";

  it("names the routine and says when the link's version was shared", () => {
    const text = replacePromptText("link", details, formatTime);
    expect(text).toContain("“Regionals”");
    expect(text).toContain("version in this link");
    expect(text).toContain("Shared Nov 12, 3:40 PM");
    expect(text).not.toContain("older");
  });

  it("warns when the link is older than the copy on this device", () => {
    expect(replacePromptText("link", { ...details, isOlderThanStored: true }, formatTime)).toContain("This link is older than your copy.");
  });

  it("talks about a file when the routine came from a file", () => {
    const text = replacePromptText("file", { ...details, isOlderThanStored: true }, formatTime);
    expect(text).toContain("version in this file");
    expect(text).toContain("Last edited Nov 12, 3:40 PM");
    expect(text).toContain("This file is older than your copy.");
  });
});
