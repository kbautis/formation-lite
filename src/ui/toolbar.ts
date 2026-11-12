// Header: routine name, routine picker, new/open file/export/share link/delete, save status.
import type { Controller } from "../app/controller";
import { currentRoutine, type AppState, type SaveStatus } from "../app/state";
import { watch } from "../app/store";
import { renameRoutine } from "../model/edits";
import { ROUTINE_NAME_MAX_LENGTH } from "../model/types";
import { el, syncInputValue } from "./dom";
import { replacePromptText } from "./format";

const SAVE_STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "Saved on this device",
  pending: "Saving…",
  failed: "Not saved",
  unavailable: "Not saving",
};

export function mountToolbar(root: HTMLElement, controller: Controller): void {
  const nameInput = el("input", {
    class: "routine-name",
    "aria-label": "Routine name",
    maxlength: ROUTINE_NAME_MAX_LENGTH,
    autocomplete: "off",
  });
  const picker = el("select", { class: "routine-picker", "aria-label": "Open a saved routine" });
  const newButton = el("button", { type: "button", "data-edit-only": true }, ["New"]);
  const importInput = el("input", { type: "file", accept: ".json,application/json", hidden: true });
  const importButton = el("button", { type: "button" }, ["Open file"]);
  const exportButton = el("button", { type: "button" }, ["Export"]);
  const shareButton = el("button", { type: "button", title: "Send this routine as a link. Export is still your backup." }, ["Share link"]);
  const deleteButton = el("button", { type: "button", class: "danger", "data-edit-only": true }, ["Delete"]);
  const status = el("span", { class: "save-status", title: "Your work saves in this browser. Export a file as your backup." });

  root.append(
    el("span", { class: "brand" }, ["formation-lite"]),
    nameInput,
    picker,
    el("div", { class: "toolbar-actions" }, [newButton, importButton, importInput, exportButton, shareButton, deleteButton, status]),
  );

  nameInput.addEventListener("change", () => {
    if (!controller.edit((routine) => renameRoutine(routine, nameInput.value))) {
      nameInput.value = controller.routine.name;
    }
  });
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") nameInput.blur();
  });
  picker.addEventListener("change", () => void controller.openRoutine(picker.value));
  newButton.addEventListener("click", () => {
    void controller.newRoutine().then(() => nameInput.select());
  });
  importButton.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    void controller.importRoutineFile(file, (details) => window.confirm(replacePromptText("file", details)));
  });
  exportButton.addEventListener("click", () => controller.exportCurrentRoutine());
  shareButton.addEventListener("click", () => {
    shareButton.disabled = true;
    void controller.shareCurrentRoutine().finally(() => (shareButton.disabled = false));
  });
  deleteButton.addEventListener("click", () => {
    const { routine } = controller;
    if (window.confirm(`Delete “${routine.name}” and its song from this device? This can't be undone.`)) {
      void controller.deleteCurrentRoutine();
    }
  });

  const renderPicker = (state: AppState) => {
    const routine = currentRoutine(state);
    const routines = state.savedRoutines.some((saved) => saved.id === routine.id) ? state.savedRoutines : [routine, ...state.savedRoutines];
    picker.replaceChildren(...routines.map((saved) => el("option", { value: saved.id, selected: saved.id === routine.id }, [saved.name])));
    picker.value = routine.id;
  };

  const render = (state: AppState) => {
    syncInputValue(nameInput, currentRoutine(state).name);
    nameInput.readOnly = !state.canEdit;
    status.textContent = SAVE_STATUS_TEXT[state.saveStatus];
    status.dataset.status = state.saveStatus;
  };
  watch(controller.store, (state) => [state.savedRoutines, currentRoutine(state).id], renderPicker);
  watch(controller.store, (state) => [currentRoutine(state).name, state.saveStatus, state.canEdit], render);
}
