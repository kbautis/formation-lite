# formation-lite

A free, minimalist dance formation planner synced to music. Place dancers on a stage,
pin formations to moments in your song, and press play to watch everyone move. There
are no accounts and nothing to pay for, and your routines stay on your device.

## Using it

1. **Name your routine** at the top. A new routine starts with one "Opening" formation.
2. **Load your song** under *Music*. If you want 8-counts on the timeline, type the BPM,
   play the song, pause on the first "1", and press *Count 1 is at the playhead*. The
   BPM is optional: without it everything works on minutes and seconds.
3. **Add dancers** under *Dancers*. Each gets a color and shows their initials on stage.
4. **Drag dancers** into the opening formation.
5. **Move the playhead** by clicking or dragging the timeline, then press *+ Formation*.
   The new formation starts as a copy of what's on stage; drag dancers to their new spots.
   Dancers glide in a straight line from one formation to the next.
6. **Play** (or press Space) to watch it with the music. *Audience view* flips the stage
   to the dancers' point of view.
7. **Stage size** is open by default. Under *Stage*, set a real width × depth for a
   specific floor. The grid switches to feet or meters and dancers keep their relative
   spots.

Click a formation on the timeline to jump to it and edit its name, start time, or hold
length. **Hide panels** (bottom right) gives the stage the full width; this device
remembers the choice. ←/→ step one count (or one second without a BPM). Ctrl/⌘+Z undoes.

### Sharing with your team

Press **Export** to download a small `.formation.json` file and send it to your team.
A teammate opens the app, presses **Open file**, picks the file, and loads their own
copy of the song. The song is never inside the file. If you send an updated version
later, opening it replaces their copy and keeps the song they already loaded.

On a phone the app is a viewer: open, play, scrub, and flip. Editing needs a larger screen.

### Export is your backup

Routines save automatically in your browser on this device. Browsers can clear site
data (Safari in particular may clear it after long periods without use), and private
windows don't keep it at all. Export routines you care about.

## Developing

Node.js 22.12+.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run smoke
```

`npm run smoke` builds the site and drives it in headless Chromium through the whole
workflow: create, add dancers, load a song, set BPM, add formations, play, reload,
export, import on a fresh profile, blocked storage, and the phone layout. It expects
Playwright and Chromium to be installed globally, resolvable through `NODE_PATH`.

The design is in [`docs/architecture.md`](docs/architecture.md), the product brief in
[`docs/requirements.md`](docs/requirements.md), and the build plan in
[`CLAUDE.md`](CLAUDE.md).

## Deploying

The GitHub Actions workflow in `.github/workflows/deploy.yml` typechecks, tests, and
builds every push and pull request. Pushes to `main` also publish to GitHub Pages once
Pages is enabled with **Settings → Pages → Source: GitHub Actions**.
