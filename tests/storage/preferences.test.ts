import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPreference, writePreference } from "../../src/storage/preferences";

describe("preferences", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a value", () => {
    writePreference("formation-lite:test", "on");
    expect(readPreference("formation-lite:test")).toBe("on");
  });

  it("reads null when nothing is stored", () => {
    expect(readPreference("formation-lite:missing")).toBeNull();
  });

  it("degrades to 'nothing remembered' when storage throws (private mode, blocked storage)", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(readPreference("formation-lite:test")).toBeNull();
    expect(() => writePreference("formation-lite:test", "on")).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
