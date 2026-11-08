import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, canRedo, canUndo, createHistory, mapHistory, pushHistory, redo, replacePresent, undo } from "../../src/model/history";
import { EditError } from "../../src/model/errors";
import { renameRoutine } from "../../src/model/edits";
import { validRoutineInput } from "../fixtures/routines";

const first = validRoutineInput();
const second = renameRoutine(first, "Second");
const third = renameRoutine(first, "Third");

describe("history", () => {
  it("starts with nothing to undo or redo", () => {
    const history = createHistory(first);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("undoes and redoes in order", () => {
    let history = pushHistory(pushHistory(createHistory(first), second), third);
    history = undo(history);
    expect(history.present.name).toBe("Second");
    history = undo(history);
    expect(history.present.name).toBe("Regionals 2027");
    history = redo(history);
    expect(history.present.name).toBe("Second");
  });

  it("drops the redo branch after a new edit", () => {
    let history = undo(pushHistory(createHistory(first), second));
    history = pushHistory(history, third);
    expect(canRedo(history)).toBe(false);
  });

  it("ignores a push of the same routine object", () => {
    const history = createHistory(first);
    expect(pushHistory(history, first)).toBe(history);
  });

  it(`keeps at most ${HISTORY_LIMIT} undo steps`, () => {
    let history = createHistory(first);
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) history = pushHistory(history, renameRoutine(first, `R${i}`));
    expect(history.past).toHaveLength(HISTORY_LIMIT);
  });

  it("throws when there is nothing to undo or redo", () => {
    expect(() => undo(createHistory(first))).toThrow(EditError);
    expect(() => redo(createHistory(first))).toThrow(EditError);
  });
});

describe("replacePresent", () => {
  it("swaps the present without adding an undo step", () => {
    const history = replacePresent(pushHistory(createHistory(first), second), third);
    expect(history.present.name).toBe("Third");
    expect(history.past).toHaveLength(1);
    expect(undo(history).present.name).toBe("Regionals 2027");
  });
});

describe("mapHistory", () => {
  it("applies a change to every snapshot, so undo never reverts it", () => {
    const history = mapHistory(undo(pushHistory(pushHistory(createHistory(first), second), third)), (routine) => ({ ...routine, name: `${routine.name}!` }));
    expect(history.present.name).toBe("Second!");
    expect(history.past.map((routine) => routine.name)).toEqual(["Regionals 2027!"]);
    expect(history.future.map((routine) => routine.name)).toEqual(["Third!"]);
  });
});
