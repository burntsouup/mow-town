import { config } from '../config.js';
import { formatDuration } from '../game/job.js';
import { biggestPatternTip, formatMoney, receiptTotal } from '../game/pay.js';
import { PATTERNS } from '../lawn/patterns.js';
import './hud.css';

/**
 * @typedef {{
 *   prompt: string | null,
 *   toast: string | null,
 *   hasMower: boolean,
 *   job: import('../game/jobList.js').JobDefinition,
 *   jobStatus: 'waiting' | 'active' | 'complete',
 *   stageHint: string | null,
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
 *   closetOpen: boolean,
 *   timelapse: { speed: number, seconds: number, total: number } | null,
 *   musicOn: boolean,
 *   photoOpen: boolean,
 * }} HudState hasMower: the player has grabbed the mower at least once; stageHint: a hint
 *   for where you are in the job (like "now mow across"), over the job's own; progress is 0..1
 *   for display; elapsed is seconds on the job; nextJob is the one after this (null if this
 *   is the last); showCard: the "Job complete" card is up (it tucks away after a while);
 *   edges is 0..1 for display; money is what to show in the wallet (it counts up); receipt
 *   is what the job paid, once it's done; closetOpen: you're dressing up (see Closet);
 *   timelapse: while a timelapse plays, how fast and how far through (seconds of mowing);
 *   musicOn: the soundtrack's playing (a button on the start screen turns it off and on);
 *   photoOpen: photo mode's on (it has its own panel, so the rest of the HUD hides).
 */

/**
 * The HTML overlay players see:
 * - while playing: the job objective with a progress bar, your money, interaction prompts,
 *   and a "Job complete!" card with a receipt at the end
 * - otherwise: a "click to play" card with the controls, a button to dress Tuft up, and one
 *   to start over
 */
export class Hud {
  /**
   * @param {HTMLElement} root
   * @param {import('../game/Input.js').Input} input
   */
  constructor(root, input) {
    this.input = input;
    /** What the start screen's buttons do (the game fills these in). */
    this.actions = { dressUp: () => {}, startOver: () => {}, toggleMusic: () => {} };

    this.prompt = element('div', 'interaction-prompt');
    this.toast = element('div', 'toast');

    this.objective = element('div', 'objective');
    // The title, with a little picture of the pattern when a client asks for one.
    const head = element('div', 'objective-head');
    this.patternIcon = element('span', 'pattern-icon');
    this.objectiveTitle = element('div', 'objective-title');
    head.append(this.patternIcon, this.objectiveTitle);
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
    this.objective.append(head, this.objectiveHint, bar, this.progressLabel, this.edgesRow);

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

    // While a timelapse plays: a "fast forward" badge, with the mowing time ticking by.
    this.timelapseBadge = element('div', 'timelapse-badge');
    this.timelapseBadge.innerHTML = `
      <span class="timelapse-icon" aria-hidden="true">▶▶</span>
      <span class="timelapse-speed"></span>
      <span class="timelapse-bar"><span class="timelapse-fill"></span></span>
      <span class="timelapse-clock"></span>`;
    /** @param {string} selector */
    const part = (selector) =>
      /** @type {HTMLElement} */ (this.timelapseBadge.querySelector(selector));
    this.timelapseSpeed = part('.timelapse-speed');
    this.timelapseFill = part('.timelapse-fill');
    this.timelapseClock = part('.timelapse-clock');

    this.playPrompt = element('div', 'play-prompt');
    this.playPrompt.innerHTML = `
      <h1>mow-town</h1>
      <p class="play-prompt-action">Click to play</p>
      <dl class="controls">
        <dt>Mouse</dt><dd>Look around</dd>
        <dt>WASD</dt><dd>Move</dd>
        <dt>Shift</dt><dd>Run</dd>
        <dt>E</dt><dd>Grab the mower / let go (or buy, or dress up at the coat stand)</dd>
        <dt>W / S</dt><dd>Push / pull the mower</dd>
        <dt>Mouse or A / D</dt><dd>Steer the mower</dd>
        <dt>Q</dt><dd>Take out / put away the string trimmer</dd>
        <dt>Hold mouse</dt><dd>Run the trimmer (it cuts where you look)</dd>
        <dt>Hold F</dt><dd>Highlight the grass that's left</dd>
        <dt>V</dt><dd>View the lawn from above</dd>
        <dt>L</dt><dd>Watch a timelapse of your mow</dd>
        <dt>P</dt><dd>Photo mode: postcards and videos</dd>
        <dt>N</dt><dd>Next job (once this one's done)</dd>
        <dt>R</dt><dd>Mow it again (once it's done)</dd>
        <dt>M</dt><dd>Mute / unmute</dd>
        <dt>T</dt><dd>Tuning panel</dd>
        <dt>Esc</dt><dd>Release the mouse</dd>
      </dl>`;
    const dressUp = element('button', 'play-prompt-button');
    dressUp.textContent = 'Dress up Tuft';
    dressUp.addEventListener('click', () => this.actions.dressUp());
    this.musicButton = element('button', 'play-prompt-button is-quiet');
    this.musicButton.addEventListener('click', () => this.actions.toggleMusic());
    const buttons = element('div', 'play-prompt-buttons');
    buttons.append(dressUp, this.musicButton);
    this.playPrompt.querySelector('.play-prompt-action')?.after(buttons);
    // Starting over wipes your progress, so it takes a second click to be sure.
    const startOver = element('button', 'play-prompt-reset');
    const startOverText = 'Start over';
    startOver.textContent = startOverText;
    let armed = 0;
    startOver.addEventListener('click', () => {
      if (armed) {
        this.actions.startOver();
        return;
      }
      startOver.textContent = 'Sure? Your money, deck and jobs reset. Click again';
      armed = window.setTimeout(() => {
        armed = 0;
        startOver.textContent = startOverText;
      }, 4000);
    });
    this.playPrompt.append(startOver);
    for (const button of [dressUp, this.musicButton, startOver]) {
      button.setAttribute('type', 'button');
    }

    root.append(
      this.objective,
      this.wallet,
      this.timelapseBadge,
      this.toast,
      this.prompt,
      this.completeCard,
      this.playPrompt,
    );
    // Hidden until the first update says otherwise (the game waits a moment before starting).
    const panels = [this.objective, this.wallet, this.toast, this.prompt, this.completeCard];
    for (const panel of [...panels, this.timelapseBadge]) panel.hidden = true;
    /** What's currently on screen, so we only touch the page when something changes. */
    this.shown = /** @type {Record<string, unknown>} */ ({});
  }

  /** @param {HudState} state */
  update(state) {
    const locked = this.input.isPointerLocked;
    const complete = state.jobStatus === 'complete';

    let screen = locked ? 'playing' : 'menu';
    if (state.closetOpen) screen = 'closet';
    if (state.photoOpen) screen = 'photo';
    this.set('screen', screen, () => {
      this.playPrompt.hidden = screen !== 'menu';
      this.objective.hidden = screen !== 'playing';
      this.wallet.hidden = screen !== 'playing';
    });

    this.set('music', state.musicOn, () => {
      this.musicButton.textContent = state.musicOn ? '♪ Music: on' : '♪ Music: off';
      this.musicButton.setAttribute('aria-pressed', String(state.musicOn));
    });

    const money = formatMoney(state.money);
    this.set('money', money, () => {
      this.wallet.textContent = money;
    });
    this.set('moneyCounting', state.moneyCounting, () => {
      this.wallet.classList.toggle('is-counting', state.moneyCounting);
    });

    const toastText = screen === 'playing' ? state.toast : null;
    this.set('toast', toastText, () => {
      showWithKeys(this.toast, toastText ?? '');
      this.toast.hidden = !toastText;
    });

    const promptText = screen === 'playing' ? state.prompt : null;
    this.set('prompt', promptText, () => {
      showWithKeys(this.prompt, promptText ?? '');
      this.prompt.hidden = !promptText;
    });

    const { job } = state;
    let title = job.title;
    if (complete) title = job.doneTitle;
    else if (!state.hasMower) title = 'Grab the mower';
    this.set('title', title, () => {
      this.objectiveTitle.textContent = title;
    });
    const pattern = state.hasMower ? (job.pattern ?? null) : null;
    this.set('pattern', pattern, () => {
      this.patternIcon.innerHTML = pattern ? patternPicture(pattern) : '';
      this.patternIcon.hidden = !pattern;
      this.patternIcon.title = pattern ? PATTERNS[pattern].name : '';
    });
    let hint = state.stageHint ?? job.hint ?? '';
    if (complete && !state.edgesDone) hint = 'Trim the edges with Q for a tip';
    else if (complete) hint = state.nextJob ? 'Press N for the next job' : 'Press R to start over';
    else if (!state.hasMower) hint = "It's parked on the driveway";
    this.set('hint', hint, () => {
      showWithKeys(this.objectiveHint, hint);
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

    this.set(
      'complete',
      screen === 'playing' && complete && state.showCard ? job.id : null,
      (shownJob) => {
        this.completeCard.hidden = !shownJob;
        if (!shownJob) return;
        const next = state.nextJob;
        const stripes = state.receipt?.find((line) => line.tip === 'stripes');
        const neat = stripes && stripes.amount >= biggestPatternTip(job, config.money);
        const { praise } = PATTERNS[job.pattern ?? 'stripes'];
        this.completeTitle.textContent = neat ? praise : 'Job complete!';
        this.jobSummary.textContent = job.summary;
        this.jobTime.textContent = formatDuration(state.elapsed);
        showWithKeys(
          this.completeHint,
          next
            ? `Press N for the next job: ${next.name ?? next.title}. R to redo this one.`
            : 'Press R to start over: the grass grows back.',
        );
      },
    );

    this.set('receipt', state.receipt, () => this.showReceipt(state.receipt));

    const { timelapse } = state;
    this.set('timelapse', screen === 'playing' && timelapse !== null, (shown) => {
      this.timelapseBadge.hidden = !shown;
    });
    if (timelapse) {
      const speed = `${Math.round(timelapse.speed)}×`;
      this.set('timelapseSpeed', speed, () => (this.timelapseSpeed.textContent = speed));
      const clock = formatDuration(timelapse.seconds);
      this.set('timelapseClock', clock, () => (this.timelapseClock.textContent = clock));
      const percent = Math.floor((100 * timelapse.seconds) / Math.max(timelapse.total, 1e-3));
      this.set('timelapseFill', percent, () => (this.timelapseFill.style.width = `${percent}%`));
    }
  }

  /** @param {import('../game/pay.js').PayLine[] | null} lines */
  showReceipt(lines) {
    this.receipt.replaceChildren();
    this.receipt.hidden = !lines;
    if (!lines) return;
    for (const line of [...lines, { label: 'Total', amount: receiptTotal(lines), total: true }]) {
      const row = this.receipt.insertRow();
      if ('total' in line) row.className = 'receipt-total';
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
 * A tiny picture of a pattern: mowed stripes in two greens, as SVG.
 *
 * @param {import('../lawn/patterns.js').PatternId} pattern
 */
function patternPicture(pattern) {
  /** @type {string[]} */
  const dark = [];
  if (pattern === 'checkerboard') {
    for (let row = 0; row < 4; row++) {
      for (let column = row % 2; column < 4; column += 2) {
        dark.push(`<rect x="${column * 6}" y="${row * 6}" width="6" height="6"/>`);
      }
    }
  } else if (pattern === 'diagonal') {
    for (let offset = -24; offset < 24; offset += 12) {
      dark.push(
        `<polygon points="${offset},24 ${offset + 6},24 ${offset + 30},0 ${offset + 24},0"/>`,
      );
    }
  } else {
    for (let column = 1; column < 4; column += 2) {
      dark.push(`<rect x="${column * 6}" y="0" width="6" height="24"/>`);
    }
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <clipPath id="pattern-clip"><rect width="24" height="24" rx="5"/></clipPath>
    <g clip-path="url(#pattern-clip)">
      <rect width="24" height="24" fill="#9fd66b"/>
      <g fill="#4f9e3f">${dark.join('')}</g>
    </g>
  </svg>`;
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

/**
 * Shows text with the keys it mentions ("Press E to grab the mower") drawn as keycaps.
 *
 * @param {HTMLElement} element
 * @param {string} text
 */
function showWithKeys(element, text) {
  // Split on the game's one-letter keys, standing alone: odd pieces are the keys.
  const pieces = text.split(/\b([EFLMNPQRTV])\b/);
  element.replaceChildren(
    ...pieces.map((piece, i) => {
      if (i % 2 === 0) return piece;
      const key = document.createElement('kbd');
      key.textContent = piece;
      return key;
    }),
  );
}
