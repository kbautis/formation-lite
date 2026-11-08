// Entry point: open device storage, build the layout, mount components, start the controller.
import "./styles.css";
import { Controller } from "./app/controller";
import { StorageError, openDatabase } from "./storage/database";
import { el, requireElement } from "./ui/dom";
import { mountDancerPanel } from "./ui/dancerPanel";
import { mountFormationInspector } from "./ui/formationInspector";
import { mountTransitionPanel } from "./ui/transitionPanel";
import { mountKeyboard } from "./ui/keyboard";
import { mountNotice } from "./ui/notice";
import { mountSidebarToggle } from "./ui/sidebarToggle";
import { mountSongPanel } from "./ui/songPanel";
import { mountStagePanel } from "./ui/stagePanel";
import { mountStageView } from "./ui/stageView";
import { mountTimelineView } from "./ui/timelineView";
import { mountToolbar } from "./ui/toolbar";
import { mountTransport } from "./ui/transport";

/** Below this width the app is a viewer: play, scrub, flip, no editing. */
export const VIEW_ONLY_MEDIA_QUERY = "(max-width: 720px)";

async function openDeviceStorage(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    return await openDatabase(indexedDB);
  } catch (error) {
    if (error instanceof StorageError || error instanceof DOMException) return null;
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

async function boot(): Promise<void> {
  const root = requireElement<HTMLElement>(document, "#app");
  const audio = el("audio", { preload: "auto", hidden: true });
  document.body.append(audio);

  const database = await openDeviceStorage();
  void requestPersistentStorage();
  const viewOnlyQuery = window.matchMedia(VIEW_ONLY_MEDIA_QUERY);
  const newId = () => crypto.randomUUID();
  const controller = new Controller({
    database,
    audio,
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
  mountStageView(stageArea, controller);
  mountSongPanel(songSection, controller);
  mountStagePanel(stageSection, controller);
  mountDancerPanel(dancerSection, controller, newId);
  mountFormationInspector(formationSection, controller, newId);
  mountTransitionPanel(formationSection, controller);
  mountTransport(transport, controller, newId);
  mountSidebarToggle(transport);
  mountTimelineView(timeline, controller);
  mountKeyboard(controller);

  const syncLayout = () => document.body.classList.toggle("view-only", !controller.store.getState().canEdit);
  controller.store.subscribe((next, previous) => {
    if (next.canEdit !== previous.canEdit) syncLayout();
  });
  syncLayout();

  const flush = () => void controller.flushPendingSave();
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  await controller.start();
  document.body.dataset.ready = "true";
}

void boot();
