// Optional BPM overlay on song time. Formations are stored in seconds; these functions
// only label and snap. Beat 0 is the first "1"; floor() gets a small tolerance so a
// time computed as a beat lands on that beat despite floating-point error.
import type { Tempo } from "./types";

const BEATS_PER_EIGHT = 8;
const BEAT_TOLERANCE = 1e-6;

export interface Count {
  readonly eight: number;
  readonly count: number;
}

export interface BeatTime {
  readonly seconds: number;
  readonly isDownbeat: boolean;
}

export function beatAt(tempo: Tempo, seconds: number): number {
  return ((seconds - tempo.firstBeatSeconds) * tempo.bpm) / 60;
}

export function beatsToSeconds(tempo: Tempo, beats: number): number {
  return (beats * 60) / tempo.bpm;
}

export function secondsToBeats(tempo: Tempo, seconds: number): number {
  return (seconds * tempo.bpm) / 60;
}

export function countAt(tempo: Tempo, seconds: number): Count | null {
  const beat = Math.floor(beatAt(tempo, seconds) + BEAT_TOLERANCE);
  if (beat < 0) return null;
  return { eight: Math.floor(beat / BEATS_PER_EIGHT) + 1, count: (beat % BEATS_PER_EIGHT) + 1 };
}

export function countLabelAt(tempo: Tempo, seconds: number): string {
  const count = countAt(tempo, seconds);
  return count ? `8-count ${count.eight} · ${count.count}` : "before count 1";
}

export function snapToBeat(tempo: Tempo, seconds: number): number {
  const beatLength = beatsToSeconds(tempo, 1);
  let snapped = tempo.firstBeatSeconds + Math.round(beatAt(tempo, seconds)) * beatLength;
  while (snapped < 0) snapped += beatLength;
  return snapped;
}

export function beatTimesBetween(tempo: Tempo, fromSeconds: number, toSeconds: number): BeatTime[] {
  if (toSeconds < fromSeconds) throw new RangeError("beat window must not end before it starts");
  const firstBeat = Math.max(0, Math.ceil(beatAt(tempo, fromSeconds) - BEAT_TOLERANCE));
  const lastBeat = Math.floor(beatAt(tempo, toSeconds) + BEAT_TOLERANCE);
  const beats: BeatTime[] = [];
  for (let beat = firstBeat; beat <= lastBeat; beat++) {
    beats.push({
      seconds: tempo.firstBeatSeconds + beatsToSeconds(tempo, beat),
      isDownbeat: beat % BEATS_PER_EIGHT === 0,
    });
  }
  return beats;
}
