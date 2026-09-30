// @ts-check
import { PATTERNS } from '../lawn/patterns.js';

/**
 * What a finished job pays: its price, plus tips for good work. Pure logic, no Babylon.
 *
 * @typedef {{ label: string, amount: number, tip?: 'stripes' | 'edges', pending?: boolean }}
 *   PayLine One line on the receipt. tip says which tip it is (they show with a plus sign;
 *   'stripes' is the one for the lawn's pattern); pending marks a tip you can still earn,
 *   which doesn't count toward the total yet.
 * @typedef {{ jobPay: Record<string, number>, stripesTip: number, patternTip: number,
 *   tipFrom: number, tipFull: number, edgesTip: number }} PaySettings jobPay: dollars by
 *   job id. stripesTip: the most the neat-stripes tip can be; patternTip: the same for a
 *   pattern a client asked for (see lawn/patterns.js). tipFrom/tipFull: the neatness (0..1)
 *   where the tip starts, and where it's the whole amount. edgesTip: dollars for trimming
 *   the edges.
 * @typedef {{ id: string, shortName?: string, title: string,
 *   pattern?: import('../lawn/patterns.js').PatternId }} PaidJob
 */

/**
 * @param {PaidJob} job
 * @param {{ neatness: number, edgesDone: boolean }} work neatness: how well the lawn
 *   matches the job's pattern (plain stripes if it doesn't ask for one), 0..1: see
 *   lawn/patterns.js. edgesDone: the edges are trimmed (if not, that tip is still pending).
 * @param {PaySettings} settings
 * @returns {PayLine[]}
 */
export function jobReceipt(job, work, settings) {
  const neat = (work.neatness - settings.tipFrom) / (settings.tipFull - settings.tipFrom);
  const tip = Math.round(biggestPatternTip(job, settings) * Math.min(1, Math.max(0, neat)));
  const pattern = PATTERNS[job.pattern ?? 'stripes'];
  return [
    { label: job.shortName ?? job.title, amount: settings.jobPay[job.id] ?? 0 },
    {
      label: `${pattern.tipLabel} (${Math.floor(work.neatness * 100)}%)`,
      amount: tip,
      tip: 'stripes',
    },
    {
      label: 'Crisp edges',
      amount: settings.edgesTip,
      tip: 'edges',
      ...(work.edgesDone ? {} : { pending: true }),
    },
  ];
}

/**
 * The most a job's stripes (or pattern) tip can be.
 *
 * @param {PaidJob} job
 * @param {Pick<PaySettings, 'stripesTip' | 'patternTip'>} settings
 */
export function biggestPatternTip(job, settings) {
  return job.pattern && job.pattern !== 'stripes' ? settings.patternTip : settings.stripesTip;
}

/**
 * What the receipt adds up to, leaving out tips still to be earned.
 *
 * @param {PayLine[]} lines
 */
export function receiptTotal(lines) {
  return lines.reduce((sum, line) => sum + (line.pending ? 0 : line.amount), 0);
}

/**
 * Whole dollars, e.g. 1234 → "$1,234".
 *
 * @param {number} amount
 */
export function formatMoney(amount) {
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(amount)).toLocaleString('en-US')}`;
}

/**
 * Counts a shown amount toward the real one, like a till: fast at first, then easing in,
 * but never slower than `minSpeed` dollars per second, so it always lands.
 *
 * @param {number} shown
 * @param {number} target
 * @param {number} dt Seconds since the previous frame.
 * @param {{ speed: number, minSpeed: number }} settings speed: higher = catches up quicker.
 */
export function countTowards(shown, target, dt, settings) {
  const gap = target - shown;
  const step = Math.max(
    Math.abs(gap) * (1 - Math.exp(-settings.speed * dt)),
    settings.minSpeed * dt,
  );
  return step >= Math.abs(gap) ? target : shown + Math.sign(gap) * step;
}
