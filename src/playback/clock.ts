// Architecture note (Task 6 — playback and sharing)
// - PlaybackClock is the only source of "now" for playback. The controller asks
//   currentTime() every animation frame and renders positionsAt(routine, t); nothing
//   accumulates frame durations, so playback cannot drift from the music.
// - AudioClock (song loaded) reads HTMLAudioElement.currentTime; SilentClock (no song)
//   reads an injected millisecond time source (performance.now in the app).
// - Neither clock knows the timeline length; the controller stops playback at the end.
// - io/serialize.ts is the share-file contract: JSON of a validated routine, read back
//   only through parseRoutine. io/files.ts is the thin browser glue around it.

export interface PlaybackClock {
  currentTime(): number;
  isPlaying(): boolean;
  /** Rejects if the browser refuses to start playback. */
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
}

export class SilentClock implements PlaybackClock {
  private readonly nowMilliseconds: () => number;
  private positionSeconds = 0;
  private startedAtMilliseconds: number | null = null;

  constructor(nowMilliseconds: () => number) {
    this.nowMilliseconds = nowMilliseconds;
  }

  currentTime(): number {
    if (this.startedAtMilliseconds === null) return this.positionSeconds;
    return this.positionSeconds + (this.nowMilliseconds() - this.startedAtMilliseconds) / 1000;
  }

  isPlaying(): boolean {
    return this.startedAtMilliseconds !== null;
  }

  play(): Promise<void> {
    if (this.startedAtMilliseconds === null) this.startedAtMilliseconds = this.nowMilliseconds();
    return Promise.resolve();
  }

  pause(): void {
    this.positionSeconds = this.currentTime();
    this.startedAtMilliseconds = null;
  }

  seek(seconds: number): void {
    assertSeekable(seconds);
    this.positionSeconds = seconds;
    if (this.startedAtMilliseconds !== null) this.startedAtMilliseconds = this.nowMilliseconds();
  }
}

export function assertSeekable(seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError(`cannot seek to ${seconds}`);
}
