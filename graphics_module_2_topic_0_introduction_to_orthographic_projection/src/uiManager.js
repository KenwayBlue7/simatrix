// Parameter dock — Module 2, Topic 0: Introduction to Orthographic Projection.
//
// Owns every control in this topic (RULES.md §4.14 — one designated owner per DOM region):
//
//   • the object picker, a `<select>`
//   • the four camera-direction buttons + Free Orbit
//   • the Front switch, which sits with the view controls because it is another viewing aid
//   • the floating Dimensions chip, where the sizes are actually looked at
//   • Step 2's side-view choice
//
// Controls never touch the scene. They call back into the injected controller, which funnels into
// main.js's single `rebuild()` / `flyToView()` (RULES.md §3.2).
//
// THE TWO SWITCHES ANSWER DIFFERENT QUESTIONS. `Dimensions` is on the viewport, because that is
// where the sizes are read and a learner reaching for them is already looking at the model.
// `Front` is in the card beside the four direction buttons, because it is another viewing aid —
// it says which face the elevation is taken from. Neither latches its own state; both are pushed
// back from main.js, so a control can never claim something the scene is not doing.
//
// The direction buttons are a SEGMENTED group, not four independent toggles: at any moment the
// camera is at one named direction or at none. Pressed state is pushed FROM the scene
// (`setActiveView`) rather than latched by the click, because free orbit — the state where NO
// direction is pressed — is reached by dragging, which a click-latched button could never show.
//
// Layering (CLAUDE.md): leaf module. Imports the pure-data registry only.

import { OBJECTS, VIEW_DIRECTIONS, FIRST_ANGLE_PLACEMENT } from './objectData.js';

/**
 * @param {{
 *   selectObject: (id: string) => void,
 *   flyToView: (key: string|null) => void,
 *   setAnnotations: (on: boolean) => void,
 *   setFrontArrow: (on: boolean) => void,
 *   setSideView: (key: 'left'|'right') => void,
 * }} sim
 */
export function initUIManager(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const objectSelect = $('object-select');
  const blurb = $('object-blurb');
  const viewGroup = $('view-buttons');
  const viewNote = $('view-note');
  const viewNoteTitle = $('view-note-title');
  const homeBtn = $('view-home');
  const annChip = $('vp-dims');
  const frontToggle = $('front-toggle');
  const sideGroup = $('side-choice');

  // ---- Object picker -----------------------------------------------------------------------------
  if (objectSelect) {
    objectSelect.innerHTML = '';
    for (const o of OBJECTS) {
      const opt = document.createElement('option');
      opt.value = o.id;
      // The name alone. A figure number is a fact about the textbook, not about the object, and a
      // learner picking a shape has no use for it — it belongs in the topic's docs, where it is.
      opt.textContent = o.name;
      objectSelect.appendChild(opt);
    }
    objectSelect.addEventListener('change', () => sim.selectObject(objectSelect.value), listen);
  }

  // ---- The four principal directions -----------------------------------------------------------
  if (viewGroup) {
    viewGroup.innerHTML = '';
    for (const v of VIEW_DIRECTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'segmented__btn';
      btn.dataset.view = v.key;
      btn.setAttribute('aria-pressed', 'false');
      // Two cues, not colour alone: the direction the learner presses, and the name of the DRAWING
      // it produces — the pairing the whole step is trying to install.
      btn.innerHTML = `<span class="segmented__label">${v.label}</span>`
        + `<span class="segmented__sub">${v.drawing}</span>`;
      btn.addEventListener('click', () => sim.flyToView(v.key), listen);
      viewGroup.appendChild(btn);
    }
  }

  homeBtn?.addEventListener('click', () => sim.flyToView(null), listen);

  frontToggle?.addEventListener('change', () => sim.setFrontArrow(frontToggle.checked), listen);

  // Asks for the OPPOSITE of what is live, read from `aria-pressed` — the chip never consults a
  // class of its own, so it cannot drift out of step with the state it is showing.
  annChip?.addEventListener('click',
    () => sim.setAnnotations(annChip.getAttribute('aria-pressed') !== 'true'), listen);

  // ---- Step 2: which side view the drawing carries ----------------------------------------------
  for (const input of sideGroup?.querySelectorAll('input[name="side-view"]') ?? []) {
    input.addEventListener('change', () => {
      if (input.checked) sim.setSideView(input.value);
    }, listen);
  }

  /** Reflect the object the scene is actually showing, and its one-line description. */
  function setObject(data) {
    if (objectSelect && objectSelect.value !== data.id) objectSelect.value = data.id;
    if (blurb) blurb.textContent = data.blurb;
  }

  /** Reflect which side view Step 2 is set to draw. */
  function setSideView(key) {
    for (const input of sideGroup?.querySelectorAll('input[name="side-view"]') ?? []) {
      input.checked = input.value === key;
    }
  }

  /** The viewport chip is the only home of the Dimensions state. */
  function setAnnotations(on) {
    if (annChip) annChip.setAttribute('aria-pressed', String(on));
  }

  /** The card switch is the only home of the Front-arrow state. */
  function setFrontArrow(on) {
    if (frontToggle) frontToggle.checked = on;
  }

  /**
   * Reflect where the camera IS. `key` is null for free orbit, which is a real state and gets its
   * own copy rather than leaving the last-pressed button lit over a view it no longer describes
   * (RULES.md §3.62 — a message must not outlive the thing it was true of).
   */
  function setActiveView(key, data) {
    for (const btn of viewGroup?.querySelectorAll('.segmented__btn') ?? []) {
      const on = btn.dataset.view === key;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', String(on));
    }
    if (homeBtn) homeBtn.classList.toggle('is-active', !key);

    if (!viewNote) return;
    if (!key) {
      if (viewNoteTitle) viewNoteTitle.textContent = 'Turning it yourself';
      viewNote.textContent = 'Drag to turn the object. Right now you are somewhere between the four '
        + 'directions. That is a good way to understand a shape — but a drawing can only be made '
        + 'from one of the four exactly, so pick one.';
      return;
    }
    const meta = VIEW_DIRECTIONS.find((v) => v.key === key);
    if (viewNoteTitle) {
      const side = FIRST_ANGLE_PLACEMENT[key];
      // Side views get the placement in the title because that is the one thing about them a
      // learner cannot work out by looking, and the one thing they most often get backwards.
      viewNoteTitle.textContent = side
        ? `${meta.drawing} — goes on the ${side} of the sheet`
        : meta.drawing;
    }
    viewNote.textContent = data.viewNotes[key] ?? '';
  }

  return {
    setObject,
    setActiveView,
    setSideView,
    setAnnotations,
    setFrontArrow,
    dispose: () => ac.abort(),
  };
}
