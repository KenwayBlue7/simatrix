// Summary animator — the abortable timeline behind Step 4's phases and Step 6's replay.
//
// Everything animated in this topic is a SCHEDULED SEQUENCE: Phase B grows the box, then lights one
// dimension callout, then the next; Step 6 replays the whole chain. Sequences overlap in practice —
// a learner re-presses Phase B while Phase C is mid-flight, or jumps to Step 5 during the replay —
// and a stale `setTimeout` firing after that is the classic way a teaching animation resurrects a
// scene that has already moved on.
//
// The guard is a TOKEN, the pattern Topic 1 proved (`flowToken`): every `play()` bumps the token and
// every scheduled beat re-checks it, so a timer that outruns a cancel simply does nothing. Timers are
// also cleared eagerly, so the token is a safety net rather than the only defence.
//
// Under `prefers-reduced-motion` the whole timeline collapses to zero delay: every beat still RUNS —
// the scene still reaches its end state, which is the platform rule (DESIGN.md §5.10, RULES.md
// §4.13) — it simply arrives at once instead of over time.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js supplies the beats; this module owns
// only the clock and the abort semantics, so it knows nothing about the scene it is driving.

/**
 * @typedef {Object} Beat
 * @property {number} at   Milliseconds from the start of the sequence.
 * @property {() => void} run
 */

/**
 * @param {{ prefersReducedMotion: boolean }} opts
 * @returns {{
 *   play: (beats: Beat[], onDone?: () => void) => void,
 *   stop: () => void,
 *   isRunning: () => boolean,
 * }}
 */
export function createSequencer({ prefersReducedMotion }) {
  let token = 0;
  let running = false;
  /** @type {number[]} */
  const timers = [];

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers.length = 0;
  }

  /** Abandon whatever is in flight. Safe to call at any time, including from inside a beat. */
  function stop() {
    token += 1;
    running = false;
    clearTimers();
  }

  /**
   * Run a sequence. Any sequence already in flight is abandoned first.
   * @param {Beat[]} beats
   * @param {() => void} [onDone]  Fired after the last beat, on the same token guard.
   */
  function play(beats, onDone) {
    stop();
    const mine = token;
    running = true;

    let last = 0;
    for (const beat of beats) {
      const at = prefersReducedMotion ? 0 : beat.at;
      last = Math.max(last, at);
      timers.push(setTimeout(() => {
        if (mine !== token) return; // the sequence was abandoned — do nothing
        beat.run();
      }, at));
    }

    timers.push(setTimeout(() => {
      if (mine !== token) return;
      running = false;
      onDone?.();
    }, last + 1));
  }

  return { play, stop, isRunning: () => running };
}

/**
 * Beat timings for Step 6's end-to-end replay, in the order the process actually happens:
 *
 *     Orthographic views  →  Axes  →  Bounding box  →  Construction  →  Finished isometric
 *
 * Kept here as DATA rather than inline in main.js so the tempo of the summary can be tuned in one
 * place, and so the chain the learner is meant to remember is written down in the order they see it.
 * Every value is the moment that stage BEGINS; the visual for each stage runs from there.
 */
export const SUMMARY_TIMING = {
  views: 0,
  axes: 2200,
  box: 4200,
  shape: 6600,
  finish: 9600,
  close: 11600,
};

/**
 * The five links of the chain, as shown in the summary strip. Pure copy, so the strip and the
 * narration can never drift from the animation that plays beside them.
 */
export const SUMMARY_CHAIN = [
  { id: 'views', label: 'Orthographic views', note: 'Three flat views describe the solid, and carry every dimension.' },
  { id: 'axes', label: 'Axes', note: 'Three isometric axes from one corner: one vertical, two at 30°.' },
  { id: 'box', label: 'Bounding box', note: 'Overall width, depth and height transferred onto those axes.' },
  { id: 'shape', label: 'Construction', note: 'The shape constructed inside the box, using the box to place it.' },
  { id: 'finish', label: 'Finished isometric', note: 'Guides fade; the visible edges remain as the finished drawing.' },
];
