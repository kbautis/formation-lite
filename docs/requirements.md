# Product Requirements Brief — formation-lite

Date: 2026-11-07
Status: Confirmed by the product owner on 2026-11-07.

## The Problem

Club choreographers preparing competition routines need to plan where every dancer
stands, and how they move between spots, in time with the music. Existing apps such
as Choreographic do this well, but they put music sync and multiple routines behind
a paywall, which is the core of the job, so the free tier is a demo rather than a tool.

## The User

The primary user is a club choreographer planning competition routines of up to about
20 dancers and 2–4 minutes of music. They plan mostly on a laptop and sometimes check
the routine on a phone. They are comfortable with apps but do not want accounts, setup,
or subscriptions. Teammates are secondary users who view a routine rather than edit it.

## The Workflow

1. The choreographer opens the site. There is no sign-up. They create a new routine and
   name it.
2. They load the song from their device (MP3, M4A, WAV, or anything the browser plays).
   Optionally they enter the BPM and tap where the first "1" lands, so the timeline also
   shows 8-counts. If they skip this, the timeline shows minutes and seconds only and
   everything else still works.
3. They add dancers, each with a name and a color. Dancers appear as labeled dots on an
   open stage: a plain stage with a grid and a center line and no fixed size.
4. If they know the competition floor, they can set the stage width and depth (for
   example 40 × 30 ft). The stage rescales to that shape and the grid shows real units.
   Changing the size later keeps every dancer in the same relative spot.
5. They drag dancers into the opening formation. They move the playhead to a later point
   in the song, add a new formation, and drag dancers to their new spots. Each formation
   holds for a set length, and dancers glide in straight lines to the next formation.
6. They press play. The song plays and the dots move in sync. They scrub to any moment
   to check spacing, and flip between the audience view and the dancer's view.
7. They close the tab. Next time they open the site on that device, the routine and the
   song are still there.
8. They export a small routine file and send it in the team chat. A teammate opens the
   site on a laptop or phone, loads the file and their own copy of the song, and watches
   it play.

## Goals

- Primary: plan formations on a music-synced timeline and play them back accurately
  against the song.
- Secondary: several routines saved on one device, undo and redo, and a phone layout
  for viewing and playback (no editing on phones).
- Non-goals: accounts, cloud sync, collaborative editing, editing on phones, 3D view,
  video export, curved or custom paths, props and sets, comments, AI features, and any
  paid tier.

## User Stories

- As a choreographer, I want to load my song and see its timeline so I can place
  formations at the moments I hear in the music.
- As a choreographer, I want to optionally set a BPM so I can also see 8-counts the way
  I count in rehearsal.
- As a choreographer, I want to drag dancers into formations at specific points in the
  song so I can block the whole routine.
- As a choreographer, I want to play the routine with the music so I can see whether
  transitions have enough time.
- As a choreographer, I want to set the stage size for a specific competition floor so
  my spacing reflects the real space.
- As a choreographer, I want my work saved automatically on my device so I never lose a
  session.
- As a teammate, I want to open a shared routine file with my copy of the song so I can
  learn my spots and paths.

## Acceptance Criteria

Done means:

- [ ] A new routine can be made and played with a song in under 5 minutes, without an
      account.
- [ ] Without a BPM, the timeline shows minutes and seconds and every feature works.
- [ ] With a BPM and first beat set, the count marks line up with the counts you hear
      (within about an eighth of a beat).
- [ ] 20 dancers can be placed and dragged, each showing their initials and color.
- [ ] The stage starts open (no units). Setting a width and depth reshapes the stage,
      shows real units on the grid, and keeps dancers in the same relative spots.
- [ ] During playback, dancers sit exactly on their marks while a formation holds and
      move smoothly between formations.
- [ ] Scrubbing to any moment shows the right positions immediately.
- [ ] The view flip shows the stage turned around, as the dancers see it.
- [ ] After a browser reload, the routine and song are still there.
- [ ] An exported file opened on another device with the same song reproduces the
      routine exactly.
- [ ] On a phone, the routine can be opened, played, scrubbed, and flipped, and editing
      controls are hidden.
- [ ] Works in current Chrome, Safari, and Firefox on a laptop, and in Safari and Chrome
      on a phone.

## Constraints & Assumptions

- The app is free to run: a static site with no server, hosted for free.
- Data stays on the device. The shared file holds formations only, never the song. This
  avoids copyright issues and keeps files small.
- Assumption: one tempo per song. Songs with tempo changes still work on the time
  timeline; only the count marks drift.
- Assumption: a single rectangular stage.

## Stretch Goals

- Teammate highlight: a viewer picks "just me" to emphasize their dot and draw their
  path through the routine.

## Revision — 2026-11-08: Transitions

Confirmed with the product owner after using the first draft.

### The problem

Dragging a formation's hold could swallow the gap before the next formation, so dancers
jumped instead of moving, and nothing on the timeline showed how long a transition was.
Choreographers also need to shape *how* dancers travel, and to see collisions before
rehearsal does.

### Added scope

- Dragging either edge of a formation on the timeline changes it: the right edge sets how
  long it holds, the left edge sets when it starts (its end stays put).
- An edge drag always leaves a minimum transition of 1 count (0.5 s without a BPM) before
  the neighboring formation. Typing an exact value in the sidebar can still go below it.
- Each transition shows on the timeline as a labeled segment between formations. The
  sidebar's **Transition in** sets how long dancers take to arrive in a formation; it
  moves the previous formation's release, not this formation's arrival, so formations
  stay on the beats they were placed on.
- **Ripple:** dancers can start moving one after another during a transition — left to
  right, right to left, front to back, back to front, or in list order — with an
  adjustable spread.
- **Paths:** while on a formation, each dancer's path from the previous formation is drawn
  on the stage. Pairs who pass closer than 2 ft (0.6 m; 1/15 of the depth on an open
  stage) mid-transition are flagged in red on the stage, the timeline, and the sidebar.
  Pairs who start or end that close are not flagged.

### Acceptance criteria

- [ ] Dragging a formation's left edge moves its start; its end does not move.
- [ ] No edge drag can leave less than 1 count (0.5 s) before a neighboring formation.
- [ ] Transition lengths are visible on the timeline and settable in the sidebar.
- [ ] A ripple transition visibly moves dancers one after another in the chosen order.
- [ ] Paths from the previous formation are shown, and a crossing pair is flagged.
- [ ] Routine files from the first draft still open.

## Revision — 2026-11-12: Share links

Confirmed with the product owner on 2026-11-12.

### The problem

Sharing a routine means exporting a file, attaching it in the team chat, and having
every teammate download it and pick it in the app, and all of that again for every
update. Two choreographers trading edits do this many times a week.

### Added scope

- **Share link.** A **Share link** button makes a link that carries the whole routine.
  Where the browser offers a share sheet the link goes through it; otherwise it is
  copied. Opening the link opens the routine on that device and saves it there, exactly
  as opening the file would: the same replace prompt, and the song kept across updates.
- **A link is a snapshot.** Changing the routine means sending a new link. The song is
  never in the link; each person loads their own copy once per device.
- **When it was shared.** Opening a link shows when that version was last edited
  ("Shared Nov 12, 3:40 pm"), so teammates can tell which link in the chat is newest.
- **Older link warning.** Opening a link that is older than the copy already on the
  device says so before anything is replaced.
- After a link opens, the address bar no longer carries the routine, so a reload or a
  bookmark does not offer the same snapshot again.
- **Export** and **Open file** stay. The file is still the backup, and the fallback for a
  routine too large for a link.

### Still not in scope

Cloud sync, a link that always shows the latest version, live editing, and merging two
people's edits. The first three need a server. Merging an imported routine into the
local copy is the likely next step if two choreographers edit the same routine, and it
goes through this stage first.

### Acceptance criteria

- [ ] A 20-dancer, 40-formation routine can be shared as a link in one click, and
      opening that link in a fresh browser profile reproduces the routine exactly.
- [ ] Opening a link on a phone shows the routine in the view-only layout.
- [ ] Opening a link for a routine already on the device asks before replacing it,
      shows when the link's version was edited, and warns when it is older than the
      device's copy.
- [ ] A teammate who already loaded the song keeps it when opening a newer link of the
      same routine.
- [ ] After a link opens, reloading the page does not offer it again.
- [ ] A damaged, cut-off or tampered link is rejected with a clear message and changes
      nothing on the device.
- [ ] A routine too large for a link says so and points to Export.
- [ ] The song is never in a link, and the routine in a link is never sent to the site's
      host.

## Open Questions

None blocking. Phone editing, stage size, and BPM were resolved on 2026-11-07.
