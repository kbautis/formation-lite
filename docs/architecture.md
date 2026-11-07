# Architecture & Data Design — formation-lite

Date: 2026-11-07
Source of truth for requirements: [`requirements.md`](requirements.md). Workflow steps
referenced below as (W1)…(W8) are the numbered steps in that brief's Workflow section.

## 1. Overview

formation-lite is a static, single-page web app with no server. All logic runs in the
browser. A routine is one plain JSON document, and the song is a separate binary kept
next to it on the device. The core of the app is a set of pure functions that answer
"where is every dancer at time *t*?". The stage, timeline, and playback just ask that
question at each frame. Persistence is the browser's IndexedDB, and sharing is a JSON
file export/import.

## 2. Component Map

```
            ┌──────────────────────────── browser tab ────────────────────────────┐
            │                                                                     │
  user ───▶ │  ui/  (DOM + SVG, no logic)                                         │
            │   toolbar · songPanel · dancerPanel · stageView · timelineView ·    │
            │   formationInspector                                                │
            │        │ dispatches edits            ▲ re-renders on state change   │
            │        ▼                             │                              │
            │  app/store.ts  ── AppState { routine, playhead, view, selection } ─┤
            │        │ calls                       ▲                              │
            │        ▼                             │                              │
            │  model/  (PURE — no DOM, no I/O, no time)                           │
            │   types · validate · edits · interpolate · tempo · stage · history  │
            │        │                                                            │
            │  ┌─────┴──────────────┬───────────────────┬──────────────────┐      │
            │  ▼                    ▼                   ▼                  ▼      │
            │ storage/           playback/            io/             (none)     │
            │ IndexedDB:         clock over           export/import             │
            │ routines + songs   <audio> or silent    .formation.json           │
            └─────────────────────────────────────────────────────────────────────┘
                     │                   │                    │
               device storage       song file           file the user shares
```

## 3. Key Components

The **model** (`src/model/`) holds pure TypeScript functions and the types they share.
It has no DOM, no storage, and no clock. Every rule about routines lives here: what a
valid routine is, how an edit changes it, and where dancers are at a given second. It is
where nearly all tests live.

The **store** (`src/app/store.ts`) is a tiny observable holding the one `AppState`. UI
components read from it and dispatch edits. Edits go through the model's edit functions
and the undo history, and every change to `routine` triggers a debounced autosave.

**Storage** (`src/storage/`) is the only code that touches IndexedDB. It exposes
`saveRoutine`, `loadRoutine`, `listRoutines`, `deleteRoutine`, `saveSong`, `loadSong`
and `deleteSong`. Swapping the store underneath later changes this folder only.

**Playback** (`src/playback/`) provides one `PlaybackClock` interface with two
implementations: `AudioClock` (wraps an `<audio>` element and is the clock when a song
is loaded) and `SilentClock` (wraps `performance.now()`, used when there is no song).
The UI never reads time from anywhere else.

**IO** (`src/io/`) serializes a routine to the share file and parses an imported file
back through the model's validator.

The **UI** (`src/ui/`) is vanilla TypeScript that builds DOM and SVG. It contains no
business rules. It is the only layer that is checked by browser smoke tests rather than
unit tests.

## 4. Data Architecture

### 4.1 Routine document (the share-file format, version 1)

```json
{
  "format": "formation-lite/routine",
  "version": 1,
  "id": "6f1c0a3e-2b8f-4c1e-9d2a-5b7e8f0a1c2d",
  "name": "Regionals 2027",
  "createdAt": "2026-11-07T18:00:00.000Z",
  "updatedAt": "2026-11-07T18:42:10.000Z",
  "stage": { "size": { "width": 40, "depth": 30, "unit": "ft" } },
  "song": { "fileName": "regionals-mix.mp3", "durationSeconds": 183.42 },
  "tempo": { "bpm": 128, "firstBeatSeconds": 0.42 },
  "dancers": [
    { "id": "d-1", "name": "Ana Reyes", "color": "#e4572e" }
  ],
  "formations": [
    {
      "id": "f-1",
      "name": "Opening",
      "startSeconds": 0,
      "holdSeconds": 3.75,
      "positions": { "d-1": { "x": 0.5, "y": 0.25 } }
    }
  ]
}
```

Field rules (enforced by `model/validate.ts`; a violation throws a `RoutineFormatError`
naming the field):

| Field | Rule |
|---|---|
| `format`, `version` | Must equal `"formation-lite/routine"` and `1`. Unknown versions are rejected, never guessed at. |
| `id` | Non-empty string; generated with `crypto.randomUUID()`. |
| `name` | 1–80 characters after trimming. |
| `createdAt`, `updatedAt` | ISO-8601 UTC strings. |
| `stage.size` | `null` = open stage. Otherwise `width` and `depth` are numbers in (0, 500] and `unit` is `"ft"` or `"m"`. |
| `song` | `null` or `{ fileName, durationSeconds > 0 }`. Metadata only; the audio is never in this document. |
| `tempo` | `null` = no BPM (time-only timeline). Otherwise `bpm` in [40, 300] and `firstBeatSeconds` ≥ 0. |
| `dancers` | 0–40 entries, unique `id`s, `name` 1–40 characters, `color` as `#rrggbb`. |
| `formations` | Sorted by `startSeconds`, `startSeconds` ≥ 0, `holdSeconds` ≥ 0, and no overlap: `start[i] + hold[i] ≤ start[i+1]`. |
| `positions` | Exactly one entry per dancer in every formation. `x` and `y` are in [−0.1, 1.1]. |

### 4.2 Coordinate system

Positions are **normalized to the stage**, not stored in feet or meters. `x` runs from
`0` (audience's left) to `1` (audience's right). `y` runs from `0` (downstage, nearest
the audience) to `1` (upstage). The extra 0.1 on each side is the wings, so dancers can
start offstage and enter. Normalized coordinates are what make "set the stage size and
everything scales" (W4) a no-op for the data: only rendering changes.

The open stage (`size: null`) renders at a 4:3 aspect with an 8 × 6 grid. A sized stage
renders at `width:depth`, with grid lines every 1, 2, 5, or 10 units, picking the
smallest step that keeps at most 20 cells across. The front edge carries spacing numbers
counting outward from the center line, like floor tape.

The dancer's view (W6) is a rendering transform only: `(x, y) → (1 − x, 1 − y)`, which
turns the stage 180° so the audience is at the top and left and right swap. It is
never stored.

### 4.3 Time model

**Seconds into the song are the source of truth for time.** BPM is an optional overlay:
`beat(t) = (t − firstBeatSeconds) × bpm / 60`, labelled as 8-count `⌊beat / 8⌋ + 1`,
count `⌊beat mod 8⌋ + 1`. Changing or removing the BPM never moves a formation, because
formations are pinned to the music, not to counts.

A formation occupies `[start, start + hold]`. Between one formation's end and the next
formation's start, each dancer moves in a straight line with ease-in-out (smoothstep)
timing. Before the first formation, dancers sit at the first formation. After the last,
they sit at the last. This is `positionsAt(routine, t)`, the function the whole app
renders from.

Adding a formation at the playhead copies what is currently on stage
(`positionsAt(t)`), starts at `t` (snapped to the nearest beat when a tempo is set), and
holds for 4 counts with a tempo or 2 seconds without, clipped so it never overlaps the
next formation. Adding at a time that falls inside an existing hold is rejected.
Editing (dragging dancers) is allowed only while the playhead is inside a formation's
hold, because that is the only time a position is a stored fact rather than an
interpolation.

### 4.4 Device storage (IndexedDB)

There is no SQL database, so the workspace rule about `db/queries.sql` does not apply.
Its intent, one named place for every data access, is kept by `src/storage/`.

```
database  "formation-lite"  (version 1)
├── object store "routines"   keyPath: "id"    value: Routine document (§4.1)
└── object store "songs"      key: routine id  value: { fileName, mimeType,
                                                         durationSeconds, bytes: ArrayBuffer }
```

The song is stored as an `ArrayBuffer` plus a MIME type rather than a `Blob`, because
Blob support in IndexedDB has historically been the less reliable path in Safari. This
is unverified for current Safari versions and is to be checked in the browser smoke
test. The last-opened routine id lives in `localStorage` (a per-device convenience;
losing it only means the routine list shows instead of the last routine).

Autosave writes the whole routine document 500 ms after the last edit. A routine is at
most about 40 dancers × 100 formations × 2 numbers, tens of kilobytes, so whole-document
writes are simpler than diffs and fast enough. Songs are written once, on load.

### 4.5 Sharing

Export downloads `<routine-name>.formation.json` (§4.1, pretty-printed). Import parses
with the same validator as storage. If a routine with the same `id` already exists on
the device, the user is asked to replace it. Because songs are keyed by routine id, **a
teammate who already loaded the song keeps it when importing an updated version** of
the same routine. If the imported `song.durationSeconds` differs from the device's song
by more than 1 second, the app warns that the song looks like a different cut.

## 5. Data Flow

**Editing (W3–W5).** A pointer drag on a dancer in `stageView` goes to
`store.dispatch(moveDancer(...))`. `model/edits.ts` returns a new routine, `history`
pushes the previous one, the store notifies the components, and they re-render. 500 ms
later `storage.saveRoutine` runs. During a drag, positions update live but only one
history entry is pushed, on pointer-up.

**Playback (W6).** Pressing play calls `clock.play()`. Each animation frame reads
`clock.currentTime()`, sets `state.playhead`, and `stageView` calls
`positionsAt(routine, playhead)` to move the 20 SVG circles. No routine data changes
during playback.

**Share (W8).** `io.exportRoutine(routine)` produces a file. On the other device,
`io.importRoutine(file)` calls `validate`, the replace prompt if the id exists,
`storage.saveRoutine`, and finally the song prompt if no song is stored for that id.

## 6. Key Trade-offs

Without a server, nothing syncs. A routine edited on the laptop reaches the phone only
by export and import. That was accepted in the brief in exchange for zero cost and no
accounts.

Normalized coordinates mean resizing a stage from 40 × 30 to 40 × 40 stretches a
circle into an ellipse in real feet. That is the requested behavior ("scale depending
on stage size"), but it means the app cannot answer "keep this exact 6 ft spacing on a
smaller floor". That would need a second, absolute mode later.

Straight-line paths keep the model tiny but cannot show dancers curving around each
other. Collisions mid-transition are visible only by scrubbing.

Using vanilla TypeScript with no UI framework keeps the bundle and the learning surface
small, at the cost of hand-written re-render code. The UI is small enough (six
components) for that to stay manageable, and the choice is a two-way door.

## 7. One-Way Doors

These decisions are expensive to reverse once routine files exist on people's devices
and in group chats. Everything not listed here is a two-way door and should be decided
quickly.

1. **The share-file format (§4.1) is a public contract.** Teammates hold old files
   forever. It is versioned from day one (`format` + `version`), and any change must
   bump `version` and ship a migration from every earlier version.
2. **Time is stored in song seconds, not counts.** Switching to counts later would
   require knowing every old file's tempo, and time-only routines have none.
3. **Positions are normalized to the stage.** Switching to absolute units later would
   need a stage size for every open-stage routine, and they have none.
4. **Every formation stores every dancer.** This makes interpolation trivial and files
   self-explanatory. Allowing missing dancers later is a format change.
5. **The song never leaves the device.** Adding audio to share files later is possible
   (a new version), but promising it now and removing it later would break trust and
   files.

The cheap-to-reverse ones, listed so nobody deliberates over them: IndexedDB vs.
another browser store (hidden behind `storage/`), vanilla TS vs. a framework, SVG vs.
canvas, the easing curve, the hosting provider, and the phone breakpoint.

## 8. Failure Modes

| Component | Down | Slow | Wrong |
|---|---|---|---|
| IndexedDB (private mode, quota, Safari eviction) | App still works for the session. A banner says "Not saving on this device — export to keep your work". | Writes are debounced and async; editing never waits on them. | Every load goes through `validate`. A corrupt record is reported by name and skipped, never half-rendered. |
| Song decode (unsupported codec) | The routine opens on the silent clock with a message naming the file. | N/A. | Duration mismatch on import shows a warning (§4.5). |
| Imported file | N/A. | N/A. | Rejected with the validator's field-level message. Nothing is written until validation passes. |
| Audio clock drift | N/A. | N/A. | Positions are always computed from `audio.currentTime`, never accumulated frame by frame, so there is no drift to accumulate. |

Safari can delete site storage after a period without use (its tracking-prevention
storage cap). The app requests persistent storage with `navigator.storage.persist()`
where the browser supports it. The user-facing rule is still **export is your
backup**, stated in the UI next to the save indicator. The exact eviction policy varies
by Safari version and is not something the app can verify, so it is called out rather
than relied on.

## 9. Build Order (handoff to software-engineer)

The work is a thin vertical slice first. The model functions are pure and come first
with tests (`types → validate → interpolate/tempo/stage → edits → history`). Next come
`storage` (tested against `fake-indexeddb`), then `playback` (tested with a fake time
source). The UI is wired after that so one routine can be created, edited, played and
reloaded, and import/export and the phone layout come last before deploy.

Preconditions that must throw rather than degrade: editing while the playhead is not in
a formation's hold, adding a formation inside an existing hold, an invalid routine
anywhere at a module boundary (load, import, save), and a dancer id in an edit that does
not exist in the routine.

The pure seams are everything in `src/model/` and `src/io/serialize.ts`, which need no
browser environment to test.

## 10. In Plain English

**What we're building:** A free website where a choreographer lays out where each dancer
stands, lines those layouts up with the song, and plays it back to watch everyone move.
Nothing to sign up for, and nothing costs money to run.

**How it fits together:**

- You load your song from your own laptop or phone. It stays on that device.
- You drag dots on a stage to make formations at points in the song. Pressing play moves
  the dots along with the music.
- Everything saves automatically in your browser, so it's there next time on that device.
- To share, you send a small file. Teammates open it with their own copy of the song.

**The key decisions made:**

- Formations are tied to moments in the song, not to counts, so the BPM is optional and
  changing it never scrambles your work.
- Positions are stored relative to the stage, so changing the stage size rescales the
  whole routine automatically.
- The song is never included in the shared file, which keeps files tiny and avoids
  sharing copyrighted music.

**What to watch out for:**

- Nothing syncs between devices on its own. Sending the file is the only way to share,
  and it is also your backup.
- Some browsers (especially Safari) can clear saved data after long stretches without
  use, so export routines you care about.
