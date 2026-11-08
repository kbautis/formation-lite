// Keyboard shortcuts: Space play/pause, ←/→ step one count (or one second), Ctrl/⌘+Z undo,
// Ctrl/⌘+Shift+Z or Ctrl+Y redo. Ignored while typing in a field.
import type { Controller } from "../app/controller";
import { beatsToSeconds } from "../model/tempo";

const STEP_SECONDS_WITHOUT_TEMPO = 1;

export function mountKeyboard(controller: Controller): void {
  window.addEventListener("keydown", (event) => {
    if (isTyping(event.target)) return;
    const modifier = event.metaKey || event.ctrlKey;
    if (event.key === " " && !modifier) {
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      controller.togglePlay();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const { routine } = controller;
      const { playheadSeconds } = controller.store.getState();
      const step = routine.tempo ? beatsToSeconds(routine.tempo, 1) : STEP_SECONDS_WITHOUT_TEMPO;
      event.preventDefault();
      controller.seek(playheadSeconds + (event.key === "ArrowLeft" ? -step : step));
    } else if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) controller.redo();
      else controller.undo();
    } else if (modifier && event.key.toLowerCase() === "y") {
      event.preventDefault();
      controller.redo();
    }
  });
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}
