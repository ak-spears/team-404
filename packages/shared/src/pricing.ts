import type { ServiceType } from './enums.js';

/**
 * Static per-unit pricing table. `department_job` has no static price -- department jobs are
 * billed per a negotiated institutional quote, so `orders.price_cents` stays null until staff
 * sets it by hand (no "set price" route exists).
 */
export const PRICING_TABLE_CENTS: Record<ServiceType, number | null> = {
  poster: 1500,
  resume_portfolio: 800,
  class_assignment: 10,
  department_job: null,
  personal_printing: 12,
};

/**
 * Returns the computed price in cents for a given service type + quantity, or `null` when the
 * service type has no static price (department_job) -- callers should leave
 * `orders.price_cents` unset in that case.
 */
export function calculatePriceCents(serviceType: ServiceType, quantity: number): number | null {
  const unitPriceCents = PRICING_TABLE_CENTS[serviceType];
  if (unitPriceCents === null) return null;
  return unitPriceCents * quantity;
}
