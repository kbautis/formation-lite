import { describe, expect, it } from "vitest";
import { formatTime } from "../../src/model/time";

describe("formatTime", () => {
  it("formats minutes, seconds, and tenths", () => {
    expect(formatTime(0)).toBe("0:00.0");
    expect(formatTime(65.34)).toBe("1:05.3");
    expect(formatTime(183.99)).toBe("3:03.9");
  });
  it("rejects negative or non-finite times", () => {
    expect(() => formatTime(-1)).toThrow();
    expect(() => formatTime(Number.POSITIVE_INFINITY)).toThrow();
  });
});
