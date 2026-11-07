// Browser glue for the share file: trigger a download, read a picked file.
// All format logic lives in serialize.ts.
import type { Routine } from "../model/types";
import { parseRoutineFile, routineFileName, serializeRoutine } from "./serialize";

export function downloadRoutine(routine: Routine): void {
  const blob = new Blob([serializeRoutine(routine)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = routineFileName(routine);
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the click has been handled; revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function readRoutineFile(file: File): Promise<Routine> {
  return parseRoutineFile(await file.text());
}
