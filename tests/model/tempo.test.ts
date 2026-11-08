import { describe, expect, it } from "vitest";
import { beatAt, beatsToSeconds, secondsToBeats, beatTimesBetween, countAt, countLabelAt, snapToBeat } from "../../src/model/tempo";

// 120 BPM = one beat every 0.5 s; the first "1" lands at 0.5 s.
const tempo = { bpm: 120, firstBeatSeconds: 0.5 };

describe("beatAt", () => {
  it("counts beats from the first downbeat", () => {
    expect(beatAt(tempo, 0.5)).toBe(0);
    expect(beatAt(tempo, 1.5)).toBe(2);
    expect(beatAt(tempo, 0)).toBe(-1);
  });
});

describe("countAt", () => {
  it("returns 8-count 1, count 1 at the first beat", () => {
    expect(countAt(tempo, 0.5)).toEqual({ eight: 1, count: 1 });
  });
  it("rolls over to the next 8-count after 8 beats", () => {
    expect(countAt(tempo, 0.5 + 8 * 0.5)).toEqual({ eight: 2, count: 1 });
    expect(countAt(tempo, 0.5 + 7 * 0.5)).toEqual({ eight: 1, count: 8 });
  });
  it("stays on the current count until the next beat", () => {
    expect(countAt(tempo, 0.74)).toEqual({ eight: 1, count: 1 });
  });
  it("is not thrown off by floating-point error just under a beat", () => {
    // At 90 BPM from 0.1 s, beat 6 lands at 4.1 s, but (4.1 - 0.1) * 90 / 60 is 5.999999999999999.
    const ninety = { bpm: 90, firstBeatSeconds: 0.1 };
    expect(countAt(ninety, 4.1)).toEqual({ eight: 1, count: 7 });
  });
  it("returns null before the first beat", () => {
    expect(countAt(tempo, 0.2)).toBeNull();
  });
});

describe("countLabelAt", () => {
  it("formats as 8-count and count", () => {
    expect(countLabelAt(tempo, 0.5 + 10 * 0.5)).toBe("8-count 2 · 3");
  });
  it("labels time before the first beat", () => {
    expect(countLabelAt(tempo, 0)).toBe("before count 1");
  });
});

describe("snapToBeat", () => {
  it("snaps to the nearest beat", () => {
    expect(snapToBeat(tempo, 1.2)).toBe(1);
    expect(snapToBeat(tempo, 1.3)).toBe(1.5);
  });
  it("never snaps to negative time", () => {
    expect(snapToBeat({ bpm: 120, firstBeatSeconds: 0.2 }, 0.01)).toBeCloseTo(0.2);
  });
});

describe("beatsToSeconds", () => {
  it("converts a beat count to seconds", () => {
    expect(beatsToSeconds(tempo, 4)).toBe(2);
  });
});

describe("beatTimesBetween", () => {
  it("lists beats in a window and marks each 8-count downbeat", () => {
    const beats = beatTimesBetween(tempo, 0, 1.6);
    expect(beats.map((beat) => beat.seconds)).toEqual([0.5, 1, 1.5]);
    expect(beats.map((beat) => beat.isDownbeat)).toEqual([true, false, false]);
  });
  it("skips beats before the first downbeat", () => {
    expect(beatTimesBetween(tempo, 0, 0.4)).toEqual([]);
  });
  it("rejects a reversed window", () => {
    expect(() => beatTimesBetween(tempo, 2, 1)).toThrow();
  });
});

describe("secondsToBeats", () => {
  it("is the inverse of beatsToSeconds", () => {
    expect(secondsToBeats(tempo, 2)).toBe(4);
    expect(secondsToBeats(tempo, beatsToSeconds(tempo, 3))).toBe(3);
  });
});
