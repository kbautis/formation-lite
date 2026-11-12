// Stage geometry. Positions are normalized (x 0 = audience-left, y 0 = downstage); this
// module maps them to SVG units, flips them for the dancer's view, and computes the
// grid. The open stage is unitless 4:3 with an 8 × 6 grid; a sized stage gets a grid in
// real units counted outward from the center line, like floor tape.
import { POSITION_MAX, POSITION_MIN, type Position, type Stage, type StageSize } from "./types";

export const OPEN_STAGE_ASPECT = 4 / 3;
export const OPEN_STAGE_COLUMNS = 8;
export const OPEN_STAGE_ROWS = 6;
/** SVG height of the stage rectangle; its width is SVG_STAGE_HEIGHT × aspect. */
export const SVG_STAGE_HEIGHT = 100;

const GRID_STEPS = [1, 2, 5, 10, 25, 50, 100] as const;
const MAX_GRID_CELLS_ACROSS = 20;

export type ViewMode = "audience" | "dancer";

export interface GridLine {
  /** Normalized position along the axis, 0–1. */
  readonly position: number;
  readonly label: string;
  readonly isCenter: boolean;
}

export interface Grid {
  readonly verticals: readonly GridLine[];
  readonly horizontals: readonly GridLine[];
}

export function stageAspect(stage: Stage): number {
  return stage.size ? stage.size.width / stage.size.depth : OPEN_STAGE_ASPECT;
}

export function gridStep(size: StageSize): number {
  const longestSide = Math.max(size.width, size.depth);
  const step = GRID_STEPS.find((candidate) => longestSide / candidate <= MAX_GRID_CELLS_ACROSS);
  return step ?? GRID_STEPS[GRID_STEPS.length - 1]!;
}

export function gridLines(stage: Stage): Grid {
  if (!stage.size) {
    return {
      verticals: centeredLines(OPEN_STAGE_COLUMNS / 2, 1 / OPEN_STAGE_COLUMNS, 1),
      horizontals: frontToBackLines(OPEN_STAGE_ROWS, 1 / OPEN_STAGE_ROWS, 1),
    };
  }
  const step = gridStep(stage.size);
  return {
    verticals: centeredLines(Math.floor(stage.size.width / 2 / step), step / stage.size.width, step),
    horizontals: frontToBackLines(Math.floor(stage.size.depth / step), step / stage.size.depth, step),
  };
}

// Lines at the center and every `spacing` outward to each side, labelled by distance.
function centeredLines(linesPerSide: number, spacing: number, labelStep: number): GridLine[] {
  const lines: GridLine[] = [];
  for (let offset = -linesPerSide; offset <= linesPerSide; offset++) {
    lines.push({ position: 0.5 + offset * spacing, label: String(Math.abs(offset) * labelStep), isCenter: offset === 0 });
  }
  return lines;
}

// Lines from the front edge (0) back every `spacing`, labelled by distance from the front.
function frontToBackLines(count: number, spacing: number, labelStep: number): GridLine[] {
  const lines: GridLine[] = [];
  for (let index = 0; index <= count; index++) {
    lines.push({ position: index * spacing, label: String(index * labelStep), isCenter: false });
  }
  return lines;
}

/** The dancer's view turns the stage 180°. Applying it twice is the identity. */
export function toViewCoords(position: Position, view: ViewMode): Position {
  return view === "audience" ? position : { x: 1 - position.x, y: 1 - position.y };
}

/** Normalized stage position → SVG point, with downstage at the bottom. */
export function stageToSvg(position: Position, aspect: number): Position {
  return { x: position.x * SVG_STAGE_HEIGHT * aspect, y: (1 - position.y) * SVG_STAGE_HEIGHT };
}

export function svgToStage(point: Position, aspect: number): Position {
  return { x: point.x / (SVG_STAGE_HEIGHT * aspect), y: 1 - point.y / SVG_STAGE_HEIGHT };
}

/**
 * Decimal places kept for a position an edit writes (architecture §4.2). 0.0001 of the
 * largest stage (500 units) is 0.05 units, finer than a pointer can place a dot, and
 * dropping float noise roughly halves a share link.
 */
export const POSITION_DECIMALS = 4;
const POSITION_SCALE = 10 ** POSITION_DECIMALS;

/** Rounds a position to POSITION_DECIMALS places (never to negative zero). */
export function roundPosition(position: Position): Position {
  return { x: roundCoordinate(position.x), y: roundCoordinate(position.y) };
}

function roundCoordinate(value: number): number {
  // Adding 0 turns -0 into 0, so a rounded value serializes the way it compares.
  return Math.round(value * POSITION_SCALE) / POSITION_SCALE + 0;
}

export function clampToWings(position: Position): Position {
  return { x: clamp(position.x), y: clamp(position.y) };
}

function clamp(value: number): number {
  return Math.min(POSITION_MAX, Math.max(POSITION_MIN, value));
}
