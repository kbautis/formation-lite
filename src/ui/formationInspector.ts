// Sidebar "Formation": edits the formation held at the playhead (name, start, hold, delete).
// Hold is entered in counts when the routine has a BPM, in seconds otherwise.
import type { Controller } from "../app/controller";
import { activeFormation, currentRoutine, type AppState } from "../app/state";
import { watch } from "../app/store";
import { removeFormation, renameFormation, updateFormationTiming } from "../model/edits";
import { holdEnd } from "../model/interpolate";
import { formatTime } from "../model/time";
import { FORMATION_NAME_MAX_LENGTH } from "../model/types";
import { el, syncInputValue } from "./dom";
import { durationField } from "./durationField";

const START_PRECISION = 1000;

export function mountFormationInspector(root: HTMLElement, controller: Controller): void {
  const nameInput = el("input", { maxlength: FORMATION_NAME_MAX_LENGTH, "aria-label": "Formation name", placeholder: "Formation name" });
  const startInput = el("input", { type: "number", min: 0, step: "0.1", inputmode: "decimal", "aria-label": "Start in seconds" });
  const hold = durationField("Holds for", "Hold length");
  const holdHint = el("p", { class: "hint" });
  const deleteButton = el("button", { type: "button", class: "danger" }, ["Delete formation"]);
  const editor = el("div", { class: "formation-editor" }, [
    nameInput,
    el("label", { class: "field" }, [el("span", {}, ["Starts at (s)"]), startInput]),
    hold.label,
    holdHint,
    deleteButton,
  ]);
  const addHereButton = el("button", { type: "button", class: "primary" }, ["Add formation here"]);
  const between = el("div", { class: "formation-between" }, [
    el("p", { class: "hint" }, ["Dancers are moving between formations here."]),
    addHereButton,
  ]);
  root.append(el("h2", {}, ["Formation"]), editor, between);

  const activeId = () => activeFormation(controller.store.getState())?.id ?? null;

  nameInput.addEventListener("change", () => {
    const id = activeId();
    if (id) controller.edit((routine) => renameFormation(routine, id, nameInput.value));
  });
  const applyTiming = () => {
    const id = activeId();
    if (!id) return;
    const startSeconds = Number(startInput.value);
    const holdSeconds = hold.readSeconds(controller.routine.tempo);
    if (controller.edit((routine) => updateFormationTiming(routine, id, { startSeconds, holdSeconds }))) controller.seek(startSeconds);
    else render(controller.store.getState());
  };
  startInput.addEventListener("change", applyTiming);
  hold.input.addEventListener("change", applyTiming);
  deleteButton.addEventListener("click", () => {
    const id = activeId();
    if (id) controller.edit((routine) => removeFormation(routine, id));
  });
  addHereButton.addEventListener("click", () => controller.addFormationAtPlayhead());

  const render = (state: AppState) => {
    const routine = currentRoutine(state);
    const formation = activeFormation(state);
    editor.hidden = formation === null;
    between.hidden = formation !== null;
    if (!formation) return;
    syncInputValue(nameInput, formation.name);
    syncInputValue(startInput, String(Math.round(formation.startSeconds * START_PRECISION) / START_PRECISION));
    hold.show(formation.holdSeconds, routine.tempo);
    const next = routine.formations.find((candidate) => candidate.startSeconds > formation.startSeconds);
    holdHint.textContent =
      `Holds until ${formatTime(holdEnd(formation))}` +
      (next ? `; next formation at ${formatTime(next.startSeconds)}.` : ".") +
      " On the timeline, drag its left edge to change the start or its right edge to change the hold.";
    deleteButton.disabled = routine.formations.length === 1;
  };
  watch(controller.store, (state) => [state.history.present, state.playheadSeconds], render);
}
