// Browser smoke test against the built site (npm run smoke builds first).
// Drives the real workflow from docs/requirements.md in Chromium: create, add dancers,
// load a song, set BPM, place two formations, play, reload, export, import on a fresh
// profile, and open the phone (view-only) layout. Fails on any page error.
// Uses the machine's Playwright install (resolved through NODE_PATH), not a project dependency.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}/`;
const ARTIFACTS = path.resolve("smoke-artifacts");
const SONG_SECONDS = 12;
const PIXELS_PER_SECOND = 20;

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
  console.log(`${condition ? "ok  " : "FAIL"} ${message}`);
}

/** A mono 16-bit PCM WAV of a quiet 440 Hz tone, so the test needs no fixture file. */
function makeWav(seconds) {
  const sampleRate = 8000;
  const samples = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 3000), 44 + i * 2);
  return buffer;
}

async function startServer() {
  // Run Vite's own entry with this Node binary so kill() reaches the server itself, not a wrapper.
  const viteEntry = path.resolve("node_modules/vite/bin/vite.js");
  const server = spawn(process.execPath, [viteEntry, "preview", "--port", String(PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("preview server did not start")), 15000);
    server.stdout.on("data", (chunk) => {
      if (String(chunk).includes(String(PORT))) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.on("exit", (code) => reject(new Error(`preview server exited with ${code}`)));
  });
  return server;
}

function watchErrors(page, label) {
  page.on("pageerror", (error) => failures.push(`${label}: page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`${label}: console error: ${message.text()}`);
  });
}

async function openApp(context, label) {
  const page = await context.newPage();
  watchErrors(page, label);
  await page.goto(BASE_URL);
  await page.waitForSelector("body[data-ready='true']");
  return page;
}

// Dancers are found by name: the stage re-orders SVG nodes so the selected dancer draws on top.
function dancerNamed(page, name) {
  return page.locator(".dancer").filter({ has: page.locator("title", { hasText: name }) });
}

async function dancerTransform(page, name) {
  return dancerNamed(page, name).getAttribute("transform");
}

async function dragDancer(page, name, dx, dy) {
  const box = await dancerNamed(page, name).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

async function seekTimeline(page, seconds) {
  const box = await page.locator(".timeline-content").boundingBox();
  await page.mouse.click(box.x + seconds * PIXELS_PER_SECOND + 1, box.y + 10);
}

async function main() {
  await mkdir(ARTIFACTS, { recursive: true });
  const songPath = path.join(ARTIFACTS, "test-song.wav");
  await writeFile(songPath, makeWav(SONG_SECONDS));

  const server = await startServer();
  const browser = await chromium.launch();
  try {
    // ── Desktop: build a routine ────────────────────────────────────────────
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    const page = await openApp(desktop, "desktop");
    check((await page.locator(".routine-picker option").count()) === 1, "fresh device starts with exactly one routine");

    await page.fill(".routine-name", "Smoke Regionals");
    await page.press(".routine-name", "Enter");
    for (const name of ["Ana Reyes", "Ben Ito", "Cam Lee"]) {
      await page.fill(".add-dancer input", name);
      await page.press(".add-dancer input", "Enter");
    }
    check((await page.locator(".dancer").count()) === 3, "three dancers appear on stage");
    check((await page.locator(".dancer-initials").first().textContent()) === "AR", "dancer shows initials");

    await page.setInputFiles("[data-testid='song-input']", songPath);
    await page.waitForSelector(".song-name[data-state='loaded']");
    check((await page.locator(".song-name").textContent()).includes("test-song.wav"), "song loads and shows its name");

    await page.fill("input[aria-label='Beats per minute']", "120");
    await page.press("input[aria-label='Beats per minute']", "Enter");
    await page.locator("input[aria-label='Beats per minute']").blur();
    check((await page.locator(".count-mark.downbeat").count()) > 0, "BPM adds 8-count marks to the timeline");
    check((await page.locator(".count-readout").textContent()) === "8-count 1 · 1", "readout shows the count at the playhead");

    const before = await dancerTransform(page, "Ana Reyes");
    await dragDancer(page, "Ana Reyes", -120, 60);
    check((await dancerTransform(page, "Ana Reyes")) !== before, "dragging moves a dancer in the opening formation");

    await seekTimeline(page, 5);
    await page.click("text=+ Formation");
    check((await page.locator(".formation-block").count()) === 2, "a second formation is added at the playhead");
    const openingSpot = await dancerTransform(page, "Ben Ito");
    await dragDancer(page, "Ben Ito", 150, -80);
    const secondSpot = await dancerTransform(page, "Ben Ito");
    check(secondSpot !== openingSpot, "dragging moves a dancer in the new formation");

    await page.click("text=Undo");
    check((await dancerTransform(page, "Ben Ito")) === openingSpot, "undo puts the dancer back");
    await page.click("text=Redo");
    check((await dancerTransform(page, "Ben Ito")) === secondSpot, "redo moves the dancer again");

    await seekTimeline(page, 3.5);
    const midTransition = await dancerTransform(page, "Ben Ito");
    check(midTransition !== secondSpot && midTransition !== openingSpot, "between formations the dancer is somewhere in between");

    await page.click(".play-button");
    await page.waitForTimeout(1200);
    const playingTime = await page.locator(".time-readout").textContent();
    await page.click(".play-button");
    check(playingTime !== "0:03.5", `playback advances the time (${playingTime})`);

    await page.click("text=Audience view");
    check((await page.locator("text=Dancer view").count()) === 1, "flip switches to the dancer view");
    await page.click("text=Dancer view");

    await page.check("text=Set the real stage size");
    check((await page.locator(".audience-label").textContent()).includes("ft"), "setting a stage size shows real units");

    await page.screenshot({ path: path.join(ARTIFACTS, "desktop.png") });

    // ── Reload: everything is still there ───────────────────────────────────
    await page.waitForSelector(".save-status[data-status='saved']");
    await page.reload();
    await page.waitForSelector("body[data-ready='true']");
    await page.waitForSelector(".song-name[data-state='loaded']");
    check((await page.inputValue(".routine-name")) === "Smoke Regionals", "routine name survives a reload");
    check((await page.locator(".dancer").count()) === 3, "dancers survive a reload");
    check((await page.locator(".formation-block").count()) === 2, "formations survive a reload");
    check((await page.locator(".song-name").textContent()).includes("test-song.wav"), "song survives a reload");

    // ── Export ──────────────────────────────────────────────────────────────
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("text=Export")]);
    const exportPath = path.join(ARTIFACTS, download.suggestedFilename());
    await download.saveAs(exportPath);
    check(download.suggestedFilename() === "smoke-regionals.formation.json", `export file is named after the routine (${download.suggestedFilename()})`);

    // Re-importing an updated copy of a routine you already have asks first and keeps your song.
    let replacePrompt = "";
    page.once("dialog", (dialog) => {
      replacePrompt = dialog.message();
      void dialog.accept();
    });
    await page.setInputFiles(".app-header input[type='file']", exportPath);
    await page.waitForSelector(".notice:not([hidden])");
    check(replacePrompt.includes("Replace"), "re-importing a routine you have asks before replacing it");
    await page.waitForSelector(".song-name[data-state='loaded']");
    check((await page.locator(".routine-picker option").count()) === 1, "re-import replaces instead of duplicating");
    check((await page.locator(".song-name").textContent()).includes("test-song.wav"), "re-import keeps the song already on this device");
    await desktop.close();

    // ── Storage blocked: the app still works and says it isn't saving ───────
    const blocked = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await blocked.addInitScript(() => Object.defineProperty(window, "indexedDB", { value: undefined }));
    const blockedPage = await openApp(blocked, "blocked");
    check(await blockedPage.locator(".storage-banner").isVisible(), "blocked storage shows the not-saving banner");
    await blockedPage.fill(".add-dancer input", "Solo");
    await blockedPage.press(".add-dancer input", "Enter");
    check((await blockedPage.locator(".dancer").count()) === 1, "editing still works when storage is blocked");
    await blocked.close();

    // ── Fresh profile: import ───────────────────────────────────────────────
    const teammate = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const teammatePage = await openApp(teammate, "teammate");
    await teammatePage.setInputFiles(".app-header input[type='file']", exportPath);
    await teammatePage.waitForFunction(() => document.querySelector(".routine-name")?.value === "Smoke Regionals");
    check((await teammatePage.locator(".dancer").count()) === 3, "import on a fresh profile reproduces the dancers");
    check((await teammatePage.locator(".formation-block").count()) === 2, "import on a fresh profile reproduces the formations");
    check((await teammatePage.locator(".song-name[data-state='missing']").count()) === 1, "import asks for the song by name");
    await teammate.close();

    // ── Phone: view-only ────────────────────────────────────────────────────
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const phonePage = await openApp(phone, "phone");
    await phonePage.setInputFiles(".app-header input[type='file']", exportPath);
    await phonePage.waitForFunction(() => document.querySelector(".routine-name")?.value === "Smoke Regionals");
    check(!(await phonePage.locator(".sidebar").isVisible()), "phone layout hides the editing sidebar");
    check(!(await phonePage.locator("text=+ Formation").isVisible()), "phone layout hides add formation");
    check(await phonePage.locator(".play-button").isVisible(), "phone layout keeps play");
    await phonePage.click("text=Audience view");
    check((await phonePage.locator("text=Dancer view").count()) === 1, "phone layout can flip the view");
    await phonePage.screenshot({ path: path.join(ARTIFACTS, "phone.png") });
    await phone.close();
  } finally {
    await browser.close();
    server.kill();
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} smoke check(s) failed:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
    process.exit(1);
  }
  console.log("\nAll smoke checks passed.");
}

await main();
