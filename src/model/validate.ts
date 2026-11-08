// parseRoutine is the single gate for every routine entering the app (storage, import,
// and every edit result in tests). It returns a fresh object holding only known fields,
// with names trimmed, or throws RoutineFormatError naming the first bad field path.
// It reads every supported version and always returns the current one: a version 1
// document migrates by giving each formation stagger: null.
import { RoutineFormatError } from "./errors";
import {
  BPM_MAX,
  BPM_MIN,
  DANCER_NAME_MAX_LENGTH,
  FORMATION_NAME_MAX_LENGTH,
  MAX_DANCERS,
  POSITION_MAX,
  POSITION_MIN,
  ROUTINE_FORMAT,
  ROUTINE_NAME_MAX_LENGTH,
  ROUTINE_VERSION,
  STAGE_DIMENSION_MAX,
  STAGGER_ORDERS,
  STAGGER_SPREAD_MAX,
  STAGGER_SPREAD_MIN,
  SUPPORTED_ROUTINE_VERSIONS,
  type Dancer,
  type Formation,
  type LengthUnit,
  type Position,
  type Routine,
  type SongInfo,
  type Stage,
  type Stagger,
  type StaggerOrder,
  type Tempo,
} from "./types";

type RecordValue = Record<string, unknown>;

const HEX_COLOR = /^#[0-9a-f]{6}$/;
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const LENGTH_UNITS: readonly LengthUnit[] = ["ft", "m"];

export function parseRoutine(input: unknown): Routine {
  const routine = readObject(input, "routine");
  if (routine.format !== ROUTINE_FORMAT) {
    throw new RoutineFormatError("format", `expected "${ROUTINE_FORMAT}"`);
  }
  if (typeof routine.version !== "number" || !SUPPORTED_ROUTINE_VERSIONS.includes(routine.version)) {
    throw new RoutineFormatError(
      "version",
      `unsupported version ${String(routine.version)}; this app reads versions ${SUPPORTED_ROUTINE_VERSIONS.join(" and ")}`,
    );
  }
  const sourceVersion = routine.version;
  const dancers = readDancers(routine.dancers);
  return {
    format: ROUTINE_FORMAT,
    version: ROUTINE_VERSION,
    id: readNonEmptyString(routine.id, "id"),
    name: readName(routine.name, "name", 1, ROUTINE_NAME_MAX_LENGTH),
    createdAt: readTimestamp(routine.createdAt, "createdAt"),
    updatedAt: readTimestamp(routine.updatedAt, "updatedAt"),
    stage: readStage(routine.stage),
    song: readSong(routine.song),
    tempo: readTempo(routine.tempo),
    dancers,
    formations: readFormations(routine.formations, dancers, sourceVersion),
  };
}

function readStage(value: unknown): Stage {
  const stage = readObject(value, "stage");
  if (stage.size === null) return { size: null };
  const size = readObject(stage.size, "stage.size");
  const unit = size.unit;
  if (typeof unit !== "string" || !LENGTH_UNITS.includes(unit as LengthUnit)) {
    throw new RoutineFormatError("stage.size.unit", `expected one of ${LENGTH_UNITS.join(", ")}`);
  }
  return {
    size: {
      width: readStageDimension(size.width, "stage.size.width"),
      depth: readStageDimension(size.depth, "stage.size.depth"),
      unit: unit as LengthUnit,
    },
  };
}

function readStageDimension(value: unknown, path: string): number {
  const dimension = readFiniteNumber(value, path);
  if (dimension <= 0 || dimension > STAGE_DIMENSION_MAX) {
    throw new RoutineFormatError(path, `must be greater than 0 and at most ${STAGE_DIMENSION_MAX}`);
  }
  return dimension;
}

function readSong(value: unknown): SongInfo | null {
  if (value === null) return null;
  const song = readObject(value, "song");
  const durationSeconds = readFiniteNumber(song.durationSeconds, "song.durationSeconds");
  if (durationSeconds <= 0) throw new RoutineFormatError("song.durationSeconds", "must be greater than 0");
  return { fileName: readNonEmptyString(song.fileName, "song.fileName"), durationSeconds };
}

function readTempo(value: unknown): Tempo | null {
  if (value === null) return null;
  const tempo = readObject(value, "tempo");
  const bpm = readFiniteNumber(tempo.bpm, "tempo.bpm");
  if (bpm < BPM_MIN || bpm > BPM_MAX) {
    throw new RoutineFormatError("tempo.bpm", `must be between ${BPM_MIN} and ${BPM_MAX}`);
  }
  return { bpm, firstBeatSeconds: readNonNegativeNumber(tempo.firstBeatSeconds, "tempo.firstBeatSeconds") };
}

function readDancers(value: unknown): Dancer[] {
  const list = readArray(value, "dancers");
  if (list.length > MAX_DANCERS) throw new RoutineFormatError("dancers", `at most ${MAX_DANCERS} dancers`);
  const seenIds = new Set<string>();
  return list.map((item, index) => {
    const path = `dancers[${index}]`;
    const dancer = readObject(item, path);
    const id = readUniqueId(dancer.id, `${path}.id`, seenIds);
    const color = dancer.color;
    if (typeof color !== "string" || !HEX_COLOR.test(color)) {
      throw new RoutineFormatError(`${path}.color`, "expected a lowercase #rrggbb color");
    }
    return { id, name: readName(dancer.name, `${path}.name`, 1, DANCER_NAME_MAX_LENGTH), color };
  });
}

function readFormations(value: unknown, dancers: readonly Dancer[], sourceVersion: number): Formation[] {
  const list = readArray(value, "formations");
  if (list.length === 0) throw new RoutineFormatError("formations", "at least one formation is required");
  const seenIds = new Set<string>();
  const formations = list.map((item, index) => readFormation(item, `formations[${index}]`, dancers, seenIds, sourceVersion));
  assertFormationsOrdered(formations);
  return formations;
}

function readFormation(
  value: unknown,
  path: string,
  dancers: readonly Dancer[],
  seenIds: Set<string>,
  sourceVersion: number,
): Formation {
  const formation = readObject(value, path);
  return {
    id: readUniqueId(formation.id, `${path}.id`, seenIds),
    name: readName(formation.name, `${path}.name`, 0, FORMATION_NAME_MAX_LENGTH),
    startSeconds: readNonNegativeNumber(formation.startSeconds, `${path}.startSeconds`),
    holdSeconds: readNonNegativeNumber(formation.holdSeconds, `${path}.holdSeconds`),
    // Version 1 had no ripple; everyone moved together.
    stagger: sourceVersion === 1 ? null : readStagger(formation, `${path}.stagger`),
    positions: readPositions(formation.positions, `${path}.positions`, dancers),
  };
}

function readStagger(formation: RecordValue, path: string): Stagger | null {
  if (!("stagger" in formation)) throw new RoutineFormatError(path, "missing; use null for everyone moving together");
  if (formation.stagger === null) return null;
  const stagger = readObject(formation.stagger, path);
  if (typeof stagger.order !== "string" || !STAGGER_ORDERS.includes(stagger.order as StaggerOrder)) {
    throw new RoutineFormatError(`${path}.order`, `expected one of ${STAGGER_ORDERS.join(", ")}`);
  }
  const spread = readFiniteNumber(stagger.spread, `${path}.spread`);
  if (spread < STAGGER_SPREAD_MIN || spread > STAGGER_SPREAD_MAX) {
    throw new RoutineFormatError(`${path}.spread`, `must be between ${STAGGER_SPREAD_MIN} and ${STAGGER_SPREAD_MAX}`);
  }
  return { order: stagger.order as StaggerOrder, spread };
}

function assertFormationsOrdered(formations: readonly Formation[]): void {
  for (let index = 1; index < formations.length; index++) {
    const previous = formations[index - 1]!;
    const current = formations[index]!;
    if (current.startSeconds < previous.startSeconds) {
      throw new RoutineFormatError(`formations[${index}].startSeconds`, "formations must be in time order");
    }
    if (previous.startSeconds + previous.holdSeconds > current.startSeconds) {
      throw new RoutineFormatError(
        `formations[${index - 1}].holdSeconds`,
        "hold overlaps the start of the next formation",
      );
    }
  }
}

function readPositions(value: unknown, path: string, dancers: readonly Dancer[]): Record<string, Position> {
  const positions = readObject(value, path);
  const dancerIds = new Set(dancers.map((dancer) => dancer.id));
  for (const key of Object.keys(positions)) {
    if (!dancerIds.has(key)) throw new RoutineFormatError(`${path}.${key}`, "position for an unknown dancer");
  }
  const result: Record<string, Position> = {};
  for (const dancer of dancers) {
    const positionPath = `${path}.${dancer.id}`;
    if (!(dancer.id in positions)) throw new RoutineFormatError(positionPath, "missing position for this dancer");
    const position = readObject(positions[dancer.id], positionPath);
    result[dancer.id] = {
      x: readCoordinate(position.x, `${positionPath}.x`),
      y: readCoordinate(position.y, `${positionPath}.y`),
    };
  }
  return result;
}

function readCoordinate(value: unknown, path: string): number {
  const coordinate = readFiniteNumber(value, path);
  if (coordinate < POSITION_MIN || coordinate > POSITION_MAX) {
    throw new RoutineFormatError(path, `must be between ${POSITION_MIN} and ${POSITION_MAX}`);
  }
  return coordinate;
}

function readUniqueId(value: unknown, path: string, seenIds: Set<string>): string {
  const id = readNonEmptyString(value, path);
  if (seenIds.has(id)) throw new RoutineFormatError(path, `duplicate id "${id}"`);
  seenIds.add(id);
  return id;
}

function readName(value: unknown, path: string, minLength: number, maxLength: number): string {
  if (typeof value !== "string") throw new RoutineFormatError(path, "expected a string");
  const name = value.trim();
  if (name.length < minLength || name.length > maxLength) {
    throw new RoutineFormatError(path, `must be ${minLength}–${maxLength} characters`);
  }
  return name;
}

function readTimestamp(value: unknown, path: string): string {
  if (typeof value !== "string" || !ISO_UTC_TIMESTAMP.test(value) || !isRealDate(value)) {
    throw new RoutineFormatError(path, "expected an ISO-8601 UTC timestamp like 2026-11-07T18:00:00.000Z");
  }
  return value;
}

// Date.parse accepts some impossible dates by rolling them over, so round-trip the
// date part to make sure it names a real calendar day.
function isRealDate(timestamp: string): boolean {
  const milliseconds = Date.parse(timestamp);
  return !Number.isNaN(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === timestamp.slice(0, 10);
}

function readNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new RoutineFormatError(path, "expected a non-empty string");
  return value;
}

function readNonNegativeNumber(value: unknown, path: string): number {
  const number = readFiniteNumber(value, path);
  if (number < 0) throw new RoutineFormatError(path, "must not be negative");
  return number;
}

function readFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RoutineFormatError(path, "expected a finite number");
  return value;
}

function readArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new RoutineFormatError(path, "expected a list");
  return value;
}

function readObject(value: unknown, path: string): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RoutineFormatError(path, "expected an object");
  }
  return value as RecordValue;
}
