import { formatDuration } from '../game/job.js';
import './hud.css';

/**
 * @typedef {{
 *   prompt: string | null,
 *   job: import('../game/jobList.js').JobDefinition,
 *   jobStatus: 'waiting' | 'active' | 'complete',
 *   progress: number,
 *   elapsed: number,
 *   nextJob: import('../game/jobList.js').JobDefinition | null,
 * }} HudState progress is 0..1 for display; elapsed is seconds on the job; nextJob is the one
 *   after this (null if this is the last).
 */

/**
 * The HTML overlay players see:
 * - while playing: the job objective with a progress bar, interaction prompts, and a
 *   "Job complete!" card at the end
 * - otherwise: a "click to play" card with the controls
 */
export class Hud {
  /**
   * @param {HTMLElement} root
   * @param {import('../game/Input.js').Input} input
   */
  constructor(root, input) {
    this.input = input;

    this.prompt = element('div', 'interaction-prompt');

    this.objective = element('div', 'objective');
    this.objectiveTitle = element('div', 'objective-title');
    this.objectiveHint = element('div', 'objective-hint');
    const bar = element('div', 'progress-bar');
    this.progressFill = element('div', 'progress-fill');
    bar.append(this.progressFill);
    this.progressLabel = element('div', 'progress-label');
    this.objective.append(this.objectiveTitle, this.objectiveHint, bar, this.progressLabel);

    this.completeCard = element('div', 'job-complete');
    this.completeCard.innerHTML = `
      <h2 class="job-complete-title"></h2>
      <p><span class="job-summary"></span> <strong class="job-time"></strong></p>
      <p class="job-complete-hint"></p>`;
    /** @param {string} selector */
    const find = (selector) =>
      /** @type {HTMLElement} */ (this.completeCard.querySelector(selector));
    this.completeTitle = find('.job-complete-title');
    this.jobSummary = find('.job-summary');
    this.jobTime = find('.job-time');
    this.completeHint = find('.job-complete-hint');

    this.playPrompt = element('div', 'play-prompt');
    this.playPrompt.innerHTML = `
      <h1>mow-town</h1>
      <p class="play-prompt-action">Click to play</p>
      <dl class="controls">
        <dt>Mouse</dt><dd>Look around</dd>
        <dt>WASD</dt><dd>Move</dd>
        <dt>Shift</dt><dd>Run</dd>
        <dt>M</dt><dd>Mute / unmute</dd>
        <dt>T</dt><dd>Tuning panel</dd>
        <dt>Esc</dt><dd>Release the mouse</dd>
      </dl>`;

    root.append(this.objective, this.prompt, this.completeCard, this.playPrompt);
    /** What's currently on screen, so we only touch the page when something changes. */
    this.shown = /** @type {Record<string, unknown>} */ ({});
  }

  /** @param {HudState} state */
  update(state) {
    const locked = this.input.isPointerLocked;
    const complete = state.jobStatus === 'complete';

    this.set('locked', locked, () => {
      this.playPrompt.hidden = locked;
      this.objective.hidden = !locked;
    });

    const promptText = locked ? state.prompt : null;
    this.set('prompt', promptText, () => {
      this.prompt.textContent = promptText ?? '';
      this.prompt.hidden = !promptText;
    });

    const { job } = state;
    const title = complete ? job.doneTitle : job.title;
    this.set('title', title, () => {
      this.objectiveTitle.textContent = title;
    });
    const hint = complete ? '' : (job.hint ?? '');
    this.set('hint', hint, () => {
      this.objectiveHint.textContent = hint;
      this.objectiveHint.hidden = !hint;
    });

    // Whole percent only reaches 100 when the job actually completes.
    const percent = Math.floor(state.progress * 100);
    this.set('percent', percent, () => {
      this.progressFill.style.width = `${percent}%`;
      this.progressLabel.textContent = `${percent}%`;
      this.objective.classList.toggle('is-complete', complete);
    });

    this.set('complete', locked && complete ? job.id : null, (shownJob) => {
      this.completeCard.hidden = !shownJob;
      if (!shownJob) return;
      const next = state.nextJob;
      this.completeTitle.textContent = next ? 'Job complete!' : 'All jobs done!';
      this.jobSummary.textContent = job.summary;
      this.jobTime.textContent = formatDuration(state.elapsed);
      this.completeHint.textContent = next
        ? `Press N for the next job: ${next.name ?? next.title}. R to redo this one.`
        : 'Press R to start over from the beginning.';
    });
  }

  /**
   * Runs `apply` only when `value` differs from what's already on screen.
   *
   * @param {string} key
   * @param {unknown} value
   * @param {(value: unknown) => void} apply
   */
  set(key, value, apply) {
    if (this.shown[key] === value) return;
    this.shown[key] = value;
    apply(value);
  }
}

/**
 * @param {string} tag
 * @param {string} className
 */
function element(tag, className) {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}
