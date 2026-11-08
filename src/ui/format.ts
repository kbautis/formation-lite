// Display-only formatting shared by UI components.
import { secondsToBeats } from "../model/tempo";
import type { Tempo } from "../model/types";
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0] ?? "").slice(0, 2).toUpperCase();
}

const DURATION_DECIMALS = 100;

/** A transition or hold length as the choreographer counts it: counts with a tempo, seconds without. */
export function formatDuration(seconds: number, tempo: Tempo | null): string {
  if (seconds <= 0) return "instant";
  if (!tempo) return `${Math.round(seconds * 10) / 10} s`;
  const counts = Math.round(secondsToBeats(tempo, seconds) * DURATION_DECIMALS) / DURATION_DECIMALS;
  return `${counts} ${counts === 1 ? "count" : "counts"}`;
}
