// Sequences every side effect in the app. See the architecture note in state.ts.
import { EditError, RoutineFormatError } from "../model/errors";
import {
  addFormationAt,
  dragFormationEdge,
  editableFormationAt,
  moveDancer,
  setSongInfo,
  touchRoutine,
  type FormationEdge,
} from "../model/edits";
import { createRoutine } from "../model/factory";
import { canRedo, canUndo, createHistory, mapHistory, pushHistory, redo, replacePresent, undo, type History } from "../model/history";
import { timelineDurationSeconds } from "../model/timeline";
import type { Position, Routine, SongInfo } from "../model/types";
import { downloadRoutine, readRoutineFile } from "../io/files";
import { ShareLinkTooLargeError, decodeShareLink, encodeShareLink } from "../io/shareLink";
import { songDurationsMatch } from "../io/serialize";
import { AudioClock, type AudioLike } from "../playback/audioClock";
import { SilentClock, type PlaybackClock } from "../playback/clock";
import { SongLoadCancelledError, type SongSource } from "../playback/songLoader";
import { StorageError, isStorageFailure } from "../storage/database";
import { readPreference, writePreference } from "../storage/preferences";
import { deleteRoutineWithSong, listRoutines, saveRoutine } from "../storage/routines";
import { loadSong, saveSong, type StoredSong } from "../storage/songs";
import { clampZoom, currentRoutine, type AppState, type Notice } from "./state";
import { createStore, type Store } from "./store";

export const AUTOSAVE_DELAY_MILLISECONDS = 500;
export const NOTICE_DURATION_MILLISECONDS = 5000;
export const NEW_ROUTINE_NAME = "Untitled routine";
/** Larger than any song a routine needs (a 5-minute WAV is ~50 MB); protects device storage. */
export const MAX_SONG_BYTES = 100 * 1024 * 1024;
const LAST_OPENED_KEY = "formation-lite:last-opened-routine";
const COLLISION_CHECK_OFF_KEY = "formation-lite:collision-check-off";
const FALLBACK_AUDIO_MIME_TYPE = "audio/mpeg";

/** What the replace prompt says about an incoming routine whose id is already on this device. */
export interface ReplaceDetails {
  readonly existingName: string;
  /** When the incoming version was last edited (its updatedAt). */
  readonly incomingUpdatedAt: string;
  /** The incoming updatedAt is earlier than the copy on this device. */
  readonly isOlderThanStored: boolean;
}

export type ConfirmReplace = (details: ReplaceDetails) => boolean;

/** The parts of `navigator` that sharing uses; each may be missing in a given browser. */
export interface ShareNavigator {
  canShare?(data: ShareData): boolean;
  share?(data: ShareData): Promise<void>;
  readonly clipboard?: { writeText(text: string): Promise<void> };
}

/** How a share link reached the user: share sheet, clipboard, a field to copy by hand, or not at all. */
export type ShareOutcome = "shared" | "cancelled" | "copied" | "manual" | "too-large";

export interface ControllerDependencies {
  /** null when IndexedDB is unavailable (private mode, blocked storage). */
  readonly database: IDBDatabase | null;
  /** The song lifecycle (playback/songLoader.ts); its audio element is the playback clock. */
  readonly songs: { load(song: SongSource): Promise<number>; unload(): void; readonly audio: AudioLike };
  /** Share sheet and clipboard (navigator in the browser). */
  readonly navigator: ShareNavigator;
  /** The app's address without fragment or query (origin + pathname); share links start with it. */
  readonly appUrl: () => string;
  readonly newId: () => string;
  readonly now: () => Date;
  readonly nowMilliseconds: () => number;
  readonly canEdit: boolean;
}

/** One drag at a time: a dancer on the stage, or a formation's edge on the timeline. */
type DragSession =
  | { readonly kind: "dancer"; readonly formationId: string; readonly dancerId: string; readonly before: Routine }
  | { readonly kind: "edge"; readonly formationId: string; readonly edge: FormationEdge; readonly before: Routine };

export class Controller {
  readonly store: Store<AppState>;
  private readonly deps: ControllerDependencies;
  private clock: PlaybackClock;
  private drag: DragSession | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private animationFrame: number | null = null;

  constructor(deps: ControllerDependencies) {
    this.deps = deps;
    this.clock = new SilentClock(deps.nowMilliseconds);
    this.store = createStore<AppState>({
      history: createHistory(this.makeRoutine()),
      savedRoutines: [],
      playheadSeconds: 0,
      isPlaying: false,
      view: "audience",
      selectedDancerId: null,
      loadedSong: null,
      saveStatus: deps.database ? "saved" : "unavailable",
      notice: null,
      canEdit: deps.canEdit,
      zoom: { mode: "fit" },
      showPaths: true,
      checkCollisions: readPreference(COLLISION_CHECK_OFF_KEY) !== "true",
      manualShareLink: null,
    });
  }

  private get state(): AppState {
    return this.store.getState();
  }

  /** The routine on screen. */
  get routine(): Routine {
    return currentRoutine(this.state);
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
    const lastId = readPreference(LAST_OPENED_KEY);
    const routine = listing.routines.find((candidate) => candidate.id === lastId) ?? listing.routines[0];
    if (routine) {
      await this.show(routine);
      return;
    }
    writePreference(LAST_OPENED_KEY, this.routine.id);
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

  /** Deletes the open routine and its song from this device; on a storage failure it stays open and the user is told. */
  async deleteCurrentRoutine(): Promise<void> {
    const routine = this.routine;
    if (this.deps.database) {
      try {
        await deleteRoutineWithSong(this.deps.database, routine.id);
      } catch (error) {
        if (!isStorageFailure(error)) throw error;
        // The routine stays open, so its pending autosave must still run.
        this.notify("error", `Couldn't delete “${routine.name}” from this device. Try again, or reload the page.`);
        return;
      }
    }
    this.cancelPendingSave();
    const remaining = this.state.savedRoutines.filter((candidate) => candidate.id !== routine.id);
    this.store.setState({ savedRoutines: remaining });
    if (remaining[0]) await this.show(remaining[0]);
    else await this.newRoutine();
  }

  /** Opens a routine file. Returns false when the file was rejected or the user kept their existing copy. */
  async importRoutineFile(file: File, confirmReplace: ConfirmReplace): Promise<boolean> {
    let routine: Routine;
    try {
      routine = await readRoutineFile(file);
    } catch (error) {
      if (!(error instanceof RoutineFormatError)) throw error;
      this.notify("error", `Couldn't open ${file.name}. ${error.message}`);
      return false;
    }
    return this.importRoutine(routine, confirmReplace);
  }

  /**
   * Opens the routine in a share link's fragment. A damaged or tampered link is reported
   * and changes nothing. Returns false when it was rejected or the user kept their copy.
   */
  async importShareLink(fragment: string, confirmReplace: ConfirmReplace): Promise<boolean> {
    let routine: Routine;
    try {
      routine = await decodeShareLink(fragment);
    } catch (error) {
      if (!(error instanceof RoutineFormatError)) throw error;
      this.notify("error", `Couldn't open this link. ${error.message}`);
      return false;
    }
    return this.importRoutine(routine, confirmReplace);
  }

  /**
   * The one path for a routine arriving from elsewhere (a file or a link). When its id is
   * already on this device the user is asked first, told when the incoming version was
   * edited and whether it is older than theirs. It is saved as it arrived, edit time
   * included, so the next link of the same routine compares against the sender's time,
   * not the moment it was opened here. Songs are keyed by id, so a loaded song is kept.
   */
  async importRoutine(routine: Routine, confirmReplace: ConfirmReplace): Promise<boolean> {
    await this.flushPendingSave();
    const existing = this.state.savedRoutines.find((candidate) => candidate.id === routine.id);
    if (existing && !confirmReplace(replaceDetails(existing, routine))) return false;
    await this.show(routine);
    await this.write(routine);
    this.notify("info", `Opened “${routine.name}”.`);
    return true;
  }

  /**
   * Makes a share link for the routine on screen and hands it to the share sheet, the
   * clipboard, or (when both fail) a field to copy by hand. The share time becomes the
   * routine's edit time, here and in the link, so teammates can tell which link is newest.
   */
  async shareCurrentRoutine(): Promise<ShareOutcome> {
    const routine = touchRoutine(this.routine, this.deps.now());
    let url: string;
    try {
      url = await encodeShareLink(routine, this.deps.appUrl());
    } catch (error) {
      if (!(error instanceof ShareLinkTooLargeError)) throw error;
      this.notify("error", error.message);
      return "too-large";
    }
    if (!this.drag && this.routine.id === routine.id) {
      this.store.setState({ history: replacePresent(this.state.history, routine) });
      await this.write(routine);
    }
    return this.deliverShareLink({ title: routine.name, url });
  }

  private async deliverShareLink(data: { readonly title: string; readonly url: string }): Promise<ShareOutcome> {
    const navigator = this.deps.navigator;
    if (navigator.share && navigator.canShare?.(data)) {
      try {
        await navigator.share(data);
        return "shared";
      } catch (error) {
        // A cancelled sheet rejects with AbortError: the user chose not to share.
        if (isAbortError(error)) return "cancelled";
      }
    }
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(data.url);
      this.notify("info", "Link copied. Paste it in your team chat.");
      return "copied";
    } catch {
      this.store.setState({ manualShareLink: data.url });
      return "manual";
    }
  }

  dismissManualShareLink(): void {
    this.store.setState({ manualShareLink: null });
  }

  exportCurrentRoutine(): void {
    downloadRoutine(touchRoutine(this.routine, this.deps.now()));
  }

  // ── Edits ─────────────────────────────────────────────────────────────────

  /**
   * Applies a model edit as one undo step. Refused edits show their message and return false.
   * An edit that arrives mid-drag (e.g. a sidebar field's change event, which fires on blur
   * after the stage's pointerdown) ends the drag so far as its own undo step, lands on top
   * of it, and the drag then continues from the edited routine, so nothing typed is lost.
   */
  edit(change: (routine: Routine) => Routine): boolean {
    if (!this.state.canEdit) {
      this.notify("info", "Editing is available on a larger screen. This screen is view-only.");
      return false;
    }
    const drag = this.drag;
    if (drag) this.endDrag();
    const applied = this.applyEdit(change);
    if (drag) this.resumeDrag(drag);
    return applied;
  }

  private applyEdit(change: (routine: Routine) => Routine): boolean {
    let next: Routine;
    try {
      next = change(this.routine);
    } catch (error) {
      if (!(error instanceof EditError)) throw error;
      this.notify("error", error.message);
      return false;
    }
    this.commit(pushHistory(this.state.history, next));
    return true;
  }

  addFormationAtPlayhead(): boolean {
    const seconds = this.state.playheadSeconds;
    return this.edit((routine) => addFormationAt(routine, { id: this.deps.newId(), seconds }));
  }

  canUndo(): boolean {
    return canUndo(this.state.history);
  }

  canRedo(): boolean {
    return canRedo(this.state.history);
  }

  /** Ignored mid-drag: the drag owns the present until it ends. */
  undo(): void {
    if (this.state.canEdit && !this.drag && this.canUndo()) this.commit(undo(this.state.history));
  }

  redo(): void {
    if (this.state.canEdit && !this.drag && this.canRedo()) this.commit(redo(this.state.history));
  }

  // ── Dragging ──────────────────────────────────────────────────────────────

  /** Starts dragging a dancer in the formation held at the playhead. */
  beginDrag(dancerId: string): boolean {
    return this.beginDragSession((before) => {
      const formation = editableFormationAt(before, this.state.playheadSeconds);
      return { kind: "dancer", formationId: formation.id, dancerId, before };
    });
  }

  /**
   * Starts dragging a formation's edge on the timeline: "end" changes how long it holds,
   * "start" changes when it starts and keeps its end. Moves the playhead into the
   * formation so the sidebar shows it while it changes.
   */
  beginEdgeDrag(formationId: string, edge: FormationEdge): boolean {
    return this.beginDragSession((before) => {
      const formation = before.formations.find((candidate) => candidate.id === formationId);
      if (!formation) throw new EditError("That formation no longer exists.");
      this.seek(formation.startSeconds);
      return { kind: "edge", formationId, edge, before };
    });
  }

  dragTo(position: Position): void {
    const drag = this.drag;
    if (drag?.kind !== "dancer") return;
    this.updateDragged(moveDancer(this.routine, { formationId: drag.formationId, dancerId: drag.dancerId, position }));
  }

  dragEdgeTo(seconds: number): void {
    const drag = this.drag;
    if (drag?.kind !== "edge") return;
    const routine = dragFormationEdge(this.routine, drag.formationId, drag.edge, seconds);
    if (routine === this.routine) return;
    this.updateDragged(routine);
    const formation = routine.formations.find((candidate) => candidate.id === drag.formationId)!;
    if (this.state.playheadSeconds < formation.startSeconds) this.seek(formation.startSeconds);
  }

  /** Ends either kind of drag, recording it as one undo step (nothing if it changed nothing). */
  endDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    const live = this.routine;
    if (live === drag.before) return;
    this.commit(pushHistory(replacePresent(this.state.history, drag.before), live));
  }

  private beginDragSession(start: (before: Routine) => DragSession): boolean {
    if (!this.state.canEdit || this.drag) return false;
    try {
      this.pause();
      this.drag = start(this.routine);
      return true;
    } catch (error) {
      if (!(error instanceof EditError)) throw error;
      this.notify("info", error.message);
      return false;
    }
  }

  /** Continues a drag interrupted by an edit, unless the edit removed what was being dragged. */
  private resumeDrag(drag: DragSession): void {
    const routine = this.routine;
    const formationExists = routine.formations.some((formation) => formation.id === drag.formationId);
    const dancerExists = drag.kind !== "dancer" || routine.dancers.some((dancer) => dancer.id === drag.dancerId);
    if (formationExists && dancerExists) this.drag = { ...drag, before: routine };
  }

  /** Mid-drag the present changes in place; the undo step is pushed once, in endDrag. */
  private updateDragged(routine: Routine): void {
    this.store.setState({ history: replacePresent(this.state.history, routine) });
  }

  private cancelDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    this.store.setState({ history: replacePresent(this.state.history, drag.before) });
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  timelineDuration(): number {
    return timelineDurationSeconds(this.routine);
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

  /**
   * Loads a song for the open routine. The routine is captured before the first await:
   * if the user switches routines while the file is read or decoded, the result is
   * dropped instead of landing on the routine they switched to.
   */
  async loadSongFile(file: File): Promise<void> {
    const routineId = this.routine.id;
    if (file.size > MAX_SONG_BYTES) {
      this.notify("error", `${file.name} is too large (over ${MAX_SONG_BYTES / 1024 / 1024} MB). Try an MP3 or M4A file.`);
      return;
    }
    const bytes = await file.arrayBuffer();
    if (this.routine.id !== routineId) return;
    const mimeType = file.type || FALLBACK_AUDIO_MIME_TYPE;
    const durationSeconds = await this.attachSong({ bytes, mimeType }, file.name, `This browser can't play ${file.name}. Try an MP3 or M4A file.`);
    if (durationSeconds === null || this.routine.id !== routineId) return;
    this.recordSongInfo({ fileName: file.name, durationSeconds });
    await this.storeSong(routineId, { fileName: file.name, mimeType, durationSeconds, bytes });
  }

  /** Writes song info into every history snapshot, so undo never reverts it. Not an undo step. */
  private recordSongInfo(song: SongInfo): void {
    this.commit(mapHistory(this.state.history, (routine) => setSongInfo(routine, song)));
  }

  private async storeSong(routineId: string, song: StoredSong): Promise<void> {
    const database = this.deps.database;
    if (!database) return;
    try {
      await saveSong(database, routineId, song);
    } catch (error) {
      if (!isStorageFailure(error)) throw error;
      this.notify("error", "The song plays now but couldn't be saved on this device (storage may be full).");
    }
  }

  /**
   * Loads the song into the audio element and switches to the audio clock. Returns the
   * duration, or null when the load failed (after telling the user) or was replaced.
   */
  private async attachSong(source: SongSource, fileName: string, failureMessage: string): Promise<number | null> {
    this.detachSong();
    let durationSeconds: number;
    try {
      durationSeconds = await this.deps.songs.load(source);
    } catch (error) {
      if (!(error instanceof SongLoadCancelledError)) this.notify("error", failureMessage);
      return null;
    }
    this.clock = new AudioClock(this.deps.songs.audio);
    this.clock.seek(Math.min(this.state.playheadSeconds, durationSeconds));
    this.store.setState({ loadedSong: { fileName, durationSeconds } });
    return durationSeconds;
  }

  private detachSong(): void {
    if (this.state.isPlaying) this.pause();
    this.deps.songs.unload();
    this.clock = new SilentClock(this.deps.nowMilliseconds);
    this.store.setState({ loadedSong: null });
  }

  // ── View ──────────────────────────────────────────────────────────────────

  toggleView(): void {
    this.store.setState({ view: this.state.view === "audience" ? "dancer" : "audience" });
  }

  /** Turns the "dancers pass too close" warnings on or off; remembered on this device. */
  toggleCollisionCheck(): void {
    const checkCollisions = !this.state.checkCollisions;
    this.store.setState({ checkCollisions });
    writePreference(COLLISION_CHECK_OFF_KEY, String(!checkCollisions));
  }

  togglePaths(): void {
    this.store.setState({ showPaths: !this.state.showPaths });
  }

  selectDancer(dancerId: string | null): void {
    this.store.setState({ selectedDancerId: dancerId });
  }

  /** Zooms by hand from the scale currently on screen, which leaves fit-to-window mode. */
  zoomBy(factor: number, currentPixelsPerSecond: number): void {
    this.store.setState({ zoom: { mode: "manual", pixelsPerSecond: clampZoom(currentPixelsPerSecond * factor) } });
  }

  zoomToFit(): void {
    this.store.setState({ zoom: { mode: "fit" } });
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

  private commit(history: History): void {
    this.store.setState({ history });
    this.scheduleSave();
  }

  /** Replaces everything on screen with this routine and its song from this device. */
  private async show(routine: Routine): Promise<void> {
    await this.flushPendingSave();
    this.cancelDrag();
    this.detachSong();
    this.store.setState({ history: createHistory(routine), playheadSeconds: 0, selectedDancerId: null });
    this.clock.seek(0);
    writePreference(LAST_OPENED_KEY, routine.id);
    await this.restoreSong(routine);
  }

  private async restoreSong(routine: Routine): Promise<void> {
    const database = this.deps.database;
    const stored = database ? await loadSong(database, routine.id) : null;
    if (this.routine.id !== routine.id) return;
    if (!stored) {
      if (routine.song) this.notify("info", `Load “${routine.song.fileName}” to hear the music with this routine.`);
      return;
    }
    const durationSeconds = await this.attachSong(stored, stored.fileName, `The saved song “${stored.fileName}” couldn't be played. Load it again.`);
    if (durationSeconds === null || this.routine.id !== routine.id) return;
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
    await this.write(touchRoutine(this.routine, this.deps.now()));
  }

  /** Writes this routine to this device as it is (edit time included), replacing any pending autosave. */
  private async write(saved: Routine): Promise<void> {
    const database = this.deps.database;
    if (!database) return;
    this.cancelPendingSave();
    try {
      await saveRoutine(database, saved);
    } catch (error) {
      if (!isStorageFailure(error)) throw error;
      this.store.setState({ saveStatus: "failed" });
      this.notify("error", "Couldn't save on this device. Export your routine to keep your work.");
      return;
    }
    const others = this.state.savedRoutines.filter((candidate) => candidate.id !== saved.id);
    this.store.setState({ saveStatus: "saved", savedRoutines: [saved, ...others] });
  }
}

function replaceDetails(existing: Routine, incoming: Routine): ReplaceDetails {
  return {
    existingName: existing.name,
    incomingUpdatedAt: incoming.updatedAt,
    isOlderThanStored: Date.parse(incoming.updatedAt) < Date.parse(existing.updatedAt),
  };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
