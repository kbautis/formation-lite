// Undo/redo as a stack of whole-routine snapshots, capped at HISTORY_LIMIT undo steps.
// During a drag the controller holds the live routine outside history and pushes once on
// pointer-up, so one drag is one undo step.
import { EditError } from "./errors";
import type { Routine } from "./types";

export const HISTORY_LIMIT = 100;

export interface History {
  readonly past: readonly Routine[];
  readonly present: Routine;
  readonly future: readonly Routine[];
}

export function createHistory(present: Routine): History {
  return { past: [], present, future: [] };
}

export function pushHistory(history: History, next: Routine): History {
  if (next === history.present) return history;
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History): boolean {
  return history.future.length > 0;
}

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1];
  if (!previous) throw new EditError("Nothing to undo.");
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (!next) throw new EditError("Nothing to redo.");
  return { past: [...history.past, history.present], present: next, future: rest };
}

/** For metadata the user doesn't think of as an edit (e.g. song info): changes the present, keeps the undo stack. */
export function replacePresent(history: History, present: Routine): History {
  return { ...history, present };
}
