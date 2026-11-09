// A number field for a length the choreographer counts: in counts when the routine has a
// BPM, in seconds without. Shared by the hold and Transition in fields.
import { beatsToSeconds, secondsToBeats } from "../model/tempo";
import type { Tempo } from "../model/types";
import { el, syncInputValue } from "./dom";

const DISPLAY_PRECISION = 100;

export interface DurationField {
  readonly label: HTMLLabelElement;
  readonly input: HTMLInputElement;
  show(seconds: number, tempo: Tempo | null): void;
  readSeconds(tempo: Tempo | null): number;
}

export function durationField(caption: string, ariaLabel: string): DurationField {
  const unit = el("span");
  const input = el("input", { type: "number", min: 0, inputmode: "decimal", "aria-label": ariaLabel });
  const label = el("label", { class: "field" }, [unit, input]);
  return {
    label,
    input,
    show(seconds, tempo) {
      unit.textContent = `${caption} (${tempo ? "counts" : "s"})`;
      input.step = tempo ? "1" : "0.25";
      const value = tempo ? secondsToBeats(tempo, seconds) : seconds;
      syncInputValue(input, String(Math.round(value * DISPLAY_PRECISION) / DISPLAY_PRECISION));
    },
    readSeconds(tempo) {
      const value = Number(input.value);
      return tempo ? beatsToSeconds(tempo, value) : value;
    },
  };
}
