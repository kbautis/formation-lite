import { describe, expect, it } from "vitest";
import { initials } from "../../src/ui/format";

describe("initials", () => {
  it("uses the first letter of the first two words", () => {
    expect(initials("Ana Reyes")).toBe("AR");
    expect(initials("ana maria reyes")).toBe("AM");
  });
  it("uses up to two letters of a single name", () => {
    expect(initials("Ben")).toBe("BE");
    expect(initials("J")).toBe("J");
  });
  it("ignores extra whitespace", () => {
    expect(initials("  Cam   Lee ")).toBe("CL");
  });
});
