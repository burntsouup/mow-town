import { describe, expect, it } from 'vitest';
import { buy, standPrompt } from './shop.js';

const DECK = { id: 'wideDeck', name: '30-inch deck', price: 50 };

describe('buy', () => {
  it('takes the price when you have enough', () => {
    expect(buy(DECK, 50, false)).toEqual({ money: 0 });
    expect(buy(DECK, 58, false)).toEqual({ money: 8 });
  });

  it("won't sell what you can't afford, or what you already have", () => {
    expect(buy(DECK, 49, false)).toBeNull();
    expect(buy(DECK, 100, true)).toBeNull();
  });
});

describe('standPrompt', () => {
  it('offers it when you can afford it', () => {
    expect(standPrompt(DECK, 60, false)).toBe('Press E to buy the 30-inch deck for $50');
  });

  it("says how much more you need when you can't", () => {
    expect(standPrompt(DECK, 0, false)).toBe('The 30-inch deck: $50 ($50 to go)');
    expect(standPrompt(DECK, 42, false)).toBe('The 30-inch deck: $50 ($8 to go)');
  });

  it('says nothing once it is sold', () => {
    expect(standPrompt(DECK, 0, true)).toBeNull();
  });
});
