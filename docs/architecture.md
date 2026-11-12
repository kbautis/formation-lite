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
file export/import or a share link that carries the same document (§4.6).

## 2. Component Map

```
            ┌──────────────────────────── browser tab ────────────────────────────┐
            │                                                                     │
  user ───▶ │  ui/  (DOM + SVG, no logic)                                         │
            │   toolbar · notice · stageView · timelineView · transport ·         │
            │   songPanel · stagePanel · dancerPanel · formationInspector         │
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
components subscribe with `watch(store, select, render)`, which re-renders only when a
value they declared changes, and dispatch edits through the controller. The routine on
screen *is* `history.present` (there is no second copy): edits push onto the history,
drags update the present in place and push one step when they end, and every change
triggers a debounced autosave. Song info is written into every history snapshot when a
song loads, so undo never reverts it.

**Storage** (`src/storage/`) is the only code that touches IndexedDB. It exposes
`saveRoutine`, `loadRoutine`, `listRoutines`, `deleteRoutineWithSong`, `saveSong`, `loadSong`
and `deleteSong`. Swapping the store underneath later changes this folder only.

**Playback** (`src/playback/`) owns the song and the clock. `SongLoader` manages the
`<audio>` element's source: one load at a time, and starting another load or switching
routines cancels the pending one, so a slow load can never attach to a routine the user
has left. It provides one `PlaybackClock` interface with two
implementations: `AudioClock` (wraps an `<audio>` element and is the clock when a song
is loaded) and `SilentClock` (wraps `performance.now()`, used when there is no song).
The UI never reads time from anywhere else.

**IO** (`src/io/`) serializes a routine to the share file and parses an imported file
back through the model's validator.

The **UI** (`src/ui/`) is vanilla TypeScript that builds DOM and SVG. It contains no
business rules. It is the only layer that is checked by browser smoke tests rather than
unit tests.

## 4. Data Architecture

### 4.1 Routine document (the share-file format, version 2)

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
| `dancers` | 0–40 entries, unique `id`s, `name` 1–40 characters, `color` as lowercase `#rrggbb`. |
| `formations` | At least one, unique `id`s, `name` 0–40 characters, sorted by `startSeconds`, `startSeconds` ≥ 0, `holdSeconds` ≥ 0, and no overlap: `start[i] + hold[i] ≤ start[i+1]`. New routines start with one "Opening" formation at 0 s. |
| `positions` | Exactly one entry per dancer in every formation. `x` and `y` are in [−0.1, 1.1]. |

**Version 2 (2026-11-08)** adds one field per formation, `stagger`, describing how dancers
move *into* that formation: `null` (everyone together) or
`{ "order": "left-to-right" | "right-to-left" | "front-to-back" | "back-to-front" | "list-order", "spread": 0.1–0.9 }`.
`parseRoutine` accepts versions 1 and 2 and always returns version 2; a version 1 document
migrates by giving every formation `stagger: null`. Storage and exports therefore hold
version 2 from the first save. An app that only knows version 1 rejects version 2 files
with a clear "unsupported version" error instead of silently dropping the ripple.

### 4.2 Coordinate system

Positions are **normalized to the stage**, not stored in feet or meters. `x` runs from
`0` (audience's left) to `1` (audience's right). `y` runs from `0` (downstage, nearest
the audience) to `1` (upstage). The extra 0.1 on each side is the wings, so dancers can
start offstage and enter. Normalized coordinates are what make "set the stage size and
everything scales" (W4) a no-op for the data: only rendering changes.

The open stage (`size: null`) renders at a 4:3 aspect with an 8 × 6 grid. A sized stage
renders at `width:depth`, with grid lines every 1, 2, 5, 10, 25, 50, or 100 units,
picking the smallest step that keeps at most 20 cells across the longer side. The front edge carries spacing numbers
counting outward from the center line, like floor tape.

**Rounding (2026-11-12).** Every edit that writes a position (`moveDancer`, the copy in
`addFormationAt`, a new dancer's spot in `addDancer`) rounds `x` and `y` to
`POSITION_DECIMALS = 4` through one `roundPosition` helper. 0.0001 of the largest stage
(500 units) is 0.05 units, finer than a pointer can place a dot, and dropping the float
noise roughly halves a share link (measured on random positions, 20 dancers × 40
formations: 24,302 → 11,262 characters). Values already stored are left as they are
until edited; this is not a format change.

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

### 4.3.1 Transitions (2026-11-08)

A transition is still exactly the gap between one formation's hold ending and the next
starting; it is not stored separately, so the time model above is unchanged. What is new:

- **Ripple timing.** Within a transition with `stagger`, dancers are ranked 0…1 by the
  chosen order, using their positions in the *previous* formation (ties by list order).
  With spread *s*, a dancer of rank *r* moves during the slice
  `[r·s, r·s + (1 − s)]` of the transition, eased with smoothstep inside that slice.
  Everyone still leaves at the gap's start and has arrived by its end.
- **Minimum transition on drags.** `holdSecondsForEnd` and `startSecondsForDrag` keep 1
  count (0.5 s without a tempo) free before or after the neighbor, unless the gap is
  already smaller, in which case the drag can only widen it.
- **Transition in** (`setTransitionIn`) changes the previous formation's hold so the
  current formation's start, which is pinned to the music, never moves.
- **Close encounters** (`model/collisions.ts`) sample `positionsAt` across each
  transition (so ripples are included) and measure distances in stage proportions
  (real units for a sized stage, 1 = depth for an open stage). A pair is flagged when
  its closest approach inside the transition is under 2 ft / 0.6 m / 1/15 of the depth
  while both its start and end distances are not. Sampling can miss a pass that is
  shorter than one sample interval; 48 samples per transition keep that window under
  ~0.1 s for transitions up to ~5 s.
- **Caching.** `encountersFor(routine)` is cached per routine object, so the stage,
  timeline and sidebar share one computation; underneath, each transition's result is
  cached by its content (timing, ripple, positions, dancers, stage), because every edit
  rebuilds the routine through `parseRoutine`. Dragging a dancer recomputes only the two
  transitions next to the edited formation.

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

### 4.6 Share links (2026-11-12)

A share link is the app's own address with the routine in the fragment:

```
https://<site>/<path>#share=1.<payload>
```

- **Encoding 1.** `<payload>` is base64url (RFC 4648 §5, no padding) of deflate-raw
  (`CompressionStream("deflate-raw")`) of the routine document (§4.1, version 2) as
  compact JSON. The `1` is the *link encoding* version; the document inside still carries
  its own `format` and `version`, so routine versions migrate through `parseRoutine`
  exactly as files do, and the two version numbers change independently.
- **The host never sees it.** Browsers do not send the fragment in the HTTP request, so
  GitHub Pages serves the same `index.html` and never receives the routine. The chat app
  the link is pasted into does see it, as it sees an attached file today.
- **Making a link** (`encodeShareLink(routine, baseUrl)` in `src/io/shareLink.ts`): the
  controller touches `updatedAt`, the document is serialized compactly, compressed and
  encoded, and appended to `location.origin + location.pathname`. A link longer than
  `SHARE_LINK_MAX_CHARACTERS` (100,000) is refused with "too large for a link — use
  Export". Delivery tries `navigator.share({ title, url })` when `navigator.canShare`
  accepts it (a cancelled sheet does nothing), then `navigator.clipboard.writeText`, and
  if both fail shows the link in a selected read-only field to copy by hand.
- **Reading a link** (`readShareFragment(hash)` → payload or `null`, then
  `decodeShareLink(fragment)` → `Routine`). Checks run cheapest first, and every failure
  is a `RoutineFormatError` with path `link`: length over `SHARE_LINK_MAX_CHARACTERS`;
  an unknown encoding number ("made by a newer version of formation-lite"); characters
  outside the base64url alphabet; a stream that fails to inflate (cut off or damaged);
  more than `SHARE_DECOMPRESSED_MAX_BYTES` (4 MiB, above the largest valid routine of
  about 2.7 MB as compact UTF-8) coming out of the stream, at which point reading stops, so a compression
  bomb cannot exhaust memory; invalid UTF-8 (`TextDecoder` with `fatal: true`); invalid
  JSON; then `parseRoutine`. Nothing is written until all of it passes.
- **Opening a link.** At startup (after `controller.start()`) and on `hashchange`,
  `main.ts` reads `location.hash`. If it holds a share link, it first removes it with
  `history.replaceState` (keeping path and query), so a reload or bookmark never offers
  the snapshot again, then decodes it and hands the routine to the controller's single
  `importRoutine(routine, confirmReplace)` path, which file import uses too. When a
  routine with the same id is on the device, the prompt names it, says when the link's
  version was edited (its `updatedAt`), and adds "This link is older than your copy"
  when the incoming `updatedAt` is earlier than the stored one. Songs stay keyed by
  routine id, so a teammate's song survives the update (§4.5).
- **Verified, and still to verify.** `CompressionStream` with `deflate-raw` ships in
  Chrome, Firefox 113+ and Safari 16.4+ (MDN); the implementation re-checks this on MDN and
  notes it in the module's architecture note. How long a link the common chat apps
  (WhatsApp, iMessage, Discord) deliver intact is not documented anywhere reliable and
  is checked by hand before release; the results are recorded here.

## 5. Data Flow

**Editing (W3–W5).** A pointer drag on a dancer in `stageView` goes to
`store.dispatch(moveDancer(...))`. `model/edits.ts` returns a new routine, `history`
pushes the previous one, the store notifies the components, and they re-render. 500 ms
later `storage.saveRoutine` runs. During a drag, positions update live but only one
history entry is pushed, on pointer-up.

**Timeline editing.** The timeline zooms to fit its width by default, so a whole song is
visible; zooming by hand leaves fit mode and *Fit* returns to it. Dragging a formation's
edge calls `beginEdgeDrag(id, "start" | "end")` / `dragEdgeTo` / `endEdgeDrag`. Each move
computes the new timing with `holdSecondsForEnd` or `startSecondsForDrag` (snapped to the
beat with a tempo, leaving a minimum transition, §4.3.1) and updates the routine live;
pointer-up records one undo step,
the same pattern as dragging a dancer; only one drag (dancer or edge) can be active, and
undo is ignored until it ends. The edge rule itself is `dragFormationEdge` in the model.
Zoom is stored as the user's choice (`fit`, or a manual px/s); the timeline derives the
fitted scale from its own measured width, and freezes the timeline length used for it
while an edge is dragged, so the scale does not change under the pointer.

**Playback (W6).** Pressing play calls `clock.play()`. Each animation frame reads
`clock.currentTime()`, sets `state.playhead`, and `stageView` calls
`positionsAt(routine, playhead)` to move the 20 SVG circles. No routine data changes
during playback.

**Share (W8).** `io.exportRoutine(routine)` produces a file. On the other device,
`io.importRoutine(file)` calls `validate`, the replace prompt if the id exists,
`storage.saveRoutine`, and finally the song prompt if no song is stored for that id.
A share link takes the same path after `decodeShareLink` (§4.6): **Share link** →
`encodeShareLink` → share sheet or clipboard → chat → teammate taps it → `main.ts`
clears the fragment → `decodeShareLink` → `importRoutine`.

## 6. Key Trade-offs

Without a server, nothing syncs. A routine edited on the laptop reaches the phone only
by export and import. That was accepted in the brief in exchange for zero cost and no
accounts. Share links (§4.6) make each send one step, but a link is still a snapshot: a
link that always shows the latest version needs a server and stays out of scope.

Normalized coordinates mean resizing a stage from 40 × 30 to 40 × 40 stretches a
circle into an ellipse in real feet. That is the requested behavior ("scale depending
on stage size"), but it means the app cannot answer "keep this exact 6 ft spacing on a
smaller floor". That would need a second, absolute mode later.

Straight-line paths keep the model tiny but cannot show dancers curving around each
other. Collisions mid-transition are visible only by scrubbing.

Using vanilla TypeScript with no UI framework keeps the bundle (about 14 kB gzipped) and
the learning surface small, at the cost of hand-written re-render code. The UI is small enough (nine
small components, each re-rendering only its own slice of state) for that to stay
manageable, and the choice is a two-way door.

## 7. One-Way Doors

These decisions are expensive to reverse once routine files exist on people's devices
and in group chats. Everything not listed here is a two-way door and should be decided
quickly.

1. **The share-file format (§4.1) is a public contract.** (Exercised on 2026-11-08: version
   2 added `stagger` with a migration from version 1.) Teammates hold old files
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
6. **Share links are a public contract too (2026-11-12).** Links live in group chats
   forever. `#share=<encoding>.<payload>` and encoding 1 (§4.6) must stay readable;
   a different compression or layout gets a new encoding number while the old one keeps
   decoding. The payload is always a routine document read through `parseRoutine`, so
   the routine format's own versioning (door 1) covers what is inside.

The cheap-to-reverse ones, listed so nobody deliberates over them: IndexedDB vs.
another browser store (hidden behind `storage/`), vanilla TS vs. a framework, SVG vs.
canvas, the easing curve, the hosting provider, and the phone breakpoint.

## 8. Failure Modes

| Component | Down | Slow | Wrong |
|---|---|---|---|
| IndexedDB (private mode, quota, Safari eviction) | App still works for the session. A banner says "Not saving on this device — export to keep your work". | Writes are debounced and async; editing never waits on them. | Every load goes through `validate`. A corrupt record is reported by name and skipped, never half-rendered. |
| Song decode (unsupported codec) | The routine opens on the silent clock with a message naming the file. | N/A. | Duration mismatch on import shows a warning (§4.5). |
| Imported file | N/A. | N/A. | Rejected with the validator's field-level message. Nothing is written until validation passes. Ids must match a safe pattern (no `__proto__`), positions are read with `Object.hasOwn`, and at most 500 formations are accepted, so a crafted file can neither corrupt a routine nor freeze the app. |
| Share link | No share sheet and no clipboard access: the link is shown in a selected field to copy by hand. | N/A. | Cut off, damaged or tampered: rejected with a `link` error before anything is written. Length and decompressed size are capped (§4.6), so a crafted link cannot freeze the tab. An older snapshot is flagged in the replace prompt. |
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
