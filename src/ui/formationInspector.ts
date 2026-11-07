// Sidebar "Formation": edits the formation held at the playhead (name, start, hold, delete).
// Hold is entered in counts when the routine has a BPM, in seconds otherwise.
import type { Controller } from "../app/controller";
import type { AppState } from "../app/state";
import { addFormationAt, removeFormation, renameFormation, updateFormationTiming } from "../model/edits";
import { activeFormationAt } from "../model/interpolate";
import { beatsToSeconds } from "../model/tempo";
import { FORMATION_NAME_MAX_LENGTH } from "../model/types";
import { el, syncInputValue } from "./dom";

const COUNT_PRECISION = 100;

export function mountFormationInspector(root: HTMLElement, controller: Controller, newId: () => string): void {
  const nameInput = el("input", { maxlength: FORMATION_NAME_MAX_LENGTH, "aria-label": "Formation name", placeholder: "Formation name" });
  const startInput = el("input", { type: "number", min: 0, step: "0.1", inputmode: "decimal", "aria-label": "Start in seconds" });
  const holdInput = el("input", { type: "number", min: 0, inputmode: "decimal", "aria-label": "Hold length" });
  const holdUnit = el("span");
  const deleteButton = el("button", { type: "button", class: "danger" }, ["Delete formation"]);
  const editor = el("div", { class: "formation-editor" }, [
    nameInput,
    el("label", { class: "field" }, [el("span", {}, ["Starts at (s)"]), startInput]),
    el("label", { class: "field" }, [holdUnit, holdInput]),
    deleteButton,
  ]);
  const addHereButton = el("button", { type: "button", class: "primary" }, ["Add formation here"]);
  const between = el("div", { class: "formation-between" }, [
    el("p", { class: "hint" }, ["Dancers are moving between formations here."]),
    addHereButton,
  ]);
  root.append(el("h2", {}, ["Formation"]), editor, between);

  const activeId = () => {
    const state = controller.store.getState();
    return activeFormationAt(state.routine, state.playheadSeconds)?.id ?? null;
  };
  const holdToSeconds = (value: number) => {
    const tempo = controller.store.getState().routine.tempo;
    return tempo ? beatsToSeconds(tempo, value) : value;
  };

  nameInput.addEventListener("change", () => {
    const id = activeId();
    if (id) controller.edit((routine) => renameFormation(routine, id, nameInput.value));
  });
  const applyTiming = () => {
    const id = activeId();
    if (!id) return;
    const startSeconds = Number(startInput.value);
    const holdSeconds = holdToSeconds(Number(holdInput.value));
    if (controller.edit((routine) => updateFormationTiming(routine, id, { startSeconds, holdSeconds }))) controller.seek(startSeconds);
    else render(controller.store.getState());
  };
  startInput.addEventListener("change", applyTiming);
  holdInput.addEventListener("change", applyTiming);
  deleteButton.addEventListener("click", () => {
    const id = activeId();
    if (id) controller.edit((routine) => removeFormation(routine, id));
  });
  addHereButton.addEventListener("click", () => {
    const seconds = controller.store.getState().playheadSeconds;
    controller.edit((routine) => addFormationAt(routine, { id: newId(), seconds }));
  });

  const render = (state: AppState) => {
    const formation = activeFormationAt(state.routine, state.playheadSeconds);
    editor.hidden = formation === null;
    between.hidden = formation !== null;
    if (!formation) return;
    const tempo = state.routine.tempo;
    syncInputValue(nameInput, formation.name);
    syncInputValue(startInput, String(Math.round(formation.startSeconds * 1000) / 1000));
    holdUnit.textContent = tempo ? "Holds for (counts)" : "Holds for (s)";
    holdInput.step = tempo ? "1" : "0.25";
    const hold = tempo ? (formation.holdSeconds * tempo.bpm) / 60 : formation.holdSeconds;
    syncInputValue(holdInput, String(Math.round(hold * COUNT_PRECISION) / COUNT_PRECISION));
    deleteButton.disabled = state.routine.formations.length === 1;
  };
  controller.store.subscribe((next, previous) => {
    if (next.routine !== previous.routine || next.playheadSeconds !== previous.playheadSeconds) render(next);
  });
  render(controller.store.getState());
}
