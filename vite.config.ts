// Relative base so the built site works from any GitHub Pages sub-path.
// The Content Security Policy is injected into the built page only: GitHub Pages can't
// send response headers, so a <meta> tag is the only option, and Vite's dev server
// injects inline styles for hot reload that a strict policy would block. The app sets
// every position through element.style (CSSOM), so no 'unsafe-inline' is needed;
// media-src blob: is for the song's object URL.
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "formation-lite:content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY }, injectTo: "head-prepend" },
    ],
  };
}

export default defineConfig({
  base: "./",
  plugins: [contentSecurityPolicy()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
