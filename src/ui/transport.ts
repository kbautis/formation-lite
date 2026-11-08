// Transport bar: play/pause, time and count readout, add formation, flip view, paths and
// collision toggles, undo/redo, zoom.
import type { Controller } from "../app/controller";
import { currentRoutine, type AppState } from "../app/state";
import { watch } from "../app/store";
import type { TimelineScale } from "./timelineView";
import { countLabelAt } from "../model/tempo";
import { formatTime } from "../model/time";
import { el } from "./dom";

const ZOOM_STEP = 1.5;

export function mountTransport(root: HTMLElement, controller: Controller, timeline: TimelineScale): void {
  const playButton = el("button", { type: "button", class: "play-button primary" });
  const time = el("span", { class: "time-readout" });
  const count = el("span", { class: "count-readout" });
  const addButton = el("button", { type: "button", "data-edit-only": true }, ["+ Formation"]);
  const flipButton = el("button", { type: "button", "aria-pressed": "false" });
  const pathsButton = el("button", { type: "button", "data-edit-only": true, "aria-label": "Show paths", title: "Show each dancer's path from the previous formation" }, ["Paths"]);
  const collisionsButton = el(
    "button",
    { type: "button", "data-edit-only": true, "aria-label": "Warn about collisions", title: "Warn when dancers pass too close mid-transition" },
    ["Collisions"],
  );
  const undoButton = el("button", { type: "button", "data-edit-only": true, "aria-label": "Undo" }, ["Undo"]);
  const redoButton = el("button", { type: "button", "data-edit-only": true, "aria-label": "Redo" }, ["Redo"]);
  const zoomOut = el("button", { type: "button", class: "icon-button", "aria-label": "Zoom timeline out" }, ["−"]);
  const zoomIn = el("button", { type: "button", class: "icon-button", "aria-label": "Zoom timeline in" }, ["+"]);
  const zoomFit = el("button", { type: "button", "aria-label": "Fit timeline to window", title: "Show the whole song" }, ["Fit"]);

  root.append(
    playButton,
    el("div", { class: "readout" }, [time, count]),
    addButton,
    flipButton,
    pathsButton,
    collisionsButton,
    el("div", { class: "spacer" }),
    undoButton,
    redoButton,
    el("div", { class: "zoom" }, [zoomOut, zoomFit, zoomIn]),
  );

  playButton.addEventListener("click", () => controller.togglePlay());
  addButton.addEventListener("click", () => controller.addFormationAtPlayhead());
  flipButton.addEventListener("click", () => controller.toggleView());
  pathsButton.addEventListener("click", () => controller.togglePaths());
  collisionsButton.addEventListener("click", () => controller.toggleCollisionCheck());
  undoButton.addEventListener("click", () => controller.undo());
  redoButton.addEventListener("click", () => controller.redo());
  zoomOut.addEventListener("click", () => controller.zoomBy(1 / ZOOM_STEP, timeline.pixelsPerSecond()));
  zoomIn.addEventListener("click", () => controller.zoomBy(ZOOM_STEP, timeline.pixelsPerSecond()));
  zoomFit.addEventListener("click", () => controller.zoomToFit());

  const render = (state: AppState) => {
    playButton.textContent = state.isPlaying ? "Pause" : "Play";
    playButton.setAttribute("aria-label", state.isPlaying ? "Pause" : "Play");
    time.textContent = formatTime(state.playheadSeconds);
    const { tempo } = currentRoutine(state);
    count.textContent = tempo ? countLabelAt(tempo, state.playheadSeconds) : "";
    flipButton.textContent = state.view === "audience" ? "Audience view" : "Dancer view";
    flipButton.setAttribute("aria-pressed", String(state.view === "dancer"));
    flipButton.title = "Flip between the audience's view and the dancers' view";
    undoButton.disabled = !controller.canUndo();
    redoButton.disabled = !controller.canRedo();
    zoomFit.setAttribute("aria-pressed", String(state.zoom.mode === "fit"));
    pathsButton.setAttribute("aria-pressed", String(state.showPaths));
    collisionsButton.setAttribute("aria-pressed", String(state.checkCollisions));
  };
  watch(
    controller.store,
    (state) => [state.isPlaying, state.playheadSeconds, state.history, state.view, state.zoom, state.showPaths, state.checkCollisions],
    render,
  );
}
