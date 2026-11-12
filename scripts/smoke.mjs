// Browser smoke test against the built site (npm run smoke builds first).
// Drives the real workflow from docs/requirements.md in Chromium: create, add dancers,
// load a song, set BPM, place two formations, play, reload, export, import on a fresh
// profile, share a link (share sheet, clipboard, copy by hand) and open it on a fresh
// profile and a phone, and open the phone (view-only) layout. Fails on any page error.
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
// Long enough that, at the old fixed zoom (20 px/s), the timeline would be wider than the window.
const SONG_SECONDS = 90;

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

/** A routine where two dancers swap sides through the same point. */
function crossingRoutine() {
  const formation = (id, name, startSeconds, positions) => ({ id, name, startSeconds, holdSeconds: 2, stagger: null, positions });
  return {
    format: "formation-lite/routine",
    version: 2,
    id: "crossing-routine",
    name: "Crossing",
    createdAt: "2026-11-08T00:00:00.000Z",
    updatedAt: "2026-11-08T00:00:00.000Z",
    stage: { size: { width: 40, depth: 30, unit: "ft" } },
    song: null,
    tempo: null,
    dancers: [
      { id: "a", name: "Ana Reyes", color: "#e6194b" },
      { id: "b", name: "Ben Ito", color: "#3cb44b" },
    ],
    formations: [
      formation("f1", "Sides", 0, { a: { x: 0.2, y: 0.5 }, b: { x: 0.8, y: 0.5 } }),
      formation("f2", "Swapped", 6, { a: { x: 0.8, y: 0.5 }, b: { x: 0.2, y: 0.5 } }),
    ],
  };
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

async function openApp(context, label, url = BASE_URL) {
  const page = await context.newPage();
  watchErrors(page, label);
  // Record every Content Security Policy violation; any one fails the run.
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`CSP violation: ${event.violatedDirective} blocked ${event.blockedURI}`);
    });
  });
  await page.goto(url);
  await page.waitForSelector("body[data-ready='true']");
  return page;
}

/** Every routine record in this profile's IndexedDB, read directly (not through the app). */
function storedRoutines(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("formation-lite");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction("routines").objectStore("routines").getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            open.result.close();
            resolve(request.result);
          };
        };
      }),
  );
}

async function storedRoutineNamed(page, name) {
  return (await storedRoutines(page)).find((routine) => routine.name === name);
}

/** Records every dialog's message and answers it. */
function answerDialogs(page, accept) {
  const messages = [];
  page.on("dialog", (dialog) => {
    messages.push(dialog.message());
    void (accept ? dialog.accept() : dialog.dismiss());
  });
  return messages;
}

/** Opens a share link in a page already showing the app, the way a tap in a chat app would when the tab is open. */
async function followLinkInPlace(page, link) {
  await page.evaluate((hash) => {
    location.hash = hash;
  }, new URL(link).hash);
}

function tamper(link) {
  const middle = Math.floor((link.indexOf("#share=1.") + link.length) / 2);
  return `${link.slice(0, middle)}${link[middle] === "A" ? "B" : "A"}${link.slice(middle + 1)}`;
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

// The timeline is the song's length (no formation runs past it here), so its zoom is width / song length.
async function dragBy(page, locator, dx) {
  const box = await locator.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx / 2, y, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 + dx, y, { steps: 4 });
  await page.mouse.up();
}

async function seekTimeline(page, seconds) {
  const box = await page.locator(".timeline-content").boundingBox();
  await page.mouse.click(box.x + (seconds * box.width) / SONG_SECONDS + 1, box.y + 10);
}

function timelineFits(page) {
  return page.locator(".timeline-scroll").evaluate((node) => node.scrollWidth <= node.clientWidth + 1);
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
    const policyTag = page.locator("meta[http-equiv='Content-Security-Policy']");
    const policy = (await policyTag.count()) > 0 ? await policyTag.getAttribute("content") : null;
    check(policy !== null && !policy.includes("unsafe-inline"), "the built site sets a Content Security Policy without 'unsafe-inline'");

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

    // By default the whole song fits the timeline, whatever its length.
    check(await timelineFits(page), "the whole song fits in the timeline without scrolling");

    // Zoomed in, the timeline is wider than the screen; it must scroll inside itself, not widen the page.
    for (let step = 0; step < 5; step++) await page.click("[aria-label='Zoom timeline in']");
    const pageWidth = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    const timelineScrolls = await page.locator(".timeline-scroll").evaluate((node) => node.scrollWidth > node.clientWidth);
    check(pageWidth.scroll <= pageWidth.viewport && timelineScrolls, `a timeline wider than the screen scrolls inside itself (page ${pageWidth.scroll}px, window ${pageWidth.viewport}px)`);
    await page.click("[aria-label='Fit timeline to window']");
    check(await timelineFits(page), "Fit returns the whole song to view");

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

    // Dragging a formation's right edge lengthens its hold; the sidebar shows it live; undo restores it.
    const holdInput = page.locator("input[aria-label='Hold length']");
    const holdBefore = Number(await holdInput.inputValue());
    const handleBox = await page.locator(".formation-block").nth(1).locator("[data-edge='end']").boundingBox();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 40, handleBox.y + handleBox.height / 2, { steps: 4 });
    await page.mouse.move(handleBox.x + 80, handleBox.y + handleBox.height / 2, { steps: 4 });
    await page.mouse.up();
    const holdAfter = Number(await holdInput.inputValue());
    check(holdAfter > holdBefore, `dragging a formation's edge lengthens its hold (${holdBefore} → ${holdAfter} counts)`);
    check(Number.isInteger(holdAfter), "a dragged hold snaps to whole counts when there is a BPM");
    check((await page.locator(".formation-editor .hint").textContent()).includes("Holds until"), "the sidebar says when the hold ends");
    await page.click("text=Undo");
    check(Number(await holdInput.inputValue()) === holdBefore, "undo restores the hold in one step");

    // Dragging the left edge moves the start and keeps the end.
    const startInput = page.locator("input[aria-label='Start in seconds']");
    const startBefore = Number(await startInput.inputValue());
    const endBefore = await page.locator(".formation-editor .hint").textContent();
    await dragBy(page, page.locator(".formation-block").nth(1).locator("[data-edge='start']"), 25);
    check(Number(await startInput.inputValue()) > startBefore, "dragging a formation's left edge moves its start later");
    check((await page.locator(".formation-editor .hint").textContent()) === endBefore, "dragging the left edge keeps the formation's end");
    await page.click("text=Undo");

    // Transitions are visible, and an edge drag always leaves at least 1 count to move in.
    check((await page.locator(".transition-segment").count()) === 1, "the transition between formations shows on the timeline");
    await dragBy(page, page.locator(".formation-block").nth(0).locator("[data-edge='end']"), 400);
    check((await page.locator(".transition-segment").first().getAttribute("data-label")) === "1 count", "dragging a hold into the next formation stops 1 count short");
    await page.click("text=Undo");

    // Paths from the previous formation show while on a formation, and can be hidden.
    await page.locator(".formation-block").nth(1).click();
    check((await page.locator(".paths .path").count()) === 3, "each dancer's path from the previous formation is drawn");
    await page.click("[aria-label='Show paths']");
    check((await page.locator(".paths .path").count()) === 0, "paths can be hidden");
    await page.click("[aria-label='Show paths']");

    // Ripple: dancers move one after another; the choice is saved with the routine.
    check(await page.locator("input[aria-label='Transition in']").isVisible(), "the sidebar shows Transition in for a formation after the first");
    await page.selectOption("select[aria-label='Ripple order']", "left-to-right");
    check(await page.locator("input[aria-label='Ripple spread']").isVisible(), "choosing a ripple shows its spread");

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

    // The stage takes precedence: the floor fills most of the stage area, and hiding the sidebar widens it.
    const floorShare = await page.evaluate(() => {
      const floor = document.querySelector(".floor").getBoundingClientRect();
      const svg = document.querySelector(".stage-svg").getBoundingClientRect();
      return Math.max(floor.width / svg.width, floor.height / svg.height);
    });
    check(floorShare >= 0.8, `the stage floor fills most of the stage area (${Math.round(floorShare * 100)}%)`);
    // A wide floor is limited by the window's width, which is where hiding the sidebar helps.
    await page.fill("input[aria-label='Stage width']", "60");
    await page.press("input[aria-label='Stage width']", "Enter");
    await page.fill("input[aria-label='Stage depth']", "25");
    await page.press("input[aria-label='Stage depth']", "Enter");
    const floorWidthWithSidebar = (await page.locator(".floor").boundingBox()).width;
    await page.click("text=Hide panels");
    check(!(await page.locator(".sidebar").isVisible()), "hide panels hides the sidebar");
    const floorWidthWithoutSidebar = (await page.locator(".floor").boundingBox()).width;
    check(floorWidthWithoutSidebar > floorWidthWithSidebar, `hiding panels makes the stage bigger (${Math.round(floorWidthWithSidebar)} → ${Math.round(floorWidthWithoutSidebar)} px)`);
    await page.screenshot({ path: path.join(ARTIFACTS, "desktop-panels-hidden.png") });
    await page.click("text=Show panels");
    check(await page.locator(".sidebar").isVisible(), "show panels brings the sidebar back");

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
    await page.locator(".formation-block").nth(1).click();
    check((await page.inputValue("select[aria-label='Ripple order']")) === "left-to-right", "the ripple survives a reload");

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

    // ── Share link: share sheet, then clipboard, then copy by hand ──────────
    const shareButton = page.locator("button:has-text('Share link')");
    await page.evaluate(() => {
      navigator.canShare = () => true;
      navigator.share = async (data) => {
        window.sharedLink = data.url;
      };
    });
    await shareButton.click();
    await page.waitForFunction(() => typeof window.sharedLink === "string");
    const firstLink = await page.evaluate(() => window.sharedLink);
    check(firstLink.startsWith(`${BASE_URL}#share=1.`), `Share link goes through the share sheet with an encoding 1 link (${firstLink.length} characters)`);
    const sharedCopy = await storedRoutineNamed(page, "Smoke Regionals");

    await desktop.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(BASE_URL).origin });
    await page.evaluate(() => {
      navigator.canShare = () => false;
    });
    await page.waitForTimeout(10);
    await shareButton.click();
    await page.waitForSelector(".notice:not([hidden]):has-text('Link copied')");
    const copiedLink = await page.evaluate(() => navigator.clipboard.readText());
    check(copiedLink.startsWith(`${BASE_URL}#share=1.`), "without a share sheet the link is copied to the clipboard");

    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
    });
    await page.waitForTimeout(10);
    await shareButton.click();
    await page.waitForSelector(".share-field:not([hidden])");
    const manual = await page.locator(".share-link-input").evaluate((input) => ({
      value: input.value,
      selected: document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length,
      readOnly: input.readOnly,
    }));
    check(manual.value.startsWith(`${BASE_URL}#share=1.`) && manual.selected && manual.readOnly, "without a clipboard the link is shown selected in a read-only field");
    const newestLink = manual.value;
    await page.click(".share-field button:has-text('Done')");
    check(!(await page.locator(".share-field").isVisible()), "the copy-by-hand field closes");

    // Opening a link of a routine you already have (accepting the replace prompt) keeps your song.
    page.once("dialog", (dialog) => void dialog.accept());
    await followLinkInPlace(page, firstLink);
    await page.waitForSelector(".notice:not([hidden]):has-text('Opened')");
    check(await page.evaluate(() => location.hash === ""), "an opened link is cleared from the address bar");
    await page.waitForSelector(".song-name[data-state='loaded']");
    check((await page.locator(".song-name").textContent()).includes("test-song.wav"), "opening a link of a routine you have keeps the song already on this device");
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

    // Two dancers who swap places through each other are flagged.
    const crossingPath = path.join(ARTIFACTS, "crossing.formation.json");
    await writeFile(crossingPath, JSON.stringify(crossingRoutine()));
    await teammatePage.setInputFiles(".app-header input[type='file']", crossingPath);
    await teammatePage.waitForFunction(() => document.querySelector(".routine-name")?.value === "Crossing");
    await teammatePage.locator(".formation-block").nth(1).click();
    check((await teammatePage.locator(".transition-segment.has-collision").count()) === 1, "a crossing transition is flagged on the timeline");
    check((await teammatePage.locator(".path.collides").count()) === 2, "both crossing paths are drawn as collisions");
    check((await teammatePage.locator(".encounter").first().textContent()).includes("Ana Reyes and Ben Ito"), "the sidebar names who passes too close");
    await teammatePage.screenshot({ path: path.join(ARTIFACTS, "crossing.png") });

    // The collision check is optional.
    await teammatePage.click("[aria-label='Warn about collisions']");
    check(
      (await teammatePage.locator(".transition-segment.has-collision, .path.collides, .encounter").count()) === 0,
      "turning collisions off removes every collision warning",
    );
    check((await teammatePage.locator(".paths .path").count()) === 2, "paths still show with collisions off");
    await teammatePage.click("[aria-label='Warn about collisions']");
    check((await teammatePage.locator(".encounter").count()) === 1, "turning collisions back on restores the warnings");
    await teammate.close();


    // ── Share link on a fresh profile ───────────────────────────────────────
    const linkContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const linkPage = await openApp(linkContext, "link", firstLink);
    const linkDialogs = answerDialogs(linkPage, true);
    await linkPage.waitForFunction(() => document.querySelector(".routine-name")?.value === "Smoke Regionals");
    check(await linkPage.evaluate(() => location.hash === "" && location.pathname.length > 0), "after a link opens, the address bar no longer carries the routine");
    check(JSON.stringify(await storedRoutineNamed(linkPage, "Smoke Regionals")) === JSON.stringify(sharedCopy), "a link reproduces the routine exactly on a fresh profile");
    check((await linkPage.locator(".dancer").count()) === 3 && (await linkPage.locator(".formation-block").count()) === 2, "the linked routine shows its dancers and formations");
    check((await linkPage.locator(".song-name[data-state='missing']").count()) === 1, "the song is not in the link; the app asks for it by name");
    check(linkDialogs.length === 0, "opening a routine new to this device does not ask to replace anything");

    const routinesBeforeReload = (await storedRoutines(linkPage)).length;
    await linkPage.reload();
    await linkPage.waitForSelector("body[data-ready='true']");
    await linkPage.waitForTimeout(300);
    check(
      linkDialogs.length === 0 &&
        (await storedRoutines(linkPage)).length === routinesBeforeReload &&
        (await linkPage.inputValue(".routine-name")) === "Smoke Regionals" &&
        (await linkPage.locator(".notice:not([hidden]):has-text('Opened')").count()) === 0,
      "reloading after a link opens does not offer it again",
    );

    await followLinkInPlace(linkPage, newestLink);
    await linkPage.waitForFunction(() => document.querySelector(".notice:not([hidden])")?.textContent.includes("Opened"));
    check(linkDialogs.length === 1 && linkDialogs[0].includes("Replace") && linkDialogs[0].includes("Shared "), `a newer link asks before replacing and says when it was shared (${JSON.stringify(linkDialogs[0])})`);
    check(!linkDialogs[0].includes("older"), "a newer link is not flagged as older");

    await linkPage.click(".notice-dismiss");
    const olderAnswers = [];
    linkPage.removeAllListeners("dialog");
    linkPage.on("dialog", (dialog) => {
      olderAnswers.push(dialog.message());
      void dialog.dismiss();
    });
    const beforeOlder = await storedRoutines(linkPage);
    await followLinkInPlace(linkPage, firstLink);
    await linkPage.waitForFunction(() => location.hash === "");
    await linkPage.waitForTimeout(300);
    check(olderAnswers.length === 1 && olderAnswers[0].includes("This link is older than your copy."), "an older link is flagged before anything is replaced");
    check(JSON.stringify(await storedRoutines(linkPage)) === JSON.stringify(beforeOlder), "keeping your copy changes nothing");

    const beforeTamper = await storedRoutines(linkPage);
    await followLinkInPlace(linkPage, tamper(newestLink));
    await linkPage.waitForSelector(".notice[data-kind='error']:not([hidden])");
    check((await linkPage.locator(".notice").textContent()).includes("Couldn't open this link"), "a tampered link is rejected with a clear message");
    check(olderAnswers.length === 1, "a tampered link never reaches the replace prompt");
    check(JSON.stringify(await storedRoutines(linkPage)) === JSON.stringify(beforeTamper), "a tampered link changes nothing on the device");

    await linkPage.click(".notice-dismiss");
    await linkPage.waitForSelector(".notice", { state: "hidden" });
    await followLinkInPlace(linkPage, newestLink.slice(0, Math.floor(newestLink.length * 0.8)));
    await linkPage.waitForSelector(".notice[data-kind='error']:not([hidden])");
    check((await linkPage.locator(".notice").textContent()).includes("cut off"), "a cut-off link is rejected as damaged or cut off");
    check(JSON.stringify(await storedRoutines(linkPage)) === JSON.stringify(beforeTamper), "a cut-off link changes nothing on the device");
    await linkPage.screenshot({ path: path.join(ARTIFACTS, "link-rejected.png") });
    await linkContext.close();

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
    check(await phonePage.locator("button:has-text('Share link')").isVisible(), "phone layout keeps Share link");
    await phonePage.screenshot({ path: path.join(ARTIFACTS, "phone.png") });
    await phone.close();

    // ── Phone: open a share link ────────────────────────────────────────────
    const phoneLinkContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const phoneLinkPage = await openApp(phoneLinkContext, "phone link", newestLink);
    await phoneLinkPage.waitForFunction(() => document.querySelector(".routine-name")?.value === "Smoke Regionals");
    check(!(await phoneLinkPage.locator(".sidebar").isVisible()) && (await phoneLinkPage.locator(".play-button").isVisible()), "a link opens in the phone's view-only layout");
    check((await phoneLinkPage.locator(".dancer").count()) === 3, "the linked routine shows its dancers on the phone");
    check(await phoneLinkPage.evaluate(() => location.hash === ""), "the phone's address bar no longer carries the routine");
    await phoneLinkPage.screenshot({ path: path.join(ARTIFACTS, "phone-link.png") });
    await phoneLinkContext.close();
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
