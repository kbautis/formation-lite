// Architecture note (app state — revised after review, 2026-11-08)
// - One AppState in one store (store.ts). Components declare what they read with watch()
//   and call Controller methods; they never touch the model, storage, or audio directly.
// - The routine on screen IS history.present: there is no second copy to keep in sync.
//   Read it with currentRoutine(state). A drag updates the present in place
//   (replacePresent) and pushes one undo step when it ends.
// - Song info is device metadata, not an edit: loading a song writes it into every
//   history snapshot (mapHistory), so undo and redo never "unload" it.
// - Zoom stores the user's choice ("fit", or a manual px/s), never a derived value; the
//   timeline computes the fitted scale from its own measured width.
// - canEdit is false on phone-width screens (view-only layout, docs/requirements.md).
import { activeFormationAt } from "../model/interpolate";
import type { History } from "../model/history";
import type { ViewMode } from "../model/stage";
import type { Formation, Routine } from "../model/types";

export type SaveStatus = "saved" | "pending" | "failed" | "unavailable";

export interface Notice {
  readonly kind: "info" | "error";
  readonly text: string;
}

export interface LoadedSong {
  readonly fileName: string;
  readonly durationSeconds: number;
}

export type TimelineZoom = { readonly mode: "fit" } | { readonly mode: "manual"; readonly pixelsPerSecond: number };

export interface AppState {
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
  readonly zoom: TimelineZoom;
  /** Draw each dancer's path from the previous formation while editing. */
  readonly showPaths: boolean;
  /** Warn when dancers pass too close mid-transition. A per-device preference, on by default. */
  readonly checkCollisions: boolean;
}

export const MIN_PIXELS_PER_SECOND = 0.5;
export const MAX_PIXELS_PER_SECOND = 200;

/** The routine on screen. */
export function currentRoutine(state: AppState): Routine {
  return state.history.present;
}

/** The formation held at the playhead, or null while dancers are moving between formations. */
export function activeFormation(state: AppState): Formation | null {
  return activeFormationAt(currentRoutine(state), state.playheadSeconds);
}

export function clampZoom(pixelsPerSecond: number): number {
  return Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, pixelsPerSecond));
}
