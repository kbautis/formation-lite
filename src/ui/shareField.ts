// The copy-by-hand fallback for a share link: shown only when neither the share sheet nor
// the clipboard worked. The link goes into a read-only input's value (never markup), and
// the text is selected so one copy gesture takes it.
import type { Controller } from "../app/controller";
import type { AppState } from "../app/state";
import { watch } from "../app/store";
import { el } from "./dom";

export function mountShareField(root: HTMLElement, controller: Controller): void {
  const input = el("input", { class: "share-link-input", readonly: true, "aria-label": "Share link", autocomplete: "off", spellcheck: "false" });
  const close = el("button", { type: "button" }, ["Done"]);
  const panel = el("div", { class: "share-field", role: "dialog", "aria-label": "Copy the share link", hidden: true }, [
    el("span", {}, ["Copy this link and paste it in your team chat:"]),
    input,
    close,
  ]);
  root.append(panel);
  close.addEventListener("click", () => controller.dismissManualShareLink());
  input.addEventListener("focus", () => input.select());

  const render = (state: AppState) => {
    panel.hidden = state.manualShareLink === null;
    input.value = state.manualShareLink ?? "";
    if (state.manualShareLink !== null) {
      input.focus();
      input.select();
    }
  };
  watch(controller.store, (state) => [state.manualShareLink], render);
}
