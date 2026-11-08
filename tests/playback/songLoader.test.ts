import { describe, expect, it } from "vitest";
import { SongLoadCancelledError, SongLoader, type AudioElementLike } from "../../src/playback/songLoader";

/** Stand-in for <audio>: tests fire its events by hand. */
class FakeAudio extends EventTarget implements AudioElementLike {
  src = "";
  duration = Number.NaN;
  loads = 0;
  load(): void {
    this.loads++;
  }
  pause(): void {}
  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
  }
  finishLoading(duration: number): void {
    this.duration = duration;
    this.dispatchEvent(new Event("loadedmetadata"));
  }
  failLoading(): void {
    this.dispatchEvent(new Event("error"));
  }
}

function makeLoader() {
  const audio = new FakeAudio();
  const created: string[] = [];
  const revoked: string[] = [];
  let counter = 0;
  const loader = new SongLoader(audio, {
    createObjectUrl: () => {
      const url = `blob:song-${++counter}`;
      created.push(url);
      return url;
    },
    revokeObjectUrl: (url) => revoked.push(url),
    timeoutMilliseconds: 1000,
  });
  const song = { bytes: new ArrayBuffer(4), mimeType: "audio/mpeg" };
  return { audio, loader, created, revoked, song };
}

describe("SongLoader", () => {
  it("resolves with the duration once the browser reads the song's metadata", async () => {
    const { audio, loader, song } = makeLoader();
    const loading = loader.load(song);
    expect(audio.src).toBe("blob:song-1");
    audio.finishLoading(183.4);
    await expect(loading).resolves.toBe(183.4);
  });

  it("rejects when the browser can't decode the file, and frees its object URL", async () => {
    const { audio, loader, revoked, song } = makeLoader();
    const loading = loader.load(song);
    audio.failLoading();
    await expect(loading).rejects.toThrow();
    expect(revoked).toEqual(["blob:song-1"]);
  });

  it("cancels an earlier load that is still running: it rejects, its URL is freed, and only the newer one resolves", async () => {
    const { audio, loader, revoked, song } = makeLoader();
    const first = loader.load(song);
    const second = loader.load(song);
    await expect(first).rejects.toBeInstanceOf(SongLoadCancelledError);
    expect(revoked).toEqual(["blob:song-1"]);
    audio.finishLoading(90);
    await expect(second).resolves.toBe(90);
  });

  it("unload cancels a pending load and frees the current song", async () => {
    const { audio, loader, revoked, song } = makeLoader();
    const loading = loader.load(song);
    loader.unload();
    await expect(loading).rejects.toBeInstanceOf(SongLoadCancelledError);
    expect(audio.src).toBe("");
    expect(revoked).toEqual(["blob:song-1"]);
  });

  it("unload after a finished load frees that song's URL", async () => {
    const { audio, loader, revoked, song } = makeLoader();
    const loading = loader.load(song);
    audio.finishLoading(60);
    await loading;
    loader.unload();
    expect(revoked).toEqual(["blob:song-1"]);
  });
});
