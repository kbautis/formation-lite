// Deterministic routine fixtures shared by model, io, and storage tests.
import type { Routine } from "../../src/model/types";

export function validRoutineInput(): Routine {
  return {
    format: "formation-lite/routine",
    version: 1,
    id: "routine-1",
    name: "Regionals 2027",
    createdAt: "2026-11-07T18:00:00.000Z",
    updatedAt: "2026-11-07T18:42:10.000Z",
    stage: { size: { width: 40, depth: 30, unit: "ft" } },
    song: { fileName: "mix.mp3", durationSeconds: 183.42 },
    tempo: { bpm: 120, firstBeatSeconds: 0.5 },
    dancers: [
      { id: "d-1", name: "Ana Reyes", color: "#e4572e" },
      { id: "d-2", name: "Ben Ito", color: "#17bebb" },
    ],
    formations: [
      {
        id: "f-1",
        name: "Opening",
        startSeconds: 0,
        holdSeconds: 2,
        positions: { "d-1": { x: 0.25, y: 0.5 }, "d-2": { x: 0.75, y: 0.5 } },
      },
      {
        id: "f-2",
        name: "Diagonal",
        startSeconds: 4,
        holdSeconds: 2,
        positions: { "d-1": { x: 0, y: 0 }, "d-2": { x: 1, y: 1 } },
      },
    ],
  };
}
