// The timeline: time ruler, optional 8-count row, formation blocks, playhead.
// Pointer down anywhere scrubs; pointer down on a formation block jumps to its start.
// The content rebuilds when the routine or zoom changes; the playhead moves every frame.
import type { Controller } from "../app/controller";
import type { AppState } from "../app/state";
import { activeFormationAt, holdEnd } from "../model/interpolate";
import { beatTimesBetween, beatsToSeconds } from "../model/tempo";
import { formatTime } from "../model/time";
import { rulerStepSeconds, timelineDurationSeconds } from "../model/timeline";
import { el } from "./dom";

const MIN_BEAT_TICK_SPACING_PIXELS = 6;
const MIN_BLOCK_WIDTH_PIXELS = 4;
const AUTOSCROLL_MARGIN_PIXELS = 40;

export function mountTimelineView(root: HTMLElement, controller: Controller): void {
  const ruler = el("div", { class: "ruler" });
  const counts = el("div", { class: "counts" });
  const track = el("div", { class: "track" });
  const playhead = el("div", { class: "playhead", "aria-hidden": "true" });
  const content = el("div", { class: "timeline-content" }, [ruler, counts, track, playhead]);
  const scroller = el("div", { class: "timeline-scroll", "aria-label": "Timeline. Drag to scrub." }, [content]);
  root.append(scroller);

  let scrubbingPointer: number | null = null;
  const secondsAt = (event: PointerEvent) => {
    const bounds = content.getBoundingClientRect();
    return (event.clientX - bounds.left) / controller.store.getState().pixelsPerSecond;
  };
  content.addEventListener("pointerdown", (event) => {
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
  });
  const stopScrub = (event: PointerEvent) => {
    if (event.pointerId === scrubbingPointer) scrubbingPointer = null;
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
      const showBeats = beatsToSeconds(routine.tempo, 1) * pixelsPerSecond >= MIN_BEAT_TICK_SPACING_PIXELS;
      let eight = 0;
      const marks: HTMLElement[] = [];
      for (const beat of beatTimesBetween(routine.tempo, 0, duration)) {
        if (beat.isDownbeat) eight++;
        if (!beat.isDownbeat && !showBeats) continue;
        marks.push(
          el("span", { class: beat.isDownbeat ? "count-mark downbeat" : "count-mark", style: `left:${beat.seconds * pixelsPerSecond}px` }, [
            beat.isDownbeat ? String(eight) : "",
          ]),
        );
      }
      counts.replaceChildren(...marks);
    }

    const active = activeFormationAt(routine, state.playheadSeconds);
    track.replaceChildren(
      ...routine.formations.map((formation, index) => {
        const width = Math.max(MIN_BLOCK_WIDTH_PIXELS, formation.holdSeconds * pixelsPerSecond);
        const label = formation.name || `Formation ${index + 1}`;
        return el(
          "button",
          {
            type: "button",
            class: formation === active ? "formation-block active" : "formation-block",
            style: `left:${formation.startSeconds * pixelsPerSecond}px;width:${width}px`,
            title: `${label} · ${formatTime(formation.startSeconds)}–${formatTime(holdEnd(formation))}`,
            "data-formation-start": formation.startSeconds,
          },
          [label],
        );
      }),
    );
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
    for (const block of track.children) {
      block.classList.toggle("active", active !== null && Number((block as HTMLElement).dataset.formationStart) === active.startSeconds);
    }
  };

  controller.store.subscribe((next, previous) => {
    if (next.routine !== previous.routine || next.pixelsPerSecond !== previous.pixelsPerSecond) renderContent(next);
    if (next.playheadSeconds !== previous.playheadSeconds || next.routine !== previous.routine || next.pixelsPerSecond !== previous.pixelsPerSecond) {
      renderPlayhead(next);
    }
  });
  renderContent(controller.store.getState());
  renderPlayhead(controller.store.getState());
}
