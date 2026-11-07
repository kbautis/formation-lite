// Sequences every side effect in the app. See the architecture note in state.ts.
import { EditError, RoutineFormatError } from "../model/errors";
import {
  editableFormationAt,
  holdSecondsForEnd,
  moveDancer,
  setSongInfo,
  updateFormationTiming,
} from "../model/edits";
import { createRoutine } from "../model/factory";
import { canRedo, canUndo, createHistory, pushHistory, redo, replacePresent, undo, type History } from "../model/history";
import { clampToWings } from "../model/stage";
import { fitPixelsPerSecond, timelineDurationSeconds } from "../model/timeline";
import { touchRoutine } from "../model/edits";
import type { Position, Routine } from "../model/types";
import { downloadRoutine, readRoutineFile } from "../io/files";
import { songDurationsMatch } from "../io/serialize";
import { AudioClock } from "../playback/audioClock";
import { SilentClock, type PlaybackClock } from "../playback/clock";
import { StorageError } from "../storage/database";
import { deleteRoutineWithSong, listRoutines, saveRoutine } from "../storage/routines";
import { loadSong, saveSong, type StoredSong } from "../storage/songs";
import {
  DEFAULT_PIXELS_PER_SECOND,
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  type AppState,
  type Notice,
} from "./state";
import { createStore, type Store } from "./store";

export const AUTOSAVE_DELAY_MILLISECONDS = 500;
export const NOTICE_DURATION_MILLISECONDS = 5000;
export const SONG_METADATA_TIMEOUT_MILLISECONDS = 10_000;
export const NEW_ROUTINE_NAME = "Untitled routine";
const LAST_OPENED_KEY = "formation-lite:last-opened-routine";
const FALLBACK_AUDIO_MIME_TYPE = "audio/mpeg";

export interface ControllerDependencies {
  /** null when IndexedDB is unavailable (private mode, blocked storage). */
  readonly database: IDBDatabase | null;
  readonly audio: HTMLAudioElement;
  readonly newId: () => string;
  readonly now: () => Date;
  readonly nowMilliseconds: () => number;
  readonly canEdit: boolean;
}

interface DragSession {
  readonly formationId: string;
  readonly dancerId: string;
  readonly before: Routine;
}

interface HoldDragSession {
  readonly formationId: string;
  readonly before: Routine;
}

export class Controller {
  readonly store: Store<AppState>;
  private readonly deps: ControllerDependencies;
  private clock: PlaybackClock;
  private drag: DragSession | null = null;
  private holdDrag: HoldDragSession | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private animationFrame: number | null = null;

  constructor(deps: ControllerDependencies) {
    this.deps = deps;
    this.clock = new SilentClock(deps.nowMilliseconds);
    const routine = this.makeRoutine();
    this.store = createStore<AppState>({
      routine,
      history: createHistory(routine),
      savedRoutines: [],
      playheadSeconds: 0,
      isPlaying: false,
      view: "audience",
      selectedDancerId: null,
      loadedSong: null,
      saveStatus: deps.database ? "saved" : "unavailable",
      notice: null,
      canEdit: deps.canEdit,
      pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
      timelineFit: true,
    });
  }

  private get state(): AppState {
    return this.store.getState();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Opens the last routine used on this device, or the newest, or a new one. */
  async start(): Promise<void> {
    const database = this.deps.database;
    if (!database) {
      this.notify("error", "This browser isn't letting the app save. Export your routine to keep your work.");
      return;
    }
    const listing = await listRoutines(database);
    if (listing.corrupt.length > 0) {
      this.notify("error", `${listing.corrupt.length} saved routine(s) couldn't be read and were skipped.`);
    }
    this.store.setState({ savedRoutines: listing.routines });
    const lastId = readLastOpenedId();
    const routine = listing.routines.find((candidate) => candidate.id === lastId) ?? listing.routines[0];
    if (routine) {
      await this.show(routine);
      return;
    }
    writeLastOpenedId(this.state.routine.id);
    await this.saveNow();
  }

  setCanEdit(canEdit: boolean): void {
    if (!canEdit) this.cancelDrag();
    this.store.setState({ canEdit });
  }

  // ── Routines ──────────────────────────────────────────────────────────────

  async newRoutine(): Promise<void> {
    await this.show(this.makeRoutine());
    await this.saveNow();
  }

  async openRoutine(id: string): Promise<void> {
    const routine = this.state.savedRoutines.find((candidate) => candidate.id === id);
    if (!routine) throw new StorageError(`No routine with id "${id}" on this device.`);
    await this.show(routine);
  }

  async deleteCurrentRoutine(): Promise<void> {
    const { routine } = this.state;
    this.cancelPendingSave();
    if (this.deps.database) await deleteRoutineWithSong(this.deps.database, routine.id);
    const remaining = this.state.savedRoutines.filter((candidate) => candidate.id !== routine.id);
    this.store.setState({ savedRoutines: remaining });
    if (remaining[0]) await this.show(remaining[0]);
    else await this.newRoutine();
  }

  /** Returns false when the file was rejected or the user kept their existing copy. */
  async importRoutineFile(file: File, confirmReplace: (name: string) => boolean): Promise<boolean> {
    let routine: Routine;
    try {
      routine = await readRoutineFile(file);
    } catch (error) {
      if (!(error instanceof RoutineFormatError)) throw error;
      this.notify("error", `Couldn't open ${file.name}. ${error.message}`);
      return false;
    }
    const existing = this.state.savedRoutines.find((candidate) => candidate.id === routine.id);
    if (existing && !confirmReplace(existing.name)) return false;
    await this.show(routine);
    await this.saveNow();
    this.notify("info", `Opened “${routine.name}”.`);
    return true;
  }

  exportCurrentRoutine(): void {
    downloadRoutine(touchRoutine(this.state.routine, this.deps.now()));
  }

  // ── Edits ─────────────────────────────────────────────────────────────────

  /** Applies a model edit as one undo step. Refused edits show their message and return false. */
  edit(change: (routine: Routine) => Routine): boolean {
    if (!this.state.canEdit) {
      this.notify("info", "Editing is available on a larger screen. This screen is view-only.");
      return false;
    }
    let next: Routine;
    try {
      next = change(this.state.routine);
    } catch (error) {
      if (!(error instanceof EditError)) throw error;
      this.notify("error", error.message);
      return false;
    }
    this.commit(next, pushHistory(this.state.history, next));
    return true;
  }

  canUndo(): boolean {
    return canUndo(this.state.history);
  }

  canRedo(): boolean {
    return canRedo(this.state.history);
  }

  undo(): void {
    if (this.state.canEdit && this.canUndo()) this.restore(undo(this.state.history));
  }

  redo(): void {
    if (this.state.canEdit && this.canRedo()) this.restore(redo(this.state.history));
  }

  // ── Dragging ──────────────────────────────────────────────────────────────

  beginDrag(dancerId: string): boolean {
    if (!this.state.canEdit) return false;
    try {
      const formation = editableFormationAt(this.state.routine, this.state.playheadSeconds);
      this.pause();
      this.drag = { formationId: formation.id, dancerId, before: this.state.routine };
      return true;
    } catch (error) {
      if (!(error instanceof EditError)) throw error;
      this.notify("info", error.message);
      return false;
    }
  }

  dragTo(position: Position): void {
    const drag = this.drag;
    if (!drag) return;
    const routine = moveDancer(this.state.routine, {
      formationId: drag.formationId,
      dancerId: drag.dancerId,
      position: clampToWings(position),
    });
    this.store.setState({ routine });
  }

  endDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    this.finishDrag(drag.before);
  }

  /** Starts dragging a formation's end on the timeline. Moves the playhead into it so the sidebar shows its hold. */
  beginHoldDrag(formationId: string): boolean {
    if (!this.state.canEdit) return false;
    const formation = this.state.routine.formations.find((candidate) => candidate.id === formationId);
    if (!formation) throw new EditError(`No formation with id "${formationId}".`);
    this.pause();
    this.seek(formation.startSeconds);
    this.holdDrag = { formationId, before: this.state.routine };
    return true;
  }

  dragHoldTo(endSeconds: number): void {
    const drag = this.holdDrag;
    if (!drag) return;
    const routine = this.state.routine;
    const formation = routine.formations.find((candidate) => candidate.id === drag.formationId)!;
    const holdSeconds = holdSecondsForEnd(routine, drag.formationId, endSeconds);
    if (holdSeconds === formation.holdSeconds) return;
    this.store.setState({
      routine: updateFormationTiming(routine, drag.formationId, { startSeconds: formation.startSeconds, holdSeconds }),
    });
  }

  endHoldDrag(): void {
    const drag = this.holdDrag;
    if (!drag) return;
    this.holdDrag = null;
    this.finishDrag(drag.before);
  }

  /** Records a finished drag as one undo step: from the routine before it to the routine now. */
  private finishDrag(before: Routine): void {
    if (this.state.routine === before) return;
    const history = pushHistory(replacePresent(this.state.history, before), this.state.routine);
    this.commit(this.state.routine, history);
  }

  private cancelDrag(): void {
    const before = this.drag?.before ?? this.holdDrag?.before;
    this.drag = null;
    this.holdDrag = null;
    if (before) this.store.setState({ routine: before });
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  timelineDuration(): number {
    return timelineDurationSeconds(this.state.routine);
  }

  togglePlay(): void {
    if (this.state.isPlaying) this.pause();
    else void this.play();
  }

  async play(): Promise<void> {
    if (this.state.isPlaying) return;
    if (this.state.playheadSeconds >= this.timelineDuration()) this.seek(0);
    try {
      await this.clock.play();
    } catch {
      this.notify("error", "The browser blocked playback. Press play again.");
      return;
    }
    this.store.setState({ isPlaying: true });
    this.scheduleFrame();
  }

  pause(): void {
    this.clock.pause();
    this.stopFrames();
    this.store.setState({ isPlaying: false, playheadSeconds: this.clock.currentTime() });
  }

  seek(seconds: number): void {
    const clamped = Math.min(Math.max(0, seconds), this.timelineDuration());
    this.clock.seek(clamped);
    this.store.setState({ playheadSeconds: clamped });
  }

  private scheduleFrame(): void {
    this.animationFrame = requestAnimationFrame(() => this.tick());
  }

  private stopFrames(): void {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
  }

  private tick(): void {
    const duration = this.timelineDuration();
    const seconds = Math.min(this.clock.currentTime(), duration);
    if (!this.clock.isPlaying() || seconds >= duration) {
      this.clock.pause();
      this.animationFrame = null;
      this.store.setState({ isPlaying: false, playheadSeconds: seconds });
      return;
    }
    this.store.setState({ playheadSeconds: seconds });
    this.scheduleFrame();
  }

  // ── Song ──────────────────────────────────────────────────────────────────

  async loadSongFile(file: File): Promise<void> {
    const bytes = await file.arrayBuffer();
    const song: Omit<StoredSong, "durationSeconds"> = {
      fileName: file.name,
      mimeType: file.type || FALLBACK_AUDIO_MIME_TYPE,
      bytes,
    };
    let durationSeconds: number;
    try {
      durationSeconds = await this.attachSong(song);
    } catch {
      this.notify("error", `This browser can't play ${file.name}. Try an MP3 or M4A file.`);
      return;
    }
    const routine = setSongInfo(this.state.routine, { fileName: file.name, durationSeconds });
    this.commit(routine, replacePresent(this.state.history, routine));
    await this.storeSong({ ...song, durationSeconds });
  }

  private async storeSong(song: StoredSong): Promise<void> {
    const database = this.deps.database;
    if (!database) return;
    try {
      await saveSong(database, this.state.routine.id, song);
    } catch (error) {
      if (!(error instanceof StorageError || error instanceof DOMException)) throw error;
      this.notify("error", "The song plays now but couldn't be saved on this device (storage may be full).");
    }
  }

  /** Points the <audio> element at the song and switches to the audio clock. Resolves with the duration. */
  private attachSong(song: Omit<StoredSong, "durationSeconds">): Promise<number> {
    this.detachSong();
    const url = URL.createObjectURL(new Blob([song.bytes], { type: song.mimeType }));
    const audio = this.deps.audio;
    return new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => fail(), SONG_METADATA_TIMEOUT_MILLISECONDS);
      const cleanup = () => {
        clearTimeout(timeout);
        audio.removeEventListener("loadedmetadata", succeed);
        audio.removeEventListener("error", fail);
      };
      const succeed = () => {
        cleanup();
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return fail();
        this.clock = new AudioClock(audio);
        this.clock.seek(Math.min(this.state.playheadSeconds, audio.duration));
        this.store.setState({ loadedSong: { url, fileName: song.fileName, durationSeconds: audio.duration } });
        resolve(audio.duration);
      };
      const fail = () => {
        cleanup();
        audio.removeAttribute("src");
        URL.revokeObjectURL(url);
        reject(new Error("audio could not be decoded"));
      };
      audio.addEventListener("loadedmetadata", succeed);
      audio.addEventListener("error", fail);
      audio.src = url;
      audio.load();
    });
  }

  private detachSong(): void {
    const loaded = this.state.loadedSong;
    if (this.state.isPlaying) this.pause();
    this.clock = new SilentClock(this.deps.nowMilliseconds);
    if (!loaded) return;
    this.deps.audio.pause();
    this.deps.audio.removeAttribute("src");
    URL.revokeObjectURL(loaded.url);
    this.store.setState({ loadedSong: null });
  }

  // ── View ──────────────────────────────────────────────────────────────────

  toggleView(): void {
    this.store.setState({ view: this.state.view === "audience" ? "dancer" : "audience" });
  }

  selectDancer(dancerId: string | null): void {
    this.store.setState({ selectedDancerId: dancerId });
  }

  /** Zooms by hand, which leaves fit-to-window mode. */
  zoom(factor: number): void {
    this.store.setState({ pixelsPerSecond: clampZoom(this.state.pixelsPerSecond * factor), timelineFit: false });
  }

  setTimelineFit(timelineFit: boolean): void {
    this.store.setState({ timelineFit });
  }

  /** In fit mode, zooms so the whole timeline fills widthPixels. Does nothing after a manual zoom. */
  applyTimelineFit(widthPixels: number): void {
    if (!this.state.timelineFit) return;
    this.store.setState({ pixelsPerSecond: clampZoom(fitPixelsPerSecond(this.timelineDuration(), widthPixels)) });
  }

  notify(kind: Notice["kind"], text: string): void {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.store.setState({ notice: { kind, text } });
    this.noticeTimer = setTimeout(() => this.store.setState({ notice: null }), NOTICE_DURATION_MILLISECONDS);
  }

  dismissNotice(): void {
    this.store.setState({ notice: null });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private makeRoutine(): Routine {
    return createRoutine({ name: NEW_ROUTINE_NAME, now: this.deps.now(), id: this.deps.newId(), firstFormationId: this.deps.newId() });
  }

  private commit(routine: Routine, history: History): void {
    this.store.setState({ routine, history });
    this.scheduleSave();
  }

  private restore(history: History): void {
    // Song info is device metadata, not an edit: keep the current one across undo/redo.
    const routine = { ...history.present, song: this.state.routine.song };
    this.commit(routine, replacePresent(history, routine));
  }

  /** Replaces everything on screen with this routine and its song from this device. */
  private async show(routine: Routine): Promise<void> {
    await this.flushPendingSave();
    this.cancelDrag();
    this.detachSong();
    this.store.setState({
      routine,
      history: createHistory(routine),
      playheadSeconds: 0,
      selectedDancerId: null,
    });
    this.clock.seek(0);
    writeLastOpenedId(routine.id);
    await this.restoreSong(routine);
  }

  private async restoreSong(routine: Routine): Promise<void> {
    const database = this.deps.database;
    const stored = database ? await loadSong(database, routine.id) : null;
    if (!stored) {
      if (routine.song) this.notify("info", `Load “${routine.song.fileName}” to hear the music with this routine.`);
      return;
    }
    try {
      await this.attachSong(stored);
    } catch {
      this.notify("error", `The saved song “${stored.fileName}” couldn't be played. Load it again.`);
      return;
    }
    if (routine.song && !songDurationsMatch(routine.song.durationSeconds, stored.durationSeconds)) {
      this.notify("info", `Heads up: your song is a different length than the one this routine was made with (“${routine.song.fileName}”).`);
    }
  }

  private scheduleSave(): void {
    if (!this.deps.database) return;
    this.cancelPendingSave();
    this.store.setState({ saveStatus: "pending" });
    this.saveTimer = setTimeout(() => void this.saveNow(), AUTOSAVE_DELAY_MILLISECONDS);
  }

  private cancelPendingSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  /** Writes the current routine now if an autosave is waiting; otherwise does nothing. */
  async flushPendingSave(): Promise<void> {
    if (this.saveTimer !== null) await this.saveNow();
  }

  /** Writes the current routine to this device immediately. */
  async saveNow(): Promise<void> {
    const database = this.deps.database;
    if (!database) return;
    this.cancelPendingSave();
    const saved = touchRoutine(this.state.routine, this.deps.now());
    try {
      await saveRoutine(database, saved);
    } catch (error) {
      if (!(error instanceof StorageError || error instanceof DOMException)) throw error;
      this.store.setState({ saveStatus: "failed" });
      this.notify("error", "Couldn't save on this device. Export your routine to keep your work.");
      return;
    }
    const others = this.state.savedRoutines.filter((candidate) => candidate.id !== saved.id);
    this.store.setState({ saveStatus: "saved", savedRoutines: [saved, ...others] });
  }
}

function clampZoom(pixelsPerSecond: number): number {
  return Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, pixelsPerSecond));
}

function readLastOpenedId(): string | null {
  try {
    return localStorage.getItem(LAST_OPENED_KEY);
  } catch {
    return null;
  }
}

function writeLastOpenedId(id: string): void {
  try {
    localStorage.setItem(LAST_OPENED_KEY, id);
  } catch {
    // Remembering the last routine is a convenience; without it the newest routine opens.
  }
}
