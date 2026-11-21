import { describe, expect, it } from "vitest";
import { deliverLink, type ShareNavigator } from "../../src/io/shareDelivery";

const LINK = { title: "Regionals", url: "https://example.github.io/formation-lite/#share=1.abc" };

/** A navigator whose share sheet and clipboard each test scripts. */
function fakeNavigator(options: {
  readonly canShare?: boolean;
  readonly share?: "accept" | "cancel" | "fail";
  readonly clipboard?: "works" | "refuses";
}): ShareNavigator & { readonly shared: ShareData[]; readonly copied: string[] } {
  const shared: ShareData[] = [];
  const copied: string[] = [];
  const navigator: ShareNavigator & { shared: ShareData[]; copied: string[] } = { shared, copied };
  if (options.canShare !== undefined) navigator.canShare = () => options.canShare!;
  if (options.share) {
    navigator.share = async (data) => {
      if (options.share === "cancel") throw new DOMException("Share canceled", "AbortError");
      if (options.share === "fail") throw new DOMException("Not allowed", "NotAllowedError");
      shared.push(data);
    };
  }
  if (options.clipboard) {
    return {
      ...navigator,
      clipboard: {
        writeText: async (text: string) => {
          if (options.clipboard === "refuses") throw new DOMException("Write permission denied.", "NotAllowedError");
          copied.push(text);
        },
      },
    };
  }
  return navigator;
}

describe("deliverLink", () => {
  it("uses the share sheet when the browser accepts the link", async () => {
    const navigator = fakeNavigator({ canShare: true, share: "accept", clipboard: "works" });
    expect(await deliverLink(navigator, LINK)).toBe("shared");
    expect(navigator.shared).toEqual([LINK]);
    expect(navigator.copied).toHaveLength(0);
  });

  it("does nothing more when the share sheet is cancelled", async () => {
    const navigator = fakeNavigator({ canShare: true, share: "cancel", clipboard: "works" });
    expect(await deliverLink(navigator, LINK)).toBe("cancelled");
    expect(navigator.copied).toHaveLength(0);
  });

  it("copies the link when the share sheet fails for another reason", async () => {
    const navigator = fakeNavigator({ canShare: true, share: "fail", clipboard: "works" });
    expect(await deliverLink(navigator, LINK)).toBe("copied");
    expect(navigator.copied).toEqual([LINK.url]);
  });

  it("skips the share sheet when canShare refuses the link", async () => {
    const navigator = fakeNavigator({ canShare: false, share: "accept", clipboard: "works" });
    expect(await deliverLink(navigator, LINK)).toBe("copied");
    expect(navigator.shared).toHaveLength(0);
  });

  it("skips the share sheet when the browser has no canShare", async () => {
    const navigator = fakeNavigator({ share: "accept", clipboard: "works" });
    expect(await deliverLink(navigator, LINK)).toBe("copied");
    expect(navigator.shared).toHaveLength(0);
  });

  it("copies the link when there is no share sheet", async () => {
    const navigator = fakeNavigator({ clipboard: "works" });
    expect(await deliverLink(navigator, LINK)).toBe("copied");
  });

  it("fails when the clipboard refuses", async () => {
    expect(await deliverLink(fakeNavigator({ clipboard: "refuses" }), LINK)).toBe("failed");
  });

  it("fails when there is no clipboard", async () => {
    expect(await deliverLink(fakeNavigator({}), LINK)).toBe("failed");
  });
});
