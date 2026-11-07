// Shows the controller's current notice (errors, hints) and the persistent "not saving" banner.
import type { Controller } from "../app/controller";
import type { AppState } from "../app/state";
import { el } from "./dom";

export function mountNotice(root: HTMLElement, controller: Controller): void {
  const banner = el("div", { class: "storage-banner", role: "alert", hidden: true }, [
    "Not saving on this device. Export your routine to keep your work.",
  ]);
  const text = el("span");
  const dismiss = el("button", { type: "button", class: "notice-dismiss", "aria-label": "Dismiss" }, ["×"]);
  const notice = el("div", { class: "notice", role: "status", "aria-live": "polite", hidden: true }, [text, dismiss]);
  dismiss.addEventListener("click", () => controller.dismissNotice());
  root.append(banner, notice);

  const render = (state: AppState) => {
    banner.hidden = !(state.saveStatus === "unavailable" || state.saveStatus === "failed");
    notice.hidden = state.notice === null;
    notice.dataset.kind = state.notice?.kind ?? "";
    text.textContent = state.notice?.text ?? "";
  };
  controller.store.subscribe((next, previous) => {
    if (next.notice !== previous.notice || next.saveStatus !== previous.saveStatus) render(next);
  });
  render(controller.store.getState());
}
