// Sidebar "Music": load the song, optional BPM, and where count 1 lands.
import type { Controller } from "../app/controller";
import type { AppState } from "../app/state";
import { setTempo } from "../model/edits";
import { formatTime } from "../model/time";
import { BPM_MAX, BPM_MIN } from "../model/types";
import { el, syncInputValue } from "./dom";

export function mountSongPanel(root: HTMLElement, controller: Controller): void {
  const fileInput = el("input", { type: "file", accept: "audio/*", class: "visually-hidden", "data-testid": "song-input" });
  const loadLabel = el("label", { class: "button" }, ["Load song", fileInput]);
  const songName = el("p", { class: "song-name" });
  const bpmInput = el("input", {
    type: "number",
    min: BPM_MIN,
    max: BPM_MAX,
    step: "0.1",
    inputmode: "decimal",
    placeholder: "none",
    "aria-label": "Beats per minute",
  });
  const countOneButton = el("button", { type: "button" }, ["Count 1 is at the playhead"]);
  const countOneHint = el("p", { class: "hint" });

  root.append(
    el("h2", {}, ["Music"]),
    loadLabel,
    songName,
    el("label", { class: "field" }, [el("span", {}, ["BPM (optional)"]), bpmInput]),
    countOneButton,
    countOneHint,
  );

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) void controller.loadSongFile(file);
  });
  bpmInput.addEventListener("change", () => {
    const text = bpmInput.value.trim();
    const current = controller.store.getState().routine.tempo;
    const tempo = text === "" ? null : { bpm: Number(text), firstBeatSeconds: current?.firstBeatSeconds ?? 0 };
    if (!controller.edit((routine) => setTempo(routine, tempo))) bpmInput.value = current ? String(current.bpm) : "";
  });
  countOneButton.addEventListener("click", () => {
    const { routine, playheadSeconds } = controller.store.getState();
    if (!routine.tempo) return;
    const tempo = { bpm: routine.tempo.bpm, firstBeatSeconds: playheadSeconds };
    controller.edit((current) => setTempo(current, tempo));
  });

  const render = (state: AppState) => {
    const { routine, loadedSong } = state;
    if (loadedSong) {
      songName.textContent = `${loadedSong.fileName} · ${formatTime(loadedSong.durationSeconds)}`;
      songName.dataset.state = "loaded";
    } else if (routine.song) {
      songName.textContent = `Load “${routine.song.fileName}” to hear the music.`;
      songName.dataset.state = "missing";
    } else {
      songName.textContent = "No song yet. Playback runs silently.";
      songName.dataset.state = "none";
    }
    syncInputValue(bpmInput, routine.tempo ? String(routine.tempo.bpm) : "");
    countOneButton.disabled = routine.tempo === null;
    countOneHint.textContent = routine.tempo
      ? `Count 1 at ${formatTime(routine.tempo.firstBeatSeconds)}. Play the song, pause on the first “1”, then press the button.`
      : "Add a BPM to see 8-counts on the timeline.";
  };
  controller.store.subscribe((next, previous) => {
    if (next.routine !== previous.routine || next.loadedSong !== previous.loadedSong) render(next);
  });
  render(controller.store.getState());
}
