import { describe, expect, it } from "vitest";
import { MIN_TIMELINE_SECONDS, TIMELINE_TAIL_SECONDS, rulerStepSeconds, timelineDurationSeconds } from "../../src/model/timeline";
import { validRoutineInput } from "../fixtures/routines";

describe("timelineDurationSeconds", () => {
  it("is the song length when a song is set", () => {
    expect(timelineDurationSeconds(validRoutineInput())).toBe(183.42);
  });
  it("without a song, covers the last formation plus a tail, with a minimum", () => {
    const noSong = { ...validRoutineInput(), song: null };
    expect(timelineDurationSeconds(noSong)).toBe(MIN_TIMELINE_SECONDS);
    const long = {
      ...noSong,
      formations: [...noSong.formations, { ...noSong.formations[1]!, id: "f-3", startSeconds: 100, holdSeconds: 5 }],
    };
    expect(timelineDurationSeconds(long)).toBe(105 + TIMELINE_TAIL_SECONDS);
  });
  it("still reaches past a formation placed beyond the song's end", () => {
    const routine = validRoutineInput();
    const late = { ...routine, song: { fileName: "short.mp3", durationSeconds: 3 } };
    expect(timelineDurationSeconds(late)).toBe(6);
  });
});

describe("rulerStepSeconds", () => {
  it("picks the smallest label step that leaves at least 60 px between labels", () => {
    expect(rulerStepSeconds(80)).toBe(1);
    expect(rulerStepSeconds(20)).toBe(5);
    expect(rulerStepSeconds(5)).toBe(15);
    expect(rulerStepSeconds(0.5)).toBe(120);
  });
  it("rejects a non-positive zoom", () => {
    expect(() => rulerStepSeconds(0)).toThrow(RangeError);
  });
});
