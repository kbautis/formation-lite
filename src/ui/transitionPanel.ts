// Architecture note (transitions UI)
// - Sidebar section for the transition INTO the formation at the playhead: its length
//   ("Transition in"), its ripple order and spread, and any close encounters in it.
// - Everything here edits through model functions (setTransitionIn, setStagger) via
//   controller.edit, so each change is one undo step and is validated like any edit.
// - Lengths are entered in counts with a BPM and seconds without, like the hold field.
// - Encounters come from closeEncounters (pure); "Show" seeks to the closest moment.
import type { Controller } from "../app/controller";
import type { AppState } from "../app/state";
import { closeEncounters, type Encounter } from "../model/collisions";
import { setStagger, setTransitionIn, transitionInSeconds } from "../model/edits";
import { activeFormationAt } from "../model/interpolate";
import { OPEN_STAGE_ROWS } from "../model/stage";
import { beatsToSeconds } from "../model/tempo";
import { formatTime } from "../model/time";
import { STAGGER_SPREAD_DEFAULT, STAGGER_SPREAD_MAX, STAGGER_SPREAD_MIN, type Routine, type StaggerOrder } from "../model/types";
import { el, syncInputValue } from "./dom";
import { formatDuration } from "./format";

const RIPPLE_LABELS: Record<StaggerOrder | "together", string> = {
  together: "Everyone together",
  "left-to-right": "Ripple left to right",
  "right-to-left": "Ripple right to left",
  "front-to-back": "Ripple front to back",
  "back-to-front": "Ripple back to front",
  "list-order": "Ripple in list order",
};
const PERCENT = 100;
const SPREAD_STEP_PERCENT = 5;
const DISTANCE_DECIMALS = 10;

export function mountTransitionPanel(root: HTMLElement, controller: Controller): void {
  const lengthInput = el("input", { type: "number", min: 0, inputmode: "decimal", "aria-label": "Transition in" });
  const lengthUnit = el("span");
  const orderSelect = el(
    "select",
    { "aria-label": "Ripple order" },
    Object.entries(RIPPLE_LABELS).map(([value, label]) => el("option", { value: value === "together" ? "" : value }, [label])),
  );
  const spreadInput = el("input", {
    type: "range",
    min: STAGGER_SPREAD_MIN * PERCENT,
    max: STAGGER_SPREAD_MAX * PERCENT,
    step: SPREAD_STEP_PERCENT,
    "aria-label": "Ripple spread",
  });
  const spreadField = el("label", { class: "field" }, [el("span", {}, ["Spread"]), spreadInput]);
  const lengthHint = el("p", { class: "hint" });
  const encounterList = el("ul", { class: "encounters" });
  const firstNote = el("p", { class: "hint" }, ["This is the first formation, so there's no transition into it."]);
  const editor = el("div", { class: "transition-fields" }, [
    el("label", { class: "field" }, [lengthUnit, lengthInput]),
    lengthHint,
    orderSelect,
    spreadField,
    encounterList,
  ]);
  const section = el("div", { class: "transition-editor" }, [el("h3", {}, ["Transition in"]), firstNote, editor]);
  root.append(section);

  const activeId = () => {
    const state = controller.store.getState();
    return activeFormationAt(state.routine, state.playheadSeconds)?.id ?? null;
  };
  const toSeconds = (value: number) => {
    const tempo = controller.store.getState().routine.tempo;
    return tempo ? beatsToSeconds(tempo, value) : value;
  };

  lengthInput.addEventListener("change", () => {
    const id = activeId();
    if (!id) return;
    if (!controller.edit((routine) => setTransitionIn(routine, id, toSeconds(Number(lengthInput.value))))) render(controller.store.getState());
  });
  const applyRipple = () => {
    const id = activeId();
    if (!id) return;
    const order = orderSelect.value as StaggerOrder | "";
    const spread = Number(spreadInput.value) / PERCENT;
    controller.edit((routine) => setStagger(routine, id, order ? { order, spread } : null));
  };
  orderSelect.addEventListener("change", applyRipple);
  spreadInput.addEventListener("change", applyRipple);

  const render = (state: AppState) => {
    const formation = activeFormationAt(state.routine, state.playheadSeconds);
    section.hidden = formation === null;
    if (!formation) return;
    const transition = transitionInSeconds(state.routine, formation.id);
    firstNote.hidden = transition !== null;
    editor.hidden = transition === null;
    if (transition === null) return;

    const tempo = state.routine.tempo;
    lengthUnit.textContent = tempo ? "Takes (counts)" : "Takes (s)";
    lengthInput.step = tempo ? "1" : "0.25";
    syncInputValue(lengthInput, String(tempo ? Math.round(((transition * tempo.bpm) / 60) * PERCENT) / PERCENT : Math.round(transition * PERCENT) / PERCENT));
    lengthHint.textContent =
      transition === 0
        ? "Instant: dancers jump into place. Give them time by shortening the previous hold."
        : `Dancers have ${formatDuration(transition, tempo)} to get here. Changing it moves when the previous formation releases; this one stays on its beat.`;

    if (document.activeElement !== orderSelect) orderSelect.value = formation.stagger?.order ?? "";
    spreadField.hidden = formation.stagger === null;
    if (document.activeElement !== spreadInput) spreadInput.value = String(Math.round((formation.stagger?.spread ?? STAGGER_SPREAD_DEFAULT) * PERCENT));

    renderEncounters(encounterList, closeEncounters(state.routine, formation.id), state.routine, controller);
  };

  controller.store.subscribe((next, previous) => {
    if (next.routine !== previous.routine || next.playheadSeconds !== previous.playheadSeconds) render(next);
  });
  render(controller.store.getState());
}

function renderEncounters(list: HTMLUListElement, encounters: readonly Encounter[], routine: Routine, controller: Controller): void {
  const names = new Map(routine.dancers.map((dancer) => [dancer.id, dancer.name]));
  list.replaceChildren(
    ...encounters.map((encounter) => {
      const show = el("button", { type: "button" }, ["Show"]);
      show.addEventListener("click", () => controller.seek(encounter.atSeconds));
      const who = `${names.get(encounter.dancerIds[0])} and ${names.get(encounter.dancerIds[1])}`;
      return el("li", { class: "encounter" }, [
        el("span", {}, [`${who} pass ${describeDistance(encounter)} apart at ${formatTime(encounter.atSeconds)}.`]),
        show,
      ]);
    }),
  );
}

function describeDistance(encounter: Encounter): string {
  if (encounter.unit) return `${Math.round(encounter.distance * DISTANCE_DECIMALS) / DISTANCE_DECIMALS} ${encounter.unit}`;
  // Open stage: depth is 1 and has OPEN_STAGE_ROWS grid rows.
  const squares = Math.round(encounter.distance * OPEN_STAGE_ROWS * DISTANCE_DECIMALS) / DISTANCE_DECIMALS;
  return `${squares} grid ${squares === 1 ? "square" : "squares"}`;
}
