import { describe, expect, it } from 'vitest';
import { countTowards, formatMoney, jobReceipt, receiptTotal } from './pay.js';

const SETTINGS = { jobPay: { frontLawn: 40 }, stripesTip: 10, tipFrom: 0.6, tipFull: 0.9 };
const FRONT_LAWN = { id: 'frontLawn', shortName: 'Front lawn', title: 'Mow the front lawn' };

describe('jobReceipt', () => {
  it("pays the job's price, plus the whole tip for neat stripes", () => {
    const receipt = jobReceipt(FRONT_LAWN, { neatness: 0.95 }, SETTINGS);
    expect(receipt).toEqual([
      { label: 'Front lawn', amount: 40 },
      { label: 'Neat stripes (95%)', amount: 10, tip: 'stripes' },
    ]);
    expect(receiptTotal(receipt)).toBe(50);
  });

  it('scales the tip between "starts" and "full", in whole dollars', () => {
    const tipFor = (/** @type {number} */ neatness) =>
      jobReceipt(FRONT_LAWN, { neatness }, SETTINGS)[1].amount;
    expect(tipFor(0.3)).toBe(0);
    expect(tipFor(0.6)).toBe(0);
    expect(tipFor(0.75)).toBe(5);
    expect(tipFor(0.84)).toBe(8);
    expect(tipFor(1)).toBe(10);
  });

  it('falls back to the title, and pays nothing for a job with no price', () => {
    const receipt = jobReceipt({ id: 'mystery', title: 'Mow it' }, { neatness: 0 }, SETTINGS);
    expect(receipt[0]).toEqual({ label: 'Mow it', amount: 0 });
  });
});

describe('formatMoney', () => {
  it('shows whole dollars with thousands separators', () => {
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(49.6)).toBe('$50');
    expect(formatMoney(1234)).toBe('$1,234');
    expect(formatMoney(-5)).toBe('-$5');
  });
});

describe('countTowards', () => {
  const settings = { speed: 4, minSpeed: 20 };

  it('lands exactly on the target, and stays there', () => {
    let shown = 0;
    for (let frame = 0; frame < 120; frame++) shown = countTowards(shown, 50, 1 / 60, settings);
    expect(shown).toBe(50);
    expect(countTowards(50, 50, 1 / 60, settings)).toBe(50);
  });

  it('moves quickly at first, then eases in', () => {
    const first = countTowards(0, 100, 0.1, settings);
    const later = countTowards(90, 100, 0.1, settings) - 90;
    expect(first).toBeGreaterThan(later * 5);
  });

  it('never crawls: at least minSpeed dollars per second', () => {
    expect(countTowards(99.9, 100, 0.001, { speed: 0.001, minSpeed: 20 })).toBeCloseTo(99.92);
  });

  it('counts down too (for spending)', () => {
    expect(countTowards(60, 0, 10, settings)).toBe(0);
    expect(countTowards(60, 0, 0.1, settings)).toBeLessThan(60);
  });
});
