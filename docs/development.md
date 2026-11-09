# Developing formation-lite

This page is for people changing the code. To use the app, open
[kbautis.github.io/formation-lite](https://kbautis.github.io/formation-lite/); nothing
needs to be installed.

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
export, import on a fresh profile, blocked storage, and the phone layout. It expects
Playwright and Chromium to be installed globally, resolvable through `NODE_PATH`.

The design is in [`docs/architecture.md`](docs/architecture.md), the product brief in
[`docs/requirements.md`](docs/requirements.md), and the build plan in
[`CLAUDE.md`](CLAUDE.md).

## Deploying

The GitHub Actions workflow in `.github/workflows/deploy.yml` typechecks, tests, and
builds every push and pull request. Pushes to `main` also publish to GitHub Pages once
Pages is enabled with **Settings → Pages → Source: GitHub Actions**.
