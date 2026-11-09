# formation-lite

A free, minimalist dance formation planner synced to music. Place dancers on a stage,
pin formations to moments in your song, and press play to watch everyone move. There
are no accounts and nothing to pay for, and your routines stay on your device.

**Open the app: [kbautis.github.io/formation-lite](https://kbautis.github.io/formation-lite/)**

It runs in your browser, so there's nothing to install. Use a recent version of Chrome,
Edge, Firefox, or Safari on a laptop to build routines; on a phone it's a viewer for
watching them.

## Why I made this

I created formation-lite because I wanted a free choreography app I could use on my
laptop. It's a personal project, not intended to be for-profit. There's probably a lot
of room for improvement, so I'm open to suggestions and feedback.

## Quick start

1. Open the app. A new routine called "Untitled routine" is ready; click its name at the
   top to rename it.
2. Under **Music** in the sidebar, press **Load song** and pick your track (MP3 and M4A
   are the safest choices).
3. Under **Dancers**, type a name and press **Add** for each dancer. Each one appears on
   the stage as a colored dot with their initials.
4. Drag the dots into your opening formation.
5. Click a later spot on the timeline, press **+ Formation**, and drag dancers to their
   next spots. Repeat for the rest of the routine.
6. Press **Play** (or Space) to watch everyone move with the music.

Everything saves automatically in your browser as you go.

## Finding your way around

The **top bar** holds the routine's name, a menu to switch between your saved routines,
and the **New**, **Open file**, **Export**, and **Delete** buttons. The note at the far
right ("Saved on this device") tells you your work is stored.

The **stage** fills most of the screen. The audience is at the bottom and upstage is at
the top; the dashed center line and the numbered marks along the front edge work like
floor tape. The grey border around the stage is the wings, where dancers can wait
offstage.

The **sidebar** on the right has four sections: **Formation** (the formation you're on),
**Dancers**, **Music**, and **Stage**. Press **Hide panels** at the bottom right to give
the stage the whole width, and **Show panels** to bring them back.

The **timeline** runs along the bottom. Each blue block is a formation, the dashed line
between two blocks is the transition between them, and the orange line is the playhead
(where you are in the song). Above it are **Play**, the current time and count,
**+ Formation**, the view and display toggles, **Undo**/**Redo**, and the zoom buttons.

## Building a routine

### Music and counts

Load your song under **Music**. The timeline stretches to the song's full length and
playback follows the music exactly.

Counting in 8s is optional. If you want it, type the song's **BPM**, play the song,
pause on the first "1", and press **Count 1 is at the playhead**. The timeline then shows
8-count numbers, the readout shows where you are ("8-count 3 · 5"), and formations snap
to the beat when you place or drag them. Without a BPM, everything works in minutes and
seconds.

### Dancers

Add dancers under **Dancers**. Click a dancer's color square to change their color, edit
their name in place, or press **×** to remove them from the whole routine. Clicking a
dancer in the list or on the stage highlights them.

### Formations

A formation is where everyone stands at a moment in the song. To make one, move the
playhead to that moment (click the timeline) and press **+ Formation**. It starts as a
copy of what's on stage, so you only move the dancers who change.

You can only drag dancers while you're *on* a formation. Between formations dancers are
mid-move, and the stage says so; click a formation's block on the timeline to jump to it.

With a formation selected, the **Formation** section lets you rename it, set exactly when
it **starts**, set how long it **holds**, or delete it.

### Timing on the timeline

Drag a formation block's **right edge** to make it hold longer or shorter, and its
**left edge** to change when it starts (its end stays put). Edges snap to the beat when
you've set a BPM, and they always leave at least 1 count (half a second without a BPM)
for dancers to get to the next formation.

The timeline fits the whole song in the window. Use **+** and **−** to zoom in on a
section (the timeline then scrolls sideways), and **Fit** to see the whole song again.

### Transitions

The dashed segment between two formations is the transition: the time dancers have to
move from one to the next, labeled with its length. With a formation selected, its
**Transition in** section sets:

- **Takes:** how long dancers have to arrive. Changing it moves when the previous
  formation lets go, so the formation you're on stays on its beat.
- **Ripple:** instead of everyone moving together, dancers set off one after another,
  left to right, right to left, front to back, back to front, or in the order of your
  dancer list. **Spread** sets how staggered they are.

### Paths and collisions

While you're on a formation, each dancer's path from the previous formation is drawn as a
dashed line, with a faint circle where they came from. Press **Paths** to hide or show
them.

If two dancers pass closer than about 2 ft (0.6 m) while moving, their paths turn red,
the transition on the timeline turns red, and the sidebar says who and when, with a
**Show** button that jumps to that moment. Dancers who start or end close together, like
partners, aren't flagged. Press **Collisions** to turn this check off (the app remembers
your choice).

### Stage size and views

The stage starts as an open, unitless floor. To plan for a specific competition floor,
tick **Set the real stage size** under **Stage** and enter its width and depth in feet or
meters. The grid then shows real distances, and every dancer keeps the same relative
spot.

Press **Audience view** to flip the stage to the **Dancer view**: what the dancers see
facing the audience, with left and right swapped. Press it again to flip back.

### Undo, saving, and other routines

**Undo** and **Redo** step through every change, and one drag counts as one step. Your
work saves automatically; use **New** to start another routine and the menu next to the
name to switch between them. **Delete** removes the open routine and its song from this
device.

## Sharing with your team

Press **Export** to download a small `.formation.json` file and send it to your team in
a group chat or email. The song is never inside the file, which keeps it tiny and avoids
sharing copyrighted music.

A teammate opens the app, presses **Open file**, and picks the file. The app then asks
them to load their own copy of the song (by name). If you later send an updated version,
opening it replaces their copy of the routine and keeps the song they already loaded.

## On your phone

On a phone the app is a viewer. Open a shared file with **Open file**, press
**Load song** in the top bar to pick your copy of the song, then play, scrub the
timeline, and flip between the audience and dancer views. Editing controls are hidden;
use a laptop or a wider screen to edit.

## Your data and backups

Routines and songs are saved in your browser on the device you used, not online. That
means a routine made on your laptop won't appear on another computer or in another
browser until you export it and open the file there.

**Export is your backup.** Browsers can clear saved site data (Safari in particular may
do this after long periods without visiting), and private or incognito windows don't
keep anything after you close them. Export routines you care about. If saving isn't
possible at all, a red banner says "Not saving on this device".

## Keyboard shortcuts

| Key | What it does |
|---|---|
| Space | Play or pause |
| ← / → | Step back or forward one count (one second without a BPM) |
| Ctrl/⌘ + Z | Undo |
| Ctrl/⌘ + Shift + Z, or Ctrl + Y | Redo |

Shortcuts are ignored while you're typing in a field.

## Troubleshooting

**The song won't load or play.** Try an MP3 or M4A file. Songs over 100 MB are refused;
export a smaller copy from your music app.

**I can't drag a dancer.** The playhead is between formations, where dancers are
mid-move. Click a formation's block on the timeline, then drag.

**A formation won't get any longer.** It's stopping 1 count before the next formation so
dancers have time to move. Drag the next formation later first, or type an exact hold in
the sidebar.

**My routine is missing.** Check the routine menu next to the name. If it's not there,
you may be in a different browser, on a different device, or in a private window; open
your exported file with **Open file**.

**A teammate sees "Load … to hear the music".** The song isn't shared with the file.
They need to press **Load song** (under **Music** on a laptop, in the top bar on a phone)
and pick their own copy.

## For developers

To run the app locally, run the tests, or contribute changes, see
[docs/development.md](docs/development.md). The product brief is in
[docs/requirements.md](docs/requirements.md) and the design in
[docs/architecture.md](docs/architecture.md).
