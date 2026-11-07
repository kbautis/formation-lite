// PlaybackClock over an <audio> element. Typed against the small slice of
// HTMLMediaElement it uses so tests can pass a plain object.
import { assertSeekable, type PlaybackClock } from "./clock";

export type AudioLike = Pick<HTMLMediaElement, "currentTime" | "paused" | "ended" | "play" | "pause">;

export class AudioClock implements PlaybackClock {
  private readonly audio: AudioLike;

  constructor(audio: AudioLike) {
    this.audio = audio;
  }

  currentTime(): number {
    return this.audio.currentTime;
  }

  isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }

  play(): Promise<void> {
    return this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  seek(seconds: number): void {
    assertSeekable(seconds);
    this.audio.currentTime = seconds;
  }
}
