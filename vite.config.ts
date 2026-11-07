// Relative base so the built site works from any GitHub Pages sub-path.
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
