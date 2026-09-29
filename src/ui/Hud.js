import { config } from '../config.js';
import { formatDuration } from '../game/job.js';
import { formatMoney, receiptTotal } from '../game/pay.js';
import './hud.css';

/**
 * @typedef {{
 *   prompt: string | null,
 *   toast: string | null,
 *   hasMower: boolean,
 *   job: import('../game/jobList.js').JobDefinition,
 *   jobStatus: 'waiting' | 'active' | 'complete',
 *   progress: number,
 *   elapsed: number,
 *   nextJob: import('../game/jobList.js').JobDefinition | null,
 *   revealing: boolean,
 *   showCard: boolean,
 *   edges: number,
 *   edgesDone: boolean,
 *   money: number,
 *   moneyCounting: boolean,
 *   receipt: import('../game/pay.js').PayLine[] | null,
 * }} HudState hasMower: the player has grabbed the mower at least once; progress is 0..1
 *   for display; elapsed is seconds on the job; nextJob is the one after this (null if this
 *   is the last); showCard: the "Job complete" card is up (it tucks away after a while);
 *   edges is 0..1 for display; money is what to show in the wallet (it counts up); receipt
 *   is what the job paid, once it's done.
 */

/**
 * The HTML overlay players see:
 * - while playing: the job objective with a progress bar, your money, interaction prompts,
 *   and a "Job complete!" card with a receipt at the end
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
    this.toast = element('div', 'toast');

    this.objective = element('div', 'objective');
    this.objectiveTitle = element('div', 'objective-title');
    this.objectiveHint = element('div', 'objective-hint');
    const bar = element('div', 'progress-bar');
    this.progressFill = element('div', 'progress-fill');
    bar.append(this.progressFill);
    this.progressLabel = element('div', 'progress-label');
    // The edges: a smaller bar underneath, for the string trimmer.
    this.edgesRow = element('div', 'edges-row');
    const edgesName = element('span', 'edges-name');
    edgesName.textContent = 'Edges';
    const edgesBar = element('div', 'progress-bar edges-bar');
    this.edgesFill = element('div', 'progress-fill');
    edgesBar.append(this.edgesFill);
    this.edgesLabel = element('span', 'edges-label');
    this.edgesRow.append(edgesName, edgesBar, this.edgesLabel);
    this.objective.append(
      this.objectiveTitle,
      this.objectiveHint,
      bar,
      this.progressLabel,
      this.edgesRow,
    );

    this.completeCard = element('div', 'job-complete');
    this.completeCard.innerHTML = `
      <h2 class="job-complete-title"></h2>
      <p><span class="job-summary"></span> <strong class="job-time"></strong></p>
      <table class="receipt"></table>
      <p class="job-complete-hint"></p>`;
    /** @param {string} selector */
    const find = (selector) =>
      /** @type {HTMLElement} */ (this.completeCard.querySelector(selector));
    this.completeTitle = find('.job-complete-title');
    this.jobSummary = find('.job-summary');
    this.jobTime = find('.job-time');
    this.completeHint = find('.job-complete-hint');
    this.receipt = find('.receipt');

    this.wallet = element('div', 'wallet');

    this.playPrompt = element('div', 'play-prompt');
    this.playPrompt.innerHTML = `
      <h1>mow-town</h1>
      <p class="play-prompt-action">Click to play</p>
      <dl class="controls">
        <dt>Mouse</dt><dd>Look around</dd>
        <dt>WASD</dt><dd>Move</dd>
        <dt>Shift</dt><dd>Run</dd>
        <dt>E</dt><dd>Grab the mower / let go (or buy, at the sale stand)</dd>
        <dt>W / S</dt><dd>Push / pull the mower</dd>
        <dt>Mouse or A / D</dt><dd>Steer the mower</dd>
        <dt>Q</dt><dd>Take out / put away the string trimmer</dd>
        <dt>Hold mouse</dt><dd>Run the trimmer (it cuts where you look)</dd>
        <dt>Hold F</dt><dd>Highlight the grass that's left</dd>
        <dt>V</dt><dd>View the lawn from above</dd>
        <dt>N</dt><dd>Next job (once this one's done)</dd>
        <dt>R</dt><dd>Mow it again (once it's done)</dd>
        <dt>M</dt><dd>Mute / unmute</dd>
        <dt>T</dt><dd>Tuning panel</dd>
        <dt>Esc</dt><dd>Release the mouse</dd>
      </dl>`;

    root.append(
      this.objective,
      this.wallet,
      this.toast,
      this.prompt,
      this.completeCard,
      this.playPrompt,
    );
    // Hidden until the first update says otherwise (the game waits a moment before starting).
    for (const panel of [this.objective, this.wallet, this.toast, this.prompt, this.completeCard]) {
      panel.hidden = true;
    }
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
      this.wallet.hidden = !locked;
    });

    const money = formatMoney(state.money);
    this.set('money', money, () => {
      this.wallet.textContent = money;
    });
    this.set('moneyCounting', state.moneyCounting, () => {
      this.wallet.classList.toggle('is-counting', state.moneyCounting);
    });

    const toastText = locked ? state.toast : null;
    this.set('toast', toastText, () => {
      this.toast.textContent = toastText ?? '';
      this.toast.hidden = !toastText;
    });

    const promptText = locked ? state.prompt : null;
    this.set('prompt', promptText, () => {
      this.prompt.textContent = promptText ?? '';
      this.prompt.hidden = !promptText;
    });

    const { job } = state;
    let title = job.title;
    if (complete) title = job.doneTitle;
    else if (!state.hasMower) title = 'Grab the mower';
    this.set('title', title, () => {
      this.objectiveTitle.textContent = title;
    });
    let hint = job.hint ?? '';
    if (complete && !state.edgesDone) hint = 'Trim the edges with Q for a tip';
    else if (complete) hint = state.nextJob ? 'Press N for the next job' : 'Press R to mow again';
    else if (!state.hasMower) hint = "It's parked on the driveway";
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

    const edgesPercent = Math.floor(state.edges * 100);
    this.set('edges', edgesPercent, () => {
      this.edgesFill.style.width = `${edgesPercent}%`;
      this.edgesLabel.textContent = `${edgesPercent}%`;
    });
    this.set('edgesDone', state.edgesDone, () => {
      this.edgesRow.classList.toggle('is-complete', state.edgesDone);
    });

    this.set('revealing', state.revealing, () => {
      this.completeCard.classList.toggle('is-revealing', state.revealing);
    });

    this.set('complete', locked && complete && state.showCard ? job.id : null, (shownJob) => {
      this.completeCard.hidden = !shownJob;
      if (!shownJob) return;
      const next = state.nextJob;
      const stripes = state.receipt?.find((line) => line.tip === 'stripes');
      const neat = stripes && stripes.amount >= config.money.stripesTip;
      this.completeTitle.textContent = neat ? 'Nice stripes!' : 'Job complete!';
      this.jobSummary.textContent = job.summary;
      this.jobTime.textContent = formatDuration(state.elapsed);
      this.completeHint.textContent = next
        ? `Press N for the next job: ${next.name ?? next.title}. R to redo this one.`
        : 'Press R to mow it again.';
    });

    this.set('receipt', state.receipt, () => this.showReceipt(state.receipt));
  }

  /** @param {import('../game/pay.js').PayLine[] | null} lines */
  showReceipt(lines) {
    this.receipt.replaceChildren();
    this.receipt.hidden = !lines;
    if (!lines) return;
    for (const line of [...lines, { label: 'Total', amount: receiptTotal(lines), total: true }]) {
      const row = this.receipt.insertRow();
      if ('total' in line) row.className = 'receipt-total';
      row.insertCell().textContent = line.label;
      const pending = 'pending' in line && line.pending;
      if (pending) row.className = 'receipt-pending';
      row.insertCell().textContent = pending ? `${line.label} (trim them: Q)` : line.label;
      const tip = 'tip' in line && line.tip;
      row.insertCell().textContent = `${tip ? '+' : ''}${formatMoney(line.amount)}`;
    }
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
