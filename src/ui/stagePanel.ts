// Sidebar "Stage": open stage by default; optionally a real width × depth that rescales the grid.
import type { Controller } from "../app/controller";
import { currentRoutine, type AppState } from "../app/state";
import { watch } from "../app/store";
import { setStageSize } from "../model/edits";
import { STAGE_DIMENSION_MAX, type LengthUnit, type StageSize } from "../model/types";
import { el, syncInputValue } from "./dom";

export const DEFAULT_STAGE_SIZE: StageSize = { width: 40, depth: 30, unit: "ft" };

export function mountStagePanel(root: HTMLElement, controller: Controller): void {
  const sizedToggle = el("input", { type: "checkbox" });
  const widthInput = el("input", { type: "number", min: 1, max: STAGE_DIMENSION_MAX, step: "0.5", "aria-label": "Stage width" });
  const depthInput = el("input", { type: "number", min: 1, max: STAGE_DIMENSION_MAX, step: "0.5", "aria-label": "Stage depth" });
  const unitSelect = el("select", { "aria-label": "Unit" }, [el("option", { value: "ft" }, ["ft"]), el("option", { value: "m" }, ["m"])]);
  const sizeFields = el("div", { class: "size-fields" }, [widthInput, el("span", {}, ["×"]), depthInput, unitSelect]);

  root.append(
    el("h2", {}, ["Stage"]),
    el("label", { class: "checkbox" }, [sizedToggle, "Set the real stage size"]),
    sizeFields,
    el("p", { class: "hint" }, ["Width × depth. Dancers keep their relative spots when you change it."]),
  );

  const apply = (size: StageSize | null) => {
    if (!controller.edit((routine) => setStageSize(routine, size))) render(controller.store.getState());
  };
  sizedToggle.addEventListener("change", () => apply(sizedToggle.checked ? DEFAULT_STAGE_SIZE : null));
  const applyFields = () =>
    apply({ width: Number(widthInput.value), depth: Number(depthInput.value), unit: unitSelect.value as LengthUnit });
  widthInput.addEventListener("change", applyFields);
  depthInput.addEventListener("change", applyFields);
  unitSelect.addEventListener("change", applyFields);

  const render = (state: AppState) => {
    const size = currentRoutine(state).stage.size;
    sizedToggle.checked = size !== null;
    sizeFields.hidden = size === null;
    if (size) {
      syncInputValue(widthInput, String(size.width));
      syncInputValue(depthInput, String(size.depth));
      unitSelect.value = size.unit;
    }
  };
  watch(controller.store, (state) => [currentRoutine(state).stage.size], render);
}
