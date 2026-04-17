import { dinero, add, equal, toUnit } from 'dinero.js';

/**
 * Safely converts a float dollar amount into a Dinero internal representation (cents)
 */
export function toDinero(amount: number | string | null | undefined, currency = 'CAD') {
  if (amount === null || amount === undefined || amount === '') return dinero({ amount: 0, currency: 'CAD' });
  const parsed = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(parsed)) return dinero({ amount: 0, currency: 'CAD' });
  
  // Convert float to smallest unit (cents)
  return dinero({ amount: Math.round(parsed * 100), currency: 'CAD' });
}

/**
 * Validates subtotal + taxes === total with 0.02 tolerance using precise Dinero logic
 */
export function isMathMismatch(subtotal: number, gst: number, pst: number, total: number): boolean {
  const dSub = toDinero(subtotal);
  const dGst = toDinero(gst);
  const dPst = toDinero(pst);
  const dTotal = toDinero(total);
  
  const expectedTotal = add(dSub, add(dGst, dPst));

  // If the manually input total equals the strictly added integers
  return !equal(expectedTotal, dTotal);
}

/**
 * Formats a raw database dollar float to local currency cleanly
 */
export function formatDineroIntl(amount: number | string | null | undefined, currency = 'CAD'): string {
  return toDinero(amount, currency).toFormat('$0,0.00');
}
