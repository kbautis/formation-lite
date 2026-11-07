// Architecture note (stage takes precedence)
// - The stage is the primary surface; the sidebar is secondary and can be hidden so the
//   stage gets the full width. This is a per-device layout preference, not routine data,
//   so it lives in a body class and localStorage, never in AppState or the share file.
// - localStorage can throw (private mode, blocked storage); the toggle still works for the
//   session and just isn't remembered.
// - The button is edit-only: the phone layout already hides the sidebar.
import { el } from "./dom";

const SIDEBAR_HIDDEN_KEY = "formation-lite:sidebar-hidden";
const HIDDEN_CLASS = "sidebar-hidden";

export function mountSidebarToggle(root: HTMLElement): void {
  const button = el("button", { type: "button", "data-edit-only": true, "aria-controls": "sidebar" });
  root.append(button);

  const apply = (hidden: boolean) => {
    document.body.classList.toggle(HIDDEN_CLASS, hidden);
    button.textContent = hidden ? "Show panels" : "Hide panels";
    button.setAttribute("aria-expanded", String(!hidden));
  };
  button.addEventListener("click", () => {
    const hidden = !document.body.classList.contains(HIDDEN_CLASS);
    apply(hidden);
    writeSidebarHidden(hidden);
  });
  apply(readSidebarHidden());
}

function readSidebarHidden(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_HIDDEN_KEY) === "true";
  } catch {
    return false;
  }
}

function writeSidebarHidden(hidden: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_HIDDEN_KEY, String(hidden));
  } catch {
    // Remembering the layout is a convenience; the toggle still works this session.
  }
}
