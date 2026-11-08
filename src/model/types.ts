// Architecture note (Task 2 — routine model)
// - This file is the shape of the share-file format v1 (docs/architecture.md §4.1).
//   It is a public contract: any change needs a new ROUTINE_VERSION and a migration.
// - Time is stored in song seconds; BPM is an optional overlay (one-way door §7.2).
// - Positions are normalized to the stage: x 0 = audience-left, y 0 = downstage, with a
//   0.1 margin of wings on every side (one-way door §7.3).
// - Every formation holds a position for every dancer (one-way door §7.4).
// - All types are readonly; edits in model/edits.ts return new objects.
// - Limits live here as named constants so validate.ts and the UI share one definition.

export const ROUTINE_FORMAT = "formation-lite/routine";
/** Version 2 (2026-11-08) added Formation.stagger. Version 1 documents migrate on read. */
export const ROUTINE_VERSION = 2;
export const SUPPORTED_ROUTINE_VERSIONS: readonly number[] = [1, 2];

export const ROUTINE_NAME_MAX_LENGTH = 80;
export const DANCER_NAME_MAX_LENGTH = 40;
export const FORMATION_NAME_MAX_LENGTH = 40;
export const MAX_DANCERS = 40;
export const STAGE_DIMENSION_MAX = 500;
export const BPM_MIN = 40;
export const BPM_MAX = 300;
export const WING_MARGIN = 0.1;
export const POSITION_MIN = -WING_MARGIN;
export const POSITION_MAX = 1 + WING_MARGIN;
export const STAGGER_SPREAD_MIN = 0.1;
export const STAGGER_SPREAD_MAX = 0.9;

export type LengthUnit = "ft" | "m";

export interface StageSize {
  readonly width: number;
  readonly depth: number;
  readonly unit: LengthUnit;
}

export interface Stage {
  /** null means an open stage with no real-world units. */
  readonly size: StageSize | null;
}

export interface SongInfo {
  readonly fileName: string;
  readonly durationSeconds: number;
}

export interface Tempo {
  readonly bpm: number;
  /** Song time of the first "1" count. */
  readonly firstBeatSeconds: number;
}

export interface Dancer {
  readonly id: string;
  readonly name: string;
  /** #rrggbb */
  readonly color: string;
}

export interface Position {
  readonly x: number;
  readonly y: number;
}

export const STAGGER_ORDERS = ["left-to-right", "right-to-left", "front-to-back", "back-to-front", "list-order"] as const;
export type StaggerOrder = (typeof STAGGER_ORDERS)[number];

/** A ripple: dancers start moving one after another, in this order, into a formation. */
export interface Stagger {
  readonly order: StaggerOrder;
  /** Fraction of the transition over which departures are spread, 0.1–0.9. */
  readonly spread: number;
}

export interface Formation {
  readonly id: string;
  readonly name: string;
  readonly startSeconds: number;
  readonly holdSeconds: number;
  /** How dancers move into this formation: null = everyone together. Ignored on the first formation. */
  readonly stagger: Stagger | null;
  /** Keyed by dancer id; exactly one entry per dancer in the routine. */
  readonly positions: Readonly<Record<string, Position>>;
}

export interface Routine {
  readonly format: typeof ROUTINE_FORMAT;
  readonly version: typeof ROUTINE_VERSION;
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly stage: Stage;
  readonly song: SongInfo | null;
  readonly tempo: Tempo | null;
  readonly dancers: readonly Dancer[];
  /** Sorted by startSeconds, never overlapping, at least one. */
  readonly formations: readonly Formation[];
}
