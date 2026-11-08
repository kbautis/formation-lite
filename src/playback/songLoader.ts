// Architecture note (song lifecycle — review follow-up)
// - Owns the <audio> element's source: the object URL for the current song and any load
//   still in progress. One load at a time: starting a new load, or unload(), cancels the
//   pending one (its promise rejects with SongLoadCancelledError and its URL is freed),
//   so a slow load can never land on a routine the user has since left.
// - load() resolves with the duration once the browser has read the song's metadata,
//   and rejects if it can't decode the file or takes longer than the timeout.
// - Object-URL functions are injected so tests run without a browser's URL.createObjectURL.

export type AudioElementLike = Pick<EventTarget, "addEventListener" | "removeEventListener"> & {
  src: string;
  readonly duration: number;
  load(): void;
  pause(): void;
  removeAttribute(name: string): void;
};

export interface SongSource {
  readonly bytes: ArrayBuffer;
  readonly mimeType: string;
}

export interface SongLoaderOptions {
  readonly createObjectUrl: (blob: Blob) => string;
  readonly revokeObjectUrl: (url: string) => void;
  readonly timeoutMilliseconds: number;
}

export class SongLoadCancelledError extends Error {
  constructor() {
    super("A newer song load replaced this one.");
    this.name = "SongLoadCancelledError";
  }
}

export class SongDecodeError extends Error {
  constructor() {
    super("The browser could not read this audio file.");
    this.name = "SongDecodeError";
  }
}

export class SongLoader<Audio extends AudioElementLike = AudioElementLike> {
  readonly audio: Audio;
  private readonly options: SongLoaderOptions;
  private currentUrl: string | null = null;
  private cancelPending: (() => void) | null = null;

  constructor(audio: Audio, options: SongLoaderOptions) {
    this.audio = audio;
    this.options = options;
  }

  load(song: SongSource): Promise<number> {
    this.unload();
    const url = this.options.createObjectUrl(new Blob([song.bytes], { type: song.mimeType }));
    this.currentUrl = url;
    const audio = this.audio;
    return new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => fail(new SongDecodeError()), this.options.timeoutMilliseconds);
      const detachListeners = () => {
        clearTimeout(timeout);
        audio.removeEventListener("loadedmetadata", succeed);
        audio.removeEventListener("error", onError);
        this.cancelPending = null;
      };
      const succeed = () => {
        detachListeners();
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return fail(new SongDecodeError());
        resolve(audio.duration);
      };
      const fail = (error: Error) => {
        detachListeners();
        this.release();
        reject(error);
      };
      const onError = () => fail(new SongDecodeError());
      this.cancelPending = () => fail(new SongLoadCancelledError());
      audio.addEventListener("loadedmetadata", succeed);
      audio.addEventListener("error", onError);
      audio.src = url;
      audio.load();
    });
  }

  /** Stops and forgets the current song, cancelling a load in progress. */
  unload(): void {
    if (this.cancelPending) this.cancelPending();
    this.release();
  }

  private release(): void {
    if (this.currentUrl === null) return;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.options.revokeObjectUrl(this.currentUrl);
    this.currentUrl = null;
  }
}
