// The timeline: time ruler, optional 8-count row, formation blocks, playhead.
// Pointer down anywhere scrubs; pointer down on a formation block jumps to its start.
// The content rebuilds when the routine or zoom changes; the playhead moves every frame.
// In fit mode (the default) it measures its own width and asks the controller to zoom so
// the whole timeline fits: on mount, on resize, and when the timeline's length changes.
// Dragging a block's right edge changes its hold; its left edge changes its start. The
// zoom is frozen during an edge drag (refit afterwards), or a growing timeline would
// rezoom under the pointer. The gap before each formation is drawn as a labeled
// transition segment, red when dancers pass too close in it.
import type { Controller } from "../app/controller";
import type { AppState } from "../app/state";
import type { FormationEdge } from "../app/controller";
import { encountersByFormation } from "../model/collisions";
import { activeFormationAt, holdEnd } from "../model/interpolate";
import { beatTimesBetween, beatsToSeconds } from "../model/tempo";
import { formatTime } from "../model/time";
import { countLabelEvery, rulerStepSeconds, timelineDurationSeconds } from "../model/timeline";
import { el } from "./dom";
import { formatDuration } from "./format";

const MIN_BEAT_TICK_SPACING_PIXELS = 6;
const MIN_BLOCK_WIDTH_PIXELS = 4;
const AUTOSCROLL_MARGIN_PIXELS = 40;
const MIN_TRANSITION_WIDTH_PIXELS = 2;
const MIN_TRANSITION_LABEL_PIXELS = 44;

export function mountTimelineView(root: HTMLElement, controller: Controller): void {
  const ruler = el("div", { class: "ruler" });
  const counts = el("div", { class: "counts" });
  const track = el("div", { class: "track" });
  const playhead = el("div", { class: "playhead", "aria-hidden": "true" });
  const content = el("div", { class: "timeline-content" }, [ruler, counts, track, playhead]);
  const scroller = el("div", { class: "timeline-scroll", "aria-label": "Timeline. Drag to scrub." }, [content]);
  root.append(scroller);

  const availableWidth = () => {
    const style = getComputedStyle(scroller);
    // One pixel of slack so rounding never produces a scrollbar for a fitted timeline.
    return scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 1;
  };
  const refit = () => {
    const width = availableWidth();
    if (width > 0) controller.applyTimelineFit(width);
  };
  new ResizeObserver(refit).observe(scroller);

  let scrubbingPointer: number | null = null;
  let edgeDragPointer: number | null = null;
  const secondsAt = (event: PointerEvent) => {
    const bounds = content.getBoundingClientRect();
    return (event.clientX - bounds.left) / controller.store.getState().pixelsPerSecond;
  };
  content.addEventListener("pointerdown", (event) => {
    const handle = (event.target as Element).closest<HTMLElement>("[data-edge]");
    if (handle) {
      event.preventDefault();
      if (controller.beginEdgeDrag(handle.dataset.formationId!, handle.dataset.edge as FormationEdge)) {
        edgeDragPointer = event.pointerId;
        content.setPointerCapture(event.pointerId);
      }
      return;
    }
    const block = (event.target as Element).closest<HTMLElement>("[data-formation-start]");
    if (block) {
      controller.pause();
      controller.seek(Number(block.dataset.formationStart));
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
  const stopScrub = (event: PointerEvent) => {
    if (event.pointerId === scrubbingPointer) scrubbingPointer = null;
    if (event.pointerId === edgeDragPointer) {
      edgeDragPointer = null;
      controller.endEdgeDrag();
      refit();
    }
  };
  content.addEventListener("pointerup", stopScrub);
  content.addEventListener("pointercancel", stopScrub);

  const renderContent = (state: AppState) => {
    const { routine, pixelsPerSecond } = state;
    const duration = timelineDurationSeconds(routine);
    content.style.width = `${Math.ceil(duration * pixelsPerSecond)}px`;

    const step = rulerStepSeconds(pixelsPerSecond);
    const rulerMarks: HTMLElement[] = [];
    for (let seconds = 0; seconds <= duration; seconds += step) {
      rulerMarks.push(el("span", { class: "ruler-mark", style: `left:${seconds * pixelsPerSecond}px` }, [formatTime(seconds).replace(/\.\d$/, "")]));
    }
    ruler.replaceChildren(...rulerMarks);

    counts.hidden = routine.tempo === null;
    if (routine.tempo) {
      const beatPixels = beatsToSeconds(routine.tempo, 1) * pixelsPerSecond;
      const showBeats = beatPixels >= MIN_BEAT_TICK_SPACING_PIXELS;
      const labelEvery = countLabelEvery(beatPixels * 8);
      let eight = 0;
      const marks: HTMLElement[] = [];
      for (const beat of beatTimesBetween(routine.tempo, 0, duration)) {
        if (beat.isDownbeat) eight++;
        if (!beat.isDownbeat && !showBeats) continue;
        marks.push(
          el("span", { class: beat.isDownbeat ? "count-mark downbeat" : "count-mark", style: `left:${beat.seconds * pixelsPerSecond}px` }, [
            beat.isDownbeat && (eight - 1) % labelEvery === 0 ? String(eight) : "",
          ]),
        );
      }
      counts.replaceChildren(...marks);
    }

    const active = activeFormationAt(routine, state.playheadSeconds);
    const encounters = encountersByFormation(routine);
    const transitions = routine.formations.slice(1).map((formation, index) => {
      const previous = routine.formations[index]!;
      const gap = formation.startSeconds - holdEnd(previous);
      const label = formatDuration(gap, routine.tempo);
      const width = Math.max(MIN_TRANSITION_WIDTH_PIXELS, gap * pixelsPerSecond);
      const crowded = encounters.has(formation.id);
      return el(
        "div",
        {
          class: crowded ? "transition-segment has-collision" : "transition-segment",
          style: `left:${holdEnd(previous) * pixelsPerSecond}px;width:${width}px`,
          title: `Transition into ${formation.name || `Formation ${index + 2}`}: ${label}${crowded ? " — dancers pass too close" : ""}`,
          "data-label": label,
        },
        width >= MIN_TRANSITION_LABEL_PIXELS ? [label] : [],
      );
    });
    const blocks = routine.formations.map((formation, index) => {
        const width = Math.max(MIN_BLOCK_WIDTH_PIXELS, formation.holdSeconds * pixelsPerSecond);
        const label = formation.name || `Formation ${index + 1}`;
        const handle = state.canEdit
          ? [
              el("span", { class: "edge-handle start", "data-edge": "start", "data-formation-id": formation.id, title: "Drag to change when this formation starts" }),
              el("span", { class: "edge-handle end", "data-edge": "end", "data-formation-id": formation.id, title: "Drag to change how long this formation holds" }),
            ]
          : [];
        return el(
          "button",
          {
            type: "button",
            class: formation === active ? "formation-block active" : "formation-block",
            style: `left:${formation.startSeconds * pixelsPerSecond}px;width:${width}px`,
            title: `${label} · ${formatTime(formation.startSeconds)}–${formatTime(holdEnd(formation))}`,
            "data-formation-start": formation.startSeconds,
          },
          [el("span", { class: "formation-label" }, [label]), ...handle],
        );
      });
    track.replaceChildren(...transitions, ...blocks);
  };

  const renderPlayhead = (state: AppState) => {
    const left = state.playheadSeconds * state.pixelsPerSecond;
    playhead.style.transform = `translateX(${left}px)`;
    if (state.isPlaying) {
      const visibleStart = scroller.scrollLeft;
      const visibleEnd = visibleStart + scroller.clientWidth;
      if (left < visibleStart || left > visibleEnd - AUTOSCROLL_MARGIN_PIXELS) scroller.scrollLeft = left - AUTOSCROLL_MARGIN_PIXELS;
    }
    const active = activeFormationAt(state.routine, state.playheadSeconds);
    for (const block of track.querySelectorAll<HTMLElement>(".formation-block")) {
      block.classList.toggle("active", active !== null && Number(block.dataset.formationStart) === active.startSeconds);
    }
  };

  controller.store.subscribe((next, previous) => {
    const lengthChanged = timelineDurationSeconds(next.routine) !== timelineDurationSeconds(previous.routine);
    if (next.timelineFit && edgeDragPointer === null && (lengthChanged || !previous.timelineFit)) {
      refit();
      next = controller.store.getState();
    }
    if (next.routine !== previous.routine || next.pixelsPerSecond !== previous.pixelsPerSecond || next.canEdit !== previous.canEdit) {
      renderContent(next);
    }
    if (next.playheadSeconds !== previous.playheadSeconds || next.routine !== previous.routine || next.pixelsPerSecond !== previous.pixelsPerSecond) {
      renderPlayhead(next);
    }
  });
  renderContent(controller.store.getState());
  renderPlayhead(controller.store.getState());
}
