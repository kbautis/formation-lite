// Architecture note (Task 7 — app shell)
// - One AppState in one store (store.ts). UI components subscribe and re-render only
//   when their slice changes; they call Controller methods and never touch the model,
//   storage, or audio directly.
// - The controller (controller.ts) is the only place that sequences side effects:
//   edit → history → state → debounced autosave, and the requestAnimationFrame loop
//   that copies clock.currentTime() into playheadSeconds.
// - During a drag, routine changes live in state without history; one history entry is
//   pushed on pointer-up, so one drag is one undo step.
// - Song info on the routine is metadata, not an edit: it is set with replacePresent and
//   carried across undo/redo so undo never "unloads" the song.
// - canEdit is false on phone-width screens (view-only layout, docs/requirements.md).
// - The timeline zooms to fit the window by default (timelineFit). The timeline view
//   measures its own width and calls applyTimelineFit; zooming by hand leaves fit mode.
import type { History } from "../model/history";
import type { ViewMode } from "../model/stage";
import type { Routine } from "../model/types";

export type SaveStatus = "saved" | "pending" | "failed" | "unavailable";

export interface Notice {
  readonly kind: "info" | "error";
  readonly text: string;
}

export interface LoadedSong {
  /** Object URL feeding the <audio> element. */
  readonly url: string;
  readonly fileName: string;
  readonly durationSeconds: number;
}

export interface AppState {
  readonly routine: Routine;
  readonly history: History;
  readonly savedRoutines: readonly Routine[];
  readonly playheadSeconds: number;
  readonly isPlaying: boolean;
  readonly view: ViewMode;
  readonly selectedDancerId: string | null;
  readonly loadedSong: LoadedSong | null;
  readonly saveStatus: SaveStatus;
  readonly notice: Notice | null;
  readonly canEdit: boolean;
  readonly pixelsPerSecond: number;
  /** True while the timeline is zoomed to fit the window; zooming by hand turns it off. */
  readonly timelineFit: boolean;
}

export const DEFAULT_PIXELS_PER_SECOND = 20;
export const MIN_PIXELS_PER_SECOND = 0.5;
export const MAX_PIXELS_PER_SECOND = 200;
