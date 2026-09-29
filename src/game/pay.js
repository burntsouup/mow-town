// @ts-check

/**
 * What a finished job pays: its price, plus tips for good work. Pure logic, no Babylon.
 *
 * @typedef {{ label: string, amount: number, tip?: 'stripes' | 'edges', pending?: boolean }}
 *   PayLine One line on the receipt. tip says which tip it is (they show with a plus sign);
 *   pending marks a tip you can still earn, which doesn't count toward the total yet.
 * @typedef {{ jobPay: Record<string, number>, stripesTip: number, tipFrom: number,
 *   tipFull: number, edgesTip: number }} PaySettings jobPay: dollars by job id. stripesTip:
 *   the most the neat-stripes tip can be. tipFrom/tipFull: the neatness (0..1) where the tip
 *   starts, and where it's the whole amount. edgesTip: dollars for trimming the edges.
 */

/**
 * @param {{ id: string, shortName?: string, title: string }} job
 * @param {{ neatness: number, edgesDone: boolean }} work neatness: 0..1, see
 *   lawn/neatness.js. edgesDone: the edges are trimmed (if not, that tip is still pending).
 * @param {PaySettings} settings
 * @returns {PayLine[]}
 */
export function jobReceipt(job, work, settings) {
  const neat = (work.neatness - settings.tipFrom) / (settings.tipFull - settings.tipFrom);
  const tip = Math.round(settings.stripesTip * Math.min(1, Math.max(0, neat)));
  return [
    { label: job.shortName ?? job.title, amount: settings.jobPay[job.id] ?? 0 },
    {
      label: `Neat stripes (${Math.floor(work.neatness * 100)}%)`,
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
