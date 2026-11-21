// Architecture note (Task 12 review — share delivery, docs/architecture.md §4.6)
// - One function, deliverLink(navigator, link), tries the share sheet, then the clipboard,
//   and says what happened; it never touches app state, notices or the DOM. The controller
//   owns the consequences (a notice when copied, the copy-by-hand field when it failed).
// - The navigator is injected (ShareNavigator: only the members used, each optional), so
//   tests drive every branch with a fake and the browser passes `navigator` itself.
// - Order: share sheet only when share exists and canShare accepts the link; a cancel
//   (AbortError, per the Web Share spec) ends there; any other share failure falls through
//   to the clipboard; no clipboard, or a refused write, is "failed". Plain branches only:
//   nothing throws to reach its own catch.
// - The share sheet and clipboard need recent user activation, and the link is encoded
//   after the click; a browser that refuses for that reason falls through to the next step.

/** The parts of `navigator` that sharing uses; each may be missing in a given browser. */
export interface ShareNavigator {
  canShare?(data: ShareData): boolean;
  share?(data: ShareData): Promise<void>;
  readonly clipboard?: { writeText(text: string): Promise<void> };
}

export interface LinkToDeliver {
  readonly title: string;
  readonly url: string;
}

/** What became of the link: shared through the sheet, cancelled there, copied, or neither. */
export type DeliveryResult = "shared" | "cancelled" | "copied" | "failed";

export async function deliverLink(navigator: ShareNavigator, link: LinkToDeliver): Promise<DeliveryResult> {
  const data = { title: link.title, url: link.url };
  if (navigator.share && navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      if (isAbortError(error)) return "cancelled";
    }
  }
  return copyToClipboard(navigator, link.url);
}

async function copyToClipboard(navigator: ShareNavigator, url: string): Promise<DeliveryResult> {
  if (!navigator.clipboard) return "failed";
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

/** A share sheet the user closed without sharing rejects with an AbortError. */
function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
