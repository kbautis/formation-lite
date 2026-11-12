# formation-lite

A free, minimalist dance formation planner synced to music. Place dancers on a stage,
pin formations to moments in your song, and press play to watch everyone move. There
are no accounts and nothing to pay for, and your routines stay on your device.

## Why I made this

I created formation-lite because I wanted a free choreography app I could use on my
laptop. It's a personal project, not intended to be for-profit. There's probably a lot
of room for improvement, so I'm open to suggestions and feedback.

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
length. On the timeline, drag a formation's **left edge** to change when it starts or its
**right edge** to change how long it holds. Drags snap to the beat when a BPM is set and
always leave at least 1 count (0.5 s) for dancers to move.

### Transitions

The dashed segment between two formations is the transition, labeled with its length.
With a formation selected, the sidebar's **Transition in** section sets:

- **Takes:** how long dancers have to arrive. Changing it moves when the previous
  formation releases; this formation stays on its beat.
- **Ripple:** dancers set off one after another (left to right, front to back, in list
  order, and so on), with a **Spread** for how staggered they are.

While you're on a formation, each dancer's path from the previous formation is drawn on
the stage (toggle with **Paths**). If two dancers pass closer than 2 ft (0.6 m) mid-move,
their paths and the transition turn red and the sidebar says who and when. The collision
check is optional: turn it off with **Collisions** (this device remembers the choice). The timeline fits the whole song in the window; **−/+** zoom in for detail and **Fit**
shows the whole song again. **Hide panels** (bottom right) gives the stage the full width; this device
remembers the choice. ←/→ step one count (or one second without a BPM). Ctrl/⌘+Z undoes.

### Sharing with your team

Press **Export** to download a small `.formation.json` file and send it to your team.
A teammate opens the app, presses **Open file**, picks the file, and loads their own
copy of the song. The song is never inside the file. If you send an updated version
later, opening it replaces their copy and keeps the song they already loaded.

**Share link** does the same in one step. It makes a link that carries the whole
routine; on a phone it opens the share sheet, and on a laptop it copies the link so you
can paste it in the team chat. Tapping the link opens the routine in the app and saves
it on that device, the same as opening the file.

- A link is a snapshot. After you change the routine, send a new link.
- If a teammate already has the routine, the app asks before replacing it, says when the
  link's version was shared, and warns when the link is older than the copy they have.
  Their song stays loaded.
- The song is never in a link. The routine is in the part of the address after `#`,
  which browsers don't send to the website, so it only goes where you paste it.
- A very large routine can be too long for a link. The app says so, and Export still
  works.
- A link that was cut off or damaged in the chat is rejected and changes nothing.

Links don't replace the file: **export is still your backup.**

On a phone the app is a viewer: open, play, scrub, and flip. Editing needs a larger screen.

### Export is your backup

Routines save automatically in your browser on this device. Browsers can clear site
data (Safari in particular may clear it after long periods without use), and private
windows don't keep it at all. Export routines you care about.

## Running it locally

### 1. Install Node.js

You need Node.js 22.12 or newer. It comes with `npm`, which installs the project's tools.
Check whether you already have it:

```bash
node --version
```

If that prints `command not found` or a version below 22.12, install Node.js one of these
ways, then close and reopen your terminal:

- **macOS with Homebrew:**

  ```bash
  brew install node
  ```

- **macOS or Windows without Homebrew:** download the installer marked **LTS** from
  [nodejs.org](https://nodejs.org) and run it.
- **Linux:** use your distribution's Node.js 22 package or
  [nvm](https://github.com/nvm-sh/nvm), then run `nvm install 22`.

Run `node --version` again to confirm it prints `v22` or higher.

### 2. Get the code and install

```bash
git clone https://github.com/kbautis/formation-lite.git
```

```bash
cd formation-lite
```

```bash
npm install
```

npm may warn that `fsevents` has install scripts it didn't run. That's an optional macOS
file-watching helper and the app works without it.

### 3. Start the app

```bash
npm run dev
```

Open the address it prints, usually http://localhost:5173. Edits to the code reload the
page automatically. Press Ctrl+C in the terminal to stop it.

To pick up new changes later, run `git pull`, restart `npm run dev`, and reload the page
with Cmd+Shift+R (Ctrl+Shift+R on Windows and Linux).

## Developing

Run the unit tests, the type checker, and the browser smoke test:

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
export, import on a fresh profile, share links (opened on a fresh profile and a phone,
plus tampered and cut-off links), blocked storage, and the phone layout. It expects
Playwright and Chromium to be installed globally, resolvable through `NODE_PATH`.

The design is in [`docs/architecture.md`](docs/architecture.md), the product brief in
[`docs/requirements.md`](docs/requirements.md), and the build plan in
[`CLAUDE.md`](CLAUDE.md).

## Deploying

The GitHub Actions workflow in `.github/workflows/deploy.yml` typechecks, tests, and
builds every push and pull request. Pushes to `main` also publish to GitHub Pages once
Pages is enabled with **Settings → Pages → Source: GitHub Actions**.
