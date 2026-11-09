// Architecture note (transitions UI)
// - Sidebar section for the transition INTO the formation at the playhead: its length
//   ("Transition in"), its ripple order and spread, and any close encounters in it.
// - Everything here edits through model functions (setTransitionIn, setStagger) via
//   controller.edit, so each change is one undo step and is validated like any edit.
// - Lengths are entered in counts with a BPM and seconds without, like the hold field.
// - Encounters come from the shared per-routine cache (encountersFor), only while the
//   collision check is on; "Show" seeks to the closest moment.
import type { Controller } from "../app/controller";
import { activeFormation, currentRoutine, type AppState } from "../app/state";
import { watch } from "../app/store";
import { encountersFor, type Encounter } from "../model/collisions";
import { setStagger, setTransitionIn, transitionInSeconds } from "../model/edits";
import { OPEN_STAGE_ROWS } from "../model/stage";
import { formatTime } from "../model/time";
import { STAGGER_SPREAD_DEFAULT, STAGGER_SPREAD_MAX, STAGGER_SPREAD_MIN, type Routine, type StaggerOrder } from "../model/types";
import { el } from "./dom";
import { durationField } from "./durationField";
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
  const length = durationField("Takes", "Transition in");
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
    length.label,
    lengthHint,
    orderSelect,
    spreadField,
    encounterList,
  ]);
  const section = el("div", { class: "transition-editor" }, [el("h3", {}, ["Transition in"]), firstNote, editor]);
  root.append(section);

  const activeId = () => activeFormation(controller.store.getState())?.id ?? null;

  length.input.addEventListener("change", () => {
    const id = activeId();
    if (!id) return;
    const seconds = length.readSeconds(controller.routine.tempo);
    if (!controller.edit((routine) => setTransitionIn(routine, id, seconds))) render(controller.store.getState());
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
    const routine = currentRoutine(state);
    const formation = activeFormation(state);
    section.hidden = formation === null;
    if (!formation) return;
    const transition = transitionInSeconds(routine, formation.id);
    firstNote.hidden = transition !== null;
    editor.hidden = transition === null;
    if (transition === null) return;

    const tempo = routine.tempo;
    length.show(transition, tempo);
    lengthHint.textContent =
      transition === 0
        ? "Instant: dancers jump into place. Give them time by shortening the previous hold."
        : `Dancers have ${formatDuration(transition, tempo)} to get here. Changing it moves when the previous formation releases; this one stays on its beat.`;

    if (document.activeElement !== orderSelect) orderSelect.value = formation.stagger?.order ?? "";
    spreadField.hidden = formation.stagger === null;
    if (document.activeElement !== spreadInput) spreadInput.value = String(Math.round((formation.stagger?.spread ?? STAGGER_SPREAD_DEFAULT) * PERCENT));

    const encounters = state.checkCollisions ? (encountersFor(routine).get(formation.id) ?? []) : [];
    renderEncounters(encounterList, encounters, routine, controller);
  };

  watch(controller.store, (state) => [state.history.present, state.playheadSeconds, state.checkCollisions], render);
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
