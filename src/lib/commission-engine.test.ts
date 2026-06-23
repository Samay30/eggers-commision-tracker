import { describe, expect, it } from 'vitest';
import { buildCommissionLedger } from './commission-engine';

const basePlan = {
  year: 2026,
  annualGoal: 250000,
  commissionRate: 0.1,
  salaryPerPayPeriod: 1000,
  payFrequency: 'SEMI_MONTHLY',
  monthlyPayoutRate: 0.9,
  quarterlyTrueUp: true,
  openingBalance: 0
};

describe('commission engine', () => {
  it('carries a negative balance when only draw is paid', () => {
    const result = buildCommissionLedger(basePlan, [], []);
    expect(result.summary.drawPaid).toBe(24000);
    expect(result.summary.endingBalance).toBe(-24000);
    expect(result.summary.paidOut).toBe(0);
  });

  it('pays monthly 90% and holds the rest until quarter true-up', () => {
    const result = buildCommissionLedger(
      basePlan,
      [
        {
          id: 'p1',
          placementName: 'Large placement',
          paymentDate: '2026-01-10',
          billAmount: 500000,
          status: 'PAID'
        }
      ],
      []
    );

    const januaryClose = result.rows.find((row) => row.type === 'MONTHLY_CLOSE' && row.month === 0);
    const q1TrueUp = result.rows.find((row) => row.type === 'QUARTERLY_TRUE_UP' && row.month === 2);

    expect(januaryClose?.commissionEarned).toBe(50000);
    expect(januaryClose?.payout).toBe(43000);
    expect(q1TrueUp?.payout).toBe(1000);
  });

  it('does not release held-back commission during a dry month', () => {
    // January earns commission; February and March earn nothing. The 10% held back in
    // January must stay in the balance through the dry months and only be released by the
    // Q1 true-up, matching the spreadsheet (not paid out month by month).
    const result = buildCommissionLedger(
      basePlan,
      [{ id: 'p1', placementName: 'Large placement', paymentDate: '2026-01-10', billAmount: 500000, status: 'PAID' }],
      []
    );

    const februaryClose = result.rows.find((row) => row.type === 'MONTHLY_CLOSE' && row.month === 1);
    const marchClose = result.rows.find((row) => row.type === 'MONTHLY_CLOSE' && row.month === 2);
    const q1TrueUp = result.rows.find((row) => row.type === 'QUARTERLY_TRUE_UP' && row.month === 2);

    expect(februaryClose?.payout).toBe(0);
    expect(marchClose?.payout).toBe(0);
    expect(q1TrueUp?.payout).toBe(1000);
  });

  it('matches the spreadsheet bi-weekly draw count and carries negative draw all year', () => {
    const result = buildCommissionLedger({ ...basePlan, payFrequency: 'BI_WEEKLY', salaryPerPayPeriod: 1923.07 }, [], []);
    // 26 bi-weekly pay periods in 2026 starting Jan 2: 26 * 1923.07 = 49999.82.
    expect(result.summary.drawPaid).toBe(49999.82);
    expect(result.summary.paidOut).toBe(0);
    expect(result.summary.endingBalance).toBeLessThan(0);
  });

  it('uses payout override for split placements', () => {
    const result = buildCommissionLedger(
      basePlan,
      [
        {
          id: 'split',
          placementName: 'Split placement',
          paymentDate: '2026-04-10',
          billAmount: 50000,
          payoutOverride: 3000,
          status: 'PAID'
        }
      ],
      []
    );

    expect(result.summary.commissionEarned).toBe(3000);
  });

  it('ignores pending placements', () => {
    const result = buildCommissionLedger(
      basePlan,
      [
        {
          id: 'pending',
          placementName: 'Pending placement',
          paymentDate: '2026-04-10',
          billAmount: 50000,
          status: 'PENDING'
        }
      ],
      []
    );

    expect(result.summary.salesToDate).toBe(0);
    expect(result.summary.commissionEarned).toBe(0);
  });
});
