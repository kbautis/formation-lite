// Sidebar "Dancers": add, rename, recolor, remove; clicking a row selects that dancer on stage.
import type { Controller } from "../app/controller";
import type { AppState } from "../app/state";
import { addDancer, removeDancer, updateDancer } from "../model/edits";
import { createDancer } from "../model/factory";
import { DANCER_NAME_MAX_LENGTH, MAX_DANCERS, type Dancer } from "../model/types";
import { el, syncInputValue } from "./dom";

interface DancerRow {
  readonly item: HTMLLIElement;
  readonly colorInput: HTMLInputElement;
  readonly nameInput: HTMLInputElement;
}

export function mountDancerPanel(root: HTMLElement, controller: Controller, newId: () => string): void {
  const countLabel = el("span", { class: "count" });
  const nameInput = el("input", { placeholder: "Dancer name", maxlength: DANCER_NAME_MAX_LENGTH, "aria-label": "New dancer name" });
  const addButton = el("button", { type: "submit" }, ["Add"]);
  const form = el("form", { class: "add-dancer" }, [nameInput, addButton]);
  const list = el("ul", { class: "dancer-list" });
  root.append(el("h2", {}, ["Dancers ", countLabel]), form, list);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const added = controller.edit((routine) =>
      addDancer(routine, createDancer({ id: newId(), name: nameInput.value, existing: routine.dancers })),
    );
    if (added) nameInput.value = "";
    nameInput.focus();
  });

  const rows = new Map<string, DancerRow>();

  const createRow = (dancer: Dancer): DancerRow => {
    const colorInput = el("input", { type: "color", "aria-label": `Color for ${dancer.name}` });
    const rowName = el("input", { maxlength: DANCER_NAME_MAX_LENGTH, "aria-label": "Dancer name" });
    const removeButton = el("button", { type: "button", class: "icon-button", "aria-label": `Remove ${dancer.name}` }, ["×"]);
    const item = el("li", { "data-dancer-id": dancer.id }, [colorInput, rowName, removeButton]);
    colorInput.addEventListener("change", () => controller.edit((routine) => updateDancer(routine, dancer.id, { color: colorInput.value })));
    rowName.addEventListener("change", () => {
      if (!controller.edit((routine) => updateDancer(routine, dancer.id, { name: rowName.value }))) {
        rowName.value = dancer.name;
      }
    });
    rowName.addEventListener("focus", () => controller.selectDancer(dancer.id));
    item.addEventListener("click", () => controller.selectDancer(dancer.id));
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      controller.edit((routine) => removeDancer(routine, dancer.id));
    });
    return { item, colorInput, nameInput: rowName };
  };

  const render = (state: AppState) => {
    const dancers = state.routine.dancers;
    countLabel.textContent = `${dancers.length} / ${MAX_DANCERS}`;
    addButton.disabled = dancers.length >= MAX_DANCERS;
    const ids = new Set(dancers.map((dancer) => dancer.id));
    for (const [id, row] of rows) {
      if (!ids.has(id)) {
        row.item.remove();
        rows.delete(id);
      }
    }
    dancers.forEach((dancer, index) => {
      let row = rows.get(dancer.id);
      if (!row) {
        row = createRow(dancer);
        rows.set(dancer.id, row);
      }
      if (list.children[index] !== row.item) list.insertBefore(row.item, list.children[index] ?? null);
      row.colorInput.value = dancer.color;
      syncInputValue(row.nameInput, dancer.name);
      row.item.classList.toggle("selected", dancer.id === state.selectedDancerId);
    });
  };
  controller.store.subscribe((next, previous) => {
    if (next.routine.dancers !== previous.routine.dancers || next.selectedDancerId !== previous.selectedDancerId) render(next);
  });
  render(controller.store.getState());
}
