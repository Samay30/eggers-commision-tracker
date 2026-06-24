/**
 * Commission/fee resolution for the three ways EES earns on a placement:
 *
 *   FLAT       — a fixed fee in dollars.
 *   PERCENTAGE — a percentage of the candidate's salary (fee = salary * pct).
 *   HOURLY     — contract placements (fee = hours * hourlyRate).
 *
 * The resolved fee becomes the placement's `billAmount` (the revenue figure the
 * commission engine multiplies by the recruiter's plan rate). The full breakdown
 * is stored alongside in Placement.metadata so it stays visible, auditable, and
 * editable without changing the database schema.
 */

export type FeeType = 'FLAT' | 'PERCENTAGE' | 'HOURLY';

export const FEE_TYPES: FeeType[] = ['FLAT', 'PERCENTAGE', 'HOURLY'];

export interface FeeInput {
  feeType: FeeType;
  flatFee?: number | null;
  feePercentage?: number | null; // decimal, e.g. 0.20 for 20%
  salaryBasis?: number | null; // candidate annual salary
  hours?: number | null;
  hourlyRate?: number | null;
}

export interface FeeResult extends FeeInput {
  resolvedFee: number | null; // EES fee in dollars; becomes billAmount
  confident: boolean; // false => import as needs-review rather than trust the number
  reason: string | null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function computeFee(input: FeeInput): FeeResult {
  const base: FeeResult = {
    feeType: input.feeType,
    flatFee: num(input.flatFee),
    feePercentage: num(input.feePercentage),
    salaryBasis: num(input.salaryBasis),
    hours: num(input.hours),
    hourlyRate: num(input.hourlyRate),
    resolvedFee: null,
    confident: false,
    reason: null
  };

  switch (input.feeType) {
    case 'FLAT': {
      if (base.flatFee != null && base.flatFee > 0) {
        return { ...base, resolvedFee: round(base.flatFee), confident: true };
      }
      return { ...base, reason: 'Flat fee missing or not positive.' };
    }
    case 'PERCENTAGE': {
      if (base.salaryBasis != null && base.feePercentage != null && base.salaryBasis > 0 && base.feePercentage > 0) {
        // Guard against the common 20 vs 0.20 mistake.
        const pct = base.feePercentage > 1 ? base.feePercentage / 100 : base.feePercentage;
        return { ...base, feePercentage: pct, resolvedFee: round(base.salaryBasis * pct), confident: true };
      }
      return { ...base, reason: 'Percentage fee needs both salary basis and percentage.' };
    }
    case 'HOURLY': {
      if (base.hours != null && base.hourlyRate != null && base.hours > 0 && base.hourlyRate > 0) {
        return { ...base, resolvedFee: round(base.hours * base.hourlyRate), confident: true };
      }
      return { ...base, reason: 'Hourly fee needs both hours and hourly rate.' };
    }
    default:
      return { ...base, reason: 'Unknown fee type.' };
  }
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function describeFee(result: Pick<FeeResult, 'feeType' | 'feePercentage' | 'salaryBasis' | 'hours' | 'hourlyRate' | 'flatFee'>) {
  switch (result.feeType) {
    case 'FLAT':
      return 'Flat fee';
    case 'PERCENTAGE':
      return result.feePercentage != null && result.salaryBasis != null
        ? `${(result.feePercentage * 100).toFixed(1)}% of ${result.salaryBasis.toLocaleString()}`
        : 'Percentage of salary';
    case 'HOURLY':
      return result.hours != null && result.hourlyRate != null
        ? `${result.hours} hrs × $${result.hourlyRate}/hr`
        : 'Hourly';
    default:
      return 'Fee';
  }
}
