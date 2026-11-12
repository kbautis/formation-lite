// Display-only formatting shared by UI components.
import type { ReplaceDetails } from "../app/controller";
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

export type ImportSource = "file" | "link";

/** "Nov 12, 3:40 PM": when a routine was last edited, in the viewer's locale and zone by default. */
export function formatEditTime(isoTime: string, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(isoTime));
}

/** The question asked before an incoming routine replaces the copy on this device. */
export function replacePromptText(source: ImportSource, details: ReplaceDetails, formatTime: (isoTime: string) => string = formatEditTime): string {
  const edited = `${source === "link" ? "Shared" : "Last edited"} ${formatTime(details.incomingUpdatedAt)}.`;
  const lines = [`You already have “${details.existingName}” on this device. Replace it with the version in this ${source}?`, edited];
  if (details.isOlderThanStored) lines.push(`This ${source} is older than your copy.`);
  return lines.join("\n\n");
}
