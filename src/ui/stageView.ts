// The stage: grid in the routine's units, dancers at positionsAt(playhead), drag to edit.
// Every position passes through toViewCoords on the way in and out, so the dancer's view
// is purely a rendering choice. The grid only rebuilds when the stage size or view changes.
import type { Controller } from "../app/controller";
import type { AppState } from "../app/state";
import { activeFormationAt, positionsAt } from "../model/interpolate";
import { SVG_STAGE_HEIGHT, gridLines, stageAspect, stageToSvg, svgToStage, toViewCoords, type ViewMode } from "../model/stage";
import { WING_MARGIN, type Dancer, type Position } from "../model/types";
import { el, svgEl } from "./dom";
import { initials } from "./format";

const DANCER_RADIUS = 3.4;
/** Labels sit inside the wings strip so the view can be framed tightly around the stage. */
const GRID_LABEL_OFFSET = 3.5;
const EDGE_LABEL_INSET = 2;
const VIEW_PADDING = 1;

interface DancerNode {
  readonly group: SVGGElement;
  readonly circle: SVGCircleElement;
  readonly label: SVGTextElement;
  readonly title: SVGTitleElement;
}

export function mountStageView(root: HTMLElement, controller: Controller): void {
  const svg = svgEl("svg", { class: "stage-svg", role: "img", "aria-label": "Stage with dancers", preserveAspectRatio: "xMidYMid meet" });
  const gridLayer = svgEl("g", { class: "grid" });
  const dancerLayer = svgEl("g", { class: "dancers" });
  svg.append(gridLayer, dancerLayer);
  const hint = el("p", { class: "stage-hint", "aria-live": "polite" });
  root.append(svg, hint);

  const dancerNodes = new Map<string, DancerNode>();
  let gridKey = "";
  let draggingPointer: number | null = null;

  const pointerToStage = (event: PointerEvent): Position => {
    const matrix = svg.getScreenCTM();
    if (!matrix) throw new Error("stage is not rendered");
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const state = controller.store.getState();
    return toViewCoords(svgToStage(point, stageAspect(state.routine.stage)), state.view);
  };

  const startDrag = (event: PointerEvent, dancerId: string) => {
    event.preventDefault();
    controller.selectDancer(dancerId);
    if (!controller.beginDrag(dancerId)) return;
    draggingPointer = event.pointerId;
    svg.setPointerCapture(event.pointerId);
  };
  svg.addEventListener("pointermove", (event) => {
    if (event.pointerId === draggingPointer) controller.dragTo(pointerToStage(event));
  });
  const stopDrag = (event: PointerEvent) => {
    if (event.pointerId !== draggingPointer) return;
    draggingPointer = null;
    controller.endDrag();
  };
  svg.addEventListener("pointerup", stopDrag);
  svg.addEventListener("pointercancel", stopDrag);
  svg.addEventListener("pointerdown", (event) => {
    if (event.target === svg || (event.target as Element).closest(".grid")) controller.selectDancer(null);
  });

  const createDancerNode = (dancer: Dancer): DancerNode => {
    const title = svgEl("title");
    const circle = svgEl("circle", { r: DANCER_RADIUS });
    const label = svgEl("text", { class: "dancer-initials", "text-anchor": "middle", "dominant-baseline": "central" });
    const group = svgEl("g", { class: "dancer", "data-dancer-id": dancer.id, tabindex: 0 }, [title, circle, label]);
    group.addEventListener("pointerdown", (event) => startDrag(event, dancer.id));
    dancerLayer.append(group);
    return { group, circle, label, title };
  };

  const renderDancers = (state: AppState) => {
    const aspect = stageAspect(state.routine.stage);
    const positions = positionsAt(state.routine, state.playheadSeconds);
    const ids = new Set(state.routine.dancers.map((dancer) => dancer.id));
    for (const [id, node] of dancerNodes) {
      if (!ids.has(id)) {
        node.group.remove();
        dancerNodes.delete(id);
      }
    }
    for (const dancer of state.routine.dancers) {
      let node = dancerNodes.get(dancer.id);
      if (!node) {
        node = createDancerNode(dancer);
        dancerNodes.set(dancer.id, node);
      }
      const point = stageToSvg(toViewCoords(positions[dancer.id]!, state.view), aspect);
      node.group.setAttribute("transform", `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);
      node.circle.setAttribute("fill", dancer.color);
      node.label.textContent = initials(dancer.name);
      node.title.textContent = dancer.name;
      node.group.classList.toggle("selected", dancer.id === state.selectedDancerId);
    }
    // Draw the selected dancer last so it sits on top.
    const selected = state.selectedDancerId ? dancerNodes.get(state.selectedDancerId) : undefined;
    if (selected && dancerLayer.lastChild !== selected.group) dancerLayer.append(selected.group);
  };

  const renderHint = (state: AppState) => {
    const editable = state.canEdit && activeFormationAt(state.routine, state.playheadSeconds) !== null;
    svg.classList.toggle("is-editable", editable);
    if (!state.canEdit) hint.textContent = "";
    else if (state.routine.dancers.length === 0) hint.textContent = "Add dancers in the sidebar to place them on stage.";
    else if (!editable && !state.isPlaying) hint.textContent = "Dancers are moving here. Click a formation on the timeline to edit positions.";
    else hint.textContent = "";
  };

  const render = (state: AppState) => {
    const key = JSON.stringify([state.routine.stage, state.view]);
    if (key !== gridKey) {
      gridKey = key;
      renderGrid(svg, gridLayer, state, state.view);
    }
    renderDancers(state);
    renderHint(state);
  };

  controller.store.subscribe((next, previous) => {
    if (
      next.routine !== previous.routine ||
      next.playheadSeconds !== previous.playheadSeconds ||
      next.view !== previous.view ||
      next.selectedDancerId !== previous.selectedDancerId ||
      next.canEdit !== previous.canEdit ||
      next.isPlaying !== previous.isPlaying
    ) {
      render(next);
    }
  });
  render(controller.store.getState());
}

function renderGrid(svg: SVGSVGElement, layer: SVGGElement, state: AppState, view: ViewMode): void {
  const aspect = stageAspect(state.routine.stage);
  const width = SVG_STAGE_HEIGHT * aspect;
  const height = SVG_STAGE_HEIGHT;
  const marginX = width * WING_MARGIN;
  const marginY = height * WING_MARGIN;
  svg.setAttribute(
    "viewBox",
    `${-marginX - VIEW_PADDING} ${-marginY - VIEW_PADDING} ${width + 2 * (marginX + VIEW_PADDING)} ${height + 2 * (marginY + VIEW_PADDING)}`,
  );

  const grid = gridLines(state.routine.stage);
  const toView = (position: Position) => stageToSvg(toViewCoords(position, view), aspect);
  const downstageY = view === "audience" ? height + GRID_LABEL_OFFSET : -GRID_LABEL_OFFSET + 1;
  const unit = state.routine.stage.size?.unit ?? "";

  const nodes: SVGElement[] = [
    svgEl("rect", { class: "wings", x: -marginX, y: -marginY, width: width + 2 * marginX, height: height + 2 * marginY, rx: 2 }),
    svgEl("rect", { class: "floor", x: 0, y: 0, width, height }),
  ];
  for (const line of grid.verticals) {
    const top = toView({ x: line.position, y: 1 });
    const bottom = toView({ x: line.position, y: 0 });
    nodes.push(svgEl("line", { class: line.isCenter ? "grid-line center" : "grid-line", x1: top.x, y1: top.y, x2: bottom.x, y2: bottom.y }));
    nodes.push(svgEl("text", { class: "grid-label", x: bottom.x, y: downstageY, "text-anchor": "middle" }, [line.label]));
  }
  for (const line of grid.horizontals) {
    const left = toView({ x: 0, y: line.position });
    const right = toView({ x: 1, y: line.position });
    nodes.push(svgEl("line", { class: "grid-line", x1: left.x, y1: left.y, x2: right.x, y2: right.y }));
  }
  // Audience and upstage labels sit at the outer edge of the wings, on opposite sides.
  const outerBottom = height + marginY - EDGE_LABEL_INSET;
  const outerTop = -marginY + EDGE_LABEL_INSET + 2;
  const audienceY = view === "audience" ? outerBottom : outerTop;
  const upstageY = view === "audience" ? outerTop : outerBottom;
  nodes.push(svgEl("text", { class: "audience-label", x: width / 2, y: audienceY, "text-anchor": "middle" }, [`AUDIENCE${unit ? ` · grid in ${unit}` : ""}`]));
  nodes.push(svgEl("text", { class: "upstage-label", x: width / 2, y: upstageY, "text-anchor": "middle" }, ["UPSTAGE"]));
  layer.replaceChildren(...nodes);
}
