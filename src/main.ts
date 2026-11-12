// Entry point: open device storage, build the layout, mount components, start the controller.
import "./styles.css";
import { Controller } from "./app/controller";
import { readShareFragment } from "./io/shareLink";
import { watch } from "./app/store";
import { SongLoader } from "./playback/songLoader";
import { isStorageFailure, openDatabase } from "./storage/database";
import { el, requireElement } from "./ui/dom";
import { mountDancerPanel } from "./ui/dancerPanel";
import { mountFormationInspector } from "./ui/formationInspector";
import { mountTransitionPanel } from "./ui/transitionPanel";
import { mountKeyboard } from "./ui/keyboard";
import { mountNotice } from "./ui/notice";
import { replacePromptText } from "./ui/format";
import { mountShareField } from "./ui/shareField";
import { mountSidebarToggle } from "./ui/sidebarToggle";
import { mountSongPanel } from "./ui/songPanel";
import { mountStagePanel } from "./ui/stagePanel";
import { mountStageView } from "./ui/stageView";
import { mountTimelineView } from "./ui/timelineView";
import { mountToolbar } from "./ui/toolbar";
import { mountTransport } from "./ui/transport";

/** Below this width the app is a viewer: play, scrub, flip, no editing. */
export const VIEW_ONLY_MEDIA_QUERY = "(max-width: 720px)";
/** How long the browser gets to read a song's length before the file counts as unplayable. */
export const SONG_METADATA_TIMEOUT_MILLISECONDS = 10_000;

async function openDeviceStorage(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    return await openDatabase(indexedDB);
  } catch (error) {
    if (isStorageFailure(error)) return null;
    throw error;
  }
}

/** Asks the browser not to evict our data. Best effort: unsupported or refused is fine. */
async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Not supported or refused; exporting remains the backup.
  }
}

/** The app's own address, without fragment or query: what a share link is built on. */
function appUrl(): string {
  return `${location.origin}${location.pathname}`;
}

/**
 * Opens a share link in the address bar, if there is one. The fragment is removed first
 * (keeping path and query), so a reload or bookmark never offers the same snapshot again,
 * and only then decoded and imported (docs/architecture.md §4.6).
 */
async function openShareLinkInAddressBar(controller: Controller): Promise<void> {
  const fragment = readShareFragment(location.hash);
  if (fragment === null) return;
  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  await controller.importShareLink(fragment, (details) => window.confirm(replacePromptText("link", details)));
}

async function boot(): Promise<void> {
  const root = requireElement<HTMLElement>(document, "#app");
  const audio = el("audio", { preload: "auto", hidden: true });
  document.body.append(audio);

  const database = await openDeviceStorage();
  void requestPersistentStorage();
  const viewOnlyQuery = window.matchMedia(VIEW_ONLY_MEDIA_QUERY);
  const newId = () => crypto.randomUUID();
  const songs = new SongLoader(audio, {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    timeoutMilliseconds: SONG_METADATA_TIMEOUT_MILLISECONDS,
  });
  const controller = new Controller({
    database,
    songs,
    navigator,
    appUrl,
    newId,
    now: () => new Date(),
    nowMilliseconds: () => performance.now(),
    canEdit: !viewOnlyQuery.matches,
  });
  viewOnlyQuery.addEventListener("change", (event) => controller.setCanEdit(!event.matches));

  const header = el("header", { class: "app-header" });
  const notices = el("div", { class: "notice-region" });
  const stageArea = el("section", { class: "stage-area", "aria-label": "Stage" });
  const songSection = el("section", { class: "panel" });
  const stageSection = el("section", { class: "panel" });
  const dancerSection = el("section", { class: "panel" });
  const formationSection = el("section", { class: "panel" });
  const sidebar = el("aside", { id: "sidebar", class: "sidebar", "data-edit-only": true }, [formationSection, dancerSection, songSection, stageSection]);
  const transport = el("div", { class: "transport" });
  const timeline = el("div", { class: "timeline" });
  root.append(
    header,
    notices,
    el("main", { class: "workspace" }, [stageArea, sidebar]),
    el("footer", { class: "timeline-area" }, [transport, timeline]),
  );

  mountToolbar(header, controller);
  mountNotice(notices, controller);
  mountShareField(notices, controller);
  mountStageView(stageArea, controller);
  mountSongPanel(songSection, controller);
  mountStagePanel(stageSection, controller);
  mountDancerPanel(dancerSection, controller, newId);
  mountFormationInspector(formationSection, controller);
  mountTransitionPanel(formationSection, controller);
  const timelineScale = mountTimelineView(timeline, controller);
  mountTransport(transport, controller, timelineScale);
  mountSidebarToggle(transport);
  mountKeyboard(controller);

  watch(controller.store, (state) => [state.canEdit], (state) => document.body.classList.toggle("view-only", !state.canEdit));

  const flush = () => void controller.flushPendingSave();
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  await controller.start();
  await openShareLinkInAddressBar(controller);
  window.addEventListener("hashchange", () => void openShareLinkInAddressBar(controller));
  document.body.dataset.ready = "true";
}

void boot();
