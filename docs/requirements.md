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

## Open Questions

None blocking. Phone editing, stage size, and BPM were resolved on 2026-11-07.
