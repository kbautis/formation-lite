// Per-device preferences in localStorage (last-opened routine, hidden panels, collision
// check). They are conveniences: when storage is blocked, reads come back empty and
// writes are dropped, and the app behaves as on a first visit.

export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered this time; the current session is unaffected.
  }
}
