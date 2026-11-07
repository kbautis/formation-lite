// Transport bar: play/pause, time and count readout, add formation, flip view, undo/redo, zoom.
import type { Controller } from "../app/controller";
import type { AppState } from "../app/state";
import { addFormationAt } from "../model/edits";
import { countLabelAt } from "../model/tempo";
import { formatTime } from "../model/time";
import { el } from "./dom";

const ZOOM_STEP = 1.5;

export function mountTransport(root: HTMLElement, controller: Controller, newId: () => string): void {
  const playButton = el("button", { type: "button", class: "play-button primary" });
  const time = el("span", { class: "time-readout" });
  const count = el("span", { class: "count-readout" });
  const addButton = el("button", { type: "button", "data-edit-only": true }, ["+ Formation"]);
  const flipButton = el("button", { type: "button", "aria-pressed": "false" });
  const undoButton = el("button", { type: "button", "data-edit-only": true, "aria-label": "Undo" }, ["Undo"]);
  const redoButton = el("button", { type: "button", "data-edit-only": true, "aria-label": "Redo" }, ["Redo"]);
  const zoomOut = el("button", { type: "button", class: "icon-button", "aria-label": "Zoom timeline out" }, ["−"]);
  const zoomIn = el("button", { type: "button", class: "icon-button", "aria-label": "Zoom timeline in" }, ["+"]);

  root.append(
    playButton,
    el("div", { class: "readout" }, [time, count]),
    addButton,
    flipButton,
    el("div", { class: "spacer" }),
    undoButton,
    redoButton,
    el("div", { class: "zoom" }, [zoomOut, zoomIn]),
  );

  playButton.addEventListener("click", () => controller.togglePlay());
  addButton.addEventListener("click", () => {
    const seconds = controller.store.getState().playheadSeconds;
    controller.edit((routine) => addFormationAt(routine, { id: newId(), seconds }));
  });
  flipButton.addEventListener("click", () => controller.toggleView());
  undoButton.addEventListener("click", () => controller.undo());
  redoButton.addEventListener("click", () => controller.redo());
  zoomOut.addEventListener("click", () => controller.zoom(1 / ZOOM_STEP));
  zoomIn.addEventListener("click", () => controller.zoom(ZOOM_STEP));

  const render = (state: AppState) => {
    playButton.textContent = state.isPlaying ? "Pause" : "Play";
    playButton.setAttribute("aria-label", state.isPlaying ? "Pause" : "Play");
    time.textContent = formatTime(state.playheadSeconds);
    count.textContent = state.routine.tempo ? countLabelAt(state.routine.tempo, state.playheadSeconds) : "";
    flipButton.textContent = state.view === "audience" ? "Audience view" : "Dancer view";
    flipButton.setAttribute("aria-pressed", String(state.view === "dancer"));
    flipButton.title = "Flip between the audience's view and the dancers' view";
    undoButton.disabled = !controller.canUndo();
    redoButton.disabled = !controller.canRedo();
  };
  controller.store.subscribe(render);
  render(controller.store.getState());
}
