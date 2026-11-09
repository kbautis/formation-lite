import { describe, expect, it } from "vitest";
import { SilentClock } from "../../src/playback/clock";
import { AudioClock } from "../../src/playback/audioClock";

function fakeTime() {
  let milliseconds = 1000;
  return { now: () => milliseconds, advance: (seconds: number) => (milliseconds += seconds * 1000) };
}

describe("SilentClock", () => {
  it("starts paused at 0", () => {
    const clock = new SilentClock(fakeTime().now);
    expect(clock.isPlaying()).toBe(false);
    expect(clock.currentTime()).toBe(0);
  });

  it("advances with the time source while playing", async () => {
    const time = fakeTime();
    const clock = new SilentClock(time.now);
    await clock.play();
    time.advance(1.5);
    expect(clock.currentTime()).toBeCloseTo(1.5);
  });

  it("stops advancing when paused", async () => {
    const time = fakeTime();
    const clock = new SilentClock(time.now);
    await clock.play();
    time.advance(1);
    clock.pause();
    time.advance(5);
    expect(clock.currentTime()).toBeCloseTo(1);
    expect(clock.isPlaying()).toBe(false);
  });

  it("seeks while paused and while playing", async () => {
    const time = fakeTime();
    const clock = new SilentClock(time.now);
    clock.seek(10);
    expect(clock.currentTime()).toBe(10);
    await clock.play();
    time.advance(2);
    clock.seek(3);
    time.advance(1);
    expect(clock.currentTime()).toBeCloseTo(4);
  });

  it("rejects a negative or non-finite seek", () => {
    const clock = new SilentClock(fakeTime().now);
    expect(() => clock.seek(-1)).toThrow(RangeError);
    expect(() => clock.seek(Number.NaN)).toThrow(RangeError);
  });

  it("does not drift: time comes from the source, not from summing ticks", async () => {
    const time = fakeTime();
    const clock = new SilentClock(time.now);
    await clock.play();
    for (let frame = 0; frame < 10_000; frame++) time.advance(1 / 60);
    expect(clock.currentTime()).toBeCloseTo(10_000 / 60, 6);
  });
});

// Mutable stand-in for the slice of HTMLMediaElement that AudioClock reads.
interface FakeAudio {
  currentTime: number;
  paused: boolean;
  ended: boolean;
  playCalls: number;
  play(): Promise<void>;
  pause(): void;
}

function fakeAudio(): FakeAudio {
  return {
    currentTime: 0,
    paused: true,
    ended: false,
    playCalls: 0,
    play() {
      this.playCalls++;
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
  };
}

describe("AudioClock", () => {
  it("reads time straight from the audio element", () => {
    const audio = fakeAudio();
    const clock = new AudioClock(audio);
    audio.currentTime = 42.5;
    expect(clock.currentTime()).toBe(42.5);
  });

  it("plays, pauses, and reports state from the element", async () => {
    const audio = fakeAudio();
    const clock = new AudioClock(audio);
    await clock.play();
    expect(audio.playCalls).toBe(1);
    expect(clock.isPlaying()).toBe(true);
    clock.pause();
    expect(clock.isPlaying()).toBe(false);
  });

  it("is not playing once the song has ended", async () => {
    const audio = fakeAudio();
    const clock = new AudioClock(audio);
    await clock.play();
    audio.ended = true;
    expect(clock.isPlaying()).toBe(false);
  });

  it("seeks by setting the element's time and rejects bad input", () => {
    const audio = fakeAudio();
    const clock = new AudioClock(audio);
    clock.seek(12);
    expect(audio.currentTime).toBe(12);
    expect(() => clock.seek(-1)).toThrow(RangeError);
  });

  it("passes through a refused play (e.g. autoplay blocked)", async () => {
    const audio = fakeAudio();
    audio.play = () => Promise.reject(new Error("NotAllowedError"));
    await expect(new AudioClock(audio).play()).rejects.toThrow("NotAllowedError");
  });
});
