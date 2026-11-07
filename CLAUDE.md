# CLAUDE.md — formation-lite

## Project overview

formation-lite is a free, minimalist web app for planning dance formations synced to
music. A club choreographer places dancers on a stage, pins formations to moments in the
song, and plays them back; teammates open a shared file to watch it. The confirmed brief
is in `docs/requirements.md` and the design in `docs/architecture.md`; both are binding.
The learning goals are to keep a browser app's logic in pure, tested functions, to drive
animation from a media clock without drift, to use IndexedDB behind a narrow module, and
to treat a file format as a versioned public contract.

## Stack

- Language: TypeScript 7.0 in `strict` mode, ES2022 modules
- Frontend: vanilla TypeScript, DOM + inline SVG, no UI framework
- Build/dev server: Vite 8
- Storage: browser IndexedDB (routines + songs) and `localStorage` (last-opened id only)
- Audio: HTML `<audio>` element as the playback clock
- Unit tests: Vitest 5 with jsdom 31 and fake-indexeddb 6
- Browser smoke test: the machine's pre-installed Playwright + Chromium, via `npm run smoke`
- Runtime: Node.js 22.12+ (build only; the app itself has no server)
- Deploy: GitHub Pages via GitHub Actions
- External APIs: none. AI layer: none.

## Project structure

```
formation-lite/
├── CLAUDE.md                     # this file — build spec and task queue
├── README.md                     # what it is, how to run, how to use
├── docs/
│   ├── requirements.md           # confirmed product brief (source of truth for "what")
│   └── architecture.md           # design, data format, one-way doors (source of truth for "how")
├── index.html                    # app shell
├── package.json                  # scripts: dev, build, test, typecheck, smoke
├── tsconfig.json                 # strict TS config
├── vite.config.ts                # relative base path for Pages; Vitest config
├── .github/workflows/deploy.yml  # typecheck + test + build + publish to Pages
├── scripts/
│   └── smoke.mjs                 # Playwright smoke test against the built site
├── src/
│   ├── main.ts                   # entry: boot storage, build layout, mount UI, start controller
│   ├── appInfo.ts                # APP_NAME
│   ├── vite-env.d.ts             # Vite client types (CSS imports)
│   ├── styles.css                # all styles, light/dark tokens, phone view-only layout
│   ├── model/                    # PURE: no DOM, no I/O, no clock
│   │   ├── types.ts              # Routine, Dancer, Formation, Position, StageSize, Tempo
│   │   ├── errors.ts             # RoutineFormatError, EditError
│   │   ├── validate.ts           # parseRoutine(unknown) → Routine, throws field-level errors
│   │   ├── interpolate.ts        # positionsAt(routine, t), activeFormationAt(routine, t)
│   │   ├── tempo.ts              # beatAt, countLabelAt, snapToBeat, beatsToSeconds, beatTimesBetween
│   │   ├── time.ts               # formatTime (m:ss.t)
│   │   ├── stage.ts              # stageAspect, gridStep, gridLines, toViewCoords (flip), SVG mapping, clampToWings
│   │   ├── timeline.ts           # timelineDurationSeconds, rulerStepSeconds, fitPixelsPerSecond, countLabelEvery
│   │   ├── edits.ts              # immutable edit functions on Routine
│   │   ├── factory.ts            # createRoutine, createDancer, nextColor
│   │   └── history.ts            # undo/redo stack of Routine snapshots
│   ├── io/
│   │   ├── serialize.ts          # serializeRoutine, parseRoutineFile, routineFileName, songDurationsMatch (pure)
│   │   └── files.ts              # downloadRoutine, readRoutineFile (browser glue)
│   ├── storage/
│   │   ├── database.ts           # openDatabase(factory), runRequest, StorageError
│   │   ├── routines.ts           # saveRoutine, loadRoutine, listRoutines, deleteRoutineWithSong
│   │   └── songs.ts              # saveSong, loadSong, deleteSong
│   ├── playback/
│   │   ├── clock.ts              # PlaybackClock interface + SilentClock
│   │   └── audioClock.ts         # AudioClock over HTMLAudioElement
│   ├── app/
│   │   ├── state.ts              # AppState type + initial state
│   │   ├── store.ts              # createStore: getState / setState / subscribe
│   │   └── controller.ts         # dispatches edits, history, autosave, playback loop
│   └── ui/
│       ├── dom.ts                # tiny element/SVG helpers
│       ├── format.ts             # initials (display formatting)
│       ├── keyboard.ts           # Space, ←/→, undo/redo shortcuts
│       ├── notice.ts             # toast notices + "not saving" banner
│       ├── toolbar.ts            # routine name, routine picker, new/open file/export/delete, save status
│       ├── transport.ts          # play/pause, time + count readout, add formation, flip, undo/redo, zoom −/Fit/+
│       ├── stagePanel.ts         # open stage vs. real width × depth
│       ├── sidebarToggle.ts      # Hide/Show panels so the stage gets the full width (per-device preference)
│       ├── songPanel.ts          # load song, BPM, tap first beat
│       ├── dancerPanel.ts        # add/rename/recolor/remove dancers
│       ├── stageView.ts          # SVG stage, grid, dancers, drag, view flip
│       ├── timelineView.ts       # fit-to-window zoom, time/count ruler, formation blocks + hold handles, playhead, seek
│       └── formationInspector.ts # selected formation: name, start, hold, delete
└── tests/                        # Vitest unit tests mirroring src/
```

## Database schema

There is no SQL database. All data lives in the browser's IndexedDB, so the
`db/queries.sql` rule does not apply. Its intent is kept by `src/storage/`, which is the
only code allowed to touch IndexedDB, with one named function per operation. The stores
and the routine document format are defined in `docs/architecture.md` §4.1 and §4.4.
Write `src/model/types.ts` and `src/model/validate.ts` first. Every value read from
storage or a file goes through `parseRoutine` before use.

```
database "formation-lite" (version 1)
├── "routines"  keyPath "id"     → Routine document (format "formation-lite/routine", version 1)
└── "songs"     key routine id   → { fileName, mimeType, durationSeconds, bytes: ArrayBuffer }
```

## Skill pipeline

```
product-manager → system-architect → software-engineer → fact-checker
"What & why"       "Design first"      "Build it right"    "Verify claims"
```

**Stage 0 — product-manager.** Done: `docs/requirements.md` is confirmed. A new feature
that is not in the brief or the stretch list goes back to this stage before any code.

**Stage 1 — system-architect (before writing any code).** Before implementing any task,
write a brief architecture note as a comment at the top of the first file created in that
task. It is 5–10 lines covering function boundaries, data flow, key design decisions, and
the load-bearing choices that must not change. The one-way doors in
`docs/architecture.md` §7 must not be changed without a new format version. This is not
optional.

**Stage 2 — software-engineer (while building).**

- Write the failing test first (RED), then implement (GREEN), then refactor (BLUE).
- Each function does one thing.
- Fail fast: throw `RoutineFormatError` or `EditError` immediately on bad input, and
  never return `undefined` silently.
- Every IndexedDB access lives in `src/storage/` before it is called anywhere.
- No secrets in code. This project has none, and none may be added.

**Stage 3 — fact-checker (before committing).**

- All tests pass (`npm test` clean) and `npm run typecheck` is clean.
- No assumed library or browser behavior. Verify against MDN or the source and note the
  check in the architecture note when it is load-bearing.
- No hardcoded magic values outside named constants, no `console.log`, no TODO comments.
- Code matches what the architecture note said it would do. If it drifted, update the note.

## Autonomous task loop

```
When running headless, work through the task queue in order. For each task:

1. Read the full task checklist before starting anything
2. Architect — write the architecture note (Stage 1) before writing code
3. Build — implement using TDD: failing test → passing code → refactor
4. Verify — run npm test and npm run typecheck, check all boxes in the task checklist
5. Commit — git add -A && git commit -m "[Task N] <what was built>"
6. Update this file — check off completed boxes in the task checklist
7. Move to the next task immediately

Commit message format:
[Task 2] Routine model — types, validator, field-level errors, tests passing
[Task 3] Timeline math — interpolation, tempo, stage geometry, tests passing

When to stop and wait for input:
- A test fails that requires a design decision
- A browser API behaves differently from what docs/architecture.md assumes
- A task checklist item is ambiguous and two interpretations lead to different code
In all other cases: keep going.
```

## Engineering principles

1. **Fail fast** — raise immediately on bad input, never return None silently
2. **Single responsibility** — each function does one thing; if you write "and" in
   a description, split the function
3. **Raw SQL first** — omitted: this project has no SQL database. The equivalent rule is
   that every IndexedDB access lives in `src/storage/` with a name before it is called.
4. **TDD** — write a failing test before writing implementation; red → green → refactor
5. **No secrets in code** — every key, token, and credential from `.env` via
   `os.getenv()`; raise immediately if a required env var is missing
6. **Clarity over cleverness** — name things what they are; no abbreviations unless
   universally understood

## Environment variables

None. The app is a static site with no server, no API keys, and no build-time
configuration. If one is ever added, it must be listed here and read through a single
function that throws when it is missing.

## Task queue

### Task 1 — Project scaffold
- [x] Create CLAUDE.md, docs/requirements.md, docs/architecture.md
- [x] Create package.json (scripts: dev, build, preview, test, typecheck, smoke), tsconfig.json, vite.config.ts, .gitignore, index.html, src/main.ts
- [x] Install vite, typescript, vitest, jsdom, fake-indexeddb as devDependencies
- [x] Verify: `npm run typecheck`, `npm test` (one placeholder-free sanity test), and `npm run build` all succeed

### Task 2 — Routine model and validator
- [x] `model/types.ts`: types exactly as `docs/architecture.md` §4.1
- [x] `model/errors.ts`: `RoutineFormatError(path, message)`, `EditError(message)`
- [x] `model/validate.ts`: `parseRoutine(input: unknown): Routine` enforcing every rule in the §4.1 table, with the field path in each error
- [x] `model/factory.ts`: `createRoutine(name, now, id)`, `createDancer(name, existing)`, `nextColor(existingDancers)` from a fixed 20-color palette
- [x] Verify: tests cover every rule in the §4.1 table (one valid, one invalid case each)

### Task 3 — Timeline math
- [x] `model/interpolate.ts`: `activeFormationAt`, `positionsAt` with smoothstep easing; before-first and after-last clamps
- [x] `model/tempo.ts`: `beatAt`, `countLabelAt` ("8-count 3 · 5"), `snapToBeat`, `beatsToSeconds`
- [x] `model/stage.ts`: `stageAspect`, `gridStep`, `gridLines`, `toViewCoords(position, view)` for audience and dancer views
- [x] Verify: tests for hold, mid-transition, boundaries, zero-length transitions, flip, and grid steps for 10/40/100-unit stages

### Task 4 — Edits and history
- [x] `model/edits.ts`: `renameRoutine`, `addDancer` (adds a position to every formation), `updateDancer`, `removeDancer` (removes it everywhere), `addFormationAt`, `updateFormationTiming`, `renameFormation`, `removeFormation`, `moveDancer`, `setStageSize`, `setTempo`, `setSongInfo`, `touchRoutine`, `editableFormationAt`, `holdSecondsForEnd`
- [x] Every edit returns a new routine that passes `parseRoutine`, and throws `EditError` on preconditions in architecture §9
- [x] `model/history.ts`: `createHistory`, `pushHistory`, `undo`, `redo`, capped at 100 entries
- [x] Verify: tests for each edit, each precondition, and undo/redo round-trips

### Task 5 — Storage
- [x] `storage/database.ts`, `storage/routines.ts`, `storage/songs.ts` per architecture §4.4
- [x] `loadRoutine` and `listRoutines` validate every record; a corrupt record is reported, not returned
- [x] Verify: tests run against `fake-indexeddb` (save → load round-trip, list, delete, corrupt record)

### Task 6 — Playback clock and serialization
- [x] `playback/clock.ts`: `PlaybackClock` interface and `SilentClock(now: () => number)`
- [x] `playback/audioClock.ts`: `AudioClock(audioElement)`
- [x] `io/serialize.ts`: `serializeRoutine`, `routineFileName`; `io/files.ts` download/read glue
- [x] Verify: SilentClock tests with a fake time source; serialize → parse round-trip test

### Task 7 — App shell and editing UI
- [x] `app/state.ts`, `app/store.ts`, `app/controller.ts` (edits → history → autosave; rAF playback loop)
- [x] `ui/*` components per the project structure; editing only while the playhead is in a formation hold
- [x] Verify: `npm run smoke` creates a routine, adds 3 dancers, adds 2 formations, plays, reloads, and finds the routine still there

### Task 8 — Sharing and phone layout
- [x] Export/import with replace prompt, song-duration warning, and song kept across re-imports
- [x] Phone layout (≤ 720 px wide): stage + timeline + play/flip only; editing hidden
- [x] Persistent-storage request and "Not saving on this device" banner when IndexedDB fails
- [x] Verify: smoke test covers export → import on a fresh profile and the phone viewport

### Task 9 — Deploy
- [x] `.github/workflows/deploy.yml`: on push to `main`, run typecheck + test + build and publish `dist/` to GitHub Pages
- [x] README: what it is, how to use it, "export is your backup"
- [ ] Verify: the workflow is green and the Pages URL loads the app (needs Pages enabled in repo settings)

## Definition of done

- [ ] Every acceptance criterion in `docs/requirements.md` is met
- [ ] A 20-dancer, 3-minute routine plays back smoothly in desktop Chrome
- [ ] Export from one browser profile and import into another reproduces the routine exactly
- [ ] The phone layout opens, plays, scrubs, and flips a routine
- [ ] The site is live on GitHub Pages
- [ ] All tests passing
- [ ] Written retrospective completed

## Stretch features (only after definition of done is met)

- Teammate highlight: "just me" emphasizes one dancer and draws their path (confirmed by the product owner)
- Waveform drawn under the timeline
- Drag formation blocks on the timeline to move their start (dragging the right edge to change the hold is done)
- Tap tempo to detect BPM
- Copy/paste a formation; mirror a formation left-right
- Several dancers selected and moved together
- Print / PDF formation sheets

## Independence checks

- Can you explain, without looking it up, why `positionsAt` reads the audio element's current time on every frame instead of adding up frame durations?
- Can you write the validator rule that rejects overlapping formations, and the test for it, from scratch?
- Can you describe what has to happen to old share files if version 2 of the format stores positions in feet?
- Can you open IndexedDB, write a record, and read it back in plain browser JavaScript, without looking it up?
- Can you explain why the dancer's view is a rendering transform and not stored data?
