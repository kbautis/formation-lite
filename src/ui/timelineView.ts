// Architecture note (timeline — revised after review, 2026-11-08)
// - Draws the time ruler, the optional 8-count row, formation blocks with edge handles,
//   transition segments (red when dancers pass too close, if the check is on), and the
//   playhead. Pointer down scrubs; on a block it jumps to that formation; on an edge
//   handle it drags that edge.
// - The scale is derived here, never stored: in fit mode it is measured width / timeline
//   length; in manual mode it is the stored px/s. While an edge is dragged the length is
//   frozen at its value when the drag began, so the scale can't change under the pointer.
// - The view never writes to the store from a listener; it re-renders itself on resize.
// - Everything is positioned with place() (CSSOM), so the CSP needs no inline styles.
import type { Controller } from "../app/controller";
import { activeFormation, clampZoom, currentRoutine, type AppState } from "../app/state";
import { watch } from "../app/store";
import { encountersFor } from "../model/collisions";
import { formationLabel, type FormationEdge } from "../model/edits";
import { holdEnd } from "../model/interpolate";
import { beatTimesBetween, beatsToSeconds } from "../model/tempo";
import { formatTime } from "../model/time";
import { countLabelEvery, fitPixelsPerSecond, rulerStepSeconds, timelineDurationSeconds } from "../model/timeline";
import type { Tempo } from "../model/types";
import { el, place } from "./dom";
import { formatDuration } from "./format";

const MIN_BEAT_TICK_SPACING_PIXELS = 6;
const MIN_BLOCK_WIDTH_PIXELS = 4;
const AUTOSCROLL_MARGIN_PIXELS = 40;
const MIN_TRANSITION_WIDTH_PIXELS = 2;
const MIN_TRANSITION_LABEL_PIXELS = 44;
const BEATS_PER_EIGHT = 8;

export interface TimelineScale {
  /** The px/s currently on screen, so zoom buttons can zoom from it. */
  pixelsPerSecond(): number;
}

export function mountTimelineView(root: HTMLElement, controller: Controller): TimelineScale {
  const ruler = el("div", { class: "ruler" });
  const counts = el("div", { class: "counts" });
  const track = el("div", { class: "track" });
  const playhead = el("div", { class: "playhead", "aria-hidden": "true" });
  const content = el("div", { class: "timeline-content" }, [ruler, counts, track, playhead]);
  const scroller = el("div", { class: "timeline-scroll", "aria-label": "Timeline. Drag to scrub." }, [content]);
  root.append(scroller);

  let measuredWidth = 0;
  let frozenDuration: number | null = null;

  const pixelsPerSecond = (state: AppState): number => {
    if (state.zoom.mode === "manual") return state.zoom.pixelsPerSecond;
    const duration = frozenDuration ?? timelineDurationSeconds(currentRoutine(state));
    return measuredWidth > 0 ? clampZoom(fitPixelsPerSecond(duration, measuredWidth)) : clampZoom(1);
  };

  const measure = () => {
    const style = getComputedStyle(scroller);
    // One pixel of slack so rounding never produces a scrollbar for a fitted timeline.
    measuredWidth = Math.max(0, scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 1);
  };

  let scrubbingPointer: number | null = null;
  let edgeDragPointer: number | null = null;
  const secondsAt = (event: PointerEvent) => {
    const bounds = content.getBoundingClientRect();
    return (event.clientX - bounds.left) / pixelsPerSecond(controller.store.getState());
  };
  content.addEventListener("pointerdown", (event) => {
    const target = event.target as Element;
    const handle = target.closest<HTMLElement>("[data-edge]");
    if (handle) {
      event.preventDefault();
      frozenDuration = controller.timelineDuration();
      if (controller.beginEdgeDrag(handle.dataset.formationId!, handle.dataset.edge as FormationEdge)) {
        edgeDragPointer = event.pointerId;
        content.setPointerCapture(event.pointerId);
      } else {
        frozenDuration = null;
      }
      return;
    }
    const block = target.closest<HTMLElement>("[data-formation-id]");
    if (block) {
      const formation = controller.routine.formations.find((candidate) => candidate.id === block.dataset.formationId);
      if (!formation) return;
      controller.pause();
      controller.seek(formation.startSeconds);
      return;
    }
    scrubbingPointer = event.pointerId;
    content.setPointerCapture(event.pointerId);
    controller.seek(secondsAt(event));
  });
  content.addEventListener("pointermove", (event) => {
    if (event.pointerId === scrubbingPointer) controller.seek(secondsAt(event));
    if (event.pointerId === edgeDragPointer) controller.dragEdgeTo(secondsAt(event));
  });
  const stopPointer = (event: PointerEvent) => {
    if (event.pointerId === scrubbingPointer) scrubbingPointer = null;
    if (event.pointerId !== edgeDragPointer) return;
    edgeDragPointer = null;
    frozenDuration = null;
    controller.endDrag();
    renderAll();
  };
  content.addEventListener("pointerup", stopPointer);
  content.addEventListener("pointercancel", stopPointer);

  const renderContent = (state: AppState) => {
    const routine = currentRoutine(state);
    const scale = pixelsPerSecond(state);
    const duration = timelineDurationSeconds(routine);
    content.style.width = `${Math.ceil(duration * scale)}px`;
    renderRuler(ruler, duration, scale);
    renderCounts(counts, routine.tempo, duration, scale);

    const active = activeFormation(state);
    const encounters = state.checkCollisions ? encountersFor(routine) : new Map<string, unknown>();
    const transitions = routine.formations.slice(1).map((formation, index) => {
      const previous = routine.formations[index]!;
      const gap = formation.startSeconds - holdEnd(previous);
      const label = formatDuration(gap, routine.tempo);
      const width = Math.max(MIN_TRANSITION_WIDTH_PIXELS, gap * scale);
      const crowded = encounters.has(formation.id);
      const segment = el(
        "div",
        {
          class: crowded ? "transition-segment has-collision" : "transition-segment",
          title: `Transition into ${formationLabel(routine, formation)}: ${label}${crowded ? " — dancers pass too close" : ""}`,
          "data-label": label,
        },
        width >= MIN_TRANSITION_LABEL_PIXELS ? [label] : [],
      );
      return place(segment, holdEnd(previous) * scale, width);
    });
    const blocks = routine.formations.map((formation) => {
      const label = formationLabel(routine, formation);
      const handles = state.canEdit
        ? (["start", "end"] as const).map((edge) =>
            el("span", {
              class: `edge-handle ${edge}`,
              "data-edge": edge,
              "data-formation-id": formation.id,
              title: edge === "start" ? "Drag to change when this formation starts" : "Drag to change how long this formation holds",
            }),
          )
        : [];
      const block = el(
        "button",
        {
          type: "button",
          class: formation.id === active?.id ? "formation-block active" : "formation-block",
          title: `${label} · ${formatTime(formation.startSeconds)}–${formatTime(holdEnd(formation))}`,
          "data-formation-id": formation.id,
        },
        [el("span", { class: "formation-label" }, [label]), ...handles],
      );
      return place(block, formation.startSeconds * scale, Math.max(MIN_BLOCK_WIDTH_PIXELS, formation.holdSeconds * scale));
    });
    track.replaceChildren(...transitions, ...blocks);
  };

  const renderPlayhead = (state: AppState) => {
    const left = state.playheadSeconds * pixelsPerSecond(state);
    playhead.style.transform = `translateX(${left}px)`;
    if (state.isPlaying) {
      const visibleStart = scroller.scrollLeft;
      const visibleEnd = visibleStart + scroller.clientWidth;
      if (left < visibleStart || left > visibleEnd - AUTOSCROLL_MARGIN_PIXELS) scroller.scrollLeft = left - AUTOSCROLL_MARGIN_PIXELS;
    }
    const activeId = activeFormation(state)?.id;
    for (const block of track.querySelectorAll<HTMLElement>(".formation-block")) {
      block.classList.toggle("active", block.dataset.formationId === activeId);
    }
  };

  const renderAll = () => {
    const state = controller.store.getState();
    renderContent(state);
    renderPlayhead(state);
  };

  new ResizeObserver(() => {
    const before = measuredWidth;
    measure();
    if (measuredWidth !== before) renderAll();
  }).observe(scroller);
  measure();

  watch(controller.store, (state) => [state.history.present, state.zoom, state.canEdit, state.checkCollisions], renderContent);
  watch(controller.store, (state) => [state.playheadSeconds, state.history.present, state.zoom, state.isPlaying], renderPlayhead);

  return { pixelsPerSecond: () => pixelsPerSecond(controller.store.getState()) };
}

function renderRuler(ruler: HTMLElement, duration: number, scale: number): void {
  const step = rulerStepSeconds(scale);
  const marks: HTMLElement[] = [];
  for (let seconds = 0; seconds <= duration; seconds += step) {
    marks.push(place(el("span", { class: "ruler-mark" }, [formatTime(seconds).replace(/\.\d$/, "")]), seconds * scale));
  }
  ruler.replaceChildren(...marks);
}

function renderCounts(counts: HTMLElement, tempo: Tempo | null, duration: number, scale: number): void {
  counts.hidden = tempo === null;
  if (!tempo) return;
  const beatPixels = beatsToSeconds(tempo, 1) * scale;
  const showBeats = beatPixels >= MIN_BEAT_TICK_SPACING_PIXELS;
  const labelEvery = countLabelEvery(beatPixels * BEATS_PER_EIGHT);
  let eight = 0;
  const marks: HTMLElement[] = [];
  for (const beat of beatTimesBetween(tempo, 0, duration)) {
    if (beat.isDownbeat) eight++;
    if (!beat.isDownbeat && !showBeats) continue;
    const label = beat.isDownbeat && (eight - 1) % labelEvery === 0 ? String(eight) : "";
    marks.push(place(el("span", { class: beat.isDownbeat ? "count-mark downbeat" : "count-mark" }, [label]), beat.seconds * scale));
  }
  counts.replaceChildren(...marks);
}
