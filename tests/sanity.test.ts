import { describe, expect, it } from "vitest";
import { APP_NAME } from "../src/appInfo";

describe("scaffold", () => {
  it("exposes the app name used in the page title", () => {
    expect(APP_NAME).toBe("formation-lite");
  });
});
