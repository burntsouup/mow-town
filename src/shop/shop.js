// @ts-check
import { formatMoney } from '../game/pay.js';

/**
 * The sale stand's rules: whether you can buy something, and what the stand says when you
 * walk up. Pure logic, no Babylon.
 *
 * @typedef {{ id: string, name: string, price: number }} ShopItem name as in a sentence
 *   ("the 30-inch deck" reads "Press E to buy the 30-inch deck").
 */

/**
 * @param {ShopItem} item
 * @param {number} money Dollars you have.
 * @param {boolean} owned You already bought it.
 * @returns {{ money: number } | null} What you have left, or null if you can't buy it.
 */
export function buy(item, money, owned) {
  if (owned || money < item.price) return null;
  return { money: money - item.price };
}

/**
 * @param {ShopItem} item
 * @param {number} money
 * @param {boolean} owned
 * @returns {string | null} The prompt to show, or null once it's sold.
 */
export function standPrompt(item, money, owned) {
  if (owned) return null;
  const price = formatMoney(item.price);
  if (money >= item.price) return `Press E to buy the ${item.name} for ${price}`;
  return `The ${item.name}: ${price} (${formatMoney(item.price - money)} to go)`;
}
